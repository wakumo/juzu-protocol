//SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.9;

interface IJuzuFactoryActionsForJuzuERC721 {

  /**
  * @dev JuzuERC721 transfer owner will call to factory to emit an event, use for subgraph
  * @param _from: owner or approved address of JuzuERC721
  * @param _to: receiver address
  * @param _tokenId: JuzuERC721 tokenId
  */
  function transferOwner(address _from, address _to, uint256 _tokenId) external;
}
