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

/// @notice Deploys implementation contracts, then PenguinFactory, then creates one campaign.
///
/// Required env vars:
///   PRIVATE_KEY        — deployer private key (hex, no 0x prefix)
///   PAYMENT_TOKEN      — stablecoin address on target network
///
/// Optional env vars (sensible defaults for BNB Chain / 18-decimal stablecoins):
///   CAMPAIGN_OWNER     — defaults to deployer
///   TOKEN_NAME         — default: "XProtocol"
///   TOKEN_SYMBOL       — default: "XPC"
///   MAX_SUPPLY         — default: 1_000_000e18
///   TOTAL_SUPPLY       — default: 1_000_000e18
///   AUCTION_DURATION   — seconds the auction runs, default: 7 days
///   UNLOCK_DELAY       — seconds after auction until TGE, default: 30 days
///   MIN_PRICE          — floor price in payment token decimals
///                        default: 1e18 ($1 for 18-dec BSC stablecoins)
///   RT_CAP_MULTIPLIER  — RT payout cap multiplier, default: 5
///
/// Usage (BNB Chain mainnet):
///   forge script script/Deploy.s.sol \
///     --rpc-url bsc \
///     --broadcast \
///     --verify \
///     -vvvv
///
/// Dry-run (no broadcast):
///   forge script script/Deploy.s.sol --rpc-url bsc -vvvv
contract Deploy is Script {
    PenguinFactory public factory;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        PenguinFactory.Implementations memory impls = _deployImplementations(deployer);
        _deployFactory(impls, deployer);
        _createCampaign(deployer);
        vm.stopBroadcast();
    }

    /// @dev Deploy one implementation of each sub-contract.
    ///      Implementations use dummy constructor args — they are never called directly.
    ///      _disableInitializers() in each constructor prevents direct use.
    function _deployImplementations(address deployer)
        internal
        returns (PenguinFactory.Implementations memory impls)
    {
        address paymentToken = vm.envAddress("PAYMENT_TOKEN");

        // Dummy addresses that satisfy non-zero checks in constructors.
        address d1 = address(1);
        address d2 = address(2);
        address d3 = address(3);
        address d4 = address(4);
        address d5 = address(5);

        impls.launchToken = address(
            new LaunchToken("impl", "IMPL", 1, deployer)
        );

        impls.allocationNFT = address(
            new AllocationNFT(deployer)
        );

        impls.batchAuction = address(
            new ContinuousClearingAuction(
                paymentToken, d1,
                1,
                block.timestamp + 1, block.timestamp + 2, block.timestamp + 3,
                1,
                deployer
            )
        );

        impls.principalToken = address(
            new PrincipalToken("IMPL", deployer)
        );

        impls.riskToken = address(
            new RiskToken("IMPL", deployer)
        );

        impls.armVault = address(
            new ARMVault(d1, d2, d3, d4)
        );

        impls.settlement = address(
            new Settlement(d1, d2, d3, d4, d5, paymentToken, 2, deployer)
        );

        impls.liquidityBootstrap = address(
            new LiquidityBootstrap(paymentToken, d1, d2, deployer)
        );

        console.log("=== Implementations ===");
        console.log("LaunchToken:        ", impls.launchToken);
        console.log("AllocationNFT:      ", impls.allocationNFT);
        console.log("BatchAuction:       ", impls.batchAuction);
        console.log("PrincipalToken:     ", impls.principalToken);
        console.log("RiskToken:          ", impls.riskToken);
        console.log("ARMVault:           ", impls.armVault);
        console.log("Settlement:         ", impls.settlement);
        console.log("LiquidityBootstrap: ", impls.liquidityBootstrap);
    }

    function _deployFactory(PenguinFactory.Implementations memory impls, address deployer) internal {
        address paymentToken = vm.envAddress("PAYMENT_TOKEN");
        factory = new PenguinFactory(impls, paymentToken, deployer);

        console.log("\n=== PenguinFactory ===");
        console.log("Address:        ", address(factory));
        console.log("Owner:          ", deployer);
        console.log("PaymentToken:   ", paymentToken);
    }

    function _createCampaign(address deployer) internal {
        address campaignOwner = vm.envOr("CAMPAIGN_OWNER", deployer);

        uint256 auctionStart = block.timestamp + 1 hours;
        uint256 auctionEnd   = auctionStart + vm.envOr("AUCTION_DURATION", uint256(7 days));
        uint256 unlockTime   = auctionEnd   + vm.envOr("UNLOCK_DELAY",     uint256(30 days));

        // Default MIN_PRICE is 1e18 — $1 for 18-decimal BSC stablecoins (USDT/USDC).
        // Override via MIN_PRICE env var if using a 6-decimal token.
        PenguinFactory.CampaignParams memory p = PenguinFactory.CampaignParams({
            tokenName:        vm.envOr("TOKEN_NAME",   string("XProtocol")),
            tokenSymbol:      vm.envOr("TOKEN_SYMBOL", string("XPC")),
            maxSupply:        vm.envOr("MAX_SUPPLY",   uint256(1_000_000e18)),
            totalTokenSupply: vm.envOr("TOTAL_SUPPLY", uint256(1_000_000e18)),
            auctionStart:     auctionStart,
            auctionEnd:       auctionEnd,
            unlockTime:       unlockTime,
            minimumPrice:     vm.envOr("MIN_PRICE",         uint256(1e18)),
            rtCapMultiplier:  vm.envOr("RT_CAP_MULTIPLIER", uint256(5)),
            paymentToken:     vm.envAddress("PAYMENT_TOKEN"),
            campaignOwner:    campaignOwner
        });

        uint256 campaignId = factory.createCampaign(p);
        PenguinFactory.Campaign memory c = factory.getCampaign(campaignId);

        console.log("\n=== Campaign", campaignId, "===");
        console.log("Owner:              ", campaignOwner);
        console.log("TokenName:          ", p.tokenName);
        console.log("TokenSymbol:        ", p.tokenSymbol);
        console.log("AuctionStart:       ", auctionStart);
        console.log("AuctionEnd:         ", auctionEnd);
        console.log("UnlockTime:         ", unlockTime);
        console.log("MinimumPrice:       ", p.minimumPrice);
        console.log("RTCapMultiplier:    ", p.rtCapMultiplier);
        console.log("\n--- Contracts ---");
        console.log("LaunchToken:        ", c.launchToken);
        console.log("AllocationNFT:      ", c.allocationNFT);
        console.log("BatchAuction:       ", c.batchAuction);
        console.log("PrincipalToken:     ", c.principalToken);
        console.log("RiskToken:          ", c.riskToken);
        console.log("ARMVault:           ", c.armVault);
        console.log("Settlement:         ", c.settlement);
        console.log("LiquidityBootstrap: ", c.liquidityBootstrap);
    }
}
