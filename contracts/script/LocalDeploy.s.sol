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

/// @notice Deploys the full Penguin Protocol stack on a local Anvil node.
///         No env vars required — uses hardcoded Anvil default accounts.
///
/// Usage:
///   anvil &
///   forge script script/LocalDeploy.s.sol \
///     --rpc-url http://127.0.0.1:8545 \
///     --broadcast --legacy -vvvv
contract LocalDeploy is Script {

    // Anvil account #0 — deployer / campaign owner
    address constant DEPLOYER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    uint256 constant DEPLOYER_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    // Anvil accounts #1 and #2 — test participants, seeded with mock USDC
    address constant ALICE = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    address constant BOB   = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;

    function run() external {
        vm.startBroadcast(DEPLOYER_KEY);

        // ── 1. Mock USDC ──────────────────────────────────────────────────────
        MockERC20 usdc = new MockERC20("USD Coin", "USDC", 6, DEPLOYER);
        usdc.mint(DEPLOYER, 100_000_000e6);
        usdc.mint(ALICE,     10_000_000e6);
        usdc.mint(BOB,       10_000_000e6);

        // ── 2. Implementation contracts (clone templates) ─────────────────────
        //    Constructor args are dummy values — _disableInitializers() prevents
        //    direct use; clones are initialized via initialize() per campaign.
        address d1 = address(1);
        address d2 = address(2);
        address d3 = address(3);
        address d4 = address(4);
        address d5 = address(5);

        PenguinFactory.Implementations memory impls;
        impls.launchToken        = address(new LaunchToken("impl", "IMPL", 1, DEPLOYER));
        impls.allocationNFT      = address(new AllocationNFT(DEPLOYER));
        impls.batchAuction       = address(new ContinuousClearingAuction(
            address(usdc), d1, 1,
            block.timestamp + 1, block.timestamp + 2, block.timestamp + 3,
            1, DEPLOYER
        ));
        impls.principalToken     = address(new PrincipalToken("IMPL", DEPLOYER));
        impls.riskToken          = address(new RiskToken("IMPL", DEPLOYER));
        impls.armVault           = address(new ARMVault(d1, d2, d3, d4));
        impls.settlement         = address(new Settlement(d1, d2, d3, d4, d5, address(usdc), 2, DEPLOYER));
        impls.liquidityBootstrap = address(new LiquidityBootstrap(address(usdc), d1, d2, DEPLOYER));

        // ── 3. Factory ────────────────────────────────────────────────────────
        PenguinFactory factory = new PenguinFactory(impls, address(usdc), DEPLOYER);

        // ── 4. Campaign ───────────────────────────────────────────────────────
        uint256 auctionStart = block.timestamp + 1 hours;
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
            minimumPrice:     1e6,           // $1 USDC floor
            rtCapMultiplier:  5,
            paymentToken:     address(usdc),
            campaignOwner:    DEPLOYER
        });

        uint256 campaignId = factory.createCampaign(p);
        PenguinFactory.Campaign memory c = factory.getCampaign(campaignId);

        vm.stopBroadcast();

        // ── Addresses ─────────────────────────────────────────────────────────
        console.log("=== Mock USDC ===");
        console.log("Address:            ", address(usdc));
        console.log("Deployer balance:   ", usdc.balanceOf(DEPLOYER) / 1e6, "USDC");
        console.log("Alice balance:      ", usdc.balanceOf(ALICE)    / 1e6, "USDC");
        console.log("Bob balance:        ", usdc.balanceOf(BOB)      / 1e6, "USDC");

        console.log("\n=== Implementations ===");
        console.log("LaunchToken:        ", impls.launchToken);
        console.log("AllocationNFT:      ", impls.allocationNFT);
        console.log("BatchAuction:       ", impls.batchAuction);
        console.log("PrincipalToken:     ", impls.principalToken);
        console.log("RiskToken:          ", impls.riskToken);
        console.log("ARMVault:           ", impls.armVault);
        console.log("Settlement:         ", impls.settlement);
        console.log("LiquidityBootstrap: ", impls.liquidityBootstrap);

        console.log("\n=== Factory ===");
        console.log("Address:            ", address(factory));

        console.log("\n=== Campaign", campaignId, "===");
        console.log("LaunchToken:        ", c.launchToken);
        console.log("AllocationNFT:      ", c.allocationNFT);
        console.log("BatchAuction:       ", c.batchAuction);
        console.log("PrincipalToken:     ", c.principalToken);
        console.log("RiskToken:          ", c.riskToken);
        console.log("ARMVault:           ", c.armVault);
        console.log("Settlement:         ", c.settlement);
        console.log("LiquidityBootstrap: ", c.liquidityBootstrap);
        console.log("\nAuction window:     ", auctionStart, "->", auctionEnd);
        console.log("TGE unlock:         ", unlockTime);
    }
}
