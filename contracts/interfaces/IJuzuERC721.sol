//SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.9;

interface IJuzuERC721 {
  
  /**
  * @notice Owner Action
  * @dev remove JuzuFactory permission
  * @param _factory: address of JuzuFactory which is added
  */
  function addJuzuFactory(address _factory) external;

  /**
  * @notice Owner Action
  * @dev remove JuzuFactory permission
  * @param _factory: address of JuzuFactory which is removed
  */
  function removeJuzuFactory(address _factory) external;

  /**
  * @notice JuzuFactory Action
  * @dev mint new JuzuERC721
  * @param to: address which receive new JuzuERC721
  */
  function mint(address to) external returns(uint256);

  /**
  * @notice JuzuFactory Action
  * @dev burn JuzuERC721
  * @param _tokenId: tokenId of JuzuERC721 mapping to JuzuLocker address
  * @param _juzuLocker: JuzuLocker address
  */
  function setJuzuLocker(uint256 _tokenId, address _juzuLocker) external;

  /**
  * @notice JuzuFactory Action
  * @dev burn JuzuERC721
  */
  function burn(uint256 tokenId) external;
}