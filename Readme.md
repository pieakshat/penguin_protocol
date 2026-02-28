# Penguin Protocol

A fair-launch token distribution protocol on BNB Chain. Projects use it to run a uniform-price batch auction, split allocations into principal and risk components, seed Uniswap v3 liquidity, then settle at TGE — all wired by a single factory call.

Every campaign is a set of 8 EIP-1167 minimal proxy contracts deployed in one transaction. The factory itself is ~5 KB on-chain.

---

## How It Works — System Flow

```
Phase 1 ─ Auction
  Bidders submit (tokenAmount, maxPrice) → USDC locked in BatchAuction
  Owner finalizes → clearingPrice set, AllocationNFT minted to winners

Phase 2 ─ ARM Vault
  Winners deposit AllocationNFT → receive PT + RT (1:1 with filled amount)
  PT = right to 1 LaunchToken at TGE
  RT = right to upside USDC if TGE price > clearing price

Phase 3 ─ Liquidity Bootstrap
  10% of USDC raised → LiquidityBootstrap contract
  Whitelisted market maker pulls USDC + PT/RT → seeds PT/USDC & RT/USDC Uniswap v3 pools

Phase 4 ─ Trading Window
  PT and RT trade freely on Uniswap v3
  Price discovery happens before TGE

Phase 5 ─ Settlement (post-TGE)
  PT holders: burn PT → receive LaunchToken 1:1
  RT holders: burn RT → receive USDC payout = max(0, min(tgePrice, CP × rtCapMultiplier) − CP) per token
              pro-rated if reserve is insufficient
  Fallback:   holders who never deposited into ARMVault can redeem NFT directly for LaunchToken
```

```
Bidder
  │  submitBid(qty, price)
  ▼
BatchAuction ──finalizeAuction(clearingPrice)──► AllocationNFT.mint()
                                                       │
                                                  deposit(nftId)
                                                       ▼
                                                   ARMVault ──► PrincipalToken.mint()
                                                            └──► RiskToken.mint()
                                                                       │
                                               ┌────────────────────── │ ────────────────────┐
                                               │   LiquidityBootstrap  │                     │
                                               │   (10% USDC → MMs)    │                     │
                                               └───────────────────────┘                     │
                                                                                              │
                                                                                         Settlement
                                                                                         ├── redeemPT()  → LaunchToken
                                                                                         └── settleRT()  → USDC payout
```

---

## Repository Layout

```
penguin_protocol/
├── contracts/
│   ├── src/
│   │   ├── PenguinFactory.sol       # deploys all 8 clones in one call
│   │   ├── BatchAuction.sol         # ContinuousClearingAuction
│   │   ├── AllocationNFT.sol        # ERC721 allocation receipt
│   │   ├── ARMVault.sol             # NFT → PT + RT splitter
│   │   ├── PrincipalToken.sol       # ERC20 PT
│   │   ├── RiskToken.sol            # ERC20 RT
│   │   ├── Settlement.sol           # post-TGE redemption
│   │   ├── LaunchToken.sol          # final project ERC20
│   │   ├── LiquidityBootstrap.sol   # USDC escrow for MMs
│   │   ├── interfaces/
│   │   └── lib/Initializable.sol
│   ├── test/                        # 147 Foundry tests (all passing)
│   └── script/Deploy.s.sol
└── sim/
    ├── engine/                      # TypeScript analytical simulation
    └── dashboard/                   # Next.js 14 + Recharts dashboard
```

---

## Contracts

### PenguinFactory
Deploys and wires a full campaign in a single `createCampaign()` call using EIP-1167 minimal proxies. Implementations are deployed once; each campaign clones them. The factory is ~5 KB on-chain (well under the 24 KB EIP-170 limit). Transfers ownership of all 8 contracts to `campaignOwner` after wiring.

### BatchAuction (`ContinuousClearingAuction`)
Uniform-price batch auction. Bidders lock `tokenAmount × maxPrice` USDC during the auction window. After the window closes, the owner submits a clearing price — the lowest price where cumulative demand meets supply. All winners pay the same clearing price; excess USDC is refunded on settlement. If oversubscribed, allocations are pro-rated via `fillRatio`. Winners receive an `AllocationNFT`. Hard cap of 500 bids to bound finalization gas. If the owner fails to finalize within 7 days of auction end, bidders can emergency-refund without trust assumptions.

### AllocationNFT
ERC721 minted by `BatchAuction` when a winner settles their bid. Each token stores immutable metadata: `amount` (tokens filled), `clearingPrice`, and `unlockTime`. Burned/transferred to `ARMVault` on deposit, or to `Settlement` on direct redemption. Minter is set to the `BatchAuction` address by the factory.

### ARMVault
Accepts an `AllocationNFT` and mints `PT + RT` to the depositor in equal amounts matching the NFT's `amount`. The vault reads `clearingPrice` lazily from `BatchAuction` and caches it on first deposit — all subsequent deposits validate against this cached price to guarantee a single consistent clearing price per campaign. The NFT is permanently held; there is no unwrap path.

### PrincipalToken
ERC20. Minted 1:1 by `ARMVault` on NFT deposit. Redeemed 1:1 for `LaunchToken` via `Settlement.redeemPT()` after `unlockTime`. Represents the "safe" portion of the allocation — holders get their tokens at TGE regardless of price performance.

