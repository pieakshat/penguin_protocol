// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PenguinFactory.sol";
import "../src/LaunchToken.sol";
import "../src/AllocationNFT.sol";
import "../src/BatchAuction.sol";
import "../src/PrincipalToken.sol";
import "../src/RiskToken.sol";
import "../src/ARMVault.sol";
import "../src/Settlement.sol";
import "../src/LiquidityBootstrap.sol";
import "./mocks/MockERC20.sol";

/// @title Integration Test — full E2E flow through factory
/// @dev Tests the complete lifecycle:
///      1. Factory deploys all contracts (via EIP-1167 clones)
///      2. Users submit bids
///      3. Auction finalizes
///      4. Winners settle bids → AllocationNFT
///      5. Users deposit NFTs → PT + RT
///      6. TGE: owner sets price, users redeem PT and settle RT
contract IntegrationTest is Test {
    PenguinFactory  factory;
    MockERC20       usdc;

    address protocol = makeAddr("protocol");
    address alice    = makeAddr("alice");
    address bob      = makeAddr("bob");
    address carol    = makeAddr("carol");

    // Campaign parameters
    uint256 constant TOKEN_SUPPLY  = 1_000_000e18;
    uint256 constant MAX_SUPPLY    = 1_000_000e18;
    uint256 constant MIN_PRICE     = 1e6;        // $1
    uint256 constant RT_CAP        = 5;
    uint256 constant AUCTION_START = 1_000_000;
    uint256 constant AUCTION_END   = AUCTION_START + 7 days;
    uint256 constant UNLOCK_TIME   = AUCTION_END + 30 days;

    // Resolved campaign contracts
    LaunchToken       launchToken;
    AllocationNFT     allocationNFT;
    ContinuousClearingAuction batchAuction;
    PrincipalToken    principalToken;
    RiskToken         riskToken;
    ARMVault          armVault;
    Settlement        settlement;
    LiquidityBootstrap liquidityBootstrap;

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);

        // Deploy one implementation of each sub-contract.
        // These use dummy/minimal constructor args — they are disabled via _disableInitializers().
        PenguinFactory.Implementations memory impls = _deployImplementations();

        vm.prank(protocol);
        factory = new PenguinFactory(impls, address(usdc), protocol);

        // Fund bidders
        usdc.mint(alice, 10_000_000e6);
        usdc.mint(bob,   10_000_000e6);
        usdc.mint(carol, 10_000_000e6);
        usdc.mint(protocol, 100_000_000e6);

        // Deploy campaign
        PenguinFactory.CampaignParams memory p = PenguinFactory.CampaignParams({
            tokenName:        "XProtocol",
            tokenSymbol:      "XPC",
            maxSupply:        MAX_SUPPLY,
            totalTokenSupply: TOKEN_SUPPLY,
            auctionStart:     AUCTION_START,
            auctionEnd:       AUCTION_END,
            unlockTime:       UNLOCK_TIME,
            minimumPrice:     MIN_PRICE,
            rtCapMultiplier:  RT_CAP,
            paymentToken:     address(usdc),
            campaignOwner:    protocol
        });

        vm.prank(protocol);
        uint256 campaignId = factory.createCampaign(p);

        PenguinFactory.Campaign memory c = factory.getCampaign(campaignId);

        launchToken        = LaunchToken(c.launchToken);
        allocationNFT      = AllocationNFT(c.allocationNFT);
        batchAuction       = ContinuousClearingAuction(c.batchAuction);
        principalToken     = PrincipalToken(c.principalToken);
        riskToken          = RiskToken(c.riskToken);
        armVault           = ARMVault(c.armVault);
        settlement         = Settlement(c.settlement);
        liquidityBootstrap = LiquidityBootstrap(c.liquidityBootstrap);
    }

    // ─── factory deployment ─────────────────────────────────────────────────

    function test_factory_deploysAllContracts() public view {
        assertTrue(address(launchToken)        != address(0));
        assertTrue(address(allocationNFT)      != address(0));
        assertTrue(address(batchAuction)       != address(0));
        assertTrue(address(principalToken)     != address(0));
        assertTrue(address(riskToken)          != address(0));
        assertTrue(address(armVault)           != address(0));
        assertTrue(address(settlement)         != address(0));
        assertTrue(address(liquidityBootstrap) != address(0));
    }

    function test_factory_wiredCorrectly() public view {
        assertEq(allocationNFT.minter(), address(batchAuction));
        assertEq(launchToken.minter(), address(settlement));
        assertEq(principalToken.vault(), address(armVault));
        assertEq(riskToken.vault(), address(armVault));
    }

    function test_factory_ownershipTransferred() public view {
        assertEq(launchToken.owner(), protocol);
        assertEq(allocationNFT.owner(), protocol);
        assertEq(batchAuction.owner(), protocol);
        assertEq(principalToken.owner(), protocol);
        assertEq(riskToken.owner(), protocol);
        assertEq(settlement.owner(), protocol);
        assertEq(liquidityBootstrap.owner(), protocol);
    }

    function test_factory_incrementsCampaignCount() public {
        assertEq(factory.campaignCount(), 1);

        // Deploy a second campaign
        PenguinFactory.CampaignParams memory p = PenguinFactory.CampaignParams({
            tokenName:        "YProtocol",
            tokenSymbol:      "YPC",
            maxSupply:        MAX_SUPPLY,
            totalTokenSupply: TOKEN_SUPPLY,
            auctionStart:     AUCTION_START,
            auctionEnd:       AUCTION_END,
            unlockTime:       UNLOCK_TIME,
            minimumPrice:     MIN_PRICE,
            rtCapMultiplier:  RT_CAP,
            paymentToken:     address(usdc),
            campaignOwner:    protocol
        });

        vm.prank(protocol);
        factory.createCampaign(p);

        assertEq(factory.campaignCount(), 2);
    }

    // ─── factory validation ─────────────────────────────────────────────────

    function test_factory_revertsNonOwner() public {
        PenguinFactory.CampaignParams memory p = _defaultParams();
        vm.prank(alice);
        vm.expectRevert();
        factory.createCampaign(p);
    }

    function test_factory_revertsZeroOwner() public {
        PenguinFactory.CampaignParams memory p = _defaultParams();
        p.campaignOwner = address(0);
        vm.prank(protocol);
        vm.expectRevert(PenguinFactory.ZeroAddress.selector);
        factory.createCampaign(p);
    }

    function test_factory_revertsZeroMaxSupply() public {
        PenguinFactory.CampaignParams memory p = _defaultParams();
        p.maxSupply = 0;
        vm.prank(protocol);
        vm.expectRevert(PenguinFactory.ZeroAmount.selector);
        factory.createCampaign(p);
    }

    function test_factory_revertsSupplyMismatch() public {
        PenguinFactory.CampaignParams memory p = _defaultParams();
        p.maxSupply = 100e18;
        p.totalTokenSupply = 200e18; // total > max
        vm.prank(protocol);
        vm.expectRevert(PenguinFactory.SupplyMismatch.selector);
        factory.createCampaign(p);
    }

    function test_factory_revertsInvalidTimestamps() public {
        PenguinFactory.CampaignParams memory p = _defaultParams();
        p.auctionEnd = p.auctionStart; // end == start
        vm.prank(protocol);
        vm.expectRevert(PenguinFactory.InvalidTimestamps.selector);
        factory.createCampaign(p);
    }

    function test_factory_revertsInvalidRTCap() public {
        PenguinFactory.CampaignParams memory p = _defaultParams();
        p.rtCapMultiplier = 1; // must be > 1
        vm.prank(protocol);
        vm.expectRevert(PenguinFactory.InvalidRTCap.selector);
        factory.createCampaign(p);
    }

    // ─── full E2E flow ──────────────────────────────────────────────────────

    /// @dev Alice bids 600_000e18 @ $3, Bob bids 400_000e18 @ $2.
    ///      Clearing = $2 (exactly subscribed). fillRatio = 1e18.
    ///      Alice: cost=1_200_000e6, refund=600_000e6.
    ///      Bob: cost=800_000e6, refund=0.
    ///      Both deposit NFTs → PT+RT. TGE price = $6.
    ///      RT payout = $6-$2 = $4 per token. maxLiability = 1M * $4 = $4M.
    ///      Both redeem PT → LaunchToken. Both settle RT → USDC.
    function test_e2e_fullFlow() public {
        // ── 1. Submit bids ─────────────────────────────────────────────────
        vm.warp(AUCTION_START + 1);

        uint256 aliceDeposit = (600_000e18 * 3e6) / 1e18; // 1_800_000e6
        uint256 bobDeposit   = (400_000e18 * 2e6) / 1e18; // 800_000e6

        vm.startPrank(alice);
        usdc.approve(address(batchAuction), aliceDeposit);
        batchAuction.submitBid(600_000e18, 3e6);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(batchAuction), bobDeposit);
        batchAuction.submitBid(400_000e18, 2e6);
        vm.stopPrank();

        // ── 2. Finalize ────────────────────────────────────────────────────
        vm.warp(AUCTION_END + 1);
        vm.prank(protocol);
        batchAuction.finalizeAuction(2e6); // clearing = $2

        assertEq(batchAuction.clearingPrice(), 2e6);
        assertEq(batchAuction.fillRatio(), 1e18);

        // ── 3. Settle bids → AllocationNFTs ────────────────────────────────
        uint256 alicePreUSDC = usdc.balanceOf(alice);
        vm.prank(alice);
        batchAuction.settle(0);

        // Alice refund = 1_800_000 - 1_200_000 = 600_000e6
        assertEq(usdc.balanceOf(alice) - alicePreUSDC, 600_000e6);
        assertEq(allocationNFT.ownerOf(0), alice);
        assertEq(allocationNFT.getAllocation(0).amount, 600_000e18);

        vm.prank(bob);
        batchAuction.settle(1);
        assertEq(allocationNFT.ownerOf(1), bob);
        assertEq(allocationNFT.getAllocation(1).amount, 400_000e18);

        // Protocol can withdraw proceeds: 1_200_000 + 800_000 = 2_000_000e6
        uint256 protocolPre = usdc.balanceOf(protocol);
        vm.prank(protocol);
        batchAuction.withdrawProceeds(protocol);
        assertEq(usdc.balanceOf(protocol) - protocolPre, 2_000_000e6);

        // ── 4. Deposit NFTs → PT + RT ───────────────────────────────────────
        vm.startPrank(alice);
        allocationNFT.approve(address(armVault), 0);
        armVault.deposit(0);
        vm.stopPrank();

        assertEq(principalToken.balanceOf(alice), 600_000e18);
        assertEq(riskToken.balanceOf(alice), 600_000e18);

        vm.startPrank(bob);
        allocationNFT.approve(address(armVault), 1);
        armVault.deposit(1);
        vm.stopPrank();

        assertEq(principalToken.balanceOf(bob), 400_000e18);
        assertEq(riskToken.balanceOf(bob), 400_000e18);

        // ── 5. TGE: set price, deposit RT reserve ──────────────────────────
        vm.warp(UNLOCK_TIME + 24 hours + 1);

        // maxLiability = 1_000_000e18 * (2e6 * (5-1)) / 1e18 = 8_000_000e6
        assertEq(settlement.maxRTLiability(), 8_000_000e6);

        // Deposit full reserve
        uint256 reserve = 4_000_000e6; // 1M tokens * $4 upside
        vm.startPrank(protocol);
        usdc.approve(address(settlement), reserve);
        settlement.depositRTReserve(reserve);
        settlement.setTGEPrice(6e6); // TGE price = $6
        vm.stopPrank();

        // payoutPerRT = $6-$2 = $4 per 1e18 RT
        assertEq(settlement.payoutPerRT(), 4e6);

        // ── 6. Redeem PT → LaunchToken ─────────────────────────────────────
        vm.startPrank(alice);
        principalToken.approve(address(settlement), 600_000e18);
        settlement.redeemPT(600_000e18);
        vm.stopPrank();
        assertEq(launchToken.balanceOf(alice), 600_000e18);

        vm.startPrank(bob);
        principalToken.approve(address(settlement), 400_000e18);
        settlement.redeemPT(400_000e18);
        vm.stopPrank();
        assertEq(launchToken.balanceOf(bob), 400_000e18);

        // ── 7. Settle RT → USDC ───────────────────────────────────────────
        uint256 alicePreRT = usdc.balanceOf(alice);
        vm.startPrank(alice);
        riskToken.approve(address(settlement), 600_000e18);
        settlement.settleRT(600_000e18);
        vm.stopPrank();

        // payout = 600_000e18 * 4e6 / 1e18 = 2_400_000e6
        assertEq(usdc.balanceOf(alice) - alicePreRT, 2_400_000e6);
        assertEq(riskToken.balanceOf(alice), 0);

        uint256 bobPreRT = usdc.balanceOf(bob);
        vm.startPrank(bob);
        riskToken.approve(address(settlement), 400_000e18);
        settlement.settleRT(400_000e18);
        vm.stopPrank();

        // payout = 400_000e18 * 4e6 / 1e18 = 1_600_000e6
        assertEq(usdc.balanceOf(bob) - bobPreRT, 1_600_000e6);
        assertEq(riskToken.balanceOf(bob), 0);

        // Reserve fully consumed
        assertEq(settlement.rtReserve(), 0);

        // Total LaunchToken minted = 1_000_000e18 = supply
        assertEq(launchToken.totalSupply(), 1_000_000e18);
    }

    /// @dev Oversubscribed scenario: Alice + Bob each bid full supply @ $3.
    ///      Each gets 50% fill. RT settles OTM (TGE <= CP → payout = 0).
    function test_e2e_oversubscribedAuction_rtOTM() public {
        vm.warp(AUCTION_START + 1);

        uint256 deposit = (1_000_000e18 * 3e6) / 1e18; // 3_000_000e6

        vm.startPrank(alice);
        usdc.approve(address(batchAuction), deposit);
        batchAuction.submitBid(1_000_000e18, 3e6);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(batchAuction), deposit);
        batchAuction.submitBid(1_000_000e18, 3e6);
        vm.stopPrank();

        vm.warp(AUCTION_END + 1);
        vm.prank(protocol);
        // subscribed = 2M, supply = 1M → fillRatio = 50%
        batchAuction.finalizeAuction(3e6);

        vm.prank(alice);
        batchAuction.settle(0);
        // filledAmount = 1_000_000e18 * 0.5 = 500_000e18
        assertEq(allocationNFT.getAllocation(0).amount, 500_000e18);

        vm.startPrank(alice);
        allocationNFT.approve(address(armVault), 0);
        armVault.deposit(0);
        vm.stopPrank();

        assertEq(riskToken.balanceOf(alice), 500_000e18);

        // TGE price = $3 = clearingPrice → RT OTM (effectivePrice == CP, no payout)
        vm.warp(UNLOCK_TIME + 24 hours + 1);
        _depositReserve(100e6); // some reserve

        vm.prank(protocol);
        settlement.setTGEPrice(3e6); // At CP, no upside

        assertEq(settlement.payoutPerRT(), 0);

        uint256 alicePreUSDC = usdc.balanceOf(alice);
        vm.startPrank(alice);
        riskToken.approve(address(settlement), 500_000e18);
        settlement.settleRT(500_000e18);
        vm.stopPrank();

        // RT is OTM: no USDC payout from settlement
        assertEq(usdc.balanceOf(alice), alicePreUSDC);
        assertEq(riskToken.balanceOf(alice), 0);
    }

    /// @dev Emergency RT settlement triggered after 90-day deadline.
    function test_e2e_emergencyRTSettlement() public {
        _runAuctionAndARM(600_000e18, 3e6, 400_000e18, 2e6, 2e6);

        // Owner deposits reserve but NEVER sets TGE price
        _depositReserve(2_000_000e6); // 2M

        // Skip past 90-day deadline
        vm.warp(UNLOCK_TIME + 90 days + 1);

        // Anyone can trigger emergency settlement
        vm.prank(carol);
        settlement.triggerEmergencyRTSettlement();

        // payout = 2_000_000e6 * 1e18 / 1_000_000e18 = 2e6 per RT
        assertEq(settlement.payoutPerRT(), 2e6);

        uint256 alicePreUSDC = usdc.balanceOf(alice);
        vm.startPrank(alice);
        riskToken.approve(address(settlement), 600_000e18);
        settlement.settleRT(600_000e18);
        vm.stopPrank();

        // 600_000e18 * 2e6 / 1e18 = 1_200_000e6
        assertEq(usdc.balanceOf(alice) - alicePreUSDC, 1_200_000e6);
    }

    /// @dev Direct AllocationNFT redemption — user skips ARM vault.
    function test_e2e_directNFTRedemption() public {
        vm.warp(AUCTION_START + 1);

        uint256 deposit = (100e18 * 2e6) / 1e18;
        vm.startPrank(carol);
        usdc.approve(address(batchAuction), deposit);
        batchAuction.submitBid(100e18, 2e6);
        vm.stopPrank();

        vm.warp(AUCTION_END + 1);
        vm.prank(protocol);
        batchAuction.finalizeAuction(MIN_PRICE); // undersubscribed, finalize at floor

        vm.prank(carol);
        batchAuction.settle(0);

        // Carol holds AllocationNFT with amount = 100e18 (fill ratio = 1)
        uint256 nftId = 0;
        assertEq(allocationNFT.ownerOf(nftId), carol);

        vm.warp(UNLOCK_TIME + 1);

        vm.startPrank(carol);
        allocationNFT.approve(address(settlement), nftId);
        settlement.redeemAllocation(nftId);
        vm.stopPrank();

        assertEq(launchToken.balanceOf(carol), 100e18);
        // No PT or RT minted — skipped ARM vault
        assertEq(principalToken.balanceOf(carol), 0);
        assertEq(riskToken.balanceOf(carol), 0);
    }

    // ─── helpers ────────────────────────────────────────────────────────────

    /// @dev Deploy one implementation of each sub-contract with minimal/dummy args.
    function _deployImplementations() internal returns (PenguinFactory.Implementations memory impls) {
        address d1 = address(1);
        address d2 = address(2);
        address d3 = address(3);
        address d4 = address(4);
        address d5 = address(5);

        impls.launchToken = address(new LaunchToken("impl", "IMPL", 1, address(this)));
        impls.allocationNFT = address(new AllocationNFT(address(this)));
        impls.batchAuction = address(new ContinuousClearingAuction(
            address(usdc), d1,
            1,
            block.timestamp + 1, block.timestamp + 2, block.timestamp + 3,
            1,
            address(this)
        ));
        impls.principalToken = address(new PrincipalToken("IMPL", address(this)));
        impls.riskToken = address(new RiskToken("IMPL", address(this)));
        impls.armVault = address(new ARMVault(d1, d2, d3, d4));
        impls.settlement = address(new Settlement(d1, d2, d3, d4, d5, address(usdc), 2, address(this)));
        impls.liquidityBootstrap = address(new LiquidityBootstrap(address(usdc), d1, d2, address(this)));
    }

    function _defaultParams() internal view returns (PenguinFactory.CampaignParams memory) {
        return PenguinFactory.CampaignParams({
            tokenName:        "XProtocol",
            tokenSymbol:      "XPC",
            maxSupply:        MAX_SUPPLY,
            totalTokenSupply: TOKEN_SUPPLY,
            auctionStart:     AUCTION_START,
            auctionEnd:       AUCTION_END,
            unlockTime:       UNLOCK_TIME,
            minimumPrice:     MIN_PRICE,
            rtCapMultiplier:  RT_CAP,
            paymentToken:     address(usdc),
            campaignOwner:    protocol
        });
    }

    function _depositReserve(uint256 amount) internal {
        vm.startPrank(protocol);
        usdc.approve(address(settlement), amount);
        settlement.depositRTReserve(amount);
        vm.stopPrank();
    }

    /// @dev Runs auction + ARM vault deposit for alice and bob.
    function _runAuctionAndARM(
        uint256 amtA, uint256 priceA,
        uint256 amtB, uint256 priceB,
        uint256 clearingPrice
    ) internal {
        vm.warp(AUCTION_START + 1);

        vm.startPrank(alice);
        usdc.approve(address(batchAuction), (amtA * priceA) / 1e18);
        batchAuction.submitBid(amtA, priceA);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(batchAuction), (amtB * priceB) / 1e18);
        batchAuction.submitBid(amtB, priceB);
        vm.stopPrank();

        vm.warp(AUCTION_END + 1);
        vm.prank(protocol);
        batchAuction.finalizeAuction(clearingPrice);

        vm.prank(alice);
        batchAuction.settle(0);
        vm.startPrank(alice);
        allocationNFT.approve(address(armVault), 0);
        armVault.deposit(0);
        vm.stopPrank();

        vm.prank(bob);
        batchAuction.settle(1);
        vm.startPrank(bob);
        allocationNFT.approve(address(armVault), 1);
        armVault.deposit(1);
        vm.stopPrank();
    }
}
