"use client";
import { buyTokens } from "@/app/actions/trade";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const BondingCurveChart = dynamic(() => import("@/components/ui/BondingCurveChart"), { 
  ssr: false,
  loading: () => <div className="w-full h-full bg-blue-500/5 animate-pulse rounded-2xl" /> 
});
export default function LaunchPage() {
  const { authenticated, ready, login } = usePrivy();
  const router = useRouter();

  if (ready && !authenticated) {
    return (
      <div className="relative min-h-screen flex items-center justify-center font-sans overflow-hidden bg-[#0a111a]">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent z-0" />
        <div className="relative z-10 text-center space-y-6">
          <h1 className="text-4xl font-medium text-white tracking-tight uppercase">Access Terminal</h1>
          <p className="text-neutral-500 max-w-xs mx-auto font-light text-sm">
            Please connect your wallet to access the Penguin Protocol terminal.
          </p>
          <button 
            onClick={login}
            className="bg-white text-black px-10 py-4 rounded-full font-bold hover:bg-blue-50 transition-all shadow-[0_0_30px_rgba(255,255,255,0.1)]"
          >
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pt-32 pb-20 px-6 font-sans overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a111a]/60 via-[#0a111a]/90 to-[#0a111a] z-0" />

      <div className="relative z-10 max-w-[1300px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT SIDE: Professional Chart Terminal */}
        <div className="lg:col-span-8 bg-[#0d1724]/40 backdrop-blur-3xl border border-white/5 rounded-3xl p-8 h-[650px] flex flex-col group shadow-2xl overflow-hidden">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-medium text-white tracking-tight">LCH / USDC</h2>
              <p className="text-xs font-mono text-blue-400/60 uppercase tracking-[0.2em] mt-1 italic">Bonding Curve v1.0</p>
            </div>
            <div className="flex gap-8">
              <div className="text-right">
                <span className="block text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1">Current Price</span>
                <span className="text-2xl font-medium text-white font-mono">$0.842</span>
              </div>
              <div className="text-right">
                <span className="block text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1">Curve Progress</span>
                <span className="text-2xl font-medium text-emerald-400 font-mono tracking-tighter">64.2%</span>
              </div>
            </div>
          </div>

          {/* REAL CHART COMPONENT */}
          <div className="flex-1 w-full min-h-0">
            <BondingCurveChart />
          </div>

          <div className="mt-4 flex justify-between items-center border-t border-white/5 pt-4">
             <div className="flex gap-4 text-[10px] font-mono text-neutral-500">
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Live Feed</span>
                <span>VOL: $1.2M</span>
             </div>
             <span className="text-[10px] font-mono text-blue-400/30 uppercase tracking-[0.2em]">Institutional discovery active</span>
          </div>
        </div>

        {/* RIGHT SIDE: Buy Panel */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-[#101926]/80 backdrop-blur-2xl border border-blue-500/20 rounded-3xl p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-8">
               <h3 className="text-lg font-medium text-white uppercase tracking-tight">Trade</h3>
               <div className="px-2 py-1 bg-emerald-500/10 rounded text-[10px] font-mono text-emerald-400 border border-emerald-500/20">BUYING</div>
            </div>
            
            <form action={buyTokens} className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between px-1">
                  <label className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Amount to Purchase</label>
                  <span className="text-[10px] font-mono text-neutral-500">MAX: 10,000</span>
                </div>
                <div className="relative">
                  <input 
                    name="amount"
                    type="number" 
                    placeholder="0.00"
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-5 text-2xl text-white focus:outline-none focus:border-blue-500/40 transition-all font-medium placeholder:text-neutral-800"
                    required
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    <button type="button" className="text-[10px] font-mono text-blue-400 hover:text-white transition-colors bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">MAX</button>
                    <span className="text-xs font-mono text-neutral-500 pr-2">LCH</span>
                  </div>
                </div>
              </div>

              <div className="p-5 bg-white/[0.02] rounded-2xl border border-white/5 space-y-4 font-mono">
                <div className="flex justify-between text-[11px]">
                  <span className="text-neutral-500 uppercase">Est. Cost</span>
                  <span className="text-white">0.00 USDC</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-neutral-500 uppercase">Impact</span>
                  <span className="text-emerald-500">0.00%</span>
                </div>
              </div>

              <button 
                type="submit" 
                className="w-full bg-white text-black font-bold py-5 rounded-2xl hover:bg-blue-50 transition-all transform active:scale-[0.98] shadow-[0_0_30px_rgba(255,255,255,0.05)] text-sm tracking-[0.2em] uppercase"
              >
                Execute Trade
              </button>
            </form>
          </div>

          <div className="p-6 rounded-2xl bg-[#0d1724]/60 border border-white/5">
            <h4 className="text-[10px] font-mono text-blue-400 uppercase tracking-widest mb-3">Protocol Mechanics</h4>
            <p className="text-[11px] leading-relaxed text-neutral-500 font-light">
              This terminal uses a <span className="text-neutral-300">Linear Bonding Curve</span>. Purchases are non-reversible. You will receive an <span className="text-blue-200">Allocation NFT</span> which acts as the collateral for PT/RT splitting in the Vault.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}