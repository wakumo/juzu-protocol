//SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.9;

interface IJuzuLockerOwner {
  
  /**
  * @dev change stage of Locker to Locked stage
  */
  function lock() external;

  /**
  * @dev Add more assets into Juzu
  * @param _params: include nfts, tokens, coins are encoded follow struct: (NFT[], Asset[])
  */
  function addAssets(bytes memory _params) external payable;

  /**
  * @dev Claim staking reward from Locker
  * @param _to: receiver address
  */
  function claim(address _to) external;

  /**
  * @dev burn JuzuERC721 after released Locker
  */
  function burn() external;

  /**
  * @notice it can be executed by Locker owner at OPEN stage or Juzu Factory at Locker constructor.
  * @dev update Locker condition when Locker in OPEN stage
  * @param _conditions: conditions are encoded follow struct: ConditionInput[]
  */
  function updateConditions(bytes memory _conditions) external;

  /**
  * @dev owner can withdraw their locked nfts when Locker in OPEN stage.
  * @param _nftIndex: nftIndex in list nfts
  * @param _collection: collection address of nft. It's used to verify with nftIndex or find out it's index
  * @param _tokenId: tokenId of nft. It's used to verify with nftIndex or find out it's index
  */
  function withdrawNFT(uint256 _nftIndex, address _collection, uint256 _tokenId) external;

  /**
  * @dev owner can withdraw their locked tokens, coins when Locker in OPEN stage.
  * @param _assetIndex: asset index in list assets
  * @param _token: token address of asset. It's used to verify with assetIndex or find out it's index
  * @param _amount: amount of asset. It's used to verify with assetIndex or find out it's index
  */
  function withdrawAsset(uint256 _assetIndex, address _token, uint256 _amount) external;
}