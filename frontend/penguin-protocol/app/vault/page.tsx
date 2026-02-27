"use client";
import { usePrivy } from "@privy-io/react-auth";
import { useState } from "react";
import { VaultStats } from "@/components/vault/VaultStats";
import { AssetCard } from "@/components/vault/AssetCard";
import { ARMSplitter } from "@/components/vault/ARMSplitter";

export default function VaultPage() {
  const { authenticated, ready } = usePrivy();
  const [selectedNft, setSelectedNft] = useState<string | null>(null);

  const nfts = [
    { id: "4021", amount: "5,000", entry: "$0.42", status: "Staked", type: "NFT" },
    { id: "4022", amount: "1,200", entry: "$0.58", status: "Unstaked", type: "NFT" },
  ];

  return (
    <div className="relative min-h-screen pt-32 pb-20 px-6 font-sans overflow-hidden bg-[#0a111a]">
      {/* Glacial Background Lighting */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-blue-500/5 blur-[120px] pointer-events-none rounded-full" />

      <div className="relative z-10 max-w-[1200px] mx-auto">
        
        {/* 1. KPI Summary Layer - The "5-second rule" */}
        <VaultStats />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* LEFT: Inventory Grid */}
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {nfts.map((nft) => (
                <div key={nft.id} onClick={() => setSelectedNft(nft.id)}>
                   <AssetCard 
                      id={nft.id} 
                      amount={nft.amount} 
                      type={nft.type as any} 
                      status={nft.status} 
                      isSelected={selectedNft === nft.id}
                   />
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: Cinematic Action Panel */}
          <div className="lg:col-span-5">
            <ARMSplitter selectedNftId={selectedNft} />
          </div>

        </div>
      </div>
    </div>
  );
}