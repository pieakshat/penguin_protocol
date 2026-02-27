// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IAllocationNFT.sol";

/// @title AllocationNFT
/// @notice ERC721 representing a user's locked token allocation from the CCA.
/// @dev Minted by ContinuousClearingAuction post-clearing. Deposited into ARMVault
///      to receive PT and RT. Each token stores immutable allocation metadata.
contract AllocationNFT is IAllocationNFT, ERC721, Ownable {
    error ZeroAddress();
    error ZeroAmount();
    error InvalidToken(uint256 tokenId);
    error NotMinter(address caller);

    event MinterUpdated(address indexed oldMinter, address indexed newMinter);
    event AllocationMinted(
        uint256 indexed tokenId,
        address indexed to,
        uint256 amount,
        uint256 clearingPrice,
        uint256 unlockTime
    );

    /// @notice Address authorised to mint (ContinuousClearingAuction).
    address public minter;

    uint256 private _nextTokenId;

    mapping(uint256 => IAllocationNFT.Allocation) private _allocations;

    constructor(address owner_) ERC721("Penguin Allocation", "pALLOC") Ownable(owner_) {}

    /// @notice Set the minter. Called once after CCA is deployed.
    function setMinter(address minter_) external onlyOwner {
        if (minter_ == address(0)) revert ZeroAddress();
        address old = minter;
        minter = minter_;
        emit MinterUpdated(old, minter_);
    }

    /// @notice Mint an allocation NFT to `to`. Only callable by the CCA.
    /// @param to           Recipient (auction winner).
    /// @param amount       Token allocation in LaunchToken decimals.
    /// @param clearingPrice Auction clearing price in payment token decimals.
    /// @param unlockTime   TGE unlock timestamp.
    /// @return tokenId     The minted token ID.
    function mint(
        address to,
        uint256 amount,
        uint256 clearingPrice,
        uint256 unlockTime
    ) external returns (uint256 tokenId) {
        if (msg.sender != minter) revert NotMinter(msg.sender);
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        tokenId = _nextTokenId++;
        _allocations[tokenId] = IAllocationNFT.Allocation(amount, clearingPrice, unlockTime);
        _mint(to, tokenId);

        emit AllocationMinted(tokenId, to, amount, clearingPrice, unlockTime);
    }

    /// @notice Returns the allocation data for a given token.
    /// @param tokenId The NFT token ID.
    function getAllocation(uint256 tokenId) external view returns (IAllocationNFT.Allocation memory) {
        if (_ownerOf(tokenId) == address(0)) revert InvalidToken(tokenId);
        return _allocations[tokenId];
    }

    /// @notice Returns the owner of `tokenId`, or address(0) if it doesn't exist.
    function ownerOf(uint256 tokenId) public view override(ERC721, IAllocationNFT) returns (address) {
        return _ownerOf(tokenId);
    }
}
