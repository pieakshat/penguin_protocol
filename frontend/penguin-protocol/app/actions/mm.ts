'use server'

import { decodeAbiParameters, formatUnits } from 'viem'
import { mmPublicClient, MM_ADDRESSES, MM_POOL_ID } from '@/lib/contracts'
import LiquidityVaultABI from '@/lib/abi/LiquidityVault.json'
import StrategyManagerABI from '@/lib/abi/StrategyManager.json'
import LiquidityManagerHookABI from '@/lib/abi/LiquidityManagerHook.json'
import PoolManagerABI from '@/lib/abi/PoolManager.json'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MMPoolState {
  // Pool price + liquidity (PoolManager.getSlot0 / getLiquidity)
  sqrtPriceX96: string          // raw as string (BigInt → string for serialization)
  currentTick: number
  currentPrice: number          // token1 per token0, both 18dp — derived from sqrtPriceX96
  currentLiquidity: string      // formatted LP liquidity units

  // Hook metrics (LiquidityManagerHook.getPoolState)
  cumulativeVolume: string      // total vol since init, formatted TKA
  volumeSinceCheckpoint: string // vol since last injection, formatted TKA
  lastUnlockTime: number        // unix seconds

  // Vault balances (LiquidityVault)
  available0: string
  available1: string
  deployed0: string
  deployed1: string
  total0: string
  total1: string

  // Strategy (StrategyManager)
  isPaused: boolean
  timelockDelay: number         // seconds
  maxModulesPerPool: number
  pendingUpdate: { updateId: string; executableAt: number } | null

  // Admin
  vaultOwner: string
  hookAddress: string           // confirmed hook address from vault
}

export interface DecodedModule {
  address: string
  name: 'TimeUnlock' | 'VolumeUnlock' | 'PriceUnlock' | 'Unknown'
  basisPoints?: number          // e.g. 500 = 5%
  // TimeUnlock
  interval?: number             // seconds
  // VolumeUnlock
  volumeThreshold?: string      // formatted token0 units
  // PriceUnlock
  targetSqrtPriceX96?: string   // raw as string
  targetPrice?: number          // human-readable price derived from sqrtPriceX96
  triggerAbove?: boolean
  cooldown?: number             // seconds
}

