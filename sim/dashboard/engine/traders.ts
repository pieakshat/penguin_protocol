import { TraderType, TradeEvent, TraderState, TraderResult } from './types';
import { V3Pool } from './v3pool';

// ─── RNG ──────────────────────────────────────────────────────────────────

function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ─── Trader Decisions ─────────────────────────────────────────────────────

interface Trade {
  pool: 'PT' | 'RT';
  zeroForOne: boolean;   // true = sell token0 (PT/RT) for USDC, false = buy with USDC
  amountIn: number;
}

function randomTrader(
  state: TraderState,
  ptPrice: number,
  rtPrice: number,
  rng: () => number,
  minTrade: number,
  maxTrade: number,
): Trade | null {
  if (rng() > 0.5) return null;

  const pool = rng() > 0.5 ? 'PT' : 'RT';
  const zeroForOne = rng() > 0.5;  // sell token or buy token
  const amountIn = minTrade + rng() * (maxTrade - minTrade);

  return { pool, zeroForOne, amountIn };
}

function momentumTrader(
  state: TraderState,
  ptPriceHistory: number[],
  rtPriceHistory: number[],
  rng: () => number,
  minTrade: number,
  maxTrade: number,
  lookback: number = 3,
): Trade | null {
  const ptHist = ptPriceHistory;
  const rtHist = rtPriceHistory;

  if (ptHist.length < lookback + 1) return null;

  // Check PT momentum
  const ptRecent = ptHist[ptHist.length - 1];
  const ptPast = ptHist[ptHist.length - 1 - lookback];
  const ptMomentum = (ptRecent - ptPast) / ptPast;

  // Check RT momentum
  const rtRecent = rtHist[rtHist.length - 1];
  const rtPast = rtHist[rtHist.length - 1 - lookback];
  const rtMomentum = (rtRecent - rtPast) / rtPast;

  // Pick pool with stronger momentum signal
  const pool = Math.abs(ptMomentum) >= Math.abs(rtMomentum) ? 'PT' : 'RT';
  const momentum = pool === 'PT' ? ptMomentum : rtMomentum;

  // Dead zone: ignore weak signals
  if (Math.abs(momentum) < 0.005) return null;

  // Buy if positive momentum, sell if negative
  const zeroForOne = momentum < 0;  // sell token if price dropped

  // Size scales with conviction (clamped)
  const conviction = Math.min(Math.abs(momentum) * 10, 1);
  const amountIn = minTrade + conviction * (maxTrade - minTrade);

  // Add noise to avoid perfect synchronization
  if (rng() > 0.7) return null;

  return { pool, zeroForOne, amountIn };
}

function arbTrader(
  state: TraderState,
  ptPrice: number,
  rtPrice: number,
  clearingPrice: number,
  rtCapMultiplier: number,
  tgePrice: number,
  rng: () => number,
  minTrade: number,
  maxTrade: number,
): Trade | null {
  // Theoretical fair values
  const ptFair = clearingPrice;  // PT should trade near clearing price pre-TGE
  // RT theoretical value: expected payout = max(0, min(tgePrice, CP * mult) - CP)
  const effectivePrice = Math.min(tgePrice, clearingPrice * rtCapMultiplier);
  const rtFair = Math.max(0, effectivePrice - clearingPrice) * 0.8; // discount for uncertainty

  const ptSpread = (ptPrice - ptFair) / ptFair;
  const rtSpread = (rtPrice - rtFair) / (rtFair || 0.01);

  // Arb threshold: 2%
  const threshold = 0.02;

  let trade: Trade | null = null;

  if (Math.abs(ptSpread) > Math.abs(rtSpread)) {
    if (Math.abs(ptSpread) > threshold) {
      trade = {
        pool: 'PT',
        zeroForOne: ptSpread > 0,   // price above fair → sell token
        amountIn: minTrade + rng() * (maxTrade - minTrade) * Math.min(Math.abs(ptSpread) * 5, 1),
      };
    }
  } else {
    if (Math.abs(rtSpread) > threshold) {
      trade = {
        pool: 'RT',
        zeroForOne: rtSpread > 0,
        amountIn: minTrade + rng() * (maxTrade - minTrade) * Math.min(Math.abs(rtSpread) * 5, 1),
      };
    }
  }

  return trade;
}

// ─── Main simulation loop ─────────────────────────────────────────────────

