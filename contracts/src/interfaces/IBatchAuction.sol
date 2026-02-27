// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBatchAuction {
    function clearingPrice() external view returns (uint256);
    function unlockTime() external view returns (uint256);
    function finalized() external view returns (bool);
    function totalTokenSupply() external view returns (uint256);
    function paymentToken() external view returns (address);
}
