// components/vault/ARMSplitter.tsx
export function ARMSplitter({ selectedNftId }: { selectedNftId: string | null }) {
    return (
      <div className="sticky top-32 bg-[#0d1724]/80 border border-blue-500/20 rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden backdrop-blur-3xl">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-blue-500/40 blur-[15px]" />
        
        <div className="text-center mb-10">
          <h3 className="text-xl font-medium text-white uppercase tracking-[0.2em] mb-2">ARM Strategy</h3>
          <p className="text-xs text-neutral-500 font-light leading-relaxed">
            The Automated Risk Manager strips yield from your allocation into <span className="text-blue-300 font-medium">Principal Tokens</span> for safety and <span className="text-orange-400 font-medium">Risk Tokens</span> for leverage.
          </p>
        </div>
  
        {selectedNftId ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-6 rounded-3xl bg-emerald-500/5 border border-emerald-500/20 text-center space-y-2 group hover:bg-emerald-500/10 transition-colors">
                <span className="text-[10px] font-mono text-emerald-500 uppercase tracking-widest">Receive PT</span>
                <div className="text-xl font-mono text-white">4,200.00</div>
                <p className="text-[9px] text-neutral-600 uppercase">Guaranteed</p>
              </div>
              <div className="p-6 rounded-3xl bg-orange-500/5 border border-orange-500/20 text-center space-y-2 group hover:bg-orange-500/10 transition-colors">
                <span className="text-[10px] font-mono text-orange-500 uppercase tracking-widest">Receive RT</span>
                <div className="text-xl font-mono text-white">0.824</div>
                <p className="text-[9px] text-neutral-600 uppercase">Leveraged</p>
              </div>
            </div>
  
            <button className="w-full py-5 bg-white text-black font-bold rounded-2xl text-[11px] tracking-[0.3em] uppercase hover:bg-blue-50 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_20px_40px_rgba(255,255,255,0.1)]">
              Execute Protocol Split
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