//SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.9;

interface IJuzuFactoryActionsForJuzuLocker {
  /**
  * @notice JuzuLocker action
  * @dev JuzuLocker claim staking reward will call to JuzuFactory to mint new token
  * @param _tokenId: JuzuERC721 tokenId
  * @param _to: address receives staking reward 
  */
  function claimReward(uint256 _tokenId, address _to) external;

  /**
  * @notice JuzuLocker action
  * @dev JuzuLocker want to burn juzuERC721
  * @param _tokenId: JuzuERC721 tokenId
  */
  function burnJuzuERC721(uint256 _tokenId) external;

  /**
  * @notice JuzuLocker action
  * @dev JuzuLocker want to burn baseFee
  * @param _tokenId: JuzuERC721 tokenId
  */
  function burnBaseFee(uint256 _tokenId) external;
}