### RiskToken
ERC20. Minted 1:1 by `ARMVault` on NFT deposit alongside PT. Settles via `Settlement.settleRT()` for a USDC payout calculated as:

```
effectivePrice = min(tgePrice, clearingPrice × rtCapMultiplier)
payoutPerRT    = max(0, effectivePrice − clearingPrice)
```

The cap bounds the protocol's maximum USDC liability. `payoutPerRT` is frozen at `setTGEPrice` time — all RT holders receive the same rate regardless of when they settle. If the reserve is insufficient, payout is uniformly pro-rated. RT is worth zero if `tgePrice ≤ clearingPrice`.

### Settlement
Handles all post-TGE redemptions:
- **PT → LaunchToken**: 1:1, permissionless after `unlockTime`
- **RT → USDC**: uses the frozen `payoutPerRT` rate set by the owner
- **Direct NFT redemption**: holders who skipped ARMVault can redeem their `AllocationNFT` directly for `LaunchToken` (no RT upside, no PT mechanics)
- **Emergency path**: if owner never calls `setTGEPrice` within 90 days of unlock, anyone can trigger emergency settlement distributing whatever reserve exists

The owner must deposit a USDC reserve before calling `setTGEPrice`. A mandatory 24-hour delay after `unlockTime` forces price discovery before the rate is locked. Unused reserve can be recovered 90 days after `setTGEPrice`.

### LiquidityBootstrap
Escrow for the USDC slice earmarked for Uniswap v3 LP seeding (~10% of auction proceeds). The owner whitelists market maker addresses; MMs call `withdrawForLP()` to pull USDC, PT, or RT, then deploy concentrated liquidity positions externally and call `reportDeployed()` for on-chain transparency. The contract does not interact with Uniswap directly. Owner can emergency-withdraw if MMs go dark.

### LaunchToken
Standard ERC20 with a `maxSupply` cap. Minted exclusively by `Settlement` at TGE. Name and symbol are set per-campaign via `initialize()`.

---

## Running the Tests

```bash
cd contracts
forge test
```

147 tests, all passing. Requires Foundry.

---

## Deployment

### 1. Set environment variables

Create `contracts/.env`:

```env
PRIVATE_KEY=<deployer_private_key_no_0x_prefix>
PAYMENT_TOKEN=<usdc_or_usdt_address>
INFURA_API_KEY=<your_infura_key>
BSCSCAN_API_KEY=<your_bscscan_key>

# Campaign config (optional — defaults shown)
TOKEN_NAME=XProtocol
TOKEN_SYMBOL=XPC
MAX_SUPPLY=1000000000000000000000000
TOTAL_SUPPLY=1000000000000000000000000
AUCTION_DURATION=604800
UNLOCK_DELAY=2592000
MIN_PRICE=1000000000000000000
RT_CAP_MULTIPLIER=5
```

> `MIN_PRICE` is in payment token decimals. Default `1e18` = $1 for 18-decimal BSC stablecoins. Use `1000000` for 6-decimal USDC.

Common BNB Chain payment tokens:
- USDT (18 dec): `0x55d398326f99059fF775485246999027B3197955`
- USDC (18 dec): `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d`

### 2. Dry-run (no broadcast)

```bash
cd contracts
forge script script/Deploy.s.sol --rpc-url bsc -vvvv
```

### 3. Deploy to mainnet

```bash
forge script script/Deploy.s.sol \
  --rpc-url bsc \
  --broadcast \
  --verify \
  -vvvv
```

This deploys 8 implementation contracts, `PenguinFactory`, then calls `createCampaign()` — all logged to stdout with addresses.

---

## Simulation Dashboard

An analytical TypeScript simulation of the full 5-phase lifecycle with a Next.js dashboard.

```bash
# Sanity check — prints SimulationResult JSON
cd sim
npm install
npx ts-node engine/scenario.ts

# Run the dashboard
cd sim/dashboard
npm install
npm run dev
# → open http://localhost:3000
```

Tweak auction parameters, trader counts, TGE price, and RT cap multiplier via sliders. Charts include bid ladder, PT/USDC + RT/USDC price action, liquidity depth, per-archetype P&L, and RT payout sensitivity sweep.

---

## Key Invariants

| Invariant | Detail |
|---|---|
| Uniform price | All winners pay `clearingPrice`, not their bid price |
| RT payout ordering | `payoutPerRT` frozen at `setTGEPrice` — no first-mover advantage |
| RT cap | Payout capped at `(rtCapMultiplier − 1) × clearingPrice` per token |
| Clearing price cache | ARMVault caches on first deposit — all NFTs for a campaign share one price |
| Emergency exits | Bidders: 7-day grace refund. RT holders: 90-day emergency settlement |
| Factory size | ~5 KB via EIP-1167 clones (EIP-170 limit is 24 KB) |

---

## Stack

- Solidity `^0.8.24`, Foundry, OpenZeppelin v5.6.0
- BNB Chain mainnet (chain ID 56)
- `via_ir = true`, `optimizer_runs = 200` (required for stack-depth)
- Simulation: TypeScript, Next.js 14 App Router, Tailwind CSS, Recharts
