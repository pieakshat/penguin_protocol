// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILaunchToken {
    function mint(address to, uint256 amount) external;
    function totalSupply() external view returns (uint256);
    function maxSupply() external view returns (uint256);
}
