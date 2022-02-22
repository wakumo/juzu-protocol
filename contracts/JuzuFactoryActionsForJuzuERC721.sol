//SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.9;
pragma experimental ABIEncoderV2;

import "./interfaces/IJuzuFactoryActionsForJuzuERC721.sol";
import "./JuzuFactoryConfiguration.sol";

contract JuzuFactoryActionsForJuzuERC721 is IJuzuFactoryActionsForJuzuERC721, JuzuFactoryConfiguration {

    event JuzuLockTransferedOwner(uint256 indexed tokenId, address oldOwner, address newOwner);

    modifier onlyJuzuERC721() {
        require(msg.sender == juzuERC721, "invalid_juzu_erc721");
        _;
    }

    /**
     * Inherit from IJuzuFactoryActionsForJuzuERC721
     */
    function transferOwner(address _from, address _to, uint256 _tokenId) external override onlyJuzuERC721 {
        emit JuzuLockTransferedOwner(_tokenId, _from, _to);
    }



}
