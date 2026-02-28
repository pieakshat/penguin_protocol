import { createPublicClient, http, keccak256, encodeAbiParameters, defineChain } from 'viem'
import { bsc } from 'viem/chains'

export const anvil = defineChain({
  id: 31337,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
})

// ── Penguin Protocol (BSC) ────────────────────────────────────────────────────
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

// ── PenguinMM (Anvil) ─────────────────────────────────────────────────────────
export const MM_ADDRESSES = {
  poolManager:     (process.env.NEXT_PUBLIC_POOL_MANAGER_ADDRESS  ?? '') as `0x${string}`,
  liquidityVault:  (process.env.NEXT_PUBLIC_LIQUIDITY_VAULT_ADDRESS ?? '') as `0x${string}`,
  strategyManager: (process.env.NEXT_PUBLIC_STRATEGY_MANAGER_ADDRESS ?? '') as `0x${string}`,
  hook:            (process.env.NEXT_PUBLIC_HOOK_ADDRESS ?? '') as `0x${string}`,
  token0:          (process.env.NEXT_PUBLIC_MM_TOKEN0_ADDRESS ?? '') as `0x${string}`,
  token1:          (process.env.NEXT_PUBLIC_MM_TOKEN1_ADDRESS ?? '') as `0x${string}`,
  timeModule:      (process.env.NEXT_PUBLIC_TIME_UNLOCK_MODULE ?? '') as `0x${string}`,
  volumeModule:    (process.env.NEXT_PUBLIC_VOLUME_UNLOCK_MODULE ?? '') as `0x${string}`,
  priceModule:     (process.env.NEXT_PUBLIC_PRICE_UNLOCK_MODULE ?? '') as `0x${string}`,
}

export const MM_POOL_ID = (process.env.NEXT_PUBLIC_POOL_ID ?? '') as `0x${string}`

// ── Public clients ────────────────────────────────────────────────────────────

export const publicClient = createPublicClient({
  chain: bsc,
  transport: http(),
})

export const mmPublicClient = createPublicClient({
  chain: anvil,
  transport: http('http://127.0.0.1:8545'),
})

// ── PoolId computation (matches Solidity keccak256(abi.encode(key))) ──────────
export function computePoolId(
  token0: `0x${string}`,
  token1: `0x${string}`,
  fee: number,
  tickSpacing: number,
  hooks: `0x${string}`,
): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'address' },
        { type: 'uint24' },
        { type: 'int24' },
        { type: 'address' },
      ],
      [token0, token1, fee, tickSpacing, hooks],
    ),
  )
}

/** Format a raw on-chain bigint to a human-readable string. */
export function formatUnits(value: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals)
  const whole = value / divisor
  const frac = value % divisor
  if (frac === 0n) return whole.toString()
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${whole}.${fracStr}`
}
