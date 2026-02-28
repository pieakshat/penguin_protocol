import { ScenarioParams, SimulationResult } from './types';
import { generateBids, runAuction } from './auction';
import { runArmVault } from './armvault';
import { V3Pool } from './v3pool';
import { runTraders } from './traders';
import { runSettlement, runSensitivity } from './settlement';
import { runComparison } from './traditional';

// ─── Default Params ───────────────────────────────────────────────────────

export const DEFAULT_PARAMS: ScenarioParams = {
  totalSupply: 1_000_000,
  minPrice: 0.10,             // $0.10 per token
  rtCapMultiplier: 5,
  bidCount: 100,
  bidDistribution: 'powerlaw',
  traderCount: { random: 5, momentum: 3, arb: 2 },
  tradingDays: 7,
  tgePrice: 0.50,             // $0.50 per LaunchToken at TGE
  rtReserve: 200_000,         // $200k USDC for RT payouts
  seed: 42,
};

// ─── Full Scenario Run ────────────────────────────────────────────────────

export function runScenario(params: ScenarioParams = DEFAULT_PARAMS): SimulationResult {
  // Phase 1: Auction
  const bids = generateBids(params);
  const auction = runAuction(bids, params);

  // Phase 2: ARM Vault
  const armVault = runArmVault(auction);

  // Phase 3: V3 Pool Seeding
  const ptPool = new V3Pool('PT', 3000);
  const rtPool = new V3Pool('RT', 3000);

  const lpAlloc = auction.lpAllocation;
  const halfAlloc = lpAlloc / 2;

  const cpPrice = auction.clearingPrice;
  const rtInitialPrice = cpPrice * 0.1;  // RT starts near zero (pure upside)

  // PT/USDC: price at clearing, range [CP*0.5, CP*4]
  // Seed with USDC only (position is in range, so split between token0 and token1)
  // We simplify: provide half as USDC and compute matching token0
  const ptUsdcAmount = halfAlloc * 0.6;
  const ptTokenAmount = halfAlloc * 0.4 / cpPrice;

  ptPool.seed(
    cpPrice,
    cpPrice * 0.5,
    cpPrice * 4,
    ptUsdcAmount,
    ptTokenAmount,
  );

  // RT/USDC: initial price = CP * 0.1, range [CP*0.05, CP*2]
  const rtUsdcAmount = halfAlloc * 0.95;  // mostly USDC since price is at bottom of range
  const rtTokenAmount = halfAlloc * 0.05 / rtInitialPrice;

  rtPool.seed(
    rtInitialPrice,
    cpPrice * 0.05,
    cpPrice * 2,
    rtUsdcAmount,
    rtTokenAmount,
  );

  // Take initial snapshots
  ptPool.takeSnapshot(-1);
  rtPool.takeSnapshot(-1);

  // Phase 4: Trading Simulation
  const { traders, trades } = runTraders(ptPool, rtPool, {
    traderCount: params.traderCount,
    tradingDays: params.tradingDays,
    clearingPrice: auction.clearingPrice,
    rtCapMultiplier: params.rtCapMultiplier,
    tgePrice: params.tgePrice,
    seed: params.seed ?? 42,
  });

  // Depth charts at final state
  const depthPT = ptPool.getDepth(20);
  const depthRT = rtPool.getDepth(20);

  // Phase 5: Settlement
  const settlement = runSettlement(auction, params);
  const sensitivity = runSensitivity(auction, params);

  // Comparison: run all 4 ICO models against same participant pool
  const comparison = runComparison(auction, params.seed ?? 42);

  return {
    params,
    auction,
    armVault,
    pools: {
      pt: ptPool.snapshots,
      rt: rtPool.snapshots,
      depthPT,
      depthRT,
    },
    trades,
    traders,
    settlement,
    sensitivity,
    comparison,
  };
}

// ─── CLI entrypoint ───────────────────────────────────────────────────────

if (require.main === module) {
  const result = runScenario(DEFAULT_PARAMS);
  console.log(JSON.stringify({
    clearingPrice: result.auction.clearingPrice,
    fillRatio: result.auction.fillRatio,
    usdcRaised: result.auction.usdcRaised,
    lpAllocation: result.auction.lpAllocation,
    ptSnapshots: result.pools.pt.length,
    rtSnapshots: result.pools.rt.length,
    totalTrades: result.trades.length,
    traderCount: result.traders.length,
    settlement: {
      payoutPerRT: result.settlement.payoutPerRT,
      proRataFactor: result.settlement.proRataFactor,
    },
    sensitivityPoints: result.sensitivity.length,
  }, null, 2));
}
