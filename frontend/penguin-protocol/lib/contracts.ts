import { createPublicClient, http } from 'viem'
import { bsc } from 'viem/chains'

export const ADDRESSES = {
  factory:        (process.env.NEXT_PUBLIC_FACTORY_ADDRESS ?? '') as `0x${string}`,
  batchAuction:   (process.env.NEXT_PUBLIC_BATCH_AUCTION_ADDRESS ?? '') as `0x${string}`,
  armVault:       (process.env.NEXT_PUBLIC_ARM_VAULT_ADDRESS ?? '') as `0x${string}`,
  settlement:     (process.env.NEXT_PUBLIC_SETTLEMENT_ADDRESS ?? '') as `0x${string}`,
  allocationNFT:  (process.env.NEXT_PUBLIC_ALLOCATION_NFT_ADDRESS ?? '') as `0x${string}`,
  principalToken: (process.env.NEXT_PUBLIC_PRINCIPAL_TOKEN_ADDRESS ?? '') as `0x${string}`,
  riskToken:      (process.env.NEXT_PUBLIC_RISK_TOKEN_ADDRESS ?? '') as `0x${string}`,
  usdc:           (process.env.NEXT_PUBLIC_USDC_ADDRESS ?? '') as `0x${string}`,
}

export const publicClient = createPublicClient({
  chain: bsc,
  transport: http(),
})

/** Format a raw on-chain bigint price to a human-readable string.
 *  USDC uses 6 decimals; LaunchToken amounts use 18 decimals.
 */
export function formatUnits(value: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals)
  const whole = value / divisor
  const frac = value % divisor
  if (frac === 0n) return whole.toString()
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${whole}.${fracStr}`
}
