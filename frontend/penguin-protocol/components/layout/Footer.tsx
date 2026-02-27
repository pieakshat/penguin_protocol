import Link from 'next/link';

export default function Footer() {
  return (
<footer className="w-full bg-black border-t border-white/5 pt-16 pb-8 font-sans relative z-20">      <div className="max-w-[1200px] mx-auto px-6">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-10 mb-16">
          {/* Brand/Logo Area */}
          <div className="flex flex-col gap-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                <div className="w-1.5 h-1.5 bg-black rounded-full" />
              </div>
              <span className="font-medium text-lg tracking-tight text-white">Penguin Protocol</span>
            </Link>
            <p className="text-xs text-neutral-500 font-light max-w-xs">
              Isolate Principal. Trade Volatility. <br />
              The derivative-native bonding curve.
            </p>
          </div>

          {/* Links Grid */}
          <div className="flex gap-16">
            <div className="flex flex-col gap-3">
              <span className="text-xs font-mono text-white tracking-widest uppercase mb-1">Protocol</span>
              <Link href="/launch" className="text-sm text-neutral-400 hover:text-white transition-colors">Launchpad</Link>
              <Link href="/vault" className="text-sm text-neutral-400 hover:text-white transition-colors">ARM Vault</Link>
              <Link href="/markets" className="text-sm text-neutral-400 hover:text-white transition-colors">RT Markets</Link>
            </div>
            
            <div className="flex flex-col gap-3">
              <span className="text-xs font-mono text-white tracking-widest uppercase mb-1">Developers</span>
              <a href="#" className="text-sm text-neutral-400 hover:text-white transition-colors">Documentation</a>
              <a href="#" className="text-sm text-neutral-400 hover:text-white transition-colors">GitHub</a>
              <a href="#" className="text-sm text-neutral-400 hover:text-white transition-colors">Smart Contracts</a>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="w-full pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-neutral-600 font-light">
            &copy; {new Date().getFullYear()} Penguin Protocol. All rights reserved.
          </p>
          
          <div className="flex items-center gap-4 text-neutral-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-mono">All Systems Operational</span>
          </div>
        </div>

      </div>
    </footer>
  );
}