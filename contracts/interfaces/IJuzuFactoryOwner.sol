//SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.9;
import "./IJuzuLockerOwner.sol";

interface IJuzuFactoryOwner {

  /**
    * @dev set new apr, this apr will applied for new JuzuLocker & JuzuLocker claim action
    * @param _newApr: new apr value
  */
  function setApr(uint256 _newApr) external;

  /**
    * @dev set new baseFeeAmonut
    * @param _baseFeeAmount: new baseFeeAmount value
  */
  function setBaseFeeAmount(uint256 _baseFeeAmount) external;

  /**
    * @dev pause JuzuFactory, prevent creating new JuzuLocker
  */
  function pause() external;

  /**
    * @dev unpause JuzuFactory, allow creating new JuzuLocker
  */
  function unpause() external;
}
