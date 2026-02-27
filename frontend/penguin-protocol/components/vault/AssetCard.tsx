// components/vault/AssetCard.tsx
export function AssetCard({ id, amount, status, isSelected }: any) {
    return (
      <div className={`relative overflow-hidden p-6 rounded-[2rem] border transition-all duration-500 cursor-pointer backdrop-blur-xl group ${
        isSelected ? 'bg-blue-500/10 border-blue-500/40 shadow-[0_0_40px_rgba(59,130,246,0.1)]' : 'bg-[#101926]/40 border-white/5 hover:border-white/20'
      }`}>
        <div className="flex justify-between items-center mb-10">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-400/20 to-blue-600/20 flex items-center justify-center border border-blue-500/20">
            <span className="text-xl">❄️</span>
          </div>
          <div className={`px-3 py-1 rounded-full text-[9px] font-mono uppercase tracking-widest border ${
            status === "Staked" ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5' : 'text-blue-400 border-blue-400/20 bg-blue-400/5'
          }`}>
            {status}
          </div>
        </div>
  
        <div className="space-y-4">
          <div>
            <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-[0.2em]">Principal Allocation</span>
            <div className="text-2xl font-mono text-white mt-1">{amount} <span className="text-xs text-neutral-600">USDC</span></div>
          </div>
          
          <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
            <div className={`h-full bg-blue-500 transition-all duration-1000 ${isSelected ? 'w-[70%]' : 'w-0'}`} />
          </div>
          <div className="flex justify-between text-[9px] font-mono text-neutral-600 uppercase">
            <span>NFT ID: {id}</span>
            <span>Tier: Glacial</span>
          </div>
        </div>
      </div>
    );
  }