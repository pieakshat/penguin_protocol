// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IARMVault {
    /// @notice Clearing price for this campaign in payment token decimals.
    ///         Returns 0 until the first deposit triggers the cache from BatchAuction.
    ///         Use batchAuction.clearingPrice() directly if needed before first deposit.
    function clearingPrice() external view returns (uint256);

    /// @notice TGE unlock timestamp — read from BatchAuction.
    function unlockTime() external view returns (uint256);

    /// @notice Returns the original depositor of an NFT, or address(0) if not deposited.
    function getDepositor(uint256 nftId) external view returns (address);
}
