//SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.9;
pragma experimental ABIEncoderV2;

import "./interfaces/IJuzuFactoryActionsForJuzuLocker.sol";
import "./JuzuFactoryConfiguration.sol";

contract JuzuFactoryActionsForJuzuLocker is IJuzuFactoryActionsForJuzuLocker, JuzuFactoryConfiguration {

    event JuzuBurnedBaseFee(uint256 indexed tokenId, uint256 burnedBaseFee);

    modifier requireLocker(uint256 _tokenId) {
      (,bytes memory data) = juzuERC721.call(
          abi.encodeWithSignature("juzuLockers(uint256)", _tokenId)
      );
      require(abi.decode(data, (address)) == msg.sender, "invalid_caller");
      _;
    }

    /**
     * Inherit from IJuzuFactoryActionsForJuzuLocker
     */
    function claimReward(uint256 _tokenId, address _to) external override requireLocker(_tokenId) {
        uint256 claimAmount;
        {
            (bool success, bytes memory data) = msg.sender.call(abi.encodeWithSignature("getStakingReward()"));
            claimAmount = abi.decode(data, (uint256));
        }
        {
            (bool success, ) = juzuERC20.call(
                abi.encodeWithSignature(
                    "mint(address,uint256)",
                    _to,
                    claimAmount
            )
            );
            require(success == true, "invalid_mint");
        }
    }

    /**
     * Inherit from IJuzuFactoryActionsForJuzuLocker
     */
    function burnJuzuERC721(uint256 _tokenId) external override requireLocker(_tokenId) {
        (bool success, ) = juzuERC721.call(abi.encodeWithSignature("burn(uint256)", _tokenId));
        require(success == true, "invalid_burn_juzu_erc721");
    }

    /**
     * Inherit from IJuzuFactoryActionsForJuzuLocker
     */
    function burnBaseFee(uint256 _tokenId) external requireLocker(_tokenId) {
        uint256 depositedBaseFee;
        {
            (, bytes memory data) = msg.sender.call(
                abi.encodeWithSignature("depositedBaseFee()")
            );
            depositedBaseFee = abi.decode(data, (uint256));
        }
        (bool success, ) = juzuERC20.call(
            abi.encodeWithSignature(
                "burn(address,uint256)",
                msg.sender,
                depositedBaseFee
        )
        );
        require(success == true, "invalid_burn_juzu_erc20");
        emit JuzuBurnedBaseFee(_tokenId, depositedBaseFee);
    }
}
