import { AuctionResult, ArmVaultResult } from './types';

// Phase 2: ARM Vault — NFT deposit → PT + RT 1:1
// For each winning bidder who received an AllocationNFT, they can deposit it
// to receive PT and RT equal to their filled token allocation.
export function runArmVault(auction: AuctionResult): ArmVaultResult {
  const allocations: ArmVaultResult['allocations'] = [];
  let totalPT = 0;
  let totalRT = 0;

  for (const bid of auction.bids) {
    if (!bid.isWinner || bid.filled <= 0) continue;

    const ptMinted = bid.filled;
    const rtMinted = bid.filled;

    allocations.push({
      bidderId: bid.id,
      nftId: bid.nftId,
      ptMinted,
      rtMinted,
    });

    totalPT += ptMinted;
    totalRT += rtMinted;
  }

  return { allocations, totalPT, totalRT };
}
