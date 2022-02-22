//SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.9;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./interfaces/IJuzuERC721.sol";

contract JuzuERC721 is ERC721, IJuzuERC721, Ownable {
    using Counters for Counters.Counter;

    Counters.Counter internal counter;
    mapping(address => bool) public juzuFactories;
    mapping(uint256 => address) public juzuLockers;
    mapping(address => address) public lockerFactories;

    constructor() ERC721("Juzu ERC721", "JuzuNFT") {}

    event JuzuLockerSet(uint256 indexed tokenId, address indexed owner, address juzuLocker);

    modifier onlyJuzuFactory() {
        require(juzuFactories[msg.sender] == true, "not_juzu_factory");
        _;
    }

    /**
     * Inherit from IJuzuERC721
     */
    function addJuzuFactory(address _factory) external override onlyOwner {
        juzuFactories[_factory] = true;
    }

    /**
     * Inherit from IJuzuERC721
     */
    function removeJuzuFactory(address _factory) external override onlyOwner {
        juzuFactories[_factory] = false;
    }

    /**
    * Inherit from IJuzuERC721
    */
    function mint(address to) public override onlyJuzuFactory returns(uint256 tokenId)
    {
        counter.increment();
        tokenId = counter.current();
        super._safeMint(to, tokenId, "0x");
    }

    /**
    * Inherit from IJuzuERC721
    */
    function setJuzuLocker(uint256 _tokenId, address _juzuLocker) public override onlyJuzuFactory {
        juzuLockers[_tokenId] = _juzuLocker;
        lockerFactories[_juzuLocker] = msg.sender;
        emit JuzuLockerSet(_tokenId, ownerOf(_tokenId), _juzuLocker);
    }

    /**
    * Inherit from IJuzuERC721
    */
    function burn(uint256 tokenId) public override onlyJuzuFactory {
        super._burn(tokenId);
    }

    /**
     * @dev Transfer JuzuERC721 from address to address
     */
    function transferFrom(address from, address to, uint256 tokenId) public override {
        _juzuTransfer(from, to, tokenId);
        super.transferFrom(from, to, tokenId);
    }

    /**
     * @dev Transfer JuzuERC721 from address to address
     */
    function safeTransferFrom(address from, address to, uint256 tokenId) public override {
        _juzuTransfer(from, to, tokenId);
        super.safeTransferFrom(from, to, tokenId, "");
    }

    /**
     * @dev Transfer JuzuERC721 from address to address
     */
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) public override {
        _juzuTransfer(from, to, tokenId);
        super.safeTransferFrom(from, to, tokenId, data);
    }

    /**
     * @notice internal function
     * @dev transfer Juzu NFT will transfer JuzuLocker too, emit event Transfer in JuzuFactory for graph.
     */
    function _juzuTransfer(address from, address to, uint256 tokenId) internal {
        (bool success, bytes memory data) = juzuLockers[tokenId].call(
            abi.encodeWithSignature("transferOwner(address)", to)
        );
        require(success == true, "fail to transfer owner at Locker");
        (success, ) = lockerFactories[juzuLockers[tokenId]].call(abi.encodeWithSignature("transferOwner(address,address,uint256)", from, to, tokenId));
        require(success == true, "fail to transfer owner at Factory");
    }
}
