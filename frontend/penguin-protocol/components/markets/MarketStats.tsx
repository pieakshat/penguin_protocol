"use client";
export default function MarketStats() {
  return (
    <div className="w-full bg-[#0d1724]/60 backdrop-blur-xl border-b border-white/5 py-4 px-8 flex items-center gap-12 overflow-x-auto no-scrollbar">
      <div className="flex flex-col">
        <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Market</span>
        <span className="text-sm font-medium text-white">LCH / USDC</span>
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Mark Price</span>
        <span className="text-sm font-mono text-blue-400">$0.842</span>
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">24h Change</span>
        <span className="text-sm font-mono text-emerald-400">+12.42%</span>
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">24h Volume</span>
        <span className="text-sm font-mono text-white">$1.24M</span>
      </div>
    </div>
  );
}