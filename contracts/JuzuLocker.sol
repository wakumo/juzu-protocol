//SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.9;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./interfaces/IJuzuLockerEvent.sol";
import "./interfaces/IJuzuLocker.sol";
import "./JuzuERC20.sol";

contract JuzuLocker is IJuzuLockerEvent, IJuzuLocker, ReentrancyGuard {

    using SafeMath for uint256;

    uint256 private constant MAX_PRIORITY_GROUP = 5;

    struct LockerInfo {
        uint256 tokenId;
        address owner;
        Condition[][MAX_PRIORITY_GROUP]  conditions;
        NFT[]  nfts;
        Asset[]  assets;
        uint256 stakingApr;
        uint256 depositedBaseFee;
        uint256 lastRewardAmount;
        uint256 lastClaimedAt;
        uint256 lastDepositedAt;
        uint256 claimedAmount;
        address releasedBy;
        STAGE stage;
    }

    uint256 public baseFeeAmount;
    address public juzuERC20;
    address public juzuERC721;
    address public juzuFactory;
    // We have limit 5 group priorities and 8 conditions in all groups.
    // For example we have 5 groups, limit condition will be 4: 1, 1, 1, 1, 4.
    Condition[][MAX_PRIORITY_GROUP] public conditions;
    address public owner;
    uint256 public stakingApr;
    NFT[] public nfts;
    Asset[] public assets;

    uint256 public depositedBaseFee;
    uint256 public tokenId;
    address public releasedBy;
    uint256 public lastRewardAmount;
    uint256 public lastClaimedAt;
    uint256 public lastDepositedAt;
    uint256 public claimedAmount;
    STAGE public stage;

    mapping(address => uint256) public depositedExtraFeeAmounts;
    uint256 public depositedJuzAmounts; // include baseFee + locked Juzu amount + JuzuExtraFee

    address private constant COIN_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    uint256 private constant MAX_CONDITIONS = 8;
    uint256 private constant MAX_NFT = 256;
    uint256 private constant MAX_ASSET = 256;
    uint256 private constant YEAR_IN_SECONDS = 31557600; // 365.25 * 24 * 60 * 60


    modifier onlyJuzuERC721() {
        require(msg.sender == juzuERC721, "only_from_juzu_nft");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "only_owner");
        _;
    }

    modifier onlyOpenStage() {
        require(stage == STAGE.OPEN, "invalid_open_stage");
        _;
    }

    modifier onlyLockedStage() {
        require(stage == STAGE.LOCKED, "invalid_locked_stage");
        _;
    }

    modifier onlyUnlockedStage() {
        require(stage == STAGE.UNLOCKED, "invalid_unlocked_stage");
        _;
    }

    constructor(
        address _owner,
        uint256 _tokenId,
        uint256 _baseFeeAmount,
        uint256 _stakingApr,
        address _juzuERC20,
        address _juzuERC721,
        address _juzuFactory,
        bytes memory _conditions,
        STAGE _stage
    ) {
        owner = _owner;
        tokenId = _tokenId;
        baseFeeAmount = _baseFeeAmount;
        stakingApr = _stakingApr;
        juzuERC20 = _juzuERC20;
        juzuFactory = _juzuFactory;
        juzuERC721 = _juzuERC721;
        lastClaimedAt = block.timestamp;
        // solve conditions
        updateConditions(_conditions);
        require(_stage != STAGE.UNLOCKED, "invalid_stage");
        stage = _stage;

    }

    //
    // Owner actions
    //

    /**
    * Inherit from IJuzuLockerOwner
    */
    function lock() external override onlyOpenStage onlyOwner {
        stage = STAGE.LOCKED;
        lastClaimedAt = block.timestamp;
        lastRewardAmount = 0;
        lastDepositedAt = block.timestamp;
        emit JuzuLocked(tokenId);
    }

    /**
    * Inherit from IJuzuLockerOwner
    */
    function addAssets(bytes memory _params, uint256 _baseFeeAmount) external payable override onlyOwner{
        require(stage != STAGE.UNLOCKED, "released");
        _transferLockData(_params);
        if (_baseFeeAmount > 0) {
            depositBaseFee(_baseFeeAmount);
        }
        emit JuzuLockUpdated(msg.sender, tokenId);
    }

    /**
    * Inherit from IJuzuLockerOwner
    */
    function claim(address _to) public override nonReentrant onlyOwner {
        uint256 stakingReward = getStakingReward();
        if (_to == address(0)) _to = owner;
        // mint reward
        if (stakingReward > 0) {
            {
                (bool success, ) = juzuFactory.call(
                    abi.encodeWithSignature(
                        "claimReward(uint256,address)",
                        tokenId,
                        _to
                )
                );
                require(success == true, "invalid_mint");
            }
            lastClaimedAt = block.timestamp;
            lastDepositedAt = block.timestamp;
            lastRewardAmount = 0;
            claimedAmount = claimedAmount.add(stakingReward);
            // update new stakingApr from Factory
            (bool success, bytes memory data) = juzuFactory.call(abi.encodeWithSignature("apr()"));
            stakingApr = abi.decode(data, (uint256));
            emit JuzuClaimedStaking(stakingReward, _to);
        }
    }

    /**
    * Inherit from IJuzuLockerOwner
    */
    function burn() external override onlyOwner onlyUnlockedStage {
        require(stage == STAGE.UNLOCKED, "not_released");
        // transfer unclaimed staking reward
        if (lastRewardAmount > 0) claim(owner);
        // Burn JuzuNFT
        (bool success, ) = juzuFactory.call(
            abi.encodeWithSignature("burnJuzuERC721(uint256)", tokenId)
        );
        require(success == true, "fail to burn JuzuNFT");
        emit JuzuBurned(tokenId);
    }

    /**
    * Inherit from IJuzuLockerOwner
    */
    function updateConditions(bytes memory _conditions) public override onlyOpenStage {
        require(msg.sender == owner || msg.sender == juzuFactory, "invalid_owner");
        delete(conditions);
        ConditionInput[] memory conditionsInputs = abi.decode(
            _conditions,
            (ConditionInput[])
        );
        require(
            conditionsInputs.length <= MAX_CONDITIONS,
            "invalid_length_release_conditions"
        );
        if (conditionsInputs.length == 0) {
            conditions[0].push(Condition(0, ConditonExternalFee(address(0), 0, address(0)), address(0), false));
        } else {
            for (uint256 i = 0; i < conditionsInputs.length; i++) {
                Condition memory condition = Condition(
                    conditionsInputs[i].unlockAt,
                    conditionsInputs[i].externalFee,
                    conditionsInputs[i].releasableBy,
                    false
                );
                conditions[conditionsInputs[i].priorityGroup].push(condition);
            }
        }
        emit JuzuConditionUpdated(tokenId);
    }

    /**
    * Inherit from IJuzuLockerOwner
    */
    function withdrawNFT(uint256 _nftIndex, address _collection, uint256 _tokenId) external override onlyOpenStage onlyOwner {
        if (nfts[_nftIndex].tokenId != _tokenId || nfts[_nftIndex].collection != _collection) {
            for (_nftIndex = 0; _nftIndex < nfts.length; _nftIndex++){
                if(nfts[_nftIndex].tokenId == _tokenId && nfts[_nftIndex].collection == _collection) break;
            }
        }
        _withdrawNFT(address(this), owner, nfts[_nftIndex]);
        nfts[_nftIndex] = nfts[nfts.length - 1];
        nfts.pop();
        emit JuzuWithdrawNFT(tokenId, _collection, _tokenId);
    }

    /**
    * Inherit from IJuzuLockerOwner
    */
    function withdrawAsset(uint256 _assetIndex, address _token, uint256 _amount) external override onlyOpenStage onlyOwner {
        if (assets[_assetIndex].token != _token || assets[_assetIndex].amount != _amount) {
            for (_assetIndex = 0; _assetIndex < assets.length; _assetIndex++){
                if(assets[_assetIndex].token == _token && assets[_assetIndex].amount == _amount) break;
            }
        }
        _safeTransfer(assets[_assetIndex].token, owner, assets[_assetIndex].amount);
        assets[_assetIndex] = assets[assets.length - 1];
        assets.pop();
        emit JuzuWithdrawAsset(tokenId, _token, _amount);
    }

    //
    // ** PUBLIC action
    //

    /**
    * @dev get Locker Info
    */
    function getLockerInfo() external view returns(LockerInfo memory data){
        data = LockerInfo(tokenId, owner, conditions, nfts, assets, stakingApr, depositedBaseFee, lastRewardAmount, lastClaimedAt, lastDepositedAt, claimedAmount, releasedBy, stage);
    }

    /**
    * Inherit from IJuzuLocker
    */
    function transferOwner(address _newOwner) external override onlyJuzuERC721 {
        address oldOwner = owner;
        owner = _newOwner;
        emit JuzuLockTransferedOwner(tokenId, oldOwner, _newOwner);
    }

    /**
    * Inherit from IJuzuLocker
    */
    function depositExtraFee(address _token, uint256 _amount) payable public override {
        depositedExtraFeeAmounts[_token] = depositedExtraFeeAmounts[_token].add(_amount);
        _safeTransferFrom(_token, msg.sender, _amount);
        if (_token == juzuERC20) _updateStakingReward(_amount);
        emit JuzuLockDeposited(tokenId, _token, _amount);
    }

    /**
    * Inherit from IJuzuLocker
    */
    function depositBaseFee(uint256 _amount) public override {
        if (depositedBaseFee < baseFeeAmount) {
            if (depositedBaseFee.add(_amount) > baseFeeAmount) _amount = baseFeeAmount.sub(depositedBaseFee);
            _safeTransferFrom(juzuERC20, msg.sender, _amount);
            depositedBaseFee =  depositedBaseFee.add(_amount);
            _updateStakingReward(_amount);
            emit JuzuLockDeposited(tokenId, juzuERC20, _amount);
        }
    }

    /**
    * Inherit from IJuzuLocker
    */
    function release(uint256 _groupIndex, uint256 _conditionIndex) public override payable onlyLockedStage {
        require(depositedBaseFee >= baseFeeAmount, "invalid_base_fee");
        (bool check, address token, uint256 amount, address recipient) = checkCondition(_groupIndex, _conditionIndex);
        require(check == true, "invalid_conditions");
        //      event Release(tokenId, groupIndex, conditionIndex, releaser, burnAmount)

        conditions[_groupIndex][_conditionIndex].isUnlocked = true;
        // transfer external fee if have
        if (token != address(0)) _sendExtraFee(token, recipient, amount);
        // the rest token will be transfered to JuzuNFT releaser
        _sweepRemainingExtraFeeToReleaser();

        // Burn baseFeeAmount
        _burnBaseFee();

        // transfer asset & nft to releaser
        _withdrawAllAssets();

        // update last reward
        _updateStakingAtRelease();

        releasedBy = msg.sender;
        stage = STAGE.UNLOCKED;
        emit JuzuLockReleased(tokenId, _groupIndex, _conditionIndex, msg.sender, baseFeeAmount);
    }

    /**
    * Inherit from IJuzuLocker
    */
    function getStakingReward() public override view returns (uint256 stakingReward) {
        // claim after Juzu was released
        if (stage == STAGE.UNLOCKED) {
            stakingReward = lastRewardAmount;
        } else if (stage == STAGE.OPEN) {
            stakingReward = 0;
        } else {
            uint256 stakingPeriod = 0;
            if (block.timestamp.sub(lastClaimedAt) > YEAR_IN_SECONDS) {
                stakingPeriod = lastClaimedAt.add(YEAR_IN_SECONDS);
            } else {
                stakingPeriod = block.timestamp;
            }
            stakingReward =
                lastRewardAmount.add(
                    depositedJuzAmounts
            .div(10000)
            .mul(stakingApr)
            .div(100)
            .mul(stakingPeriod.sub(lastDepositedAt))
            .div(YEAR_IN_SECONDS));
        }
    }


    //
    // ** INTERNAL FUNCTION
    //

    /**
    * @dev withdraw NFT from owner or approved to receiver
    * functions: _withdrawAllAssets, withdrawNFT
    * @param _from: from owner or approved
    * @param _to: receiver address
    * @param _nft: nft info
    */
    function _withdrawNFT(address _from, address _to, NFT memory _nft) internal {
        _nftSafeTransferFrom(
            _from,
            _to,
            _nft.collection,
            _nft.tokenId,
            _nft.amount,
            _nft.nftType
        );
    }

    /**
    * @dev send extra fee to recipient
    * functions: release
    * @param _token: token address
    * @param _recipient: receiver address
    * @param _amount: send amount
    */
    function _sendExtraFee(address _token, address _recipient, uint256 _amount) internal {
        _safeTransfer(_token, _recipient, _amount);
        depositedExtraFeeAmounts[_token] = depositedExtraFeeAmounts[_token].sub(_amount);
        emit JuzuLockWithdrawed(_token, _recipient, _amount);
    }

    /**
    * @dev send the rest extra fee which aren't used after released
    * functions: release
    */
    function _sweepRemainingExtraFeeToReleaser() internal {
        for (uint256 i = 0; i < conditions.length; i++) {
            for (uint256 j = 0; j < conditions[i].length; j++) {
                ConditonExternalFee memory extraFee = conditions[i][j]
                .externalFee;
                if (
                    extraFee.token != address(0) &&
                        depositedExtraFeeAmounts[extraFee.token] > 0
                ) {
                    _safeTransfer(
                        extraFee.token,
                        msg.sender,
                        depositedExtraFeeAmounts[extraFee.token]
                    );
                    emit JuzuLockWithdrawed(
                        extraFee.token,
                        msg.sender,
                        depositedExtraFeeAmounts[extraFee.token]
                    );
                    depositedExtraFeeAmounts[extraFee.token] = 0;
                }
            }
        }
    }

    /**
    * @dev burn base fee of Locker
    * functions: release
    */
    function _burnBaseFee() internal {
        (bool success, ) = juzuFactory.call(
            abi.encodeWithSignature("burnBaseFee(uint256)", tokenId)
        );
        require(success == true, "fail to burn baseFeeAmount");
    }

    /**
    * @dev withdraw all locked nfts, coins, tokens after released
    * functions: release
    */
    function _withdrawAllAssets() internal {
        for (uint256 i = 0; i < nfts.length; i++) {
            if (nfts[i].collection != address(0)) {
                _withdrawNFT(address(this), msg.sender, nfts[i]);
            }
        }
        for (uint256 i = 0; i < assets.length; i++) {
            if (assets[i].token != address(0)) {
                _safeTransfer(assets[i].token, msg.sender, assets[i].amount);
            }
        }
    }

    /**
    * @dev update last staking reward after released
    * functions: release
    */
    function _updateStakingAtRelease() internal {
        lastRewardAmount = lastRewardAmount.add(
            depositedJuzAmounts
            .div(10000)
            .mul(stakingApr)
            .div(100)
            .mul(block.timestamp.sub(lastDepositedAt))
            .div(YEAR_IN_SECONDS));
            lastDepositedAt = block.timestamp;
    }

    /**
    * @dev transfer nfts, tokens, coins into Locker
    * functions: addAssets
    * @param _params: nfts, coins, tokens are encoded follow struct: (NFT[], ASSET[])
    */
    function _transferLockData(bytes memory _params) internal {
        (NFT[] memory nftsInput, Asset[] memory assetsInput) = abi.decode(
            _params,
            (NFT[], Asset[])
        );
        require(
            nftsInput.length.add(nfts.length) < MAX_NFT,
            "invalid_length_nfts"
        );
        require(
            assetsInput.length.add(assets.length) < MAX_ASSET,
            "invalid_length_assets"
        );
        for (uint256 i = 0; i < nftsInput.length; i++) {
            _nftSafeTransferFrom(
                msg.sender,
                address(this),
                nftsInput[i].collection,
                nftsInput[i].tokenId,
                nftsInput[i].amount,
                nftsInput[i].nftType
            );
            nfts.push(nftsInput[i]);
        }
        for (uint256 i = 0; i < assetsInput.length; i++) {
            if (assetsInput[i].amount > 0) {
                _safeTransferFrom(assetsInput[i].token, msg.sender, assetsInput[i].amount);
                if (assetsInput[i].token == juzuERC20) _updateStakingReward(assetsInput[i].amount);
                assets.push(assetsInput[i]);
            }
        }
    }

    /**
    * @dev Transfer nft from ... to ...
    * functions: _withdrawNFT, _transferLockData
    */
    function _nftSafeTransferFrom(address _from, address _to, address _collection, uint256 _tokenId, uint256 _nftAmount, uint256 _nftType) internal {
        if (_nftType == 1155) {
            IERC1155(_collection).safeTransferFrom(_from, _to, _tokenId, _nftAmount, "0x");
        } else if (_nftType == 721) {
            IERC721(_collection).transferFrom(_from, _to, _tokenId);
        }
    }

    /**
    * @dev Transfer tokens, coins from ... to ...
    * functions: depositExtraFee, depositBaseFee, _transferLockData
    */
    function _safeTransferFrom(address _token, address _from, uint256 _amount) internal {
        if (_token == COIN_ADDRESS) {
            require(msg.value == _amount, "invalid_amount");
        } else {
            IERC20(_token).transferFrom(_from, address(this), _amount);
        }
    }

    /**
    * @dev Transfer tokens, coins from Locker to ...
    * functions: _sendExtraFee, _sweepRemainingExtraFeeToReleaser, _withdrawAllAssets
    */
    function _safeTransfer(address _token, address _to, uint256 _amount) internal {
        if (_token == COIN_ADDRESS) {
            if (_to == address(this)) {
                require(msg.value == _amount, "invalid_amount");
            } else {
                payable(_to).transfer(uint64(_amount));
            }
        } else {
            IERC20(_token).transfer(_to, _amount);
        }
    }

    /**
    * @dev update staking reward when Juzu is deposited into Locker
    * functions: depositExtraFee, depositBaseFee, _transferLockData
    * @param _amount: amount of Juzu token
    */
    function _updateStakingReward(uint256 _amount) internal {
        if (stage == STAGE.LOCKED) {
            lastRewardAmount =
                lastRewardAmount.add(
                    depositedJuzAmounts
            .div(10000)
            .mul(stakingApr)
            .div(100)
            .mul(block.timestamp.sub(lastDepositedAt))
            .div(YEAR_IN_SECONDS));
            lastDepositedAt = block.timestamp;
        }
        depositedJuzAmounts = depositedJuzAmounts.add(_amount);
    }

    /**
    * @dev Check condition when releasing
    * functions: release
    * @param _groupIndex: group priority index of choosen release condition
    * @param _conditionIndex: condition index in group priority of choosen release condition
    */
    function checkCondition(uint256 _groupIndex, uint256 _conditionIndex) public payable returns(bool check, address token, uint256 amount, address recipient) {
        require(depositedBaseFee >= baseFeeAmount, "not_enough_base_fee");
        require(_conditionIndex < conditions[_groupIndex].length, "invalid_release_index");
        // priority Group
        // check allownace first
        {
            address token = conditions[_groupIndex][_conditionIndex].externalFee.token;
            uint256 depositedAmount = depositedExtraFeeAmounts[token];
            uint256 requireAmount = conditions[_groupIndex][_conditionIndex].externalFee.amount;
            if(token != address(0) && depositedAmount < requireAmount) {
                if (token == COIN_ADDRESS && msg.value.add(depositedAmount) >= requireAmount)  {
                    depositExtraFee(token, requireAmount - depositedAmount);
                } else {
                    (bool success, bytes memory data) = token.call(abi.encodeWithSignature("allowance(address,address)", msg.sender, address(this)));
                    if (success == true) {
                        uint256 allowedAmount = abi.decode(data, (uint256));
                        if (allowedAmount + depositedAmount >= requireAmount) {
                            depositExtraFee(token, requireAmount - depositedAmount);
                        }
                    }
                }
            }
        }
        for(uint256 i = 0; i <= _groupIndex; i++) {
            check = false;
            for (uint256 j = 0; j < conditions[i].length; j++) {
                Condition memory condition = conditions[i][j];
                check = false;
                if (condition.unlockAt <= block.timestamp) {
                    if (
                        condition.externalFee.token == address(0) ||
                            (depositedExtraFeeAmounts[
                        condition.externalFee.token
                    ] >= condition.externalFee.amount)
                    ) {
                        check = true;
                        break;
                    }
                }
            }
            // find out active priority group
            // checking _conditionIndex is valid or not
            if (check == true && (_conditionIndex < conditions[i].length) && (_groupIndex == i)) {
                Condition memory condition = conditions[i][_conditionIndex];
                check = false;
                // if (condition.unlockAt <= block.timestamp) {
                // if (condition.externalFee.token == address(0) || (depositedExtraFeeAmounts[condition.externalFee.token] >= condition.externalFee.amount)) {
                if ((condition.releasableBy == address(0) && msg.sender == owner) || (msg.sender == condition.releasableBy)) {
                    check = true;
                    token = condition.externalFee.token;
                    amount = condition.externalFee.amount;
                    recipient = condition.externalFee.recipient;
                }
                // }
                // }
                break;
            } else if (check == true) {
                check = false;
                break;
            }
        }
    }
}
