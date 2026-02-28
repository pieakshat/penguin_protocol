// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PenguinFactory.sol";

/// @notice Creates a new campaign on an already-deployed PenguinFactory.
///
/// Required env vars:
///   PRIVATE_KEY        — factory owner private key
///   FACTORY_ADDRESS    — deployed PenguinFactory address
///   PAYMENT_TOKEN      — stablecoin address
///
/// Optional env vars: same as Deploy.s.sol
///
/// Usage:
///   forge script script/CreateCampaign.s.sol \
///     --rpc-url bsc \
///     --broadcast \
///     --verify \
///     -vvvv
contract CreateCampaign is Script {
    function run() external {
        uint256 pk       = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        PenguinFactory factory = PenguinFactory(vm.envAddress("FACTORY_ADDRESS"));

        address campaignOwner = vm.envOr("CAMPAIGN_OWNER", deployer);
        uint256 auctionStart  = block.timestamp + 1 hours;
        uint256 auctionEnd    = auctionStart + vm.envOr("AUCTION_DURATION", uint256(7 days));
        uint256 unlockTime    = auctionEnd   + vm.envOr("UNLOCK_DELAY",     uint256(30 days));

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

        vm.startBroadcast(pk);
        uint256 campaignId = factory.createCampaign(p);
        vm.stopBroadcast();

        PenguinFactory.Campaign memory c = factory.getCampaign(campaignId);

        console.log("=== Campaign", campaignId, "===");
        console.log("Factory:            ", address(factory));
        console.log("Owner:              ", campaignOwner);
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
