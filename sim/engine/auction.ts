import { Bid, BidResult, AuctionResult, ScenarioParams } from './types';

// ─── Bid Generation ───────────────────────────────────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export function generateBids(params: ScenarioParams): Bid[] {
  const rng = seededRandom(params.seed ?? 42);
  const bids: Bid[] = [];
  const minP = params.minPrice;
  const maxP = params.minPrice * 10;

  for (let i = 0; i < params.bidCount; i++) {
    let price: number;

    if (params.bidDistribution === 'uniform') {
      price = minP + rng() * (maxP - minP);
    } else if (params.bidDistribution === 'powerlaw') {
      // Power-law: most bids cluster near minPrice, a few at high prices
      // Use inverse CDF: price = minP * (1 - u)^(-1/alpha) bounded to maxP
      const alpha = 1.5;
      const u = rng();
      price = minP * Math.pow(1 - u * 0.9, -1 / alpha);
      price = Math.min(price, maxP);
    } else {
      // random: log-uniform between minP and maxP
      price = Math.exp(Math.log(minP) + rng() * (Math.log(maxP) - Math.log(minP)));
    }

    // qty: each bidder wants 0.1% to 5% of supply
    const qtyFrac = 0.001 + rng() * 0.049;
    const qty = params.totalSupply * qtyFrac;

    bids.push({ id: i, qty, price });
  }
  return bids;
}

// ─── CCA Clearing ─────────────────────────────────────────────────────────

export function runAuction(bids: Bid[], params: ScenarioParams): AuctionResult {
  const { totalSupply, minPrice } = params;

  // 1. Filter bids below minPrice
  const eligible = bids.filter(b => b.price >= minPrice);

  // 2. Sort descending by price
  const sorted = [...eligible].sort((a, b) => b.price - a.price);

  // 3. Walk bids to find clearing price
  let cumulative = 0;
  let clearingPrice = minPrice;
  let clearingIndex = -1;

  for (let i = 0; i < sorted.length; i++) {
    cumulative += sorted[i].qty;
    if (cumulative >= totalSupply) {
      clearingPrice = sorted[i].price;
      clearingIndex = i;
      break;
    }
  }

  // If total demand < supply, fill at minPrice with no pro-rata
  if (clearingIndex === -1) {
    clearingPrice = minPrice;
    clearingIndex = sorted.length - 1;
  }

  // 4. Compute fill ratio at clearing price
  // Cumulative qty up to (and including) the clearing price tier
  let cumulativeAtCP = 0;
  for (let i = 0; i <= clearingIndex; i++) {
    cumulativeAtCP += sorted[i].qty;
  }

  const fillRatio = Math.min(1, totalSupply / cumulativeAtCP);

  // 5. Build BidResult for every original bid
  let totalFilled = 0;
  let nftCounter = 1;
  const resultMap = new Map<number, BidResult>();

  for (const bid of bids) {
    if (bid.price < minPrice) {
      resultMap.set(bid.id, {
        ...bid,
        filled: 0,
        refund: bid.qty * bid.price,
        nftId: 0,
        isWinner: false,
      });
      continue;
    }

    if (bid.price > clearingPrice) {
      // Full winner
      const filled = bid.qty * fillRatio;
      // Refund: (bid.price - clearingPrice) * qty + clearingPrice * (qty - filled)
      const refund = (bid.price - clearingPrice) * bid.qty + clearingPrice * (bid.qty - filled);
      totalFilled += filled;
      resultMap.set(bid.id, {
        ...bid,
        filled,
        refund,
        nftId: nftCounter++,
        isWinner: true,
      });
    } else if (bid.price === clearingPrice) {
      // Partial fill at clearing price
      const filled = bid.qty * fillRatio;
      const refund = clearingPrice * (bid.qty - filled);
      totalFilled += filled;
      resultMap.set(bid.id, {
        ...bid,
        filled,
        refund,
        nftId: filled > 0 ? nftCounter++ : 0,
        isWinner: filled > 0,
      });
    } else {
      // Loser
      resultMap.set(bid.id, {
        ...bid,
        filled: 0,
        refund: bid.qty * bid.price,
        nftId: 0,
        isWinner: false,
      });
    }
  }

  const bidResults = bids.map(b => resultMap.get(b.id)!);
  const usdcRaised = totalFilled * clearingPrice;

  return {
    clearingPrice,
    fillRatio,
    usdcRaised,
    lpAllocation: usdcRaised * 0.10,
    bids: bidResults,
    totalFilled,
  };
}
