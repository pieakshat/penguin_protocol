// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/Settlement.sol";
import "../src/LaunchToken.sol";
import "../src/PrincipalToken.sol";
import "../src/RiskToken.sol";
import "../src/AllocationNFT.sol";
import "../src/ARMVault.sol";
import "./mocks/MockBatchAuction.sol";
import "./mocks/MockERC20.sol";

contract SettlementTest is Test {
    Settlement        settlement;
    LaunchToken       launchToken;
    PrincipalToken    pt;
    RiskToken         rt;
    ARMVault          armVault;
    AllocationNFT     nft;
    MockBatchAuction  mockAuction;
    MockERC20         usdc;

    address owner = makeAddr("owner");
    address alice = makeAddr("alice");
    address bob   = makeAddr("bob");

    uint256 constant CP          = 2e6;   // $2 USDC clearing price
    uint256 constant UNLOCK      = 100_000;
    uint256 constant MAX_SUPPLY  = 1_000_000e18;
    uint256 constant RT_CAP      = 5;

    function setUp() public {
        usdc = new MockERC20("USDC", "USDC", 6);

        mockAuction = new MockBatchAuction();
        mockAuction.setClearingPrice(CP);
        mockAuction.setUnlockTime(UNLOCK);
        mockAuction.setFinalized(true);

        vm.startPrank(owner);
        launchToken = new LaunchToken("XProtocol", "XPC", MAX_SUPPLY, owner);
        pt = new PrincipalToken("XPC", owner);
        rt = new RiskToken("XPC", owner);
        nft = new AllocationNFT(owner);
        vm.stopPrank();

        armVault = new ARMVault(
            address(mockAuction),
            address(nft),
            address(pt),
            address(rt)
        );

        vm.startPrank(owner);
        pt.setVault(address(armVault));
        rt.setVault(address(armVault));
        nft.setMinter(address(armVault));

        settlement = new Settlement(
            address(launchToken),
            address(pt),
            address(rt),
            address(armVault),
            address(nft),
            address(usdc),
            RT_CAP,
            owner
        );

        launchToken.setMinter(address(settlement));
        vm.stopPrank();

        // Give alice PT and RT via ARM flow
        _giveAllocations(alice, 100e18);

        usdc.mint(owner, 1_000_000e6);
    }

    // ─── constructor ────────────────────────────────────────────────────────

    function test_constructor_revertsZeroAddress() public {
        vm.expectRevert(Settlement.ZeroAddress.selector);
        new Settlement(
            address(0),
            address(pt),
            address(rt),
            address(armVault),
            address(nft),
            address(usdc),
            RT_CAP,
            owner
        );
    }

    function test_constructor_revertsInvalidRTCap() public {
        vm.expectRevert(Settlement.InvalidTGEPrice.selector);
        new Settlement(
            address(launchToken),
            address(pt),
            address(rt),
            address(armVault),
            address(nft),
            address(usdc),
            1, // must be > 1
            owner
        );
    }

    // ─── redeemPT ───────────────────────────────────────────────────────────

    function test_redeemPT_afterUnlock() public {
        vm.warp(UNLOCK + 1);

        uint256 ptAmt = 60e18;
        vm.startPrank(alice);
        pt.approve(address(settlement), ptAmt);
        settlement.redeemPT(ptAmt);
        vm.stopPrank();

        assertEq(launchToken.balanceOf(alice), ptAmt);
        assertEq(pt.balanceOf(alice), 100e18 - ptAmt);
    }

    function test_redeemPT_revertsBeforeUnlock() public {
        vm.warp(UNLOCK - 1);

        vm.startPrank(alice);
        pt.approve(address(settlement), 100e18);
        vm.expectRevert(Settlement.NotYetUnlocked.selector);
        settlement.redeemPT(100e18);
        vm.stopPrank();
    }

    function test_redeemPT_revertsZeroAmount() public {
        vm.warp(UNLOCK + 1);
        vm.prank(alice);
        vm.expectRevert(Settlement.ZeroAmount.selector);
        settlement.redeemPT(0);
    }

    // ─── redeemAllocation ───────────────────────────────────────────────────

    function test_redeemAllocation_directNFTRedemption() public {
        // Give alice an NFT that was NOT deposited in ARMVault
        vm.prank(owner);
        nft.setMinter(owner); // Override to allow direct mint
        vm.prank(owner);
        uint256 nftId = nft.mint(alice, 50e18, CP, UNLOCK);

        vm.warp(UNLOCK + 1);

        vm.startPrank(alice);
        nft.approve(address(settlement), nftId);
        settlement.redeemAllocation(nftId);
        vm.stopPrank();

        assertEq(launchToken.balanceOf(alice), 50e18);
        assertEq(nft.ownerOf(nftId), address(settlement));
    }

    function test_redeemAllocation_revertsBeforeUnlock() public {
        vm.prank(owner);
        nft.setMinter(owner);
        vm.prank(owner);
        uint256 nftId = nft.mint(alice, 50e18, CP, UNLOCK);

        vm.warp(UNLOCK - 1);

        vm.startPrank(alice);
        nft.approve(address(settlement), nftId);
        vm.expectRevert(Settlement.NotYetUnlocked.selector);
        settlement.redeemAllocation(nftId);
        vm.stopPrank();
    }

    function test_redeemAllocation_revertsNotOwner() public {
        vm.prank(owner);
        nft.setMinter(owner);
        vm.prank(owner);
        uint256 nftId = nft.mint(alice, 50e18, CP, UNLOCK);

        vm.warp(UNLOCK + 1);

        vm.prank(bob);
        vm.expectRevert(Settlement.NotNFTOwner.selector);
        settlement.redeemAllocation(nftId);
    }

    // ─── depositRTReserve ───────────────────────────────────────────────────

    function test_depositRTReserve_ownerDeposits() public {
        uint256 amount = 100_000e6;
        vm.startPrank(owner);
        usdc.approve(address(settlement), amount);
        settlement.depositRTReserve(amount);
        vm.stopPrank();

        assertEq(settlement.rtReserve(), amount);
    }

    function test_depositRTReserve_revertsNonOwner() public {
        vm.startPrank(alice);
        usdc.approve(address(settlement), 1e6);
        vm.expectRevert();
        settlement.depositRTReserve(1e6);
        vm.stopPrank();
    }

    function test_depositRTReserve_revertsZeroAmount() public {
        vm.prank(owner);
        vm.expectRevert(Settlement.ZeroAmount.selector);
        settlement.depositRTReserve(0);
    }

    // ─── setTGEPrice ────────────────────────────────────────────────────────

    /// @dev Alice has 100e18 RT, CP=$2, cap=5x so cappedPrice=$10.
    ///      tgePrice=$6 < $10. effectivePrice=$6. maxPayoutPerRT = $4/token.
    ///      totalMaxPayout = 100e18 * 4e6 / 1e18 = 400e6.
    ///      Reserve = 400e6 → payoutPerRT = 4e6.
    function test_setTGEPrice_fullReserve() public {
        uint256 reserve = 400e6;
        _depositReserve(reserve);

        vm.warp(UNLOCK + 24 hours + 1);

        vm.prank(owner);
        settlement.setTGEPrice(6e6);

        assertEq(settlement.tgePrice(), 6e6);
        assertTrue(settlement.tgePriceSet());
        // payoutPerRT = 4e6 (effectivePrice - CP)
        assertEq(settlement.payoutPerRT(), 4e6);
        assertEq(settlement.totalRTOutstanding(), 100e18);
    }

    /// @dev Same scenario but reserve only covers 50%. payoutPerRT pro-rated.
    ///      rtReserve = 200e6. payout = 200e6 * 1e18 / 100e18 = 2e6 per RT.
    function test_setTGEPrice_proRatedReserve() public {
        uint256 reserve = 200e6;
        _depositReserve(reserve);

        vm.warp(UNLOCK + 24 hours + 1);

        vm.prank(owner);
        settlement.setTGEPrice(6e6);

        // payout = rtReserve * 1e18 / rtSupply = 200e6 * 1e18 / 100e18 = 2e6
        assertEq(settlement.payoutPerRT(), 2e6);
    }

    /// @dev TGE price below clearing price → RT is out of the money. payoutPerRT = 0.
    function test_setTGEPrice_outOfMoney() public {
        _depositReserve(100e6);

        vm.warp(UNLOCK + 24 hours + 1);

        vm.prank(owner);
        settlement.setTGEPrice(CP - 1); // below clearing price

        assertEq(settlement.payoutPerRT(), 0);
    }

    /// @dev TGE price above cap: effectivePrice = cap. RT capped at 4x above CP.
    ///      cappedPrice = 2e6 * 5 = 10e6. tgePrice = 20e6 → effectivePrice = 10e6.
    ///      maxPayoutPerRT = 10e6 - 2e6 = 8e6.
    function test_setTGEPrice_cappedAtMultiplier() public {
        uint256 reserve = 800e6; // 100e18 * 8e6 / 1e18
        _depositReserve(reserve);

        vm.warp(UNLOCK + 24 hours + 1);

        vm.prank(owner);
        settlement.setTGEPrice(20e6); // way above cap

        assertEq(settlement.payoutPerRT(), 8e6);
    }

    function test_setTGEPrice_revertsBeforeDelay() public {
        _depositReserve(100e6);

        vm.warp(UNLOCK + 1); // Before MIN_PRICE_DELAY
        vm.prank(owner);
        vm.expectRevert(Settlement.PriceDelayNotMet.selector);
        settlement.setTGEPrice(5e6);
    }

    function test_setTGEPrice_revertsAlreadySet() public {
        _depositReserve(100e6);
        vm.warp(UNLOCK + 24 hours + 1);
        vm.prank(owner);
        settlement.setTGEPrice(5e6);

        vm.prank(owner);
        vm.expectRevert(Settlement.TGEPriceAlreadySet.selector);
        settlement.setTGEPrice(5e6);
    }

    function test_setTGEPrice_revertsNoReserve() public {
        vm.warp(UNLOCK + 24 hours + 1);
        vm.prank(owner);
        vm.expectRevert(Settlement.NoReserve.selector);
        settlement.setTGEPrice(5e6);
    }

    function test_setTGEPrice_revertsZeroPrice() public {
        _depositReserve(100e6);
        vm.warp(UNLOCK + 24 hours + 1);
        vm.prank(owner);
        vm.expectRevert(Settlement.InvalidTGEPrice.selector);
        settlement.setTGEPrice(0);
    }

    // ─── settleRT ───────────────────────────────────────────────────────────

    function test_settleRT_payoutCalculated() public {
        _depositReserve(400e6);
        vm.warp(UNLOCK + 24 hours + 1);
        vm.prank(owner);
        settlement.setTGEPrice(6e6);
        // payoutPerRT = 4e6

        uint256 rtAmt = 50e18;
        vm.startPrank(alice);
        rt.approve(address(settlement), rtAmt);
        settlement.settleRT(rtAmt);
        vm.stopPrank();

        // payout = 50e18 * 4e6 / 1e18 = 200e6
        assertEq(usdc.balanceOf(alice), 200e6);
        assertEq(rt.balanceOf(alice), 50e18);
        assertEq(settlement.rtReserve(), 200e6);
    }

    function test_settleRT_outOfMoney_burnsForZero() public {
        _depositReserve(100e6);
        vm.warp(UNLOCK + 24 hours + 1);
        vm.prank(owner);
        settlement.setTGEPrice(CP - 1);
        // payoutPerRT = 0

        uint256 rtAmt = 100e18;
        vm.startPrank(alice);
        rt.approve(address(settlement), rtAmt);
        settlement.settleRT(rtAmt);
        vm.stopPrank();

        assertEq(usdc.balanceOf(alice), 0);
        assertEq(rt.balanceOf(alice), 0);
    }

    function test_settleRT_reversePriceNotSet() public {
        vm.startPrank(alice);
        rt.approve(address(settlement), 100e18);
        vm.expectRevert(Settlement.TGEPriceNotSet.selector);
        settlement.settleRT(100e18);
        vm.stopPrank();
    }

    function test_settleRT_revertsZeroAmount() public {
        _depositReserve(400e6);
        vm.warp(UNLOCK + 24 hours + 1);
        vm.prank(owner);
        settlement.setTGEPrice(6e6);

        vm.prank(alice);
        vm.expectRevert(Settlement.ZeroAmount.selector);
        settlement.settleRT(0);
    }

    // ─── withdrawUnusedReserve ──────────────────────────────────────────────

    function test_withdrawUnusedReserve_afterWindow() public {
        _depositReserve(400e6);
        vm.warp(UNLOCK + 24 hours + 1);
        vm.prank(owner);
        settlement.setTGEPrice(6e6);

        vm.warp(block.timestamp + 90 days + 1);

        uint256 pre = usdc.balanceOf(owner);
        vm.prank(owner);
        settlement.withdrawUnusedReserve(owner);

        assertEq(usdc.balanceOf(owner) - pre, 400e6);
        assertEq(settlement.rtReserve(), 0);
    }

    function test_withdrawUnusedReserve_revertsWindowOpen() public {
        _depositReserve(400e6);
        vm.warp(UNLOCK + 24 hours + 1);
        vm.prank(owner);
        settlement.setTGEPrice(6e6);

        vm.prank(owner);
        vm.expectRevert(Settlement.SettlementWindowOpen.selector);
        settlement.withdrawUnusedReserve(owner);
    }

    function test_withdrawUnusedReserve_revertsPriceNotSet() public {
        vm.prank(owner);
        vm.expectRevert(Settlement.TGEPriceNotSet.selector);
        settlement.withdrawUnusedReserve(owner);
    }

    // ─── triggerEmergencyRTSettlement ───────────────────────────────────────

    function test_emergencyRTSettlement_anyoneCanTrigger() public {
        _depositReserve(400e6);

        vm.warp(UNLOCK + 90 days + 1);

        vm.prank(bob);
        settlement.triggerEmergencyRTSettlement();

        assertTrue(settlement.tgePriceSet());
        // payout = 400e6 * 1e18 / 100e18 = 4e6
        assertEq(settlement.payoutPerRT(), 4e6);
        assertEq(settlement.totalRTOutstanding(), 100e18);
    }

    function test_emergencyRTSettlement_revertsBeforeDeadline() public {
        vm.warp(UNLOCK + 89 days);
        vm.expectRevert(Settlement.EmergencyDeadlineNotMet.selector);
        settlement.triggerEmergencyRTSettlement();
    }

    function test_emergencyRTSettlement_revertsIfAlreadySet() public {
        _depositReserve(100e6);
        vm.warp(UNLOCK + 24 hours + 1);
        vm.prank(owner);
        settlement.setTGEPrice(5e6);

        vm.warp(UNLOCK + 90 days + 1);
        vm.expectRevert(Settlement.TGEPriceAlreadySet.selector);
        settlement.triggerEmergencyRTSettlement();
    }

    function test_emergencyRTSettlement_noReserve_payoutZero() public {
        vm.warp(UNLOCK + 90 days + 1);
        settlement.triggerEmergencyRTSettlement();

        assertEq(settlement.payoutPerRT(), 0);

        uint256 rtAmt = 100e18;
        vm.startPrank(alice);
        rt.approve(address(settlement), rtAmt);
        settlement.settleRT(rtAmt);
        vm.stopPrank();

        assertEq(usdc.balanceOf(alice), 0);
        assertEq(rt.balanceOf(alice), 0);
    }

    // ─── maxRTLiability ─────────────────────────────────────────────────────

    function test_maxRTLiability() public view {
        // totalRT = 100e18, cappedUpside = CP * (5-1) = 2e6*4 = 8e6
        // liability = 100e18 * 8e6 / 1e18 = 800e6
        assertEq(settlement.maxRTLiability(), 800e6);
    }

    // ─── helpers ────────────────────────────────────────────────────────────

    /// @dev Give `to` some PT and RT via the ARM vault flow.
    function _giveAllocations(address to, uint256 amount) internal {
        // Mint an NFT directly and deposit into vault
        vm.prank(owner);
        nft.setMinter(owner);
        vm.prank(owner);
        uint256 nftId = nft.mint(to, amount, CP, UNLOCK);

        vm.startPrank(to);
        nft.approve(address(armVault), nftId);
        armVault.deposit(nftId);
        vm.stopPrank();

        // Restore minter to armVault
        vm.prank(owner);
        nft.setMinter(address(armVault));
    }

    function _depositReserve(uint256 amount) internal {
        vm.startPrank(owner);
        usdc.approve(address(settlement), amount);
        settlement.depositRTReserve(amount);
        vm.stopPrank();
    }

    // Expose constant for use in test
    function _minPriceDelay() internal pure returns (uint256) {
        return 24 hours;
    }
}
