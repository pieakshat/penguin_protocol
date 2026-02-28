// ─── Scenario Configuration ───────────────────────────────────────────────

export interface ScenarioParams {
  totalSupply: number;       // tokens (e.g. 1_000_000)
  minPrice: number;          // USDC per token
  rtCapMultiplier: number;   // e.g. 5
  bidCount: number;
  bidDistribution: 'random' | 'powerlaw' | 'uniform';
  traderCount: { random: number; momentum: number; arb: number };
  tradingDays: number;
  tgePrice: number;          // USDC per LaunchToken
  rtReserve: number;         // USDC deposited for RT payouts
  seed?: number;             // optional rng seed for reproducibility
}

// ─── Auction ──────────────────────────────────────────────────────────────

export interface Bid {
  id: number;
  qty: number;    // tokens requested
  price: number;  // USDC per token (limit price)
}

export interface BidResult extends Bid {
  filled: number;    // tokens actually received
  refund: number;    // USDC refunded
  nftId: number;     // AllocationNFT id (only for winning bids with filled > 0)
  isWinner: boolean;
}

export interface AuctionResult {
  clearingPrice: number;
  fillRatio: number;
  usdcRaised: number;
  lpAllocation: number;  // 10% of usdcRaised
  bids: BidResult[];
  totalFilled: number;
}

// ─── ARM Vault ────────────────────────────────────────────────────────────

export interface ArmVaultResult {
  allocations: {
    bidderId: number;
    nftId: number;
    ptMinted: number;
    rtMinted: number;
  }[];
  totalPT: number;
  totalRT: number;
}

// ─── V3 Pool ──────────────────────────────────────────────────────────────

export interface PoolSnapshot {
  t: number;          // time step index
  price: number;      // token1/token0 spot price
  sqrtPriceX96: bigint;
  tick: number;
  volume0: number;    // volume in token0 this step
  volume1: number;    // volume in token1 this step
  fee0: number;
  fee1: number;
  liquidity: number;
}

export interface LiquidityPosition {
  tickLower: number;
  tickUpper: number;
  liquidity: number;
  feeGrowthInside0: number;
  feeGrowthInside1: number;
}

export interface TickBucket {
  tickLower: number;
  tickUpper: number;
  price: number;
  liquidity: number;
}

// ─── Traders ──────────────────────────────────────────────────────────────

export type TraderType = 'random' | 'momentum' | 'arb';

export interface TradeEvent {
  t: number;
  traderId: number;
  traderType: TraderType;
  pool: 'PT' | 'RT';
  direction: 'buy' | 'sell';  // buy = token0 in, token1 out
  amountIn: number;
  amountOut: number;
  price: number;
  fee: number;
  pnlDelta: number;
}

export interface TraderState {
  id: number;
  type: TraderType;
  usdcBalance: number;
  ptBalance: number;
  rtBalance: number;
  cumulativePnL: number[];   // one entry per time step
  trades: TradeEvent[];
}

export interface TraderResult {
  id: number;
  type: TraderType;
  finalPnL: number;
  totalVolume: number;
  tradeCount: number;
  cumulativePnL: number[];
}

// ─── Settlement ───────────────────────────────────────────────────────────

export interface BidderSettlement {
  bidderId: number;
  auctionCost: number;   // USDC paid at clearing
  tokensFilled: number;
  ptValue: number;       // PT redeemed 1:1 to LaunchToken valued at tgePrice
  rtPayout: number;      // USDC from RT settlement
  netPnL: number;        // ptValue + rtPayout - auctionCost
}

export interface SettlementResult {
  tgePrice: number;
  clearingPrice: number;
  rtCapMultiplier: number;
  effectivePrice: number;
  payoutPerRT: number;
  totalRtPayout: number;
  rtReserveUsed: number;
  proRataFactor: number;  // 1.0 if reserve sufficient, < 1.0 if not
  ptRedemptionRate: number;  // always 1.0 (1 PT → 1 LaunchToken)
  bidderSettlements: BidderSettlement[];
}

// ─── Sensitivity ──────────────────────────────────────────────────────────

export interface SensitivityPoint {
  tgePrice: number;
  payoutPerRT: number;
  avgBidderPnL: number;
}

// ─── Full Result ──────────────────────────────────────────────────────────

export interface SimulationResult {
  params: ScenarioParams;
  auction: AuctionResult;
  armVault: ArmVaultResult;
  pools: {
    pt: PoolSnapshot[];
    rt: PoolSnapshot[];
    depthPT: TickBucket[];
    depthRT: TickBucket[];
  };
  trades: TradeEvent[];
  traders: TraderResult[];
  settlement: SettlementResult;
  sensitivity: SensitivityPoint[];
}
