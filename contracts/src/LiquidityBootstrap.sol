// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./lib/Initializable.sol";

/// @title LiquidityBootstrap
/// @notice Holds USDC allocated for seeding PT/USDC and RT/USDC Uniswap v3 pools.
/// @dev One instance per campaign, deployed by the factory.
///      Owner (protocol) deposits USDC. Whitelisted market makers withdraw it
///      to deploy concentrated liquidity positions on Uniswap v3 externally.
///      The contract does not interact with Uniswap directly — MMs handle tick
///      math and position management. Deployment receipts are recorded on-chain
///      for transparency.
///
///      Typical flow:
///        1. Factory deploys this contract.
///        2. After CCA settles, owner calls allocate() to move USDC in.
///        3. Owner whitelists one or more MMs.
///        4. MM calls withdrawForLP() to pull USDC for seeding.
///        5. MM deploys position on Uniswap v3 and calls reportDeployed().
///        6. If MM goes dark, owner calls emergencyWithdraw().
///      Clone-compatible: deploy an implementation once, clone per campaign.
contract LiquidityBootstrap is Ownable, ReentrancyGuard, Initializable {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error ZeroAmount();
    error NotWhitelisted(address caller);
    error ExceedsAvailable(uint256 requested, uint256 available);

    event MMWhitelisted(address indexed mm, bool status);
    event Allocated(uint256 amount);
    event WithdrawnForLP(address indexed mm, address indexed token, uint256 amount);
    event DeploymentReported(address indexed mm, uint256 usdcDeployed, string poolDescription);
    event EmergencyWithdraw(address indexed to, uint256 amount);

    IERC20 public paymentToken;

    /// @notice PT token for this campaign. MMs may also withdraw PT for LP.
    address public ptToken;

    /// @notice RT token for this campaign. MMs may also withdraw RT for LP.
    address public rtToken;

    mapping(address => bool) public isWhitelisted;

    /// @notice Total USDC allocated to this contract for LP seeding.
    uint256 public totalAllocated;

    /// @notice USDC already withdrawn by MMs.
    uint256 public totalWithdrawn;

    constructor(
        address paymentToken_,
        address ptToken_,
        address rtToken_,
        address owner_
    ) Ownable(owner_) {
        if (paymentToken_ == address(0) || ptToken_ == address(0) || rtToken_ == address(0)) {
            revert ZeroAddress();
        }
        paymentToken = IERC20(paymentToken_);
        ptToken = ptToken_;
        rtToken = rtToken_;
        _disableInitializers();
    }

    /// @notice Clone initializer — called once on each EIP-1167 clone by the factory.
    function initialize(
        address paymentToken_,
        address ptToken_,
        address rtToken_,
        address owner_
    ) external initializer {
        if (paymentToken_ == address(0) || ptToken_ == address(0) || rtToken_ == address(0)) {
            revert ZeroAddress();
        }
        paymentToken = IERC20(paymentToken_);
        ptToken = ptToken_;
        rtToken = rtToken_;
        _transferOwnership(owner_);
    }

    /// @notice Whitelist or de-whitelist a market maker address.
    function setWhitelisted(address mm, bool status) external onlyOwner {
        if (mm == address(0)) revert ZeroAddress();
        isWhitelisted[mm] = status;
        emit MMWhitelisted(mm, status);
    }

    /// @notice Transfer USDC from owner into this contract as LP allocation.
    /// @dev Owner must approve this contract to spend paymentToken first.
    function allocate(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        paymentToken.safeTransferFrom(msg.sender, address(this), amount);
        totalAllocated += amount;
        emit Allocated(amount);
    }

    /// @notice Whitelisted MM withdraws USDC (or PT/RT) to deploy as LP on Uniswap v3.
    /// @dev `token` must be paymentToken, ptToken, or rtToken.
    ///      For USDC withdrawals, tracks against totalWithdrawn.
    /// @param token  Token address to withdraw.
    /// @param amount Amount to withdraw.
    /// @param to     Destination — typically the MM's deployment wallet.
    function withdrawForLP(address token, uint256 amount, address to) external nonReentrant {
        if (!isWhitelisted[msg.sender]) revert NotWhitelisted(msg.sender);
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroAddress();

        if (token == address(paymentToken)) {
            uint256 available = totalAllocated - totalWithdrawn;
            if (amount > available) revert ExceedsAvailable(amount, available);
            totalWithdrawn += amount;
        }

        IERC20(token).safeTransfer(to, amount);
        emit WithdrawnForLP(msg.sender, token, amount);
    }

    /// @notice MM records how much USDC was deployed and into which pool.
    /// @dev Purely for on-chain transparency and frontend indexing.
    function reportDeployed(uint256 usdcDeployed, string calldata poolDescription) external {
        if (!isWhitelisted[msg.sender]) revert NotWhitelisted(msg.sender);
        emit DeploymentReported(msg.sender, usdcDeployed, poolDescription);
    }

    /// @notice Owner recovers all remaining USDC if MMs fail to deploy.
    function emergencyWithdraw(address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 balance = paymentToken.balanceOf(address(this));
        if (balance == 0) revert ZeroAmount();
        paymentToken.safeTransfer(to, balance);
        emit EmergencyWithdraw(to, balance);
    }

    /// @notice Returns remaining USDC available for LP deployment.
    function availableForLP() external view returns (uint256) {
        return totalAllocated - totalWithdrawn;
    }
}
