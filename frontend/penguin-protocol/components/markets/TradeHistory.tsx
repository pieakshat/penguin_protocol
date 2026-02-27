import MarketStats from "@/components/markets/MarketStats";
import OrderBook from "@/components/markets/OrderBook";
import TradeHistory from "@/components/markets/TradeHistory"; // Create this similarly
import BondingCurveChart from "@/components/ui/BondingCurveChart";

export default function MarketsPage() {
  return (
    <div className="min-h-screen pt-20 flex flex-col bg-[#0a111a] font-sans">
      <MarketStats />
      
      <div className="flex-1 grid grid-cols-12 overflow-hidden">
        {/* LEFT: Charting Area */}
        <div className="col-span-12 lg:col-span-7 border-r border-white/5 p-6 flex flex-col">
          <div className="flex-1 min-h-[500px] bg-[#0d1724]/40 rounded-3xl p-4 border border-white/5">
            <BondingCurveChart />
          </div>
          
          {/* PT/RT Market Toggle */}
          <div className="mt-6 flex gap-4">
            <button className="px-6 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-mono uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all">Trade Principal (PT)</button>
            <button className="px-6 py-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-mono uppercase tracking-widest hover:bg-orange-500 hover:text-white transition-all">Trade Risk (RT)</button>
          </div>
        </div>

        {/* MIDDLE: Order Book */}
        <div className="hidden lg:block col-span-3 h-full">
          <OrderBook />
        </div>

        {/* RIGHT: Trading Panel */}
        <div className="col-span-12 lg:col-span-2 border-l border-white/5 bg-[#101926]/20 p-6">
           <div className="space-y-6">
              <div className="flex gap-2">
                <button className="flex-1 py-2 bg-emerald-500 text-black text-[10px] font-bold uppercase rounded">Buy</button>
                <button className="flex-1 py-2 bg-white/5 text-neutral-500 text-[10px] font-bold uppercase rounded">Sell</button>
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-neutral-600 uppercase">Price</label>
                <input type="text" placeholder="0.842" className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white font-mono text-sm" />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-mono text-neutral-600 uppercase">Amount</label>
                <input type="text" placeholder="0.00" className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white font-mono text-sm" />
              </div>

              <button className="w-full py-4 bg-white text-black text-xs font-bold uppercase rounded-xl hover:scale-[1.02] transition-transform">Place Order</button>
           </div>
        </div>
      </div>
    </div>
  );
}