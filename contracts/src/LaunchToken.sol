// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./lib/Initializable.sol";

/// @title LaunchToken
/// @notice ERC20 token minted at TGE and distributed to PT holders via Settlement.
/// @dev Mint authority is transferred to the Settlement contract post-deploy.
///      No minting is possible after the cap is reached.
///      Clone-compatible: deploy an implementation once, clone per campaign.
contract LaunchToken is ERC20, Ownable, Initializable {
    error ExceedsMaxSupply(uint256 requested, uint256 available);
    error ZeroAddress();
    error ZeroAmount();

    event MinterUpdated(address indexed oldMinter, address indexed newMinter);

    /// @notice Maximum token supply. Fixed at deploy/initialize time.
    uint256 public maxSupply;

    /// @notice Address authorised to mint (Settlement contract).
    address public minter;

    // Storage for name/symbol so clones (which skip the ERC20 constructor) work correctly.
    string private _n;
    string private _s;

    /// @param name_      Token name.
    /// @param symbol_    Token symbol.
    /// @param maxSupply_ Hard cap on total supply.
    /// @param owner_     Protocol multisig / deployer.
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 maxSupply_,
        address owner_
    ) ERC20(name_, symbol_) Ownable(owner_) {
        if (maxSupply_ == 0) revert ZeroAmount();
        maxSupply = maxSupply_;
        _n = name_;
        _s = symbol_;
        _disableInitializers();
    }

    /// @notice Clone initializer — called once on each EIP-1167 clone by the factory.
    /// @dev Replaces the constructor for clone instances.
    function initialize(
        string memory name_,
        string memory symbol_,
        uint256 maxSupply_,
        address owner_
    ) external initializer {
        if (maxSupply_ == 0) revert ZeroAmount();
        maxSupply = maxSupply_;
        _n = name_;
        _s = symbol_;
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

    /// @notice Set the minter address. Called once to point at Settlement.
    /// @dev Only owner. Emits MinterUpdated.
    function setMinter(address minter_) external onlyOwner {
        if (minter_ == address(0)) revert ZeroAddress();
        address old = minter;
        minter = minter_;
        emit MinterUpdated(old, minter_);
    }

    /// @notice Mint tokens to `to`. Only callable by the authorised minter.
    /// @param to     Recipient address.
    /// @param amount Amount to mint (in token decimals).
    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert OwnableUnauthorizedAccount(msg.sender);
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 available = maxSupply - totalSupply();
        if (amount > available) revert ExceedsMaxSupply(amount, available);

        _mint(to, amount);
    }

    /// @notice Burn tokens from the caller's balance.
    /// @param amount Amount to burn.
    function burn(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        _burn(msg.sender, amount);
    }
}
