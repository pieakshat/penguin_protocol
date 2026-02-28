// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockERC20
/// @notice Drop-in USDC/USDT replacement for local and testnet deployments.
/// @dev Configurable decimals (use 6 for USDC/USDT, 18 for BSC stablecoins).
///      Owner can mint freely. Anyone can burn their own balance.
contract MockERC20 is ERC20, Ownable {
    uint8 private _dec;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address owner_
    ) ERC20(name_, symbol_) Ownable(owner_) {
        _dec = decimals_;
    }

    /// @notice Returns the token decimals.
    function decimals() public view override returns (uint8) {
        return _dec;
    }

    /// @notice Mint tokens to any address. Only callable by owner.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Burn tokens from caller's own balance.
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
