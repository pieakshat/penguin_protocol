// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal initializer guard for EIP-1167 clone contracts.
///         Prevents double-initialization and disables initialize() on implementations.
abstract contract Initializable {
    bool private _initialized;

    error AlreadyInitialized();

    modifier initializer() {
        if (_initialized) revert AlreadyInitialized();
        _initialized = true;
        _;
    }

    /// @dev Call in implementation constructor to prevent initialize() being called on the impl itself.
    function _disableInitializers() internal {
        _initialized = true;
    }
}
