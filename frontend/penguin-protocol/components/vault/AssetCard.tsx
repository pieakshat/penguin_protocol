// components/vault/AssetCard.tsx

interface AssetCardProps {
  id: string;
  amount: string;        // formatted token amount (1e18)
  clearingPrice: string; // formatted USDC price (6dp)
  unlockTime: number;    // unix timestamp
  status: "Available" | "Deposited";
  isSelected: boolean;
}

export function AssetCard({ id, amount, clearingPrice, unlockTime, status, isSelected }: AssetCardProps) {
  const unlockDate = new Date(unlockTime * 1000).toLocaleDateString();
  const isDeposited = status === "Deposited";

  return (
    <div className={`relative overflow-hidden p-6 rounded-[2rem] border transition-all duration-500 backdrop-blur-xl group ${
      isDeposited
        ? "bg-white/[0.02] border-white/5 opacity-60 cursor-default"
        : isSelected
        ? "bg-blue-500/10 border-blue-500/40 shadow-[0_0_40px_rgba(59,130,246,0.1)] cursor-pointer"
        : "bg-[#101926]/40 border-white/5 hover:border-white/20 cursor-pointer"
    }`}>
      <div className="flex justify-between items-center mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-400/20 to-blue-600/20 flex items-center justify-center border border-blue-500/20">
          <span className="text-xl">❄️</span>
        </div>
        <div className={`px-3 py-1 rounded-full text-[9px] font-mono uppercase tracking-widest border ${
          isDeposited
            ? "text-neutral-500 border-neutral-500/20 bg-neutral-500/5"
            : "text-emerald-400 border-emerald-400/20 bg-emerald-400/5"
        }`}>
          {status}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-[0.2em]">Token Allocation</span>
          <div className="text-2xl font-mono text-white mt-0.5">
            {amount} <span className="text-xs text-neutral-600">TOKENS</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/[0.02] rounded-xl p-2.5 border border-white/5">
            <span className="text-[8px] font-mono text-neutral-600 uppercase tracking-widest block">Clearing Price</span>
            <span className="text-[11px] font-mono text-blue-400">${clearingPrice}</span>
          </div>
          <div className="bg-white/[0.02] rounded-xl p-2.5 border border-white/5">
            <span className="text-[8px] font-mono text-neutral-600 uppercase tracking-widest block">Unlock</span>
            <span className="text-[11px] font-mono text-white">{unlockDate}</span>
          </div>
        </div>

        <div className="h-px w-full bg-white/5" />
        <div className="flex justify-between text-[9px] font-mono text-neutral-600 uppercase">
          <span>NFT ID: #{id}</span>
          <span>{isDeposited ? "In Vault" : "Select to Split"}</span>
        </div>
      </div>

      {isSelected && !isDeposited && (
        <div className="absolute inset-0 border-2 border-blue-500/30 rounded-[2rem] pointer-events-none" />
      )}
    </div>
  );
}
