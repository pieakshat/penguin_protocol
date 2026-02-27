export default function Footer() {
  return (
    <footer className="w-full bg-[#0a111a] border-t border-white/5 pt-20 pb-10 px-10">
      <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-16">
        
        <div className="col-span-2 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full bg-white shadow-[0_0_15px_rgba(255,255,255,0.4)]" />
            <span className="font-medium tracking-tighter text-lg">Penguin Protocol</span>
          </div>
          <p className="text-xs text-neutral-500 max-w-sm leading-relaxed font-light">
            The institutional standard for principal isolation and volatility trading. 
            Engineered for high-fidelity yield optimization.
          </p>
        </div>

        <div className="space-y-4">
          <h4 className="text-[10px] font-mono text-neutral-400 uppercase tracking-[0.2em] font-bold">Terminal</h4>
          <ul className="space-y-3 text-[11px] text-neutral-500 font-mono">
            <li className="hover:text-blue-400 cursor-pointer transition-colors uppercase">Launchpad</li>
            <li className="hover:text-blue-400 cursor-pointer transition-colors uppercase">ARM Vaults</li>
            <li className="hover:text-blue-400 cursor-pointer transition-colors uppercase">Orderbooks</li>
          </ul>
        </div>

        <div className="space-y-4">
          <h4 className="text-[10px] font-mono text-neutral-400 uppercase tracking-[0.2em] font-bold">Socials</h4>
          <ul className="space-y-3 text-[11px] text-neutral-500 font-mono">
            <li className="hover:text-blue-400 cursor-pointer transition-colors uppercase">Twitter / X</li>
            <li className="hover:text-blue-400 cursor-pointer transition-colors uppercase">Discord</li>
          </ul>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto mt-20 pt-8 border-t border-white/5 flex justify-between items-center text-[9px] font-mono text-neutral-600 uppercase tracking-[0.3em]">
        <span>© 2026 PENGUIN PROTOCOL</span>
        <span>DEPLOYED ON TUNDRA_MAINNET</span>
      </div>
    </footer>
  );
}