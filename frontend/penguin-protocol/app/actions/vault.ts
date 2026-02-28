'use server'

import { publicClient, ADDRESSES } from '@/lib/contracts'
import AllocationNFTABI from '@/lib/abi/AllocationNFT.json'
import ARMVaultABI from '@/lib/abi/ARMVault.json'

export interface NFTAllocation {
  tokenId: string
  amount: string
  clearingPrice: string
  unlockTime: number
  deposited: boolean
}

export interface ARMVaultState {
  clearingPrice: string
  unlockTime: number
}

/** Fetch all AllocationNFTs owned by a user by scanning Transfer events. */
export async function getUserNFTs(userAddress: string): Promise<NFTAllocation[]> {
  if (!ADDRESSES.allocationNFT || !userAddress) return []
  try {
    // Get Transfer events where `to` = userAddress (minted or transferred in)
    const transfersIn = await publicClient.getLogs({
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
      args: { to: userAddress as `0x${string}` },
      fromBlock: BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? '0'),
    })

    const tokenIds = [...new Set(transfersIn.map((log) => (log.args as { tokenId: bigint }).tokenId))]
    if (!tokenIds.length) return []

    // Filter to tokens still owned by this user
    const owned: NFTAllocation[] = []
    await Promise.all(
      tokenIds.map(async (tokenId) => {
        try {
          const [owner, allocation, depositor] = await Promise.all([
            publicClient.readContract({
              address: ADDRESSES.allocationNFT,
              abi: AllocationNFTABI,
              functionName: 'ownerOf',
              args: [tokenId],
            }) as Promise<string>,
            publicClient.readContract({
              address: ADDRESSES.allocationNFT,
              abi: AllocationNFTABI,
              functionName: 'getAllocation',
              args: [tokenId],
            }) as Promise<{ amount: bigint; clearingPrice: bigint; unlockTime: bigint }>,
            ADDRESSES.armVault
              ? (publicClient.readContract({
                  address: ADDRESSES.armVault,
                  abi: ARMVaultABI,
                  functionName: 'getDepositor',
                  args: [tokenId],
                }) as Promise<string>)
              : Promise.resolve('0x0000000000000000000000000000000000000000'),
          ])

          // Include if user is still the owner OR has deposited (NFT now in vault)
          if (
            owner.toLowerCase() === userAddress.toLowerCase() ||
            depositor.toLowerCase() === userAddress.toLowerCase()
          ) {
            owned.push({
              tokenId: tokenId.toString(),
              amount: allocation.amount.toString(),
              clearingPrice: allocation.clearingPrice.toString(),
              unlockTime: Number(allocation.unlockTime),
              deposited: depositor !== '0x0000000000000000000000000000000000000000',
            })
          }
        } catch {
          // Token may have been burned or transferred — skip
        }
      })
    )

    return owned.sort((a, b) => Number(a.tokenId) - Number(b.tokenId))
  } catch (err) {
    console.error('getUserNFTs error:', err)
    return []
  }
}

export async function getARMVaultState(): Promise<ARMVaultState | null> {
  if (!ADDRESSES.armVault) return null
  try {
    const [clearingPrice, unlockTime] = await Promise.all([
      publicClient.readContract({
        address: ADDRESSES.armVault,
        abi: ARMVaultABI,
        functionName: 'clearingPrice',
      }),
      publicClient.readContract({
        address: ADDRESSES.armVault,
        abi: ARMVaultABI,
        functionName: 'unlockTime',
      }),
    ])

    return {
      clearingPrice: (clearingPrice as bigint).toString(),
      unlockTime: Number(unlockTime as bigint),
    }
  } catch (err) {
    console.error('getARMVaultState error:', err)
    return null
  }
}
