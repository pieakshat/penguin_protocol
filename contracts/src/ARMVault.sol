// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./interfaces/IAllocationNFT.sol";
import "./interfaces/IARMVault.sol";
import "./interfaces/IBatchAuction.sol";
import "./interfaces/IPrincipalToken.sol";
import "./interfaces/IRiskToken.sol";

/// @title ARMVault
/// @notice Accepts an AllocationNFT and splits it into PT and RT 1:1 with token amount.
/// @dev One ARMVault is deployed per campaign by the factory.
///      clearingPrice and unlockTime are read lazily from the paired BatchAuction,
///      meaning the vault can be deployed before the auction finalizes.
///      The first deposit triggers the cache — subsequent reads use the cached value.
///      The vault permanently holds the NFT; there is no unwrap path.
contract ARMVault is IARMVault, ReentrancyGuard {
    error ZeroAddress();
    error AuctionNotFinalized();
    error NotNFTOwner(uint256 tokenId, address caller);
    error ClearingPriceMismatch(uint256 expected, uint256 actual);
    error AlreadyDeposited(uint256 tokenId);

    event Deposited(
        uint256 indexed nftId,
        address indexed depositor,
        uint256 amount,
        uint256 clearingPrice
    );

    IBatchAuction public immutable batchAuction;
    IAllocationNFT public immutable allocationNFT;
    IPrincipalToken public immutable principalToken;
    IRiskToken public immutable riskToken;

    /// @dev Cached after first deposit. 0 means not yet cached.
    uint256 private _clearingPrice;

    /// @notice Maps nftId → original depositor. address(0) = not yet deposited.
    mapping(uint256 => address) private _depositorOf;

    constructor(
        address batchAuction_,
        address allocationNFT_,
        address principalToken_,
        address riskToken_
    ) {
        if (
            batchAuction_ == address(0) ||
            allocationNFT_ == address(0) ||
            principalToken_ == address(0) ||
            riskToken_ == address(0)
        ) revert ZeroAddress();

        batchAuction = IBatchAuction(batchAuction_);
        allocationNFT = IAllocationNFT(allocationNFT_);
        principalToken = IPrincipalToken(principalToken_);
        riskToken = IRiskToken(riskToken_);
    }

    /// @inheritdoc IARMVault
    /// @dev Returns cached value after first deposit, else reads from BatchAuction.
    function clearingPrice() public view returns (uint256) {
        return _clearingPrice != 0 ? _clearingPrice : batchAuction.clearingPrice();
    }

    /// @inheritdoc IARMVault
    function unlockTime() external view returns (uint256) {
        return batchAuction.unlockTime();
    }

    /// @notice Deposit an AllocationNFT and receive PT + RT minted 1:1 with token amount.
    /// @dev Reverts if the BatchAuction has not been finalized yet.
    ///      Caches clearingPrice on first call to avoid repeated external reads.
    ///      Follows Checks-Effects-Interactions.
    /// @param nftId The AllocationNFT token ID to deposit.
    function deposit(uint256 nftId) external nonReentrant {
        // --- Checks ---
        if (!batchAuction.finalized()) revert AuctionNotFinalized();
        if (allocationNFT.ownerOf(nftId) != msg.sender) revert NotNFTOwner(nftId, msg.sender);
        if (_depositorOf[nftId] != address(0)) revert AlreadyDeposited(nftId);

        IAllocationNFT.Allocation memory allocation = allocationNFT.getAllocation(nftId);

        // Cache clearing price on first deposit.
        if (_clearingPrice == 0) _clearingPrice = batchAuction.clearingPrice();

        if (allocation.clearingPrice != _clearingPrice) {
            revert ClearingPriceMismatch(_clearingPrice, allocation.clearingPrice);
        }

        // --- Effects ---
        _depositorOf[nftId] = msg.sender;

        // --- Interactions ---
        IERC721(address(allocationNFT)).transferFrom(msg.sender, address(this), nftId);
        principalToken.mint(msg.sender, allocation.amount);
        riskToken.mint(msg.sender, allocation.amount);

        emit Deposited(nftId, msg.sender, allocation.amount, _clearingPrice);
    }

    /// @inheritdoc IARMVault
    function getDepositor(uint256 nftId) external view returns (address) {
        return _depositorOf[nftId];
    }
}
