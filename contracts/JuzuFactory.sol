//SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.9;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./JuzuLocker.sol";
import "./interfaces/IJuzuFactory.sol";
import "./interfaces/IJuzuLocker.sol";
import "./JuzuFactoryActionsForJuzuLocker.sol";
import "./JuzuFactoryActionsForJuzuERC721.sol";
import "./JuzuFactoryConfiguration.sol";

contract JuzuFactory is Ownable, IJuzuFactory, Pausable, JuzuFactoryActionsForJuzuLocker, JuzuFactoryActionsForJuzuERC721  {
    using SafeMath for uint256;

    event JuzuLockerCreated(address juzuLocker, uint256 tokenId, address owner, uint256 createdAt);

    uint256 public juzuFactoryVersion;

    uint256 public baseFeeAmount;
    uint256 public apr;

    constructor(address _juzuERC721, address _juzuERC20, uint256 _juzuFactoryVersion, uint256 _apr, uint256 _baseFeeAmount) {
        juzuFactoryVersion = _juzuFactoryVersion;
        juzuERC721 = _juzuERC721;
        juzuERC20 = _juzuERC20;
        apr = _apr;
        baseFeeAmount = _baseFeeAmount;
    }

    /**
     * Inherit from IJuzuFactoryOwner
     */
    function pause() external override onlyOwner {
        _pause();
    }

    /**
     * Inherit from IJuzuFactoryOwner
     */
    function unpause() external override onlyOwner {
        _unpause();
    }

    /**
     * Inherit from IJuzuFactoryOwner
     */
    function setApr(uint256 _newApr) external override onlyOwner {
        apr = _newApr;
    }

    /**
     * Inherit from IJuzuFactoryOwner
     */
    function setBaseFeeAmount(uint256 _baseFeeAmount) external onlyOwner {
        baseFeeAmount = _baseFeeAmount;
    }

    /**
     * Inherit from IJuzuFactory
     */
    function createJuzu(bytes memory _conditions, IJuzuLocker.STAGE _stage) external override whenNotPaused {
        // Mint new JuzuERC721
        (bool success, bytes memory data) = juzuERC721.call(abi.encodeWithSignature("mint(address)", msg.sender));
        require(success == true, "fail_to_create_juzu_nft");

        uint256 tokenId = abi.decode(data, (uint256));
        // create new JuzuLocker
        JuzuLocker juzuLocker = new JuzuLocker(msg.sender, tokenId, baseFeeAmount, apr, juzuERC20, juzuERC721, address(this), _conditions, _stage);
        emit JuzuLockerCreated(address(juzuLocker), tokenId, msg.sender, block.timestamp);
        // set mapping juzuLockers in JuzuERC721
        (success, ) = juzuERC721.call(abi.encodeWithSignature("setJuzuLocker(uint256,address)", tokenId, address(juzuLocker)));
        require(success == true, "fail_to_set_juzu_locker");
    }
}
