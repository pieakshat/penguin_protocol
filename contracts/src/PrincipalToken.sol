// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title PrincipalToken (PT)
/// @notice Represents the principal claim on a token allocation.
/// @dev Minted by ARMVault when an AllocationNFT is deposited.
///      1 PT = right to redeem 1 LaunchToken at TGE via Settlement.
///      Burn is handled through the standard ERC20 allowance pattern —
///      Settlement calls burnFrom() after the user approves it.
contract PrincipalToken is ERC20, ERC20Burnable, Ownable {
    error ZeroAddress();
    error ZeroAmount();
    error NotVault(address caller);

    event VaultUpdated(address indexed oldVault, address indexed newVault);

    /// @notice ARMVault — the only address authorised to mint.
    address public vault;

    /// @param launchTokenSymbol Symbol of the launch token (e.g. "XPC").
    ///                          Results in name "Principal Token - XPC" and symbol "PT-XPC".
    constructor(string memory launchTokenSymbol, address owner_)
        ERC20(
            string.concat("Principal Token - ", launchTokenSymbol),
            string.concat("PT-", launchTokenSymbol)
        )
        Ownable(owner_)
    {}

    /// @notice Set the vault address. Called once after ARMVault is deployed.
    function setVault(address vault_) external onlyOwner {
        if (vault_ == address(0)) revert ZeroAddress();
        address old = vault;
        vault = vault_;
        emit VaultUpdated(old, vault_);
    }

    /// @notice Mint PT to `to`. Only callable by ARMVault.
    /// @param to     Recipient address.
    /// @param amount Amount in PT decimals (1e18).
    function mint(address to, uint256 amount) external {
        if (msg.sender != vault) revert NotVault(msg.sender);
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        _mint(to, amount);
    }
}
