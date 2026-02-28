import {
  PoolSnapshot,
  LiquidityPosition,
  TickBucket,
} from './types';
import {
  priceToTick,
  tickToPrice,
  liquidityFromAmounts,
  swapStep,
  priceToSqrtPriceX96,
  sqrtPriceX96ToPrice,
} from './v3math';

// ─── V3 Pool State Machine ────────────────────────────────────────────────

export interface SwapResult {
  amountIn: number;
  amountOut: number;
  fee: number;
  priceAfter: number;
  tickAfter: number;
}

export class V3Pool {
  name: 'PT' | 'RT';
  feePips: number;          // e.g. 3000 = 0.3%
  tickSpacing: number;

  sqrtPrice: number;        // sqrt(price) as float
  tick: number;             // current tick
  liquidity: number;        // active liquidity

  positions: LiquidityPosition[];
  ticks: Map<number, number>; // tick → net liquidity delta

  // Per-step accumulators (reset each step)
  stepVolume0: number = 0;
  stepVolume1: number = 0;
  stepFee0: number = 0;
  stepFee1: number = 0;

  snapshots: PoolSnapshot[] = [];
  currentStep: number = 0;

  constructor(name: 'PT' | 'RT', feePips: number = 3000) {
    this.name = name;
    this.feePips = feePips;
    this.tickSpacing = 60; // standard for 0.3% pools
    this.sqrtPrice = 0;
    this.tick = 0;
    this.liquidity = 0;
    this.positions = [];
    this.ticks = new Map();
  }

  get price(): number {
    return this.sqrtPrice * this.sqrtPrice;
  }

  // ─── Seed the pool ──────────────────────────────────────────────────────

  seed(
    initialPrice: number,
    priceLower: number,
    priceUpper: number,
    usdc: number,       // token1 (USDC) amount to deploy
    token0: number,     // token0 (PT/RT) amount to deploy
  ) {
    this.sqrtPrice = Math.sqrt(initialPrice);
    this.tick = priceToTick(initialPrice);

    // Align ticks to tick spacing
    const tickLower = Math.floor(priceToTick(priceLower) / this.tickSpacing) * this.tickSpacing;
    const tickUpper = Math.ceil(priceToTick(priceUpper) / this.tickSpacing) * this.tickSpacing;

    const L = liquidityFromAmounts(initialPrice, priceLower, priceUpper, token0, usdc);

    this.liquidity = L;
    this.positions.push({
      tickLower,
      tickUpper,
      liquidity: L,
      feeGrowthInside0: 0,
      feeGrowthInside1: 0,
    });

    // Register ticks
    this.ticks.set(tickLower, (this.ticks.get(tickLower) ?? 0) + L);
    this.ticks.set(tickUpper, (this.ticks.get(tickUpper) ?? 0) - L);
  }

  // ─── Swap ───────────────────────────────────────────────────────────────

  swap(
    amountIn: number,
    zeroForOne: boolean,  // true = sell token0, false = sell token1
  ): SwapResult {
    if (amountIn <= 0 || this.liquidity <= 0) {
      return { amountIn: 0, amountOut: 0, fee: 0, priceAfter: this.price, tickAfter: this.tick };
    }

    let remaining = amountIn;
    let totalOut = 0;
    let totalFee = 0;
    let iterations = 0;
    const MAX_ITERATIONS = 50;

    while (remaining > 1e-12 && iterations < MAX_ITERATIONS) {
      iterations++;
      // Find next tick boundary
      const sqrtPriceTarget = this.nextTickSqrtPrice(zeroForOne);

      const step = swapStep(
        this.sqrtPrice,
        sqrtPriceTarget,
        this.liquidity,
        remaining,
        this.feePips,
      );

      remaining -= step.amountIn;
      totalOut += step.amountOut;
      totalFee += step.feeAmount;

      this.sqrtPrice = step.sqrtPriceAfter;
      this.tick = priceToTick(this.price);

      // If we reached the tick boundary, cross it
      if (Math.abs(step.sqrtPriceAfter - sqrtPriceTarget) < 1e-15) {
        this.crossTick(zeroForOne);
      } else {
        break; // swap completed within current tick range
      }
    }

    const netAmountIn = amountIn - remaining;

    // Accumulate step stats
    if (zeroForOne) {
      this.stepVolume0 += netAmountIn;
      this.stepVolume1 += totalOut;
      this.stepFee0 += totalFee;
    } else {
      this.stepVolume1 += netAmountIn;
      this.stepVolume0 += totalOut;
      this.stepFee1 += totalFee;
    }

    return {
      amountIn: netAmountIn,
      amountOut: totalOut,
      fee: totalFee,
      priceAfter: this.price,
      tickAfter: this.tick,
    };
  }

  // ─── Internal tick helpers ──────────────────────────────────────────────

  private nextTickSqrtPrice(zeroForOne: boolean): number {
    const position = this.positions[0];
    if (!position) return this.sqrtPrice;

    if (zeroForOne) {
      // Price drops: next boundary is tickLower
      const tickTarget = position.tickLower;
      return Math.sqrt(tickToPrice(tickTarget));
    } else {
      // Price rises: next boundary is tickUpper
      const tickTarget = position.tickUpper;
      return Math.sqrt(tickToPrice(tickTarget));
    }
  }

  private crossTick(zeroForOne: boolean) {
    const position = this.positions[0];
    if (!position) return;

    if (zeroForOne) {
      // Crossed below tickLower → liquidity exits
      this.liquidity = Math.max(0, this.liquidity - position.liquidity);
    } else {
      // Crossed above tickUpper → liquidity exits
      this.liquidity = Math.max(0, this.liquidity - position.liquidity);
    }
  }

  // ─── Snapshot ───────────────────────────────────────────────────────────

  takeSnapshot(t: number) {
    this.snapshots.push({
      t,
      price: this.price,
      sqrtPriceX96: priceToSqrtPriceX96(this.price),
      tick: this.tick,
      volume0: this.stepVolume0,
      volume1: this.stepVolume1,
      fee0: this.stepFee0,
      fee1: this.stepFee1,
      liquidity: this.liquidity,
    });
    // Reset step accumulators
    this.stepVolume0 = 0;
    this.stepVolume1 = 0;
    this.stepFee0 = 0;
    this.stepFee1 = 0;
  }

  // ─── Depth chart ────────────────────────────────────────────────────────

  getDepth(buckets: number = 20): TickBucket[] {
    const position = this.positions[0];
    if (!position) return [];

    const currentTick = this.tick;
    const halfRange = Math.floor(buckets / 2);
    const result: TickBucket[] = [];

    for (let i = -halfRange; i <= halfRange; i++) {
      const tick = Math.round((currentTick + i * this.tickSpacing) / this.tickSpacing) * this.tickSpacing;
      const inRange =
        tick >= position.tickLower && tick < position.tickUpper;
      result.push({
        tickLower: tick,
        tickUpper: tick + this.tickSpacing,
        price: tickToPrice(tick),
        liquidity: inRange ? position.liquidity : 0,
      });
    }
    return result;
  }
}
