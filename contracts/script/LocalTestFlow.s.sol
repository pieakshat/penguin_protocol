// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PenguinFactory.sol";
import "../src/LaunchToken.sol";
import "../src/AllocationNFT.sol";
import "../src/BatchAuction.sol";
import "../src/PrincipalToken.sol";
import "../src/RiskToken.sol";
import "../src/ARMVault.sol";
import "../src/Settlement.sol";
import "../src/LiquidityBootstrap.sol";
import "../src/mocks/MockERC20.sol";

/// @notice Runs the full Penguin Protocol lifecycle on a local Anvil node.
///
/// Usage:
///   forge script script/LocalTestFlow.s.sol \
///     --rpc-url http://127.0.0.1:8545 \
///     --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
///     --gas-price 3000000000 --legacy --broadcast -vvvv
///
/// Optional env var:
///   FACTORY_ADDRESS — reuse an already-deployed factory (skips impl + factory deploy)
contract LocalTestFlow is Script {

    /// @dev Advance Anvil's real block timestamp AND the local simulation's view.
    ///      vm.warp alone only affects the local Foundry EVM — it does NOT move
    ///      the actual node clock, so time-gated on-chain functions still revert.
    ///      anvil_setNextBlockTimestamp + anvil_mine moves the real node forward.
    function _warp(uint256 ts) internal {
        vm.rpc("anvil_setNextBlockTimestamp", string.concat("[", vm.toString(ts), "]"));
        vm.rpc("anvil_mine", "[1]");
        vm.warp(ts); // keep local simulation in sync
    }

    // ── Anvil default accounts ──────────────────────────────────────────────
    address deployer = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    address alice    = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    address bob      = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;

    uint256 deployerKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 aliceKey    = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    uint256 bobKey      = 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;

    function run() external {
        // ── Deploy mock USDC ─────────────────────────────────────────────────
        vm.startBroadcast(deployerKey);
        MockERC20 usdc = new MockERC20("USD Coin", "USDC", 6, deployer);
        console.log("\n=== Mock USDC ===");
        console.log("Address:", address(usdc));

        // ── Mint USDC to participants ─────────────────────────────────────────
        usdc.mint(alice,    10_000_000e6);
        usdc.mint(bob,      10_000_000e6);
        usdc.mint(deployer, 50_000_000e6);
        console.log("Minted USDC to alice, bob, deployer");

        // ── Deploy factory (or reuse existing) ───────────────────────────────
        PenguinFactory factory;
        address factoryEnv = vm.envOr("FACTORY_ADDRESS", address(0));

        if (factoryEnv != address(0)) {
            factory = PenguinFactory(factoryEnv);
            console.log("\n=== Reusing Factory ===");
            console.log("Address:", address(factory));
        } else {
            factory = _deployFactory(address(usdc));
        }

        // ── Create campaign ───────────────────────────────────────────────────
        uint256 auctionStart = block.timestamp + 60;       // 1 min from now
        uint256 auctionEnd   = auctionStart + 7 days;
        uint256 unlockTime   = auctionEnd   + 30 days;

        PenguinFactory.CampaignParams memory p = PenguinFactory.CampaignParams({
            tokenName:        "XProtocol",
            tokenSymbol:      "XPC",
            maxSupply:        1_000_000e18,
            totalTokenSupply: 1_000_000e18,
            auctionStart:     auctionStart,
            auctionEnd:       auctionEnd,
            unlockTime:       unlockTime,
            minimumPrice:     1e6,         // $1 USDC
            rtCapMultiplier:  5,
            paymentToken:     address(usdc),
            campaignOwner:    deployer
        });

        uint256 campaignId = factory.createCampaign(p);
        PenguinFactory.Campaign memory c = factory.getCampaign(campaignId);
        vm.stopBroadcast();

        ContinuousClearingAuction auction   = ContinuousClearingAuction(c.batchAuction);
        AllocationNFT             nft       = AllocationNFT(c.allocationNFT);
        ARMVault                  vault     = ARMVault(c.armVault);
        Settlement                settlement = Settlement(c.settlement);
        PrincipalToken            pt        = PrincipalToken(c.principalToken);
        RiskToken                 rt        = RiskToken(c.riskToken);
        LaunchToken               lt        = LaunchToken(c.launchToken);

        console.log("\n=== Campaign", campaignId, "===");
        console.log("BatchAuction:   ", c.batchAuction);
        console.log("AllocationNFT:  ", c.allocationNFT);
        console.log("ARMVault:       ", c.armVault);
        console.log("Settlement:     ", c.settlement);
        console.log("PrincipalToken: ", c.principalToken);
        console.log("RiskToken:      ", c.riskToken);
        console.log("LaunchToken:    ", c.launchToken);

        // ════════════════════════════════════════════════════════════════════
        // PHASE 1 — Auction
        // ════════════════════════════════════════════════════════════════════

        // Advance Anvil to auction start
        _warp(auctionStart + 1);
        console.log("\n--- Phase 1: Auction ---");

        // Alice bids 600k tokens @ $3 — deposit = 1,800,000 USDC
        vm.startBroadcast(aliceKey);
        usdc.approve(address(auction), 1_800_000e6);
        auction.submitBid(600_000e18, 3e6);
        vm.stopBroadcast();
        console.log("Alice bid: 600k tokens @ $3");

        // Bob bids 400k tokens @ $2 — deposit = 800,000 USDC
        vm.startBroadcast(bobKey);
        usdc.approve(address(auction), 800_000e6);
        auction.submitBid(400_000e18, 2e6);
        vm.stopBroadcast();
        console.log("Bob bid:   400k tokens @ $2");

        // ── Finalize at clearing price = $2 (exactly subscribed) ─────────────
        _warp(auctionEnd + 1);
        vm.startBroadcast(deployerKey);
        auction.finalizeAuction(2e6);
        vm.stopBroadcast();

        console.log("Auction finalized @ $2 clearing price");
        console.log("Fill ratio:", auction.fillRatio(), "(1e18 = 100%)");

        // ── Settle bids ───────────────────────────────────────────────────────
        uint256 alicePreUSDC = usdc.balanceOf(alice);
        vm.startBroadcast(aliceKey);
        auction.settle(0);
        vm.stopBroadcast();
        console.log("\nAlice settled bid 0");
        console.log("  USDC refund:", (usdc.balanceOf(alice) - alicePreUSDC) / 1e6, "USDC");
        console.log("  NFT balance:", nft.balanceOf(alice));
        console.log("  Allocation: ", nft.getAllocation(0).amount / 1e18, "tokens");

        vm.startBroadcast(bobKey);
        auction.settle(1);
        vm.stopBroadcast();
        console.log("Bob settled bid 1");
        console.log("  NFT balance:", nft.balanceOf(bob));

        // ── Withdraw proceeds ─────────────────────────────────────────────────
        uint256 preProceeds = usdc.balanceOf(deployer);
        vm.startBroadcast(deployerKey);
        auction.withdrawProceeds(deployer);
        vm.stopBroadcast();
        console.log("\nProtocol proceeds withdrawn:", (usdc.balanceOf(deployer) - preProceeds) / 1e6, "USDC");

        // ════════════════════════════════════════════════════════════════════
        // PHASE 2 — ARM Vault: split NFT -> PT + RT
        // ════════════════════════════════════════════════════════════════════
        console.log("\n--- Phase 2: ARM Vault ---");

        vm.startBroadcast(aliceKey);
        nft.approve(address(vault), 0);
        vault.deposit(0);
        vm.stopBroadcast();
        console.log("Alice deposited NFT 0");
        console.log("  PT balance:", pt.balanceOf(alice) / 1e18);
        console.log("  RT balance:", rt.balanceOf(alice) / 1e18);

        vm.startBroadcast(bobKey);
        nft.approve(address(vault), 1);
        vault.deposit(1);
        vm.stopBroadcast();
        console.log("Bob deposited NFT 1");
        console.log("  PT balance:", pt.balanceOf(bob) / 1e18);
        console.log("  RT balance:", rt.balanceOf(bob) / 1e18);

        // ════════════════════════════════════════════════════════════════════
        // PHASE 3 — TGE
        // ════════════════════════════════════════════════════════════════════
        console.log("\n--- Phase 3: TGE ---");

        _warp(unlockTime + 24 hours + 1);

        // Max liability = 1M tokens * $2 CP * (5-1) = $8M USDC
        console.log("Max RT liability:", settlement.maxRTLiability() / 1e6, "USDC");

        // Deposit RT reserve ($4M covers full payout at $6 TGE price)
        vm.startBroadcast(deployerKey);
        usdc.approve(address(settlement), 4_000_000e6);
        settlement.depositRTReserve(4_000_000e6);
        settlement.setTGEPrice(6e6); // TGE price = $6
        vm.stopBroadcast();

        console.log("TGE price set: $6");
        console.log("Payout per RT:", settlement.payoutPerRT() / 1e6, "USDC");

        // ── Alice redeems PT -> LaunchTokens ──────────────────────────────────
        vm.startBroadcast(aliceKey);
        pt.approve(address(settlement), 600_000e18);
        settlement.redeemPT(600_000e18);
        vm.stopBroadcast();
        console.log("\nAlice redeemed PT -> LaunchToken:", lt.balanceOf(alice) / 1e18, "XPC");

        // ── Bob redeems PT -> LaunchTokens ────────────────────────────────────
        vm.startBroadcast(bobKey);
        pt.approve(address(settlement), 400_000e18);
        settlement.redeemPT(400_000e18);
        vm.stopBroadcast();
        console.log("Bob redeemed PT -> LaunchToken:", lt.balanceOf(bob) / 1e18, "XPC");

        // ── Alice settles RT -> USDC ───────────────────────────────────────────
        uint256 alicePreRT = usdc.balanceOf(alice);
        vm.startBroadcast(aliceKey);
        rt.approve(address(settlement), 600_000e18);
        settlement.settleRT(600_000e18);
        vm.stopBroadcast();
        console.log("\nAlice settled RT -> USDC:", (usdc.balanceOf(alice) - alicePreRT) / 1e6, "USDC");

        // ── Bob settles RT -> USDC ────────────────────────────────────────────
        uint256 bobPreRT = usdc.balanceOf(bob);
        vm.startBroadcast(bobKey);
        rt.approve(address(settlement), 400_000e18);
        settlement.settleRT(400_000e18);
        vm.stopBroadcast();
        console.log("Bob settled RT -> USDC:", (usdc.balanceOf(bob) - bobPreRT) / 1e6, "USDC");

        // ════════════════════════════════════════════════════════════════════
        // Summary
        // ════════════════════════════════════════════════════════════════════
        console.log("\n========== FINAL STATE ==========");
        console.log("LaunchToken total supply:", lt.totalSupply() / 1e18, "XPC");
        console.log("Alice XPC:  ", lt.balanceOf(alice) / 1e18);
        console.log("Bob XPC:    ", lt.balanceOf(bob) / 1e18);
        console.log("RT reserve remaining:", settlement.rtReserve() / 1e6, "USDC");
        console.log("=================================");
    }

    function _deployFactory(address usdc) internal returns (PenguinFactory factory) {
        address d1 = address(1);
        address d2 = address(2);
        address d3 = address(3);
        address d4 = address(4);
        address d5 = address(5);

        PenguinFactory.Implementations memory impls;
        impls.launchToken       = address(new LaunchToken("impl", "IMPL", 1, deployer));
        impls.allocationNFT     = address(new AllocationNFT(deployer));
        impls.batchAuction      = address(new ContinuousClearingAuction(
            usdc, d1, 1, block.timestamp + 1, block.timestamp + 2, block.timestamp + 3, 1, deployer
        ));
        impls.principalToken    = address(new PrincipalToken("IMPL", deployer));
        impls.riskToken         = address(new RiskToken("IMPL", deployer));
        impls.armVault          = address(new ARMVault(d1, d2, d3, d4));
        impls.settlement        = address(new Settlement(d1, d2, d3, d4, d5, usdc, 2, deployer));
        impls.liquidityBootstrap = address(new LiquidityBootstrap(usdc, d1, d2, deployer));

        factory = new PenguinFactory(impls, usdc, deployer);

        console.log("\n=== PenguinFactory ===");
        console.log("Address:", address(factory));
    }
}
