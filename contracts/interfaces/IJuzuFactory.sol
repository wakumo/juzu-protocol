//SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.9;
import "./IJuzuFactoryOwner.sol";
import "./IJuzuLocker.sol";

interface IJuzuFactory is IJuzuFactoryOwner {

  /**
  * @dev create new JuzuLocker and mint new JuzuERC721 with stage
  * @param _conditions: list conditions of JuzuLocker which is encoded
  * @param _stage: stage of JuzuLocker, should be IJuzuLocker.STAGE.OPEN or IJuzuLocker.STAGE.LOCKED
  */
  function createJuzu(bytes memory _conditions, IJuzuLocker.STAGE _stage) external;
}
