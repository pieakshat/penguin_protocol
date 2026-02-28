import { ICOAllocation, ICOMetrics, ComparisonResult, TradICOModel, AuctionResult } from './types';

// ─── Participant generation ───────────────────────────────────────────────
// Shared pool of synthetic participants across all models for apples-to-apples comparison.

interface Participant {
  id: number;
  wealth: number;        // USDC they can deploy
  desiredTokens: number; // tokens they want at fair price
  speedRank: number;     // 0–1; bots/whales skew toward 1 (FCFS ordering)
  isRetail: boolean;     // bottom 50% by desired size
}

function seededRng(seed: number) {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s ^= s >>> 16;
    return (s >>> 0) / 0xffffffff;
  };
}

// Box-Muller for normal samples
function normal(rng: () => number, mean = 0, std = 1): number {
  const u1 = Math.max(1e-10, rng());
  const u2 = rng();
  return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function generateParticipants(count: number, totalSupply: number, seed = 42): Participant[] {
  const rng = seededRng(seed + 7777);
  const participants: Participant[] = [];

  for (let i = 0; i < count; i++) {
    // Log-normal wealth: realistic crypto distribution, heavy right tail
    const logWealth = normal(rng, 8, 2);   // mean exp(8)=$2980, std wide
    const wealth = Math.max(50, Math.exp(logWealth));

    // Desired tokens: correlated with wealth (whales want more), with noise
    const desiredFrac = 0.001 + rng() * 0.04;
    const desiredTokens = totalSupply * desiredFrac;

    // Speed rank: correlated with wealth (richer = faster bots) + noise
    const wealthPercentile = 0; // filled below
    const speedRank = Math.min(1, Math.max(0, (logWealth / 14) + normal(rng, 0, 0.1)));

    participants.push({ id: i, wealth, desiredTokens, speedRank, isRetail: false });
  }

  // Mark bottom 50% by desiredTokens as retail
  const median = [...participants].sort((a, b) => a.desiredTokens - b.desiredTokens)[Math.floor(count / 2)].desiredTokens;
  for (const p of participants) p.isRetail = p.desiredTokens <= median;

  return participants;
}

// ─── Metric helpers ───────────────────────────────────────────────────────

function gini(values: number[]): number {
  const sorted = [...values].filter(v => v > 0).sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  if (mean === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (2 * (i + 1) - n - 1) * sorted[i];
  return sum / (n * n * mean);
}

function computeMetrics(
  model: TradICOModel,
  label: string,
  allocations: ICOAllocation[],
  fairPrice: number,
  totalSupply: number,
  participants: Participant[],
): ICOMetrics {
  const winners = allocations.filter(a => a.tokens > 0);
  const totalTokensAllocated = winners.reduce((s, a) => s + a.tokens, 0);
  const totalDeposited = allocations.reduce((s, a) => s + a.usdcSpent + a.usdcRefunded, 0);
  const totalRefunded = allocations.reduce((s, a) => s + a.usdcRefunded, 0);
  const totalRaised = allocations.reduce((s, a) => s + a.usdcSpent, 0);

  // Effective sale price (weighted average price paid)
  const salePrice = totalTokensAllocated > 0 ? totalRaised / totalTokensAllocated : fairPrice;

  // Gini on token distribution (all participants, zeros included for losers)
  const allTokens = participants.map(p => {
    const alloc = allocations.find(a => a.participantId === p.id);
    return alloc?.tokens ?? 0;
  });
  const g = gini(allTokens);

  // Whale capture: top 10% of winner count's share of total
  const sortedWinnerTokens = winners.map(a => a.tokens).sort((a, b) => b - a);
  const top10Count = Math.max(1, Math.floor(winners.length * 0.1));
  const whaleCapture = totalTokensAllocated > 0
    ? sortedWinnerTokens.slice(0, top10Count).reduce((s, t) => s + t, 0) / totalTokensAllocated
    : 0;

  // Retail fill rate: % of retail participants who got any tokens
  const retailParticipants = participants.filter(p => p.isRetail);
  const retailWinners = retailParticipants.filter(p =>
    allocations.find(a => a.participantId === p.id && a.tokens > 0)
  );
  const retailFillRate = retailParticipants.length > 0 ? retailWinners.length / retailParticipants.length : 0;

  // Refund rate: fraction of deposited capital returned
  const refundRate = totalDeposited > 0 ? totalRefunded / totalDeposited : 0;

  // Day-1 dump risk: fraction of supply with immediate sell incentive
  // Winners dump if they can flip for profit (bought at discount vs fair price)
  // Also: FCFS/whitelist winners with underpriced tokens nearly all dump
  const dumpAlloc = winners.filter(a => {
    const discount = (fairPrice - a.pricePaid) / fairPrice;
    return discount > 0.05; // >5% discount = dump incentive
  });
  const day1DumpRisk = totalTokensAllocated > 0
    ? dumpAlloc.reduce((s, a) => s + a.tokens, 0) / totalTokensAllocated
    : 0;

  // Bot advantage: ratio of (top-10% whale fill rate) to (retail fill rate)
  // 1.0 = equal access; higher = whales captured disproportionately more
  const whaleParticipants = participants.filter(p => !p.isRetail);
  const whaleWinners = whaleParticipants.filter(p =>
    allocations.find(a => a.participantId === p.id && a.tokens > 0)
  );
  const whaleFillRate = whaleParticipants.length > 0 ? whaleWinners.length / whaleParticipants.length : 0;
  const botAdvantage = retailFillRate > 0 ? whaleFillRate / retailFillRate : whaleFillRate > 0 ? 5 : 1;

  // Price discovery score: 0–100 (100 = sale price exactly equals fair price)
  const priceDiscoveryScore = Math.max(0, 100 - (Math.abs(salePrice - fairPrice) / fairPrice) * 100);

  // ── Radar dimensions (0–100, higher = better) ──────────────────────────

  // Distribution fairness: inverted gini
  const distributionFairness = Math.max(0, (1 - g) * 100);

  // Capital efficiency: how close protocol raised to fair value * supply
  const targetRaise = fairPrice * totalSupply;
  const capitalEfficiency = Math.min(100, Math.max(0, (totalRaised / targetRaise) * 100));

  // Dump resistance: lower dump risk = better
  const dumpResistance = Math.max(0, (1 - day1DumpRisk) * 100);

  // Bot resistance: derived from model mechanics, partially overridden per model
  const botResistanceRaw = Math.max(0, Math.min(100, (1 - Math.min(1, (botAdvantage - 1) / 4)) * 100));

  return {
    model,
    label,
    salePrice,
    totalRaised,
    giniCoefficient: g,
    whaleCapture,
    retailFillRate,
    refundRate,
    day1DumpRisk,
    botAdvantage,
    priceDiscovery: priceDiscoveryScore,
    radar: {
      priceDiscovery: priceDiscoveryScore,
      distributionFairness,
      retailAccess: Math.round(retailFillRate * 100),
      capitalEfficiency: Math.round(capitalEfficiency),
      dumpResistance: Math.round(dumpResistance),
      botResistance: Math.round(botResistanceRaw),
    },
  };
}

// ─── Model 1: FCFS (Fixed Price, First-Come-First-Served) ─────────────────
// Team sets price at a discount. Fastest wallets (bots/whales) fill first.
// No price discovery. Gas wars. Retail nearly locked out.

export function runFCFS(
  participants: Participant[],
  fairPrice: number,
  totalSupply: number,
  seed = 42,
): ICOAllocation[] {
  const rng = seededRng(seed + 1111);

  // Team underprices by 30% to guarantee sellout
  const fcfsPrice = fairPrice * 0.70;

  // Sort by speed rank descending (fastest = bots/whales first)
  // Add small noise so it's not perfectly deterministic
  const ordered = [...participants]
    .map(p => ({ ...p, speed: p.speedRank + normal(rng, 0, 0.05) }))
    .sort((a, b) => b.speed - a.speed);

  const allocations: ICOAllocation[] = [];
  let supplyLeft = totalSupply;

  for (const p of ordered) {
    if (supplyLeft <= 0) {
      allocations.push({ participantId: p.id, tokens: 0, pricePaid: 0, usdcSpent: 0, usdcRefunded: 0, isRetail: p.isRetail });
      continue;
    }
    const maxAffordable = p.wealth / fcfsPrice;
    const wanted = Math.min(p.desiredTokens, maxAffordable, supplyLeft);
    const tokens = Math.max(0, wanted);
    const cost = tokens * fcfsPrice;
    supplyLeft -= tokens;
    allocations.push({ participantId: p.id, tokens, pricePaid: fcfsPrice, usdcSpent: cost, usdcRefunded: 0, isRetail: p.isRetail });
  }

  return allocations;
}

// ─── Model 2: Whitelist FCFS ──────────────────────────────────────────────
// Random whitelist selection. Equal max allocation per slot. Fixed price.
// Fair lottery access but still no price discovery. Equal distribution among winners.

export function runWhitelistFCFS(
  participants: Participant[],
  fairPrice: number,
  totalSupply: number,
  seed = 42,
): ICOAllocation[] {
  const rng = seededRng(seed + 2222);

  const whitelistPrice = fairPrice * 0.80;  // 20% discount
  const whitelistSize = Math.floor(participants.length * 0.4); // 40% get whitelisted
  const allocationPerSlot = totalSupply / whitelistSize;

  // Random shuffle for whitelist selection (no wealth advantage)
  const shuffled = [...participants].sort(() => rng() - 0.5);
  const whitelisted = new Set(shuffled.slice(0, whitelistSize).map(p => p.id));

  return participants.map(p => {
    if (!whitelisted.has(p.id)) {
      return { participantId: p.id, tokens: 0, pricePaid: 0, usdcSpent: 0, usdcRefunded: 0, isRetail: p.isRetail };
    }
    const maxAffordable = p.wealth / whitelistPrice;
    const tokens = Math.min(allocationPerSlot, maxAffordable);
    const cost = tokens * whitelistPrice;
    return { participantId: p.id, tokens, pricePaid: whitelistPrice, usdcSpent: cost, usdcRefunded: 0, isRetail: p.isRetail };
  });
}

// ─── Model 3: Dutch Auction ───────────────────────────────────────────────
// Price starts high, drops linearly over time. Rational bidders wait.
// Strategic equilibrium: everyone rushes near the bottom simultaneously.
// Partial price discovery but susceptible to the timing game.

export function runDutchAuction(
  participants: Participant[],
  fairPrice: number,
  totalSupply: number,
  seed = 42,
): ICOAllocation[] {
  const rng = seededRng(seed + 3333);

  const startPrice = fairPrice * 3.0;
  const endPrice   = fairPrice * 0.30;
  const steps = 100; // price steps

  // Each participant has a "target price" they'll bid at
  // Rational: they want to pay as little as possible but fear missing out
  // Empirically Dutch auctions clear ~10-20% below "true" fair due to timing game
  const targets = participants.map(p => {
    // Retail waits longer (less capital at risk), whales bid earlier (more to lose)
    const fearOfMissingOut = p.isRetail ? 0.8 : 1.1;  // whales bid ~10% above fair, retail waits
    const noise = normal(rng, 0, 0.15);
    const targetMultiple = Math.max(0.35, Math.min(2.5, fearOfMissingOut + noise));
    return { ...p, targetPrice: fairPrice * targetMultiple };
  });

  let supplyLeft = totalSupply;
  const filled = new Map<number, { tokens: number; price: number }>();

  // Simulate price dropping step by step
  for (let step = 0; step < steps && supplyLeft > 0; step++) {
    const currentPrice = startPrice - (startPrice - endPrice) * (step / steps);

    // All participants whose target >= currentPrice bid now (if not already filled)
    const biddingNow = targets.filter(
      p => p.targetPrice >= currentPrice && !filled.has(p.id)
    );

    for (const p of biddingNow) {
      if (supplyLeft <= 0) break;
      const maxAffordable = p.wealth / currentPrice;
      const tokens = Math.min(p.desiredTokens, maxAffordable, supplyLeft);
      if (tokens > 0) {
        filled.set(p.id, { tokens, price: currentPrice });
        supplyLeft -= tokens;
      }
    }
  }

  return participants.map(p => {
    const f = filled.get(p.id);
    if (!f) return { participantId: p.id, tokens: 0, pricePaid: 0, usdcSpent: 0, usdcRefunded: 0, isRetail: p.isRetail };
    return {
      participantId: p.id,
      tokens: f.tokens,
      pricePaid: f.price,
      usdcSpent: f.tokens * f.price,
      usdcRefunded: 0,
      isRetail: p.isRetail,
    };
  });
}

// ─── Penguin adapter ──────────────────────────────────────────────────────
// Convert Penguin auction result into the common ICOAllocation format.

export function penguinToAllocations(
  auction: AuctionResult,
  participants: Participant[],
  seed = 42,
): ICOAllocation[] {
  const rng = seededRng(seed + 4444);

  // Map bid results to participants (approximate: shuffle bids onto participants)
  const winners = auction.bids.filter(b => b.isWinner && b.filled > 0);
  const shuffledParticipants = [...participants].sort(() => rng() - 0.5);

  return shuffledParticipants.map((p, i) => {
    const bid = winners[i % winners.length];
    if (!bid || i >= winners.length) {
      return { participantId: p.id, tokens: 0, pricePaid: 0, usdcSpent: 0, usdcRefunded: 0, isRetail: p.isRetail };
    }
    const deposit = bid.qty * bid.price;
    const cost = bid.filled * auction.clearingPrice;
    return {
      participantId: p.id,
      tokens: bid.filled,
      pricePaid: auction.clearingPrice,
      usdcSpent: cost,
      usdcRefunded: deposit - cost,
      isRetail: p.isRetail,
    };
  });
}

// ─── Full comparison runner ───────────────────────────────────────────────

export function runComparison(auction: AuctionResult, seed = 42): ComparisonResult {
  const fairPrice = auction.clearingPrice;
  const totalSupply = auction.totalFilled;
  const count = Math.max(auction.bids.length, 80);

  const participants = generateParticipants(count, totalSupply, seed);

  const fcfsAlloc      = runFCFS(participants, fairPrice, totalSupply, seed);
  const wlAlloc        = runWhitelistFCFS(participants, fairPrice, totalSupply, seed);
  const dutchAlloc     = runDutchAuction(participants, fairPrice, totalSupply, seed);
  const penguinAlloc   = penguinToAllocations(auction, participants, seed);

  const models: ICOMetrics[] = [
    computeMetrics('penguin',   'Penguin Protocol',      penguinAlloc, fairPrice, totalSupply, participants),
    computeMetrics('fcfs',      'FCFS (Fixed Price)',     fcfsAlloc,    fairPrice, totalSupply, participants),
    computeMetrics('whitelist', 'Whitelist Sale',         wlAlloc,      fairPrice, totalSupply, participants),
    computeMetrics('dutch',     'Dutch Auction',          dutchAlloc,   fairPrice, totalSupply, participants),
  ];

  return { fairPrice, models };
}
