'use server'

import { publicClient, ADDRESSES } from '@/lib/contracts'
import SettlementABI from '@/lib/abi/Settlement.json'
import AllocationNFTABI from '@/lib/abi/AllocationNFT.json'
import ERC20ABI from '@/lib/abi/ERC20Extended.json'
import { formatUnits } from 'viem'

export interface SettlementState {
  tgePrice: string
  tgePriceSet: boolean
  payoutPerRT: string
  rtCapMultiplier: string
  rtReserve: string
  tgePriceSetAt: number
  unlockTime: number
  clearingPrice: string
  settlementWindowDeadline: number
}

export interface UserTokenBalances {
  ptBalance: string
  rtBalance: string
}

export async function getSettlementState(): Promise<SettlementState | null> {
  if (!ADDRESSES.settlement) return null
  try {
    const [
      tgePrice,
      tgePriceSet,
      payoutPerRT,
      rtCapMultiplier,
      rtReserve,
      tgePriceSetAt,
    ] = await Promise.all([
      publicClient.readContract({ address: ADDRESSES.settlement, abi: SettlementABI, functionName: 'tgePrice' }),
      publicClient.readContract({ address: ADDRESSES.settlement, abi: SettlementABI, functionName: 'tgePriceSet' }),
      publicClient.readContract({ address: ADDRESSES.settlement, abi: SettlementABI, functionName: 'payoutPerRT' }),
      publicClient.readContract({ address: ADDRESSES.settlement, abi: SettlementABI, functionName: 'rtCapMultiplier' }),
      publicClient.readContract({ address: ADDRESSES.settlement, abi: SettlementABI, functionName: 'rtReserve' }),
      publicClient.readContract({ address: ADDRESSES.settlement, abi: SettlementABI, functionName: 'tgePriceSetAt' }),
    ])

    // Fetch unlockTime + clearingPrice from armVault via Settlement references
    let unlockTime = 0
    let clearingPrice = '0'
    if (ADDRESSES.armVault) {
      const ARMVaultABI = (await import('@/lib/abi/ARMVault.json')).default
      const [ut, cp] = await Promise.all([
        publicClient.readContract({ address: ADDRESSES.armVault, abi: ARMVaultABI, functionName: 'unlockTime' }),
        publicClient.readContract({ address: ADDRESSES.armVault, abi: ARMVaultABI, functionName: 'clearingPrice' }),
      ])
      unlockTime = Number(ut as bigint)
      clearingPrice = (cp as bigint).toString()
    }

    const settlementWindow = await publicClient.readContract({
      address: ADDRESSES.settlement,
      abi: SettlementABI,
      functionName: 'SETTLEMENT_WINDOW',
    }) as bigint
    return {
      tgePrice: (tgePrice as bigint).toString(),
      tgePriceSet: tgePriceSet as boolean,
      payoutPerRT: (payoutPerRT as bigint).toString(),
      rtCapMultiplier: (rtCapMultiplier as bigint).toString(),
      rtReserve: (rtReserve as bigint).toString(),
      tgePriceSetAt: Number(tgePriceSetAt as bigint),
      unlockTime,
      clearingPrice,
      settlementWindowDeadline: Number(tgePriceSetAt as bigint) + Number(settlementWindow),
    }
  } catch (err) {
    console.error('getSettlementState error:', err)
    return null
  }
}

export async function getUserBalances(userAddress: string): Promise<UserTokenBalances> {
  if (!userAddress) return { ptBalance: '0', rtBalance: '0' }
  try {
    const results = await Promise.allSettled([
      ADDRESSES.principalToken
        ? publicClient.readContract({
            address: ADDRESSES.principalToken,
            abi: ERC20ABI,
            functionName: 'balanceOf',
            args: [userAddress as `0x${string}`],
          })
        : Promise.resolve(0n),
      ADDRESSES.riskToken
        ? publicClient.readContract({
            address: ADDRESSES.riskToken,
            abi: ERC20ABI,
            functionName: 'balanceOf',
            args: [userAddress as `0x${string}`],
          })
        : Promise.resolve(0n),
    ])

    const ptBalance = results[0].status === 'fulfilled' ? (results[0].value as bigint).toString() : '0'
    const rtBalance = results[1].status === 'fulfilled' ? (results[1].value as bigint).toString() : '0'

    return { ptBalance, rtBalance }
  } catch (err) {
    console.error('getUserBalances error:', err)
    return { ptBalance: '0', rtBalance: '0' }
  }
}

export interface UserNFT {
  tokenId: string
  amount: string       // formatted 18dp
  clearingPrice: string // formatted 6dp (USDC)
  unlockTime: number   // unix seconds
}

export async function getUserNFTs(userAddress: string): Promise<UserNFT[]> {
  if (!userAddress || !ADDRESSES.allocationNFT) return []
  try {
    const deployBlock = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? '0')
    // Scan mint events: Transfer(from=0x0, to=user)
    const logs = await publicClient.getLogs({
      address: ADDRESSES.allocationNFT,
      event: {
        type: 'event',
        name: 'Transfer',
        inputs: [
          { name: 'from', type: 'address', indexed: true },
          { name: 'to', type: 'address', indexed: true },
          { name: 'tokenId', type: 'uint256', indexed: true },
        ],
      },
      args: {
        from: '0x0000000000000000000000000000000000000000',
        to: userAddress as `0x${string}`,
      },
      fromBlock: deployBlock,
    })

    const tokenIds = logs.map((l) => (l.args.tokenId ?? 0n) as bigint)
    if (tokenIds.length === 0) return []

    // Filter: only tokens still owned by user
    const ownerResults = await Promise.allSettled(
      tokenIds.map((id) =>
        publicClient.readContract({
          address: ADDRESSES.allocationNFT,
          abi: AllocationNFTABI,
          functionName: 'ownerOf',
          args: [id],
        })
      )
    )

    const ownedIds = tokenIds.filter(
      (_, i) =>
        ownerResults[i].status === 'fulfilled' &&
        (ownerResults[i] as PromiseFulfilledResult<unknown>).value?.toString().toLowerCase() ===
          userAddress.toLowerCase()
    )

    if (ownedIds.length === 0) return []

    // Fetch allocation data for each owned token
    const allocResults = await Promise.allSettled(
      ownedIds.map((id) =>
        publicClient.readContract({
          address: ADDRESSES.allocationNFT,
          abi: AllocationNFTABI,
          functionName: 'getAllocation',
          args: [id],
        })
      )
    )

    return ownedIds
      .map((id, i) => {
        if (allocResults[i].status !== 'fulfilled') return null
        const alloc = (allocResults[i] as PromiseFulfilledResult<unknown>).value as {
          amount: bigint
          clearingPrice: bigint
          unlockTime: bigint
        }
        return {
          tokenId: id.toString(),
          amount: formatUnits(alloc.amount, 18),
          clearingPrice: formatUnits(alloc.clearingPrice, 6),
          unlockTime: Number(alloc.unlockTime),
        }
      })
      .filter(Boolean) as UserNFT[]
  } catch (err) {
    console.error('getUserNFTs error:', err)
    return []
  }
}
