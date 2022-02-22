//SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.9;

interface IJuzuLockerEvent {

    event JuzuLocked(uint256 indexed tokenId);

    event JuzuLockCreated(address owner, uint256 indexed tokenId);

    event JuzuLockUpdated(address owner, uint256 indexed tokenId);

    event JuzuConditionUpdated(uint256 indexed tokenId);

    event JuzuLockTransferedOwner(uint256 indexed tokenId, address oldOwner, address newOwner);

    event JuzuLockApproved(uint256 indexed tokenId, address approver);

    event JuzuLockDeposited(uint256 indexed tokenId, address token, uint256 amount);

    event JuzuLockWithdrawed(address token, address recipient, uint256 amount);

    event JuzuLockReleased(uint256 indexed tokenId, uint256 groupIndex, uint256 conditionIndex, address submitter, uint256 burnedBasedFeeAmount);

    event JuzuClaimedStaking(uint256 amount, address to);

    event JuzuBurned(uint256 indexed tokenId);

    event JuzuWithdrawNFT(uint256 juzuTokenId, address collection, uint256 nftTokenId);

    event JuzuWithdrawAsset(uint256 juzuTokenId, address token, uint256 amount);
}
