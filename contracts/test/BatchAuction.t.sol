// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/BatchAuction.sol";
import "../src/AllocationNFT.sol";
import "./mocks/MockERC20.sol";

contract BatchAuctionTest is Test {
    ContinuousClearingAuction auction;
    AllocationNFT             nft;
    MockERC20                 usdc;

    address owner = makeAddr("owner");
    address alice = makeAddr("alice");
    address bob   = makeAddr("bob");
    address carol = makeAddr("carol");

    uint256 constant SUPPLY   = 100e18;
    uint256 constant MIN_P    = 1e6;   // $1 USDC
    uint256 constant START    = 1000;
    uint256 constant END      = START + 7 days;
    uint256 constant UNLOCK   = END + 30 days;

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);

        vm.startPrank(owner);
        nft = new AllocationNFT(owner);
        auction = new ContinuousClearingAuction(
            address(usdc),
            address(nft),
            SUPPLY,
            START,
            END,
            UNLOCK,
            MIN_P,
            owner
        );
        nft.setMinter(address(auction));
        vm.stopPrank();

        // Fund bidders
        usdc.mint(alice, 10_000e6);
        usdc.mint(bob,   10_000e6);
        usdc.mint(carol, 10_000e6);
    }

    // ─── submitBid ──────────────────────────────────────────────────────────

    function test_submitBid_basic() public {
        vm.warp(START + 1);
        vm.startPrank(alice);
        usdc.approve(address(auction), 300e6);
        uint256 bidId = auction.submitBid(100e18, 3e6);
        vm.stopPrank();

        assertEq(bidId, 0);
        ContinuousClearingAuction.Bid memory b = auction.getBid(0);
        assertEq(b.bidder, alice);
        assertEq(b.tokenAmount, 100e18);
        assertEq(b.maxPrice, 3e6);
        assertFalse(b.settled);
    }

    function test_submitBid_transfersCorrectDeposit() public {
        // deposit = (100e18 * 3e6) / 1e18 = 300e6
        vm.warp(START + 1);
        uint256 pre = usdc.balanceOf(alice);

        vm.startPrank(alice);
        usdc.approve(address(auction), 300e6);
        auction.submitBid(100e18, 3e6);
        vm.stopPrank();

        assertEq(pre - usdc.balanceOf(alice), 300e6);
        assertEq(usdc.balanceOf(address(auction)), 300e6);
    }

    function test_submitBid_revertsBeforeStart() public {
        vm.warp(START - 1);
        vm.prank(alice);
        vm.expectRevert(ContinuousClearingAuction.AuctionNotActive.selector);
        auction.submitBid(1e18, 1e6);
    }

    function test_submitBid_revertsAfterEnd() public {
        vm.warp(END + 1);
        vm.prank(alice);
        vm.expectRevert(ContinuousClearingAuction.AuctionNotActive.selector);
        auction.submitBid(1e18, 1e6);
    }

    function test_submitBid_revertsBelowMinPrice() public {
        vm.warp(START + 1);
        vm.prank(alice);
        vm.expectRevert(ContinuousClearingAuction.BelowMinimumPrice.selector);
        auction.submitBid(1e18, MIN_P - 1);
    }

    function test_submitBid_revertsZeroAmount() public {
        vm.warp(START + 1);
        vm.prank(alice);
        vm.expectRevert(ContinuousClearingAuction.ZeroAmount.selector);
        auction.submitBid(0, 2e6);
    }

    // ─── finalizeAuction ────────────────────────────────────────────────────

    /// @dev Exactly subscribed at minimumPrice: Alice 60e18 @ $2, Bob 40e18 @ $2.
    ///      Clearing = $2, demand = supply = 100e18, fillRatio = 1e18.
    function test_finalize_exactlySubscribed() public {
        _placeBids(60e18, 2e6, alice, 40e18, 2e6, bob);
        vm.warp(END + 1);

        vm.prank(owner);
        auction.finalizeAuction(2e6);

        assertEq(auction.clearingPrice(), 2e6);
        assertEq(auction.totalSubscribed(), 100e18);
        assertEq(auction.fillRatio(), 1e18);
        assertTrue(auction.finalized());
    }

    /// @dev Oversubscribed: Alice 80e18 @ $3, Bob 80e18 @ $3, supply = 100e18.
    ///      totalSubscribed = 160e18, fillRatio = 100e18*1e18/160e18 = 0.625e18.
    function test_finalize_oversubscribed() public {
        _placeBids(80e18, 3e6, alice, 80e18, 3e6, bob);
        vm.warp(END + 1);

        vm.prank(owner);
        auction.finalizeAuction(3e6);

        assertEq(auction.totalSubscribed(), 160e18);
        // fillRatio = 100e18 * 1e18 / 160e18 = 625000000000000000
        assertEq(auction.fillRatio(), (100e18 * 1e18) / 160e18);
    }

    /// @dev Undersubscribed: only Alice 60e18 @ $5, supply = 100e18.
    ///      Must finalize at minimumPrice.
    function test_finalize_undersubscribed_atMinPrice() public {
        vm.warp(START + 1);
        vm.startPrank(alice);
        usdc.approve(address(auction), 300e6);
        auction.submitBid(60e18, 5e6);
        vm.stopPrank();

        vm.warp(END + 1);
        vm.prank(owner);
        auction.finalizeAuction(MIN_P);

        assertEq(auction.clearingPrice(), MIN_P);
        assertEq(auction.fillRatio(), 1e18);
    }

    function test_finalize_revertsBeforeEnd() public {
        vm.warp(END - 1);
        vm.prank(owner);
        vm.expectRevert(ContinuousClearingAuction.AuctionNotEnded.selector);
        auction.finalizeAuction(2e6);
    }

    function test_finalize_revertsAlreadyFinalized() public {
        _placeBids(60e18, 2e6, alice, 40e18, 2e6, bob);
        vm.warp(END + 1);

        vm.prank(owner);
        auction.finalizeAuction(2e6);

        vm.prank(owner);
        vm.expectRevert(ContinuousClearingAuction.AuctionAlreadyFinalized.selector);
        auction.finalizeAuction(2e6);
    }

    function test_finalize_revertsInvalidClearingPrice_belowMin() public {
        _placeBids(60e18, 2e6, alice, 40e18, 2e6, bob);
        vm.warp(END + 1);

        vm.prank(owner);
        vm.expectRevert(ContinuousClearingAuction.InvalidClearingPrice.selector);
        auction.finalizeAuction(MIN_P - 1);
    }

    /// @dev Undersubscribed but price above floor — invalid, correct price is MIN_P.
    function test_finalize_revertsUndersubscribedAboveFloor() public {
        // deposit = (60e18 * 5e6) / 1e18 = 300e6
        vm.warp(START + 1);
        vm.startPrank(alice);
        usdc.approve(address(auction), 300e6);
        auction.submitBid(60e18, 5e6); // demand 60e18 < supply 100e18
        vm.stopPrank();

        vm.warp(END + 1);
        vm.prank(owner);
        vm.expectRevert(ContinuousClearingAuction.InvalidClearingPrice.selector);
        auction.finalizeAuction(5e6); // would be too high
    }

    // ─── settle ─────────────────────────────────────────────────────────────

    /// @dev Alice bids 60e18 @ $3, Bob bids 40e18 @ $2. Clearing = $2.
    ///      Alice: filled=60e18, cost=120e6, deposited=180e6, refund=60e6.
    ///      Bob:   filled=40e18, cost=80e6,  deposited=80e6,  refund=0.
    ///      Proceeds = 200e6.
    function test_settle_winnerReceivesNFTandRefund() public {
        _placeBids(60e18, 3e6, alice, 40e18, 2e6, bob);
        vm.warp(END + 1);
        vm.prank(owner);
        auction.finalizeAuction(2e6);

        uint256 alicePre = usdc.balanceOf(alice);

        vm.prank(alice);
        auction.settle(0); // Alice bid id 0

        // NFT minted
        assertEq(nft.ownerOf(0), alice);
        IAllocationNFT.Allocation memory a = nft.getAllocation(0);
        assertEq(a.amount, 60e18);
        assertEq(a.clearingPrice, 2e6);

        // Refund: deposited 180e6, cost 120e6, refund 60e6
        assertEq(usdc.balanceOf(alice) - alicePre, 60e6);
    }

    /// @dev Alice fills the supply at $3; Bob's max is $2 so he's a loser.
    ///      Alice: 100e18 @ $3. Bob: 50e18 @ $2.
    ///      Clearing at $3: only Alice qualifies (100e18 = supply). Bob loses.
    function test_settle_loserGetsFullRefund() public {
        // deposit Alice: (100e18 * 3e6) / 1e18 = 300e6
        // deposit Bob:   (50e18  * 2e6) / 1e18 = 100e6
        _placeBids(100e18, 3e6, alice, 50e18, 2e6, bob);
        vm.warp(END + 1);

        // Clearing at $3: subscribed = 100e18 = supply → valid
        vm.prank(owner);
        auction.finalizeAuction(3e6);

        uint256 bobPre = usdc.balanceOf(bob);

        vm.prank(bob);
        auction.settle(1); // Bob bid id 1

        // Full refund: 50e18 * 2e6 / 1e18 = 100e6
        assertEq(usdc.balanceOf(bob) - bobPre, 100e6);
    }

    function test_settle_proceedsAccumulate() public {
        _placeBids(60e18, 3e6, alice, 40e18, 2e6, bob);
        vm.warp(END + 1);
        vm.prank(owner);
        auction.finalizeAuction(2e6);

        vm.prank(alice);
        auction.settle(0);
        assertEq(auction.proceedsAvailable(), 120e6); // Alice's cost

        vm.prank(bob);
        auction.settle(1);
        assertEq(auction.proceedsAvailable(), 200e6); // + Bob's cost 80e6
    }

    function test_settle_revertsNotFinalized() public {
        vm.warp(START + 1);
        vm.startPrank(alice);
        usdc.approve(address(auction), 300e6);
        auction.submitBid(60e18, 3e6);
        vm.stopPrank();

        vm.prank(alice);
        vm.expectRevert(ContinuousClearingAuction.AuctionNotFinalized.selector);
        auction.settle(0);
    }

    function test_settle_revertsAlreadySettled() public {
        _placeBids(60e18, 2e6, alice, 40e18, 2e6, bob);
        vm.warp(END + 1);
        vm.prank(owner);
        auction.finalizeAuction(2e6);

        vm.prank(alice);
        auction.settle(0);

        vm.prank(alice);
        vm.expectRevert(ContinuousClearingAuction.BidAlreadySettled.selector);
        auction.settle(0);
    }

    function test_settle_revertsNotBidder() public {
        _placeBids(60e18, 2e6, alice, 40e18, 2e6, bob);
        vm.warp(END + 1);
        vm.prank(owner);
        auction.finalizeAuction(2e6);

        vm.prank(carol);
        vm.expectRevert(ContinuousClearingAuction.NotBidder.selector);
        auction.settle(0);
    }

    /// @dev Pro-rata: Alice 80e18 @ $3, Bob 80e18 @ $3, supply=100e18.
    ///      fillRatio = 100/160 = 0.625. Alice filled = 50e18.
    function test_settle_proRataFill() public {
        _placeBids(80e18, 3e6, alice, 80e18, 3e6, bob);
        vm.warp(END + 1);
        vm.prank(owner);
        auction.finalizeAuction(3e6);

        vm.prank(alice);
        auction.settle(0);

        IAllocationNFT.Allocation memory a = nft.getAllocation(0);
        assertEq(a.amount, 50e18); // 80e18 * 0.625 = 50e18
    }

    // ─── emergencyRefund ────────────────────────────────────────────────────

    function test_emergencyRefund_afterGracePeriod() public {
        vm.warp(START + 1);
        vm.startPrank(alice);
        usdc.approve(address(auction), 300e6);
        auction.submitBid(100e18, 3e6);
        vm.stopPrank();

        vm.warp(END + 7 days + 1);

        uint256 pre = usdc.balanceOf(alice);
        vm.prank(alice);
        auction.emergencyRefund(0);

        assertEq(usdc.balanceOf(alice) - pre, 300e6);
    }

    function test_emergencyRefund_revertsBeforeGracePeriod() public {
        vm.warp(START + 1);
        vm.startPrank(alice);
        usdc.approve(address(auction), 300e6);
        auction.submitBid(100e18, 3e6);
        vm.stopPrank();

        vm.warp(END + 1);
        vm.prank(alice);
        vm.expectRevert(ContinuousClearingAuction.GracePeriodNotExpired.selector);
        auction.emergencyRefund(0);
    }

    function test_emergencyRefund_revertsIfFinalized() public {
        _placeBids(60e18, 2e6, alice, 40e18, 2e6, bob);
        vm.warp(END + 1);
        vm.prank(owner);
        auction.finalizeAuction(2e6);

        vm.warp(END + 7 days + 1);
        vm.prank(alice);
        vm.expectRevert(ContinuousClearingAuction.AuctionAlreadyFinalized.selector);
        auction.emergencyRefund(0);
    }

    // ─── withdrawProceeds ───────────────────────────────────────────────────

    function test_withdrawProceeds_ownerWithdraws() public {
        _placeBids(60e18, 2e6, alice, 40e18, 2e6, bob);
        vm.warp(END + 1);
        vm.prank(owner);
        auction.finalizeAuction(2e6);

        vm.prank(alice);
        auction.settle(0);
        vm.prank(bob);
        auction.settle(1);

        uint256 pre = usdc.balanceOf(owner);
        vm.prank(owner);
        auction.withdrawProceeds(owner);

        assertEq(usdc.balanceOf(owner) - pre, 200e6);
        assertEq(auction.proceedsAvailable(), 0);
    }

    function test_withdrawProceeds_revertsNoProceeds() public {
        _placeBids(60e18, 2e6, alice, 40e18, 2e6, bob);
        vm.warp(END + 1);
        vm.prank(owner);
        auction.finalizeAuction(2e6);

        vm.prank(owner);
        vm.expectRevert(ContinuousClearingAuction.NoProceeds.selector);
        auction.withdrawProceeds(owner);
    }

    // ─── helpers ────────────────────────────────────────────────────────────

    function _placeBids(
        uint256 amtA, uint256 priceA, address bidderA,
        uint256 amtB, uint256 priceB, address bidderB
    ) internal {
        vm.warp(START + 1);

        uint256 depositA = (amtA * priceA) / 1e18;
        uint256 depositB = (amtB * priceB) / 1e18;

        vm.startPrank(bidderA);
        usdc.approve(address(auction), depositA);
        auction.submitBid(amtA, priceA);
        vm.stopPrank();

        vm.startPrank(bidderB);
        usdc.approve(address(auction), depositB);
        auction.submitBid(amtB, priceB);
        vm.stopPrank();
    }
}
