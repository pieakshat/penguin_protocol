'use server'

import { publicClient, ADDRESSES } from '@/lib/contracts'
import BatchAuctionABI from '@/lib/abi/BatchAuction.json'

export interface AuctionState {
  clearingPrice: string
  totalSubscribed: string
  totalTokenSupply: string
  auctionStart: number
  auctionEnd: number
  unlockTime: number
  minimumPrice: string
  finalized: boolean
  fillRatio: string
}

export interface BidInfo {
  bidId: number
  bidder: string
  tokenAmount: string
  maxPrice: string
  settled: boolean
}

export async function getAuctionState(): Promise<AuctionState | null> {
  if (!ADDRESSES.batchAuction) return null
  try {
    const [
      clearingPrice,
      totalSubscribed,
      totalTokenSupply,
      auctionStart,
      auctionEnd,
      unlockTime,
      minimumPrice,
      finalized,
      fillRatio,
    ] = await Promise.all([
      publicClient.readContract({ address: ADDRESSES.batchAuction, abi: BatchAuctionABI, functionName: 'clearingPrice' }),
      publicClient.readContract({ address: ADDRESSES.batchAuction, abi: BatchAuctionABI, functionName: 'totalSubscribed' }),
      publicClient.readContract({ address: ADDRESSES.batchAuction, abi: BatchAuctionABI, functionName: 'totalTokenSupply' }),
      publicClient.readContract({ address: ADDRESSES.batchAuction, abi: BatchAuctionABI, functionName: 'auctionStart' }),
      publicClient.readContract({ address: ADDRESSES.batchAuction, abi: BatchAuctionABI, functionName: 'auctionEnd' }),
      publicClient.readContract({ address: ADDRESSES.batchAuction, abi: BatchAuctionABI, functionName: 'unlockTime' }),
      publicClient.readContract({ address: ADDRESSES.batchAuction, abi: BatchAuctionABI, functionName: 'minimumPrice' }),
      publicClient.readContract({ address: ADDRESSES.batchAuction, abi: BatchAuctionABI, functionName: 'finalized' }),
      publicClient.readContract({ address: ADDRESSES.batchAuction, abi: BatchAuctionABI, functionName: 'fillRatio' }),
    ])

    return {
      clearingPrice: (clearingPrice as bigint).toString(),
      totalSubscribed: (totalSubscribed as bigint).toString(),
      totalTokenSupply: (totalTokenSupply as bigint).toString(),
      auctionStart: Number(auctionStart as bigint),
      auctionEnd: Number(auctionEnd as bigint),
      unlockTime: Number(unlockTime as bigint),
      minimumPrice: (minimumPrice as bigint).toString(),
      finalized: finalized as boolean,
      fillRatio: (fillRatio as bigint).toString(),
    }
  } catch (err) {
    console.error('getAuctionState error:', err)
    return null
  }
}

export async function getUserBids(userAddress: string): Promise<BidInfo[]> {
  if (!ADDRESSES.batchAuction || !userAddress) return []
  try {
    const bidIds = await publicClient.readContract({
      address: ADDRESSES.batchAuction,
      abi: BatchAuctionABI,
      functionName: 'getUserBidIds',
      args: [userAddress as `0x${string}`],
    }) as bigint[]

    if (!bidIds.length) return []

    const bids = await Promise.all(
      bidIds.map(async (bidId) => {
        const bid = await publicClient.readContract({
          address: ADDRESSES.batchAuction,
          abi: BatchAuctionABI,
          functionName: 'getBid',
          args: [bidId],
        }) as { bidder: string; tokenAmount: bigint; maxPrice: bigint; settled: boolean }

        return {
          bidId: Number(bidId),
          bidder: bid.bidder,
          tokenAmount: bid.tokenAmount.toString(),
          maxPrice: bid.maxPrice.toString(),
          settled: bid.settled,
        }
      })
    )

    return bids
  } catch (err) {
    console.error('getUserBids error:', err)
    return []
  }
}
