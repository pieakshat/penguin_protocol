// components/vault/ARMSplitter.tsx
import { formatUnits } from "viem";
import type { NFTAllocation } from "@/app/actions/vault";

interface ARMSplitterProps {
  selectedNft: NFTAllocation | null;
  onDeposit: (nft: NFTAllocation) => Promise<void>;
  status: "idle" | "approving" | "depositing" | "done" | "error";
  error: string;
}

export function ARMSplitter({ selectedNft, onDeposit, status, error }: ARMSplitterProps) {
  // PT = NFT.amount (1:1), RT = NFT.amount (1:1)
  const tokenAmount = selectedNft
    ? Number(formatUnits(BigInt(selectedNft.amount), 18)).toLocaleString()
    : null;
  const clearingPriceDisplay = selectedNft
    ? Number(formatUnits(BigInt(selectedNft.clearingPrice), 6)).toFixed(6)
    : null;
  const unlockDate = selectedNft
    ? new Date(selectedNft.unlockTime * 1000).toLocaleDateString()
    : null;

  const isBusy = status === "approving" || status === "depositing";

  return (
    <div className="sticky top-32 bg-[#0d1724]/80 border border-blue-500/20 rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden backdrop-blur-3xl">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-blue-500/40 blur-[15px]" />

      <div className="text-center mb-10">
        <h3 className="text-xl font-medium text-white uppercase tracking-[0.2em] mb-2">ARM Strategy</h3>
        <p className="text-xs text-neutral-500 font-light leading-relaxed">
          Deposit your Allocation NFT to receive{" "}
          <span className="text-blue-300 font-medium">Principal Tokens</span> (guaranteed) and{" "}
          <span className="text-orange-400 font-medium">Risk Tokens</span> (upside) — minted 1:1 with your allocation.
        </p>
      </div>

      {selectedNft ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* NFT Details */}
          <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-2 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-neutral-500">NFT ID</span>
              <span className="text-white">#{selectedNft.tokenId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Clearing Price</span>
              <span className="text-blue-400">${clearingPriceDisplay}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Unlock Date</span>
              <span className="text-white">{unlockDate}</span>
            </div>
          </div>

          {/* PT + RT you receive */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-6 rounded-3xl bg-emerald-500/5 border border-emerald-500/20 text-center space-y-2 hover:bg-emerald-500/10 transition-colors">
              <span className="text-[10px] font-mono text-emerald-500 uppercase tracking-widest">Receive PT</span>
              <div className="text-lg font-mono text-white">{tokenAmount}</div>
              <p className="text-[9px] text-neutral-600 uppercase">1:1 · Guaranteed</p>
            </div>
            <div className="p-6 rounded-3xl bg-orange-500/5 border border-orange-500/20 text-center space-y-2 hover:bg-orange-500/10 transition-colors">
              <span className="text-[10px] font-mono text-orange-500 uppercase tracking-widest">Receive RT</span>
              <div className="text-lg font-mono text-white">{tokenAmount}</div>
              <p className="text-[9px] text-neutral-600 uppercase">1:1 · Upside</p>
            </div>
          </div>

          {error && (
            <p className="text-[10px] font-mono text-red-400 bg-red-400/5 border border-red-400/20 rounded-xl px-3 py-2">{error}</p>
          )}
          {status === "done" && (
            <p className="text-[10px] font-mono text-emerald-400 bg-emerald-400/5 border border-emerald-400/20 rounded-xl px-3 py-2">
              Split complete! PT and RT have been minted to your wallet.
            </p>
          )}

          <button
            onClick={() => onDeposit(selectedNft)}
            disabled={isBusy}
            className="w-full py-5 bg-white text-black font-bold rounded-2xl text-[11px] tracking-[0.3em] uppercase hover:bg-blue-50 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_20px_40px_rgba(255,255,255,0.1)] disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100"
          >
            {status === "approving" ? "Approving NFT..." : status === "depositing" ? "Depositing..." : "Execute Protocol Split"}
          </button>
        </div>
      ) : (
        <div className="py-24 text-center border-2 border-dashed border-white/5 rounded-[2rem] group hover:border-blue-500/20 transition-colors">
          <p className="text-[10px] text-neutral-600 uppercase tracking-[0.3em] group-hover:text-neutral-400 transition-colors">
            Select an allocation to begin
          </p>
        </div>
      )}
    </div>
  );
}
