// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./LaunchToken.sol";
import "./AllocationNFT.sol";
import "./BatchAuction.sol";
import "./PrincipalToken.sol";
import "./RiskToken.sol";
import "./ARMVault.sol";
import "./Settlement.sol";
import "./LiquidityBootstrap.sol";

/// @title PenguinFactory
/// @notice Deploys and wires all per-campaign contracts in a single transaction.
/// @dev Separates deployment into two phases:
///
///      Phase 1 — createCampaign():
///        Deploys: LaunchToken, AllocationNFT, BatchAuction, PT, RT, ARMVault,
///                 Settlement, LiquidityBootstrap.
///        Wires:   AllocationNFT.setMinter(batchAuction)
///                 PrincipalToken.setVault(armVault)
///                 RiskToken.setVault(armVault)
///                 LaunchToken.setMinter(settlement)
///        Transfers ownership of all contracts to campaignOwner.
///        ARMVault and Settlement read clearingPrice lazily from BatchAuction,
///        so they can be fully deployed before the auction finalizes.
///
///      Phase 2 — no additional factory call needed.
///        After the auction finalizes, users deposit NFTs into ARMVault directly.
///        ARMVault caches clearingPrice on first deposit.
contract PenguinFactory is Ownable {
    error ZeroAddress();
    error ZeroAmount();
    error InvalidTimestamps();
    error InvalidRTCap();

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed campaignOwner,
        address launchToken,
        address allocationNFT,
        address batchAuction,
        address principalToken,
        address riskToken,
        address armVault,
        address settlement,
        address liquidityBootstrap
    );

    struct Campaign {
        address launchToken;
        address allocationNFT;
        address batchAuction;
        address principalToken;
        address riskToken;
        address armVault;
        address settlement;
        address liquidityBootstrap;
        address campaignOwner;
    }

    struct CampaignParams {
        /// @notice Launch token name and symbol (e.g. "XProtocol", "XPC").
        string tokenName;
        string tokenSymbol;
        /// @notice Hard cap on LaunchToken supply — must match totalTokenSupply_.
        uint256 maxSupply;
        /// @notice Total tokens available in the auction (in 1e18 decimals).
        uint256 totalTokenSupply;
        uint256 auctionStart;
        uint256 auctionEnd;
        /// @notice TGE unlock time — must be after auctionEnd.
        uint256 unlockTime;
        /// @notice Floor bid price in payment token decimals (e.g. USDC 6dp).
        uint256 minimumPrice;
        /// @notice RT payout cap as a multiple of clearingPrice. e.g. 5 = max 5x.
        uint256 rtCapMultiplier;
        /// @notice Payment token (USDC) address.
        address paymentToken;
        /// @notice Address that will own all campaign contracts post-deployment.
        address campaignOwner;
    }

    /// @notice Protocol-level payment token. Set once at factory deployment.
    address public immutable paymentToken;

    uint256 public campaignCount;
    mapping(uint256 => Campaign) public campaigns;

    constructor(address paymentToken_, address owner_) Ownable(owner_) {
        if (paymentToken_ == address(0)) revert ZeroAddress();
        paymentToken = paymentToken_;
    }

    /// @notice Deploy a full campaign and transfer ownership to campaignOwner.
    /// @dev All contracts are deployed with the factory as temporary owner.
    ///      Authorities (setMinter, setVault) are wired before ownership is transferred.
    /// @param p Campaign parameters.
    /// @return campaignId Index of the newly created campaign.
    function createCampaign(CampaignParams calldata p) external onlyOwner returns (uint256 campaignId) {
        if (p.campaignOwner == address(0) || p.paymentToken == address(0)) revert ZeroAddress();
        if (p.maxSupply == 0 || p.totalTokenSupply == 0 || p.minimumPrice == 0) revert ZeroAmount();
        if (p.auctionEnd <= p.auctionStart || p.unlockTime <= p.auctionEnd) revert InvalidTimestamps();
        if (p.rtCapMultiplier <= 1) revert InvalidRTCap();

        // --- Deploy ---

        LaunchToken launchToken = new LaunchToken(
            p.tokenName,
            p.tokenSymbol,
            p.maxSupply,
            address(this)
        );

        AllocationNFT allocationNFT = new AllocationNFT(address(this));

        ContinuousClearingAuction batchAuction = new ContinuousClearingAuction(
            p.paymentToken,
            address(allocationNFT),
            p.totalTokenSupply,
            p.auctionStart,
            p.auctionEnd,
            p.unlockTime,
            p.minimumPrice,
            address(this)
        );

        PrincipalToken principalToken = new PrincipalToken(p.tokenSymbol, address(this));
        RiskToken riskToken = new RiskToken(p.tokenSymbol, address(this));

        ARMVault armVault = new ARMVault(
            address(batchAuction),
            address(allocationNFT),
            address(principalToken),
            address(riskToken)
        );

        Settlement settlement = new Settlement(
            address(launchToken),
            address(principalToken),
            address(riskToken),
            address(armVault),
            p.paymentToken,
            p.rtCapMultiplier,
            address(this)
        );

        LiquidityBootstrap liquidityBootstrap = new LiquidityBootstrap(
            p.paymentToken,
            address(principalToken),
            address(riskToken),
            address(this)
        );

        // --- Wire authorities ---

        allocationNFT.setMinter(address(batchAuction));
        principalToken.setVault(address(armVault));
        riskToken.setVault(address(armVault));
        launchToken.setMinter(address(settlement));

        // --- Transfer ownership to campaign owner ---

        launchToken.transferOwnership(p.campaignOwner);
        allocationNFT.transferOwnership(p.campaignOwner);
        batchAuction.transferOwnership(p.campaignOwner);
        principalToken.transferOwnership(p.campaignOwner);
        riskToken.transferOwnership(p.campaignOwner);
        settlement.transferOwnership(p.campaignOwner);
        liquidityBootstrap.transferOwnership(p.campaignOwner);

        // --- Store and emit ---

        campaignId = campaignCount++;

        campaigns[campaignId] = Campaign({
            launchToken: address(launchToken),
            allocationNFT: address(allocationNFT),
            batchAuction: address(batchAuction),
            principalToken: address(principalToken),
            riskToken: address(riskToken),
            armVault: address(armVault),
            settlement: address(settlement),
            liquidityBootstrap: address(liquidityBootstrap),
            campaignOwner: p.campaignOwner
        });

        emit CampaignCreated(
            campaignId,
            p.campaignOwner,
            address(launchToken),
            address(allocationNFT),
            address(batchAuction),
            address(principalToken),
            address(riskToken),
            address(armVault),
            address(settlement),
            address(liquidityBootstrap)
        );
    }

    /// @notice Returns all contract addresses for a campaign.
    function getCampaign(uint256 campaignId) external view returns (Campaign memory) {
        return campaigns[campaignId];
    }
}
