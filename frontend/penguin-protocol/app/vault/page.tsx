"use client";

import { useEffect, useState, useCallback } from "react";
import { formatUnits } from "viem";
import { getUserNFTs } from "@/app/actions/vault";
import { getUserBalances } from "@/app/actions/settlement";
import type { NFTAllocation } from "@/app/actions/vault";
import { VaultStats } from "@/components/vault/VaultStats";
import { AssetCard } from "@/components/vault/AssetCard";
import { ARMSplitter } from "@/components/vault/ARMSplitter";
import { ADDRESSES, demoWalletClient, demoAccount } from "@/lib/contracts";
import AllocationNFTABI from "@/lib/abi/AllocationNFT.json";
import ARMVaultABI from "@/lib/abi/ARMVault.json";

export default function VaultPage() {
  const [nfts, setNfts] = useState<NFTAllocation[]>([]);
  const [selectedNft, setSelectedNft] = useState<NFTAllocation | null>(null);
  const [ptBalance, setPtBalance] = useState("0");
  const [rtBalance, setRtBalance] = useState("0");
  const [loading, setLoading] = useState(true);
  const [depositStatus, setDepositStatus] = useState<"idle" | "approving" | "depositing" | "done" | "error">("idle");
  const [depositError, setDepositError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    const [fetchedNfts, balances] = await Promise.all([
      getUserNFTs(demoAccount.address),
      getUserBalances(demoAccount.address),
    ]);
    setNfts(fetchedNfts);
    setPtBalance(balances.ptBalance);
    setRtBalance(balances.rtBalance);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleDeposit(nft: NFTAllocation) {
    if (!ADDRESSES.armVault || !ADDRESSES.allocationNFT) {
      setDepositError("Contract addresses not set in .env.local");
      setDepositStatus("error");
      return;
    }
    try {
      setDepositError("");
      const tokenId = BigInt(nft.tokenId);

      // 1. Approve NFT to ARMVault
      setDepositStatus("approving");
      await demoWalletClient.writeContract({
        address: ADDRESSES.allocationNFT,
        abi: AllocationNFTABI,
        functionName: "approve",
        args: [ADDRESSES.armVault, tokenId],
        account: demoAccount,
      });

      // 2. Deposit NFT → mint PT + RT 1:1
      setDepositStatus("depositing");
      await demoWalletClient.writeContract({
        address: ADDRESSES.armVault,
        abi: ARMVaultABI,
        functionName: "deposit",
        args: [tokenId],
        account: demoAccount,
      });

      setDepositStatus("done");
      setSelectedNft(null);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setDepositError(msg.includes("user rejected") ? "Transaction rejected." : msg.slice(0, 160));
      setDepositStatus("error");
    }
  }

  const ptBalanceDisplay = ptBalance !== "0" ? Number(formatUnits(BigInt(ptBalance), 18)).toLocaleString() : "0";
  const rtBalanceDisplay = rtBalance !== "0" ? Number(formatUnits(BigInt(rtBalance), 18)).toLocaleString() : "0";


  return (
    <div className="relative min-h-screen pt-32 pb-20 px-6 font-sans overflow-hidden bg-[#0a111a]">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-blue-500/5 blur-[120px] pointer-events-none rounded-full" />

      <div className="relative z-10 max-w-[1200px] mx-auto">
        <VaultStats ptBalance={ptBalanceDisplay} rtBalance={rtBalanceDisplay} nftCount={nfts.length} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">

          {/* LEFT: Allocation NFT grid */}
          <div className="lg:col-span-7 space-y-8">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-medium text-white tracking-tight">
                Your <span className="font-serif italic text-blue-200/40">Allocations</span>
              </h2>
              <div className="flex gap-2">
                <div className="h-1 w-8 bg-blue-500 rounded-full" />
                <div className="h-1 w-2 bg-white/10 rounded-full" />
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[0, 1].map((i) => (
                  <div key={i} className="h-52 rounded-[2rem] bg-white/5 animate-pulse" />
                ))}
              </div>
            ) : nfts.length === 0 ? (
              <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-[2rem]">
                <p className="text-[11px] font-mono text-neutral-600 uppercase tracking-[0.2em]">No Allocation NFTs found</p>
                <p className="text-[10px] text-neutral-700 mt-2 font-light">Participate in the auction on the Launch page to receive one.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {nfts.map((nft) => (
                  <div
                    key={nft.tokenId}
                    onClick={() => !nft.deposited && setSelectedNft(selectedNft?.tokenId === nft.tokenId ? null : nft)}
                    className={nft.deposited ? "cursor-default" : "cursor-pointer"}
                  >
                    <AssetCard
                      id={nft.tokenId}
                      amount={Number(formatUnits(BigInt(nft.amount), 18)).toLocaleString()}
                      clearingPrice={Number(formatUnits(BigInt(nft.clearingPrice), 6)).toFixed(6)}
                      unlockTime={nft.unlockTime}
                      status={nft.deposited ? "Deposited" : "Available"}
                      isSelected={selectedNft?.tokenId === nft.tokenId}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: ARM Splitter */}
          <div className="lg:col-span-5">
            <ARMSplitter
              selectedNft={selectedNft}
              onDeposit={handleDeposit}
              status={depositStatus}
              error={depositError}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
