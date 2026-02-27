"use client";
import { buyTokens } from "@/app/actions/trade";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LaunchPage() {
  const { authenticated, ready, login } = usePrivy();
  const router = useRouter();

  // Protect the route: If not logged in, show a "Connect" screen
  if (ready && !authenticated) {
    return (
      <div className="relative min-h-screen flex items-center justify-center font-sans overflow-hidden">
        {/* Background Blur Overlay */}
        <div className="absolute inset-0 bg-[#0a111a]/80 backdrop-blur-md z-0" />
        
        <div className="relative z-10 text-center space-y-6">
          <h1 className="text-4xl font-medium text-white tracking-tight">Access Terminal</h1>
          <p className="text-neutral-400 max-w-xs mx-auto font-light">
            Please connect your wallet to access the Penguin Protocol launchpad.
          </p>
          <button 
            onClick={login}
            className="bg-white text-black px-10 py-4 rounded-full font-bold hover:bg-blue-50 transition-all shadow-xl"
          >
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pt-32 pb-20 px-6 font-sans overflow-hidden">
      
      {/* Background Mask: Keeps the penguin vibe but dims it for the app */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a111a]/60 via-[#0a111a]/90 to-[#0a111a] z-0" />

      <div className="relative z-10 max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT SIDE: Price Chart Terminal */}
        <div className="lg:col-span-8 bg-[#101926]/40 backdrop-blur-3xl border border-white/5 rounded-3xl p-8 h-[600px] flex flex-col group shadow-2xl">
          <div className="flex justify-between items-start mb-10">
            <div>
              <h2 className="text-2xl font-medium text-white tracking-tight">LCH / USDC</h2>
              <p className="text-xs font-mono text-blue-400/60 uppercase tracking-[0.2em] mt-1">Bonding Curve v1.0</p>
            </div>
            <div className="flex gap-4">
              <div className="text-right">
                <span className="block text-[10px] font-mono text-neutral-500 uppercase">Current Price</span>
                <span className="text-xl font-medium text-white font-mono">$0.842</span>
              </div>
              <div className="text-right">
                <span className="block text-[10px] font-mono text-neutral-500 uppercase">Curve Progress</span>
                <span className="text-xl font-medium text-emerald-400 font-mono">64.2%</span>
              </div>
            </div>
          </div>

          {/* Faux Chart Visual */}
          <div className="flex-1 relative border-l border-b border-white/5 flex items-end">
            <div className="absolute bottom-0 left-0 w-full h-[60%] bg-gradient-to-t from-blue-500/10 to-transparent" />
            <svg className="w-full h-full text-blue-500/30" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d="M0,100 L20,85 L40,75 L60,50 L80,30 L100,5" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </svg>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-mono text-blue-200/10 tracking-[0.5em] uppercase">
              Streaming Market Data
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: Buy Panel */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#101926]/80 backdrop-blur-2xl border border-blue-500/20 rounded-3xl p-8 shadow-2xl">
            <div className="flex items-center gap-2 mb-8">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="text-lg font-medium text-white">Purchase LCH</h3>
            </div>
            
            <form action={buyTokens} className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between px-1">
                  <label className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Amount</label>
                  <span className="text-[10px] font-mono text-neutral-500 uppercase">Balance: 0.00</span>
                </div>
                <div className="relative">
                  <input 
                    name="amount"
                    type="number" 
                    placeholder="0.00"
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-5 text-2xl text-white focus:outline-none focus:border-blue-500/40 transition-all font-medium placeholder:text-neutral-800"
                    required
                  />
                  <button type="button" className="absolute right-5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-blue-400 hover:text-white transition-colors bg-blue-500/10 px-2 py-1 rounded">MAX</button>
                </div>
              </div>

              <div className="p-5 bg-white/[0.03] rounded-2xl border border-white/5 space-y-4">
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-500">You Pay</span>
                  <span className="text-white font-mono">0.00 USDC</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-500">Allocation NFT ID</span>
                  <span className="text-blue-400 font-mono">Pending...</span>
                </div>
              </div>

              <button 
                type="submit" 
                className="w-full bg-white text-black font-bold py-5 rounded-2xl hover:bg-blue-50 transition-all transform active:scale-[0.98] shadow-lg text-sm tracking-widest uppercase"
              >
                Execute Transaction
              </button>
            </form>
          </div>

          <div className="p-6 rounded-2xl bg-[#0d1724]/60 border border-white/5">
            <h4 className="text-xs font-semibold text-white mb-2 uppercase tracking-tight">Market Rules</h4>
            <p className="text-[11px] leading-relaxed text-neutral-500 font-light">
              This is a <span className="text-neutral-300">Linear Bonding Curve</span>. Prices increase as supply is minted. Each buy issues a unique <span className="text-blue-400">Allocation NFT</span> which is required to enter the ARM Vaults for PT/RT yield stripping.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}