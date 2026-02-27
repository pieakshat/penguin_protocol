// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IAllocationNFT.sol";

/// @title ContinuousClearingAuction
/// @notice Uniform-price batch auction for fair token distribution.
/// @dev Users submit bids (tokenAmount + maxPrice) during the auction window.
///      After the window closes, the owner submits the clearing price — the lowest
///      price at which cumulative demand meets supply. All winning bids pay the same
///      clearing price regardless of their max. Excess USDC is refunded on settlement.
///      If oversubscribed, winning bids are pro-rated via fillRatio.
///      If the owner fails to finalize within FINALIZATION_GRACE_PERIOD, bidders
///      can emergency-refund their deposits without trust assumptions.
contract ContinuousClearingAuction is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error AuctionNotActive();
    error AuctionNotEnded();
    error AuctionAlreadyFinalized();
    error AuctionNotFinalized();
    error InvalidClearingPrice();
    error BidAlreadySettled();
    error NotBidder();
    error ZeroAmount();
    error ZeroAddress();
    error BelowMinimumPrice();
    error InvalidTimestamps();
    error MaxBidsReached();
    error GracePeriodNotExpired();

    event BidSubmitted(
        uint256 indexed bidId,
        address indexed bidder,
        uint256 tokenAmount,
        uint256 maxPrice
    );
    event AuctionFinalized(uint256 clearingPrice, uint256 totalSubscribed, uint256 totalFilled);
    event AllocationClaimed(
        uint256 indexed bidId,
        address indexed bidder,
        uint256 filledAmount,
        uint256 refund
    );
    event BidRefunded(uint256 indexed bidId, address indexed bidder, uint256 refund);

    struct Bid {
        address bidder;
        /// @dev Token amount in LaunchToken decimals (1e18).
        uint256 tokenAmount;
        /// @dev Max price per token in payment token decimals (e.g. USDC 6dp).
        uint256 maxPrice;
        bool settled;
    }

    /// @dev Used for price-to-deposit and fill math. Matches LaunchToken decimals.
    uint256 private constant PRECISION = 1e18;

    /// @notice Hard cap on bids to bound gas cost of finalizeAuction.
    uint256 public constant MAX_BIDS = 500;

    /// @notice Window after auctionEnd before emergency refunds become available.
    uint256 public constant FINALIZATION_GRACE_PERIOD = 7 days;

    IERC20 public immutable paymentToken;
    IAllocationNFT public immutable allocationNFT;

    /// @notice Total LaunchTokens available in this auction (1e18 decimals).
    uint256 public immutable totalTokenSupply;
    uint256 public immutable auctionStart;
    uint256 public immutable auctionEnd;
    /// @notice Passed directly into each minted AllocationNFT as the TGE unlock time.
    uint256 public immutable unlockTime;
    /// @notice Floor price per token in payment token decimals. Bids below this are rejected.
    uint256 public immutable minimumPrice;

    uint256 public clearingPrice;
    uint256 public totalSubscribed;

    /// @notice 1e18-scaled fill ratio: min(totalTokenSupply, totalSubscribed) * 1e18 / totalSubscribed.
    ///         Applied per bid in settle() to compute the pro-rated filled amount.
    uint256 public fillRatio;

    bool public finalized;

    Bid[] public bids;
    mapping(address => uint256[]) private _userBidIds;

    /// @param paymentToken_     USDC or other stablecoin address.
    /// @param allocationNFT_    AllocationNFT contract address.
    /// @param totalTokenSupply_ Total LaunchTokens for sale (1e18 decimals).
    /// @param auctionStart_     Timestamp when bidding opens.
    /// @param auctionEnd_       Timestamp when bidding closes.
    /// @param unlockTime_       TGE unlock timestamp — must be after auctionEnd_.
    /// @param minimumPrice_     Floor price per token in payment token decimals.
    /// @param owner_            Protocol multisig.
    constructor(
        address paymentToken_,
        address allocationNFT_,
        uint256 totalTokenSupply_,
        uint256 auctionStart_,
        uint256 auctionEnd_,
        uint256 unlockTime_,
        uint256 minimumPrice_,
        address owner_
    ) Ownable(owner_) {
        if (paymentToken_ == address(0) || allocationNFT_ == address(0)) revert ZeroAddress();
        if (totalTokenSupply_ == 0 || minimumPrice_ == 0) revert ZeroAmount();
        if (auctionEnd_ <= auctionStart_ || unlockTime_ <= auctionEnd_) revert InvalidTimestamps();

        paymentToken = IERC20(paymentToken_);
        allocationNFT = IAllocationNFT(allocationNFT_);
        totalTokenSupply = totalTokenSupply_;
        auctionStart = auctionStart_;
        auctionEnd = auctionEnd_;
        unlockTime = unlockTime_;
        minimumPrice = minimumPrice_;
    }

    /// @notice Submit a bid during the auction window.
    /// @dev Transfers deposit = (tokenAmount * maxPrice) / 1e18 from caller.
    /// @param tokenAmount Tokens requested in LaunchToken decimals (1e18).
    /// @param maxPrice    Max price per token in payment token decimals.
    /// @return bidId      Index of the stored bid.
    function submitBid(uint256 tokenAmount, uint256 maxPrice)
        external
        nonReentrant
        returns (uint256 bidId)
    {
        if (block.timestamp < auctionStart || block.timestamp > auctionEnd) revert AuctionNotActive();
        if (tokenAmount == 0) revert ZeroAmount();
        if (maxPrice < minimumPrice) revert BelowMinimumPrice();
        if (bids.length >= MAX_BIDS) revert MaxBidsReached();

        uint256 deposit = (tokenAmount * maxPrice) / PRECISION;
        paymentToken.safeTransferFrom(msg.sender, address(this), deposit);

        bidId = bids.length;
        bids.push(Bid({bidder: msg.sender, tokenAmount: tokenAmount, maxPrice: maxPrice, settled: false}));
        _userBidIds[msg.sender].push(bidId);

        emit BidSubmitted(bidId, msg.sender, tokenAmount, maxPrice);
    }

    /// @notice Finalize the auction by setting the clearing price.
    /// @dev Owner computes clearing price off-chain as the lowest price at which
    ///      cumulative demand >= totalTokenSupply. Contract validates the invariant:
    ///        - oversubscribed:  demand at clearingPrice_ >= totalTokenSupply
    ///        - undersubscribed: demand < totalTokenSupply only valid at minimumPrice
    ///      Sets fillRatio for pro-rata allocation when oversubscribed.
    /// @param clearingPrice_ Clearing price in payment token decimals.
    function finalizeAuction(uint256 clearingPrice_) external onlyOwner {
        if (block.timestamp <= auctionEnd) revert AuctionNotEnded();
        if (finalized) revert AuctionAlreadyFinalized();
        if (clearingPrice_ < minimumPrice) revert InvalidClearingPrice();

        uint256 subscribed;
        uint256 n = bids.length;
        for (uint256 i; i < n; ++i) {
            if (bids[i].maxPrice >= clearingPrice_) {
                subscribed += bids[i].tokenAmount;
            }
        }

        // Undersubscribed but price above floor means the clearing price is too high —
        // the correct price would be minimumPrice where all demand is captured.
        if (subscribed < totalTokenSupply && clearingPrice_ != minimumPrice) {
            revert InvalidClearingPrice();
        }

        uint256 filled = subscribed > totalTokenSupply ? totalTokenSupply : subscribed;

        clearingPrice = clearingPrice_;
        totalSubscribed = subscribed;
        fillRatio = subscribed > 0 ? (filled * PRECISION) / subscribed : 0;
        finalized = true;

        emit AuctionFinalized(clearingPrice_, subscribed, filled);
    }

    /// @notice Settle a bid after finalization.
    ///         Winners receive an AllocationNFT + refund of excess USDC.
    ///         Losers receive a full refund.
    /// @param bidId Bid index to settle.
    function settle(uint256 bidId) external nonReentrant {
        if (!finalized) revert AuctionNotFinalized();

        Bid storage bid = bids[bidId];
        if (bid.settled) revert BidAlreadySettled();
        if (bid.bidder != msg.sender) revert NotBidder();

        bid.settled = true;

        if (bid.maxPrice >= clearingPrice) {
            uint256 filledAmount = (bid.tokenAmount * fillRatio) / PRECISION;
            uint256 cost = (filledAmount * clearingPrice) / PRECISION;
            uint256 deposited = (bid.tokenAmount * bid.maxPrice) / PRECISION;
            uint256 refund = deposited - cost;

            if (refund > 0) {
                paymentToken.safeTransfer(msg.sender, refund);
            }

            if (filledAmount > 0) {
                allocationNFT.mint(msg.sender, filledAmount, clearingPrice, unlockTime);
            }

            emit AllocationClaimed(bidId, msg.sender, filledAmount, refund);
        } else {
            uint256 refund = (bid.tokenAmount * bid.maxPrice) / PRECISION;
            paymentToken.safeTransfer(msg.sender, refund);
            emit BidRefunded(bidId, msg.sender, refund);
        }
    }

    /// @notice Allows bidders to recover deposits if the owner never finalizes
    ///         within FINALIZATION_GRACE_PERIOD after auction end.
    /// @param bidId Bid index to refund.
    function emergencyRefund(uint256 bidId) external nonReentrant {
        if (finalized) revert AuctionAlreadyFinalized();
        if (block.timestamp <= auctionEnd + FINALIZATION_GRACE_PERIOD) revert GracePeriodNotExpired();

        Bid storage bid = bids[bidId];
        if (bid.settled) revert BidAlreadySettled();
        if (bid.bidder != msg.sender) revert NotBidder();

        bid.settled = true;
        uint256 refund = (bid.tokenAmount * bid.maxPrice) / PRECISION;
        paymentToken.safeTransfer(msg.sender, refund);

        emit BidRefunded(bidId, msg.sender, refund);
    }

    function getBidCount() external view returns (uint256) {
        return bids.length;
    }

    function getUserBidIds(address user) external view returns (uint256[] memory) {
        return _userBidIds[user];
    }

    function getBid(uint256 bidId) external view returns (Bid memory) {
        return bids[bidId];
    }
}
