// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../src/interfaces/IBatchAuction.sol";

/// @dev Minimal mock satisfying IBatchAuction for unit tests.
contract MockBatchAuction is IBatchAuction {
    uint256 public clearingPrice;
    uint256 public unlockTime;
    bool public finalized;
    uint256 public totalTokenSupply;
    address public paymentToken;

    function setFinalized(bool v) external { finalized = v; }
    function setClearingPrice(uint256 v) external { clearingPrice = v; }
    function setUnlockTime(uint256 v) external { unlockTime = v; }
    function setTotalTokenSupply(uint256 v) external { totalTokenSupply = v; }
    function setPaymentToken(address v) external { paymentToken = v; }
}
