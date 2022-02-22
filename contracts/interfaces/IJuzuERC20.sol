//SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.9;

interface IJuzuERC20 {
  
  /**
  * @notice owner & JuzuFactory which has mint right can mint new token
  * @dev mint new token
  */
  function mint(address _to, uint256 _amount) external;

  /**
  * @notice owner & JuzuFactory which has mint right can mint new token
  * @dev burn token of address
  */
  function burn(address _account, uint256 _amount) external;

  /**
  * @notice Owner Action
  * @dev add mintRight of JuzuFactory
  * @param _factory: JuzuFactory address which is added mintRight
  */
  function addMintRight(address _factory) external;

  /**
  * @notice Owner Action
  * @dev remove mintRight of JuzuFactory
  * @param _factory: JuzuFactory address which is removed mintRight
  */
  function removeMintRight(address _factory) external;
}