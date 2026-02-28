import { AuctionResult, SettlementResult, BidderSettlement, SensitivityPoint, ScenarioParams } from './types';

// ─── Settlement Math ──────────────────────────────────────────────────────

function computeSettlement(
  clearingPrice: number,
  rtCapMultiplier: number,
  tgePrice: number,
  rtSupply: number,
  rtReserve: number,
  auction: AuctionResult,
): SettlementResult {
  const effectivePrice = Math.min(tgePrice, clearingPrice * rtCapMultiplier);
  const payoutPerRT = Math.max(0, effectivePrice - clearingPrice);

  const totalRtPayout = rtSupply * payoutPerRT;
  const proRataFactor = totalRtPayout > rtReserve && totalRtPayout > 0
    ? rtReserve / totalRtPayout
    : 1.0;

  const rtReserveUsed = Math.min(totalRtPayout, rtReserve);

  // Per-bidder settlement
  const bidderSettlements: BidderSettlement[] = [];

  for (const bid of auction.bids) {
    if (!bid.isWinner || bid.filled <= 0) continue;

    const auctionCost = bid.filled * clearingPrice;
    const ptValue = bid.filled * tgePrice;                          // PT → LaunchToken at TGE price
    const rtPayout = bid.filled * payoutPerRT * proRataFactor;      // RT payout in USDC
    const netPnL = ptValue + rtPayout - auctionCost;

    bidderSettlements.push({
      bidderId: bid.id,
      auctionCost,
      tokensFilled: bid.filled,
      ptValue,
      rtPayout,
      netPnL,
    });
  }

  return {
    tgePrice,
    clearingPrice,
    rtCapMultiplier,
    effectivePrice,
    payoutPerRT,
    totalRtPayout,
    rtReserveUsed,
    proRataFactor,
    ptRedemptionRate: 1.0,
    bidderSettlements,
  };
}

export function runSettlement(
  auction: AuctionResult,
  params: ScenarioParams,
): SettlementResult {
  return computeSettlement(
    auction.clearingPrice,
    params.rtCapMultiplier,
    params.tgePrice,
    auction.totalFilled,
    params.rtReserve,
    auction,
  );
}

// ─── Sensitivity Sweep ────────────────────────────────────────────────────

export function runSensitivity(
  auction: AuctionResult,
  params: ScenarioParams,
): SensitivityPoint[] {
  const multiples = [0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0, 7.0, 10.0];
  const cp = auction.clearingPrice;

  return multiples.map(mult => {
    const tgePrice = cp * mult;
    const result = computeSettlement(
      cp,
      params.rtCapMultiplier,
      tgePrice,
      auction.totalFilled,
      params.rtReserve,
      auction,
    );

    const avgPnL = result.bidderSettlements.length > 0
      ? result.bidderSettlements.reduce((a, b) => a + b.netPnL, 0) / result.bidderSettlements.length
      : 0;

    return {
      tgePrice,
      payoutPerRT: result.payoutPerRT,
      avgBidderPnL: avgPnL,
    };
  });
}
