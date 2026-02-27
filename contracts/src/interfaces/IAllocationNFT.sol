// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAllocationNFT
/// @notice Interface for the AllocationNFT contract consumed by CCA and ARMVault.
interface IAllocationNFT {
    struct Allocation {
        uint256 amount;
        uint256 clearingPrice;
        uint256 unlockTime;
    }

    function mint(
        address to,
        uint256 amount,
        uint256 clearingPrice,
        uint256 unlockTime
    ) external returns (uint256 tokenId);

    function getAllocation(uint256 tokenId) external view returns (Allocation memory);

    function ownerOf(uint256 tokenId) external view returns (address);
}
