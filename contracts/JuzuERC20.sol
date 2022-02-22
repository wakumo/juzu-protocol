//SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.9;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IJuzuERC20.sol";

contract JuzuERC20 is Context, ERC20, IJuzuERC20, Ownable {

    mapping(address => bool) public mintRights;

    constructor() ERC20("JUZU Token", "JUZ") {}

    /**
     * Inherit from IJuzuERC20
     */
    function mint(address _to, uint256 _amount) public override {
        require(
            (msg.sender == owner() || mintRights[msg.sender] == true),
            "invalid_sender"
        );
        super._mint(_to, _amount);
    }

    /**
     * Inherit from IJuzuERC20
     */
    function burn(address _account, uint256 _amount) public override {
        require(
            (msg.sender == owner() || mintRights[msg.sender] == true),
            "invalid_sender"
        );
        super._burn(_account, _amount);
    }

    /**
     * Inherit from IJuzuERC20
     */
    function addMintRight(address _factory) external override onlyOwner {
        mintRights[_factory] = true;
    }

    /**
     * Inherit from IJuzuERC20
     */
    function removeMintRight(address _factory) external override onlyOwner {
        mintRights[_factory] = false;
    }

    receive() external payable {}

    fallback() external payable {}
}
