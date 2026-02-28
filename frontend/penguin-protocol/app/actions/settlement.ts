'use server'

import { publicClient, ADDRESSES } from '@/lib/contracts'
import SettlementABI from '@/lib/abi/Settlement.json'
import ERC20ABI from '@/lib/abi/ERC20Extended.json'

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

    const SETTLEMENT_WINDOW = 30 * 24 * 60 * 60 // 30 days in seconds
    return {
      tgePrice: (tgePrice as bigint).toString(),
      tgePriceSet: tgePriceSet as boolean,
      payoutPerRT: (payoutPerRT as bigint).toString(),
      rtCapMultiplier: (rtCapMultiplier as bigint).toString(),
      rtReserve: (rtReserve as bigint).toString(),
      tgePriceSetAt: Number(tgePriceSetAt as bigint),
      unlockTime,
      clearingPrice,
      settlementWindowDeadline: Number(tgePriceSetAt as bigint) + SETTLEMENT_WINDOW,
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
