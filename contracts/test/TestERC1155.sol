//SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.9;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TestERC1155 is Context, ERC1155, Ownable {
    // uint256 public totalSupply = 1000000000;

    // address public owner;

    constructor() ERC1155("baseURI") {}

    function mint(
        address to,
        uint256 tokenId,
        uint256 _amount
    ) public onlyOwner {
        super._mint(to, tokenId, _amount, "0x");
    }

    function burn(
        address _account,
        uint256 _tokenId,
        uint256 _amount
    ) public onlyOwner {
        super._burn(_account, _tokenId, _amount);
    }

    // Function for test
    function currentTime() public view returns (uint256) {
        return block.timestamp;
    }

    receive() external payable {}

    fallback() external payable {}
}
