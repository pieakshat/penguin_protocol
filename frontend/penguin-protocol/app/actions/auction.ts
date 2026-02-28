'use server'

import { publicClient, ADDRESSES } from '@/lib/contracts'
import BatchAuctionABI from '@/lib/abi/BatchAuction.json'
import ERC20ABI from '@/lib/abi/ERC20Extended.json'

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

export async function getAllBids(): Promise<BidInfo[]> {
  if (!ADDRESSES.batchAuction) return []
  try {
    const deployBlock = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? '0')
    const logs = await publicClient.getLogs({
      address: ADDRESSES.batchAuction,
      event: {
        type: 'event',
        name: 'BidSubmitted',
        inputs: [
          { name: 'bidId', type: 'uint256', indexed: true },
          { name: 'bidder', type: 'address', indexed: true },
          { name: 'tokenAmount', type: 'uint256', indexed: false },
          { name: 'maxPrice', type: 'uint256', indexed: false },
        ],
      },
      fromBlock: deployBlock,
    })

    if (!logs.length) return []

    const results = await Promise.allSettled(
      logs.map(async (log) => {
        const bidId = log.args.bidId as bigint
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

    return results
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<BidInfo>).value)
  } catch (err) {
    console.error('getAllBids error:', err)
    return []
  }
}

export async function getUserUSDCBalance(userAddress: string): Promise<string> {
  if (!ADDRESSES.usdc || !userAddress) return '0'
  try {
    const balance = await publicClient.readContract({
      address: ADDRESSES.usdc,
      abi: ERC20ABI,
      functionName: 'balanceOf',
      args: [userAddress as `0x${string}`],
    }) as bigint
    return balance.toString()
  } catch {
    return '0'
  }
}
