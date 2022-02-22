//SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.9;
import "./IJuzuLockerOwner.sol";

interface IJuzuLocker is IJuzuLockerOwner {

  enum STAGE{OPEN, LOCKED, UNLOCKED}

  struct NFT {
    address collection;
    uint256 tokenId;
    uint256 amount;
    uint256 nftType; // 721 || 1155
  }

  struct Asset {
    address token;
    uint256 amount;
  }

  struct ConditonExternalFee {
    address token;
    uint256 amount;
    address recipient;
  }

  struct Condition {
    uint256 unlockAt;
    ConditonExternalFee externalFee;
    address releasableBy;
    bool isUnlocked;
  }

  struct ConditionInput {
    uint256 unlockAt;
    ConditonExternalFee externalFee;
    address releasableBy;
    uint256 priorityGroup;
  }

  /**
  * @notice JuzuERC721 action
  * @dev JuzuERC721 transfer owner makes Locker owner is transfered too.
  * @param _newOwner: new owner address
  */
  function transferOwner(address _newOwner) external;

  /**
  * @dev deposit extra fee of release condition into Locker
  * @param _token: token address to deposit
  * @param _amount: deposit amount
  */
  function depositExtraFee(address _token, uint256 _amount) external payable;

  /**
  * @dev deposit base fee of release condition into Locker
  * @param _amount: deposit amount
  */
  function depositBaseFee(uint256 _amount) external payable;  
  
  /**
  * @dev get available staking reward amount
  */
  function getStakingReward() external view returns(uint256);

  /**
  * @dev release Locker when release condition is passed, all assets will be transferd to releaser
  * It can't pass lower priority group condition when higher one is active
  * The rest extra fee amount which is not used will be transfered to releaser
  * Update last staking reward and stop update new staking reward
  * Change Locker stage to UNLOCKED
  * Base fee will be burned when releasing
  * @param _groupIndex: group priority index of choosen release condition
  * @param _conditionIndex: condition index in group priority of choosen release condition
  */
  function release(uint256 _groupIndex, uint256 _conditionIndex) payable external;
}
