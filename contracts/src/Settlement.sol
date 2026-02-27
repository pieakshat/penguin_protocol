// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ILaunchToken.sol";
import "./interfaces/IPrincipalToken.sol";
import "./interfaces/IRiskToken.sol";
import "./interfaces/IARMVault.sol";

/// @title Settlement
/// @notice Handles post-TGE redemption of PT for LaunchTokens and RT for USDC.
///
/// @dev PT flow (simple):
///        After unlockTime, PT holders burn PT 1:1 for LaunchToken.
///
///      RT flow (capped + pro-rata):
///        Owner sets TGE price after a mandatory delay post-unlock.
///        RT settles at max(0, min(tgePrice, clearingPrice * rtCapMultiplier) - clearingPrice).
///        The cap bounds the protocol's maximum USDC liability to a known amount.
///        Owner deposits a USDC reserve before calling setTGEPrice.
///        payoutPerRT is computed once at setTGEPrice time and frozen —
///        all RT holders receive the same rate regardless of settlement order.
///        If the reserve is insufficient, payout is pro-rated uniformly across all RT.
contract Settlement is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error NotYetUnlocked();
    error TGEPriceNotSet();
    error TGEPriceAlreadySet();
    error PriceDelayNotMet();
    error InvalidTGEPrice();
    error ZeroAmount();
    error ZeroAddress();
    error SettlementWindowOpen();

    event RTReserveDeposited(uint256 amount);
    event TGEPriceSet(uint256 tgePrice, uint256 effectivePrice, uint256 payoutPerRT);
    event PTRedeemed(address indexed user, uint256 amount);
    event RTSettled(address indexed user, uint256 rtAmount, uint256 usdcPayout);
    event UnusedReserveWithdrawn(address indexed to, uint256 amount);

    /// @notice Minimum delay after unlockTime before the owner can set TGE price.
    ///         Forces the token to trade on the open market before price is locked.
    uint256 public constant MIN_PRICE_DELAY = 24 hours;

    /// @notice How long after setTGEPrice the owner must wait before reclaiming unused reserve.
    uint256 public constant SETTLEMENT_WINDOW = 30 days;

    uint256 private constant PRECISION = 1e18;

    ILaunchToken public immutable launchToken;
    IPrincipalToken public immutable principalToken;
    IRiskToken public immutable riskToken;
    IARMVault public immutable armVault;
    IERC20 public immutable paymentToken;

    /// @notice Maximum TGE price multiplier for RT settlement.
    ///         e.g. 5 means RT pays out on at most 5x clearingPrice.
    ///         Bounds the USDC liability to: totalRT * clearingPrice * (rtCapMultiplier - 1).
    uint256 public immutable rtCapMultiplier;

    uint256 public tgePrice;
    bool public tgePriceSet;

    /// @notice USDC payout per 1e18 RT tokens. Frozen at setTGEPrice time.
    ///         Incorporates both the cap and pro-rata logic.
    uint256 public payoutPerRT;

    /// @notice Snapshot of total RT supply at setTGEPrice time.
    uint256 public totalRTOutstanding;

    /// @notice USDC held for RT payouts. Decreases as RT is settled.
    uint256 public rtReserve;

    /// @notice Timestamp when setTGEPrice was called. Used to gate reserve withdrawal.
    uint256 public tgePriceSetAt;

    /// @param launchToken_     LaunchToken contract — Settlement is its minter.
    /// @param principalToken_  PT contract.
    /// @param riskToken_       RT contract.
    /// @param armVault_        ARMVault — provides clearingPrice and unlockTime.
    /// @param paymentToken_    USDC.
    /// @param rtCapMultiplier_ Max TGE price as a multiple of clearingPrice (e.g. 5 = 5x cap).
    /// @param owner_           Protocol multisig.
    constructor(
        address launchToken_,
        address principalToken_,
        address riskToken_,
        address armVault_,
        address paymentToken_,
        uint256 rtCapMultiplier_,
        address owner_
    ) Ownable(owner_) {
        if (
            launchToken_ == address(0) ||
            principalToken_ == address(0) ||
            riskToken_ == address(0) ||
            armVault_ == address(0) ||
            paymentToken_ == address(0)
        ) revert ZeroAddress();
        if (rtCapMultiplier_ <= 1) revert InvalidTGEPrice();

        launchToken = ILaunchToken(launchToken_);
        principalToken = IPrincipalToken(principalToken_);
        riskToken = IRiskToken(riskToken_);
        armVault = IARMVault(armVault_);
        paymentToken = IERC20(paymentToken_);
        rtCapMultiplier = rtCapMultiplier_;
    }

    /// @notice Deposit USDC into the RT settlement reserve.
    /// @dev Can be called before or after setTGEPrice.
    ///      If called after, payoutPerRT is already frozen — extra USDC stays as buffer.
    function depositRTReserve(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        paymentToken.safeTransferFrom(msg.sender, address(this), amount);
        rtReserve += amount;
        emit RTReserveDeposited(amount);
    }

    /// @notice Set the TGE price and freeze the RT payout rate.
    /// @dev Can only be called after unlockTime + MIN_PRICE_DELAY.
    ///      Applies the cap: effectivePrice = min(tgePrice_, clearingPrice * rtCapMultiplier).
    ///      Computes payoutPerRT: if reserve covers full payout → full rate.
    ///                            if reserve is short → pro-rated uniformly.
    ///      After this call, all RT holders know exactly what they will receive per RT.
    /// @param tgePrice_ Market price of LaunchToken in payment token decimals at TGE.
    function setTGEPrice(uint256 tgePrice_) external onlyOwner {
        if (tgePriceSet) revert TGEPriceAlreadySet();
        if (tgePrice_ == 0) revert InvalidTGEPrice();

        uint256 unlock = armVault.unlockTime();
        if (block.timestamp < unlock + MIN_PRICE_DELAY) revert PriceDelayNotMet();

        uint256 cp = armVault.clearingPrice();
        uint256 cappedPrice = cp * rtCapMultiplier;
        uint256 effectivePrice = tgePrice_ < cappedPrice ? tgePrice_ : cappedPrice;

        uint256 payout;

        if (effectivePrice > cp) {
            uint256 maxPayoutPerRT = effectivePrice - cp;
            uint256 rtSupply = riskToken.totalSupply();
            uint256 totalMaxPayout = (rtSupply * maxPayoutPerRT) / PRECISION;

            if (rtSupply == 0) {
                payout = 0;
            } else if (rtReserve >= totalMaxPayout) {
                payout = maxPayoutPerRT;
            } else {
                // Pro-rate: each RT gets rtReserve / rtSupply USDC.
                payout = (rtReserve * PRECISION) / rtSupply;
            }

            totalRTOutstanding = rtSupply;
        }

        tgePrice = tgePrice_;
        tgePriceSet = true;
        tgePriceSetAt = block.timestamp;
        payoutPerRT = payout;

        emit TGEPriceSet(tgePrice_, effectivePrice, payout);
    }

    /// @notice Redeem PT for LaunchTokens 1:1.
    /// @dev Caller must approve Settlement to spend their PT first.
    /// @param amount Amount of PT to redeem.
    function redeemPT(uint256 amount) external nonReentrant {
        if (block.timestamp < armVault.unlockTime()) revert NotYetUnlocked();
        if (amount == 0) revert ZeroAmount();

        principalToken.burnFrom(msg.sender, amount);
        launchToken.mint(msg.sender, amount);

        emit PTRedeemed(msg.sender, amount);
    }

    /// @notice Settle RT for USDC payout.
    /// @dev Caller must approve Settlement to spend their RT first.
    ///      payoutPerRT is frozen — no ordering advantage, all holders receive same rate.
    ///      If RT is out of the money (tgePrice <= clearingPrice), payout is 0 and RT is burned.
    /// @param amount Amount of RT to settle.
    function settleRT(uint256 amount) external nonReentrant {
        if (!tgePriceSet) revert TGEPriceNotSet();
        if (amount == 0) revert ZeroAmount();

        uint256 payout = (amount * payoutPerRT) / PRECISION;

        riskToken.burnFrom(msg.sender, amount);

        if (payout > 0) {
            rtReserve -= payout;
            paymentToken.safeTransfer(msg.sender, payout);
        }

        emit RTSettled(msg.sender, amount, payout);
    }

    /// @notice Withdraw unused USDC reserve after the settlement window closes.
    /// @dev Only callable after SETTLEMENT_WINDOW has elapsed since setTGEPrice.
    ///      Any RT not settled after this window is effectively abandoned.
    function withdrawUnusedReserve(address to) external onlyOwner {
        if (!tgePriceSet) revert TGEPriceNotSet();
        if (block.timestamp < tgePriceSetAt + SETTLEMENT_WINDOW) revert SettlementWindowOpen();
        if (to == address(0)) revert ZeroAddress();

        uint256 amount = rtReserve;
        rtReserve = 0;
        paymentToken.safeTransfer(to, amount);

        emit UnusedReserveWithdrawn(to, amount);
    }

    /// @notice Maximum USDC liability for RT given current reserve.
    ///         Useful for the protocol to know how much to deposit pre-TGE.
    function maxRTLiability() external view returns (uint256) {
        uint256 cp = armVault.clearingPrice();
        if (cp == 0) return 0;
        uint256 cappedUpside = cp * (rtCapMultiplier - 1);
        return (riskToken.totalSupply() * cappedUpside) / PRECISION;
    }
}
