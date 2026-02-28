// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./LaunchToken.sol";
import "./AllocationNFT.sol";
import "./BatchAuction.sol";
import "./PrincipalToken.sol";
import "./RiskToken.sol";
import "./ARMVault.sol";
import "./Settlement.sol";
import "./LiquidityBootstrap.sol";

/// @title PenguinFactory
/// @notice Deploys and wires all per-campaign contracts via EIP-1167 minimal proxies.
/// @dev Separates deployment into two phases:
///
///      Phase 0 — constructor (one-time, off-chain):
///        Caller deploys one implementation of each of the 8 sub-contracts,
///        passes their addresses as `Implementations` to this constructor.
///        The factory stores only 8 addresses — zero embedded bytecode.
///
///      Phase 1 — createCampaign():
///        Clones each implementation (< 200 gas per clone, fixed bytecode).
///        Calls initialize() on each clone to wire per-campaign state.
///        Wires:   AllocationNFT.setMinter(batchAuction)
///                 PrincipalToken.setVault(armVault)
///                 RiskToken.setVault(armVault)
///                 LaunchToken.setMinter(settlement)
///        Transfers ownership of all contracts to campaignOwner.
///
///      Phase 2 — no additional factory call needed.
///        After the auction finalizes, users deposit NFTs into ARMVault directly.
contract PenguinFactory is Ownable {
    using Clones for address;

    error ZeroAddress();
    error ZeroAmount();
    error InvalidTimestamps();
    error InvalidRTCap();
    error SupplyMismatch();

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

    struct Implementations {
        address launchToken;
        address allocationNFT;
        address batchAuction;
        address principalToken;
        address riskToken;
        address armVault;
        address settlement;
        address liquidityBootstrap;
    }

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

    /// @notice Implementation addresses used as clone templates.
    Implementations public impls;

    uint256 public campaignCount;
    mapping(uint256 => Campaign) public campaigns;

    /// @param impls_        Addresses of the 8 implementation contracts.
    /// @param paymentToken_ Default payment token (USDC).
    /// @param owner_        Factory owner (protocol multisig).
    constructor(Implementations memory impls_, address paymentToken_, address owner_) Ownable(owner_) {
        if (paymentToken_ == address(0)) revert ZeroAddress();
        if (
            impls_.launchToken       == address(0) ||
            impls_.allocationNFT     == address(0) ||
            impls_.batchAuction      == address(0) ||
            impls_.principalToken    == address(0) ||
            impls_.riskToken         == address(0) ||
            impls_.armVault          == address(0) ||
            impls_.settlement        == address(0) ||
            impls_.liquidityBootstrap == address(0)
        ) revert ZeroAddress();

        impls = impls_;
        paymentToken = paymentToken_;
    }

    /// @notice Clone and wire a full campaign, transferring ownership to campaignOwner.
    /// @dev Uses EIP-1167 minimal proxies — factory embeds zero implementation bytecode.
    /// @param p Campaign parameters.
    /// @return campaignId Index of the newly created campaign.
    function createCampaign(CampaignParams calldata p) external onlyOwner returns (uint256 campaignId) {
        if (p.campaignOwner == address(0) || p.paymentToken == address(0)) revert ZeroAddress();
        if (p.maxSupply == 0 || p.totalTokenSupply == 0 || p.minimumPrice == 0) revert ZeroAmount();
        if (p.maxSupply < p.totalTokenSupply) revert SupplyMismatch();
        if (p.auctionEnd <= p.auctionStart || p.unlockTime <= p.auctionEnd) revert InvalidTimestamps();
        if (p.rtCapMultiplier <= 1) revert InvalidRTCap();

        // --- Clone + initialize each contract ---

        LaunchToken launchToken = LaunchToken(impls.launchToken.clone());
        launchToken.initialize(p.tokenName, p.tokenSymbol, p.maxSupply, address(this));

        AllocationNFT allocationNFT = AllocationNFT(impls.allocationNFT.clone());
        allocationNFT.initialize(address(this));

        ContinuousClearingAuction batchAuction = ContinuousClearingAuction(impls.batchAuction.clone());
        batchAuction.initialize(
            p.paymentToken,
            address(allocationNFT),
            p.totalTokenSupply,
            p.auctionStart,
            p.auctionEnd,
            p.unlockTime,
            p.minimumPrice,
            address(this)
        );

        PrincipalToken principalToken = PrincipalToken(impls.principalToken.clone());
        principalToken.initialize(p.tokenSymbol, address(this));

        RiskToken riskToken = RiskToken(impls.riskToken.clone());
        riskToken.initialize(p.tokenSymbol, address(this));

        ARMVault armVault = ARMVault(impls.armVault.clone());
        armVault.initialize(
            address(batchAuction),
            address(allocationNFT),
            address(principalToken),
            address(riskToken)
        );

        Settlement settlement = Settlement(impls.settlement.clone());
        settlement.initialize(
            address(launchToken),
            address(principalToken),
            address(riskToken),
            address(armVault),
            address(allocationNFT),
            p.paymentToken,
            p.rtCapMultiplier,
            address(this)
        );

        LiquidityBootstrap liquidityBootstrap = LiquidityBootstrap(impls.liquidityBootstrap.clone());
        liquidityBootstrap.initialize(
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
            launchToken:        address(launchToken),
            allocationNFT:      address(allocationNFT),
            batchAuction:       address(batchAuction),
            principalToken:     address(principalToken),
            riskToken:          address(riskToken),
            armVault:           address(armVault),
            settlement:         address(settlement),
            liquidityBootstrap: address(liquidityBootstrap),
            campaignOwner:      p.campaignOwner
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