export interface InjectionEvent {
  poolId: string
  amount0: string
  amount1: string
  liquidityAdded: string
  blockNumber: string
  txHash: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function addr(a: string) { return a as `0x${string}` }

function fmtToken(raw: bigint) {
  return Number(formatUnits(raw, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })
}

/** sqrtPriceX96 (Q64.96) → price of token1 per token0 (both 18dp, no adjustment). */
function sqrtPriceX96ToPrice(sqrtPriceX96: bigint): number {
  const sqrtPrice = Number(sqrtPriceX96) / (2 ** 96)
  return sqrtPrice * sqrtPrice
}

// ── getMMPoolState ─────────────────────────────────────────────────────────────

export async function getMMPoolState(): Promise<MMPoolState | null> {
  const poolId = MM_POOL_ID
  if (!poolId || !MM_ADDRESSES.liquidityVault || !MM_ADDRESSES.strategyManager || !MM_ADDRESSES.hook) {
    return null
  }

  try {
    const [
      slot0,
      poolLiquidity,
      hookState,
      available,
      deployed,
      total,
      paused,
      timelockDelay,
      maxModules,
      pendingUpdate,
      vaultOwner,
      hookAddr,
    ] = await Promise.all([
      mmPublicClient.readContract({
        address: addr(MM_ADDRESSES.poolManager),
        abi: PoolManagerABI,
        functionName: 'getSlot0',
        args: [poolId],
      }) as Promise<[bigint, number, number, number]>,

      mmPublicClient.readContract({
        address: addr(MM_ADDRESSES.poolManager),
        abi: PoolManagerABI,
        functionName: 'getLiquidity',
        args: [poolId],
      }) as Promise<bigint>,

      mmPublicClient.readContract({
        address: addr(MM_ADDRESSES.hook),
        abi: LiquidityManagerHookABI,
        functionName: 'getPoolState',
        args: [poolId],
      }) as Promise<[bigint, bigint, bigint]>,

      mmPublicClient.readContract({
        address: addr(MM_ADDRESSES.liquidityVault),
        abi: LiquidityVaultABI,
        functionName: 'getAvailable',
        args: [poolId],
      }) as Promise<[bigint, bigint]>,

      mmPublicClient.readContract({
        address: addr(MM_ADDRESSES.liquidityVault),
        abi: LiquidityVaultABI,
        functionName: 'getDeployed',
        args: [poolId],
      }) as Promise<[bigint, bigint]>,

      mmPublicClient.readContract({
        address: addr(MM_ADDRESSES.liquidityVault),
        abi: LiquidityVaultABI,
        functionName: 'getTotalDeposited',
        args: [poolId],
      }) as Promise<[bigint, bigint]>,

      mmPublicClient.readContract({
        address: addr(MM_ADDRESSES.strategyManager),
        abi: StrategyManagerABI,
        functionName: 'isPaused',
        args: [poolId],
      }) as Promise<boolean>,

      mmPublicClient.readContract({
        address: addr(MM_ADDRESSES.strategyManager),
        abi: StrategyManagerABI,
        functionName: 'timelockDelay',
      }) as Promise<bigint>,

      mmPublicClient.readContract({
        address: addr(MM_ADDRESSES.strategyManager),
        abi: StrategyManagerABI,
        functionName: 'MAX_MODULES_PER_POOL',
      }) as Promise<bigint>,

      mmPublicClient.readContract({
        address: addr(MM_ADDRESSES.strategyManager),
        abi: StrategyManagerABI,
        functionName: 'getPendingUpdate',
        args: [poolId],
      }) as Promise<[`0x${string}`, bigint]>,

      mmPublicClient.readContract({
        address: addr(MM_ADDRESSES.liquidityVault),
        abi: LiquidityVaultABI,
        functionName: 'owner',
      }) as Promise<string>,

      mmPublicClient.readContract({
        address: addr(MM_ADDRESSES.liquidityVault),
        abi: LiquidityVaultABI,
        functionName: 'hook',
      }) as Promise<string>,
    ])

    const [sqrtPriceX96, tick] = slot0
    const [cumVol, cumVolCheckpoint, lastUnlock] = hookState
    const [avail0, avail1] = available
    const [dep0, dep1] = deployed
    const [tot0, tot1] = total
    const [updateId, executableAt] = pendingUpdate
    const volumeSince = cumVol >= cumVolCheckpoint ? cumVol - cumVolCheckpoint : 0n

    return {
      sqrtPriceX96: sqrtPriceX96.toString(),
      currentTick: tick,
      currentPrice: sqrtPriceX96ToPrice(sqrtPriceX96),
      currentLiquidity: Number(poolLiquidity).toLocaleString(),

      cumulativeVolume: fmtToken(cumVol),
      volumeSinceCheckpoint: fmtToken(volumeSince),
      lastUnlockTime: Number(lastUnlock),

      available0: fmtToken(avail0),
      available1: fmtToken(avail1),
      deployed0: fmtToken(dep0),
      deployed1: fmtToken(dep1),
      total0: fmtToken(tot0),
      total1: fmtToken(tot1),

      isPaused: paused,
      timelockDelay: Number(timelockDelay),
      maxModulesPerPool: Number(maxModules),
      pendingUpdate: executableAt > 0n
        ? { updateId: updateId as string, executableAt: Number(executableAt) }
        : null,

      vaultOwner: vaultOwner as string,
      hookAddress: hookAddr as string,
    }
  } catch (e) {
    console.error('getMMPoolState error:', e)
    return null
  }
}

// ── getMMModules ───────────────────────────────────────────────────────────────

export async function getMMModules(): Promise<DecodedModule[]> {
  const poolId = MM_POOL_ID
  if (!poolId || !MM_ADDRESSES.strategyManager) return []

  try {
    const modules = await mmPublicClient.readContract({
      address: addr(MM_ADDRESSES.strategyManager),
      abi: StrategyManagerABI,
      functionName: 'getModules',
      args: [poolId],
    }) as Array<{ module: string; config: `0x${string}` }>

    return modules.map((m) => {
      const moduleAddr = m.module.toLowerCase()
      const cfg = m.config

      if (moduleAddr === MM_ADDRESSES.timeModule.toLowerCase()) {
        try {
          const [interval, basisPoints] = decodeAbiParameters(
            [{ type: 'uint256' }, { type: 'uint256' }],
            cfg,
          )
          return {
            address: m.module,
            name: 'TimeUnlock' as const,
            interval: Number(interval),
            basisPoints: Number(basisPoints),
          }
        } catch { /* fall through */ }
      }

      if (moduleAddr === MM_ADDRESSES.volumeModule.toLowerCase()) {
        try {
          const [volumeThreshold, basisPoints] = decodeAbiParameters(
            [{ type: 'uint256' }, { type: 'uint256' }],
            cfg,
          )
          return {
            address: m.module,
            name: 'VolumeUnlock' as const,
            volumeThreshold: fmtToken(volumeThreshold as bigint),
            basisPoints: Number(basisPoints),
          }
        } catch { /* fall through */ }
      }

      if (moduleAddr === MM_ADDRESSES.priceModule.toLowerCase()) {
        try {
          const [targetSqrtPriceX96, triggerAbove, cooldown, basisPoints] = decodeAbiParameters(
            [{ type: 'uint160' }, { type: 'bool' }, { type: 'uint256' }, { type: 'uint256' }],
            cfg,
          )
          const sqrtP = targetSqrtPriceX96 as bigint
          return {
            address: m.module,
            name: 'PriceUnlock' as const,
            targetSqrtPriceX96: sqrtP.toString(),
            targetPrice: sqrtPriceX96ToPrice(sqrtP),
            triggerAbove: triggerAbove as boolean,
            cooldown: Number(cooldown),
            basisPoints: Number(basisPoints),
          }
        } catch { /* fall through */ }
      }

      return { address: m.module, name: 'Unknown' as const }
    })
  } catch (e) {
    console.error('getMMModules error:', e)
    return []
  }
}

// ── getInjectionHistory ────────────────────────────────────────────────────────

export async function getInjectionHistory(): Promise<InjectionEvent[]> {
  if (!MM_ADDRESSES.hook) return []

  try {
    const logs = await mmPublicClient.getLogs({
      address: addr(MM_ADDRESSES.hook),
      event: {
        type: 'event',
        name: 'LiquidityInjected',
        inputs: [
          { name: 'poolId', type: 'bytes32', indexed: true },
          { name: 'amount0', type: 'uint256', indexed: false },
          { name: 'amount1', type: 'uint256', indexed: false },
          { name: 'liquidityAdded', type: 'uint128', indexed: false },
        ],
      },
      fromBlock: BigInt(0),
    })

    return logs.slice(-50).map((log) => ({
      poolId: (log.args.poolId ?? '') as string,
      amount0: fmtToken((log.args.amount0 ?? 0n) as bigint),
      amount1: fmtToken((log.args.amount1 ?? 0n) as bigint),
      liquidityAdded: ((log.args.liquidityAdded ?? 0n) as bigint).toString(),
      blockNumber: log.blockNumber?.toString() ?? '—',
      txHash: log.transactionHash ?? '—',
    }))
  } catch (e) {
    console.error('getInjectionHistory error:', e)
    return []
  }
}
