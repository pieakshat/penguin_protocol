"use client";
import dynamic from "next/dynamic";
import MarketStats from "@/components/markets/MarketStats";
import OrderBook from "@/components/markets/OrderBook";

// Dynamic import to prevent SSR issues with the chart
const BondingCurveChart = dynamic(() => import("@/components/ui/BondingCurveChart"), { 
  ssr: false,
  loading: () => <div className="w-full h-full bg-blue-500/5 animate-pulse rounded-3xl" />
});

export default function MarketsPage() {
  return (
    <div className="min-h-screen pt-20 flex flex-col bg-[#0a111a] font-sans">
      <MarketStats />
      
      <div className="flex-1 grid grid-cols-12 overflow-hidden border-t border-white/5">
        
        {/* LEFT: Trading Charts & Toggles */}
        <div className="col-span-12 lg:col-span-8 p-6 flex flex-col space-y-6">
          <div className="flex-1 bg-[#0d1724]/40 rounded-[2rem] p-6 border border-white/5 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 flex gap-2">
               <span className="px-2 py-1 bg-blue-500/10 border border-blue-500/20 text-[9px] text-blue-400 font-mono rounded">1H</span>
               <span className="px-2 py-1 bg-white/5 text-[9px] text-neutral-500 font-mono rounded">1D</span>
            </div>
            <BondingCurveChart />
          </div>
          
          {/* Secondary Stats Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
             <MarketInfoBox label="Market Cap" value="$1.2M" />
             <MarketInfoBox label="Circulating" value="1.42M LCH" />
             <MarketInfoBox label="Liquidity" value="$420K" />
             <MarketInfoBox label="Vol (24h)" value="$12.4K" />
          </div>
        </div>

        {/* RIGHT: Order Book Sidebar */}
        <div className="hidden lg:block lg:col-span-4 h-full shadow-2xl">
          <OrderBook />
        </div>

      </div>
    </div>
  );
}

function MarketInfoBox({ label, value }: { label: string, value: string }) {
  return (
    <div className="p-4 rounded-2xl bg-[#101926]/40 border border-white/5">
      <span className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest block mb-1">{label}</span>
      <span className="text-sm font-medium text-white">{value}</span>
    </div>
  );
}