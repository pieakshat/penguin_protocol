"use client";
export default function OrderBook() {
  const asks = [{ p: "0.845", a: "1,200", total: "1,200" }, { p: "0.844", a: "800", total: "2,000" }];
  const bids = [{ p: "0.841", a: "500", total: "500" }, { p: "0.840", a: "1,500", total: "2,000" }];

  return (
    <div className="bg-[#101926]/40 border-l border-white/5 h-full flex flex-col font-mono text-[11px]">
      <div className="p-4 border-b border-white/5 uppercase text-neutral-500 tracking-widest text-[10px]">Order Book</div>
      
      {/* Asks (Sells) */}
      <div className="flex-1 p-2 space-y-1">
        {asks.map((a, i) => (
          <div key={i} className="flex justify-between text-red-400/80 hover:bg-red-400/5 px-2 py-0.5 rounded cursor-pointer">
            <span>{a.p}</span>
            <span className="text-neutral-400">{a.a}</span>
          </div>
        ))}
      </div>

      <div className="p-4 text-center border-y border-white/5 bg-white/[0.02]">
        <span className="text-lg font-medium text-white">$0.842</span>
      </div>

      {/* Bids (Buys) */}
      <div className="flex-1 p-2 space-y-1">
        {bids.map((b, i) => (
          <div key={i} className="flex justify-between text-emerald-400/80 hover:bg-emerald-400/5 px-2 py-0.5 rounded cursor-pointer">
            <span>{b.p}</span>
            <span className="text-neutral-400">{b.a}</span>
          </div>
        ))}
      </div>
    </div>
  );
}