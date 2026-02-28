// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./lib/Initializable.sol";

/// @title RiskToken (RT)
/// @notice Represents the volatility/upside exposure on a token allocation.
/// @dev Minted by ARMVault when an AllocationNFT is deposited.
///      At TGE, 1 RT settles for max(0, TGEPrice - clearingPrice) in USDC via Settlement.
///      Burn is handled through the standard ERC20 allowance pattern —
///      Settlement calls burnFrom() after the user approves it.
///      Clone-compatible: deploy an implementation once, clone per campaign.
contract RiskToken is ERC20, ERC20Burnable, Ownable, Initializable {
    error ZeroAddress();
    error ZeroAmount();
    error NotVault(address caller);

    event VaultUpdated(address indexed oldVault, address indexed newVault);

    /// @notice ARMVault — the only address authorised to mint.
    address public vault;

    // Storage for name/symbol so clones (which skip the ERC20 constructor) work correctly.
    string private _n;
    string private _s;

    /// @param launchTokenSymbol Symbol of the launch token (e.g. "XPC").
    ///                          Results in name "Risk Token - XPC" and symbol "RT-XPC".
    constructor(string memory launchTokenSymbol, address owner_)
        ERC20(
            string.concat("Risk Token - ", launchTokenSymbol),
            string.concat("RT-", launchTokenSymbol)
        )
        Ownable(owner_)
    {
        _n = string.concat("Risk Token - ", launchTokenSymbol);
        _s = string.concat("RT-", launchTokenSymbol);
        _disableInitializers();
    }

    /// @notice Clone initializer — called once on each EIP-1167 clone by the factory.
    function initialize(string memory launchTokenSymbol, address owner_) external initializer {
        _n = string.concat("Risk Token - ", launchTokenSymbol);
        _s = string.concat("RT-", launchTokenSymbol);
        _transferOwnership(owner_);
    }

    /// @dev Override so clones (which skip ERC20 constructor) return the correct name.
    function name() public view override returns (string memory) {
        return _n;
    }

    /// @dev Override so clones (which skip ERC20 constructor) return the correct symbol.
    function symbol() public view override returns (string memory) {
        return _s;
    }

    /// @notice Set the vault address. Called once after ARMVault is deployed.
    function setVault(address vault_) external onlyOwner {
        if (vault_ == address(0)) revert ZeroAddress();
        address old = vault;
        vault = vault_;
        emit VaultUpdated(old, vault_);
    }

    /// @notice Mint RT to `to`. Only callable by ARMVault.
    /// @param to     Recipient address.
    /// @param amount Amount in RT decimals (1e18).
    function mint(address to, uint256 amount) external {
        if (msg.sender != vault) revert NotVault(msg.sender);
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        _mint(to, amount);
    }
}
