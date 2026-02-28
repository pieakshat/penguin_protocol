// ─── Uniswap V3 Math Primitives ───────────────────────────────────────────
// Pool convention: token0 = project token (PT or RT), token1 = USDC
// price = token1 per token0 (USDC per PT/RT)

export const Q96 = BigInt(2) ** BigInt(96);
export const Q192 = BigInt(2) ** BigInt(192);

// ─── sqrtPrice conversions ────────────────────────────────────────────────

export function priceToSqrtPriceX96(price: number): bigint {
  // sqrtPriceX96 = sqrt(price) * 2^96
  const sqrtP = Math.sqrt(price);
  return BigInt(Math.floor(sqrtP * Number(Q96)));
}

export function sqrtPriceX96ToPrice(sqrtPriceX96: bigint): number {
  const sqrtP = Number(sqrtPriceX96) / Number(Q96);
  return sqrtP * sqrtP;
}

// ─── Tick conversions ─────────────────────────────────────────────────────

const LOG_SQRT_1_0001 = Math.log(Math.sqrt(1.0001));

export function priceToTick(price: number): number {
  return Math.floor(Math.log(price) / Math.log(1.0001));
}

export function tickToPrice(tick: number): number {
  return Math.pow(1.0001, tick);
}

export function tickToSqrtPriceX96(tick: number): bigint {
  return priceToSqrtPriceX96(tickToPrice(tick));
}

// ─── Liquidity from amounts ───────────────────────────────────────────────

// Given a position [tickLower, tickUpper] and current price, compute L from amounts.
// We use float-precision sqrt prices for analytical sim accuracy.
export function liquidityFromAmounts(
  price: number,      // current price
  priceLower: number, // price at tickLower
  priceUpper: number, // price at tickUpper
  amount0: number,    // token0 available
  amount1: number,    // token1 available
): number {
  const sqrtP = Math.sqrt(price);
  const sqrtPL = Math.sqrt(priceLower);
  const sqrtPU = Math.sqrt(priceUpper);

  if (price <= priceLower) {
    // token0-only range
    return amount0 * (sqrtPL * sqrtPU) / (sqrtPU - sqrtPL);
  } else if (price >= priceUpper) {
    // token1-only range
    return amount1 / (sqrtPU - sqrtPL);
  } else {
    // mixed range — take the binding constraint
    const L0 = amount0 * (sqrtP * sqrtPU) / (sqrtPU - sqrtP);
    const L1 = amount1 / (sqrtP - sqrtPL);
    return Math.min(L0, L1);
  }
}

// ─── Amounts from liquidity ───────────────────────────────────────────────

export function amount0FromLiquidity(
  L: number,
  price: number,
  priceUpper: number,
): number {
  const sqrtP = Math.sqrt(Math.min(price, priceUpper));
  const sqrtPU = Math.sqrt(priceUpper);
  return L * (sqrtPU - sqrtP) / (sqrtP * sqrtPU);
}

export function amount1FromLiquidity(
  L: number,
  price: number,
  priceLower: number,
): number {
  const sqrtP = Math.sqrt(Math.max(price, priceLower));
  const sqrtPL = Math.sqrt(priceLower);
  return L * (sqrtP - sqrtPL);
}

// ─── Swap step math ───────────────────────────────────────────────────────

export interface SwapStepResult {
  sqrtPriceAfter: number;   // float sqrt price (not X96)
  amountIn: number;
  amountOut: number;
  feeAmount: number;
}

// exactIn swap within a single liquidity tier (no tick crossing)
// zeroForOne = true: selling token0 to get token1 (price goes down)
// zeroForOne = false: selling token1 to get token0 (price goes up)
export function swapStep(
  sqrtPriceCurrent: number,  // sqrt(price) as float
  sqrtPriceTarget: number,   // sqrt(price) boundary (tick boundary or limit)
  liquidity: number,
  amountRemaining: number,   // positive = exact-in
  feePips: number,           // e.g. 3000 = 0.3%
): SwapStepResult {
  const feeRate = feePips / 1_000_000;
  const amountInAfterFee = amountRemaining * (1 - feeRate);

  let sqrtPriceAfter: number;
  let amountIn: number;
  let amountOut: number;

  const zeroForOne = sqrtPriceCurrent >= sqrtPriceTarget;

  if (zeroForOne) {
    // Selling token0: price drops
    // sqrtPriceAfter = L * sqrtP / (L + amountIn * sqrtP)
    // First check if amountIn is enough to reach target
    const maxAmountIn = liquidity * (sqrtPriceCurrent - sqrtPriceTarget) / (sqrtPriceCurrent * sqrtPriceTarget);

    if (amountInAfterFee >= maxAmountIn) {
      sqrtPriceAfter = sqrtPriceTarget;
      amountIn = maxAmountIn;
    } else {
      sqrtPriceAfter = liquidity * sqrtPriceCurrent / (liquidity + amountInAfterFee * sqrtPriceCurrent);
      amountIn = amountInAfterFee;
    }
    amountOut = liquidity * (sqrtPriceCurrent - sqrtPriceAfter);

  } else {
    // Selling token1: price rises
    // sqrtPriceAfter = sqrtP + amountIn / L
    const maxAmountIn = liquidity * (sqrtPriceTarget - sqrtPriceCurrent);

    if (amountInAfterFee >= maxAmountIn) {
      sqrtPriceAfter = sqrtPriceTarget;
      amountIn = maxAmountIn;
    } else {
      sqrtPriceAfter = sqrtPriceCurrent + amountInAfterFee / liquidity;
      amountIn = amountInAfterFee;
    }
    amountOut = liquidity * (sqrtPriceAfter - sqrtPriceCurrent) / (sqrtPriceCurrent * sqrtPriceAfter);
  }

  const feeAmount = amountIn * feeRate / (1 - feeRate);

  return {
    sqrtPriceAfter,
    amountIn: amountIn + feeAmount,  // gross in (with fee)
    amountOut: Math.max(0, amountOut),
    feeAmount,
  };
}