export function runTraders(
  ptPool: V3Pool,
  rtPool: V3Pool,
  params: {
    traderCount: { random: number; momentum: number; arb: number };
    tradingDays: number;
    clearingPrice: number;
    rtCapMultiplier: number;
    tgePrice: number;
    seed: number;
  },
): { traders: TraderResult[]; trades: TradeEvent[] } {
  const rng = makeRng(params.seed ?? 99);
  const stepsPerDay = 24;
  const totalSteps = params.tradingDays * stepsPerDay;

  const minTrade = ptPool.price * 10;    // ~10 token0 worth in USDC terms
  const maxTrade = ptPool.price * 500;

  // Initialize trader states
  const states: TraderState[] = [];
  let idCounter = 0;

  const addTraders = (type: TraderType, count: number) => {
    for (let i = 0; i < count; i++) {
      states.push({
        id: idCounter++,
        type,
        usdcBalance: 100_000,
        ptBalance: 10_000,
        rtBalance: 10_000,
        cumulativePnL: [],
        trades: [],
      });
    }
  };

  addTraders('random', params.traderCount.random);
  addTraders('momentum', params.traderCount.momentum);
  addTraders('arb', params.traderCount.arb);

  const ptPriceHistory: number[] = [ptPool.price];
  const rtPriceHistory: number[] = [rtPool.price];
  const allTrades: TradeEvent[] = [];

  // Create per-trader RNGs
  const traderRngs = states.map((_, i) => makeRng((params.seed ?? 99) + i * 1000));

  for (let t = 0; t < totalSteps; t++) {
    const ptPrice = ptPool.price;
    const rtPrice = rtPool.price;

    for (let si = 0; si < states.length; si++) {
      const state = states[si];
      const traderRng = traderRngs[si];

      let decision: Trade | null = null;

      if (state.type === 'random') {
        decision = randomTrader(state, ptPrice, rtPrice, traderRng, minTrade, maxTrade);
      } else if (state.type === 'momentum') {
        decision = momentumTrader(state, ptPriceHistory, rtPriceHistory, traderRng, minTrade, maxTrade);
      } else if (state.type === 'arb') {
        decision = arbTrader(
          state, ptPrice, rtPrice,
          params.clearingPrice, params.rtCapMultiplier, params.tgePrice,
          traderRng, minTrade, maxTrade,
        );
      }

      if (!decision) continue;

      const pool = decision.pool === 'PT' ? ptPool : rtPool;
      const tokenBalance = decision.pool === 'PT' ? state.ptBalance : state.rtBalance;

      // Check balance
      let amountIn = decision.amountIn;
      if (decision.zeroForOne) {
        amountIn = Math.min(amountIn, tokenBalance * 0.1);
      } else {
        amountIn = Math.min(amountIn, state.usdcBalance * 0.1);
      }
      if (amountIn <= 0) continue;

      const priceBefore = pool.price;
      const result = pool.swap(amountIn, decision.zeroForOne);

      if (result.amountOut <= 0) continue;

      // Update trader balances
      let pnlDelta = 0;
      if (decision.zeroForOne) {
        // Sold token0, received USDC
        if (decision.pool === 'PT') {
          state.ptBalance -= result.amountIn;
          state.usdcBalance += result.amountOut;
          pnlDelta = result.amountOut - result.amountIn * priceBefore;
        } else {
          state.rtBalance -= result.amountIn;
          state.usdcBalance += result.amountOut;
          pnlDelta = result.amountOut - result.amountIn * priceBefore;
        }
      } else {
        // Sold USDC, received token0
        if (decision.pool === 'PT') {
          state.usdcBalance -= result.amountIn;
          state.ptBalance += result.amountOut;
          pnlDelta = result.amountOut * pool.price - result.amountIn;
        } else {
          state.usdcBalance -= result.amountIn;
          state.rtBalance += result.amountOut;
          pnlDelta = result.amountOut * pool.price - result.amountIn;
        }
      }

      const event: TradeEvent = {
        t,
        traderId: state.id,
        traderType: state.type,
        pool: decision.pool,
        direction: decision.zeroForOne ? 'sell' : 'buy',
        amountIn: result.amountIn,
        amountOut: result.amountOut,
        price: pool.price,
        fee: result.fee,
        pnlDelta,
      };

      state.trades.push(event);
      allTrades.push(event);
    }

    // Update P&L snapshots for all traders
    for (const state of states) {
      const ptVal = state.ptBalance * ptPool.price;
      const rtVal = state.rtBalance * rtPool.price;
      const totalVal = state.usdcBalance + ptVal + rtVal;
      const initial = 100_000 + 10_000 * params.clearingPrice + 10_000 * rtPool.price;
      state.cumulativePnL.push(totalVal - initial);
    }

    // Track price history
    ptPriceHistory.push(ptPool.price);
    rtPriceHistory.push(rtPool.price);

    // Take pool snapshots
    ptPool.takeSnapshot(t);
    rtPool.takeSnapshot(t);
  }

  // Compile results
  const results: TraderResult[] = states.map(s => ({
    id: s.id,
    type: s.type,
    finalPnL: s.cumulativePnL[s.cumulativePnL.length - 1] ?? 0,
    totalVolume: s.trades.reduce((a, t) => a + t.amountIn, 0),
    tradeCount: s.trades.length,
    cumulativePnL: s.cumulativePnL,
  }));

  return { traders: results, trades: allTrades };
}
