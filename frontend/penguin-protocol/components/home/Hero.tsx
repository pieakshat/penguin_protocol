import Link from 'next/link';
import { ROUTES } from '@/constants/routes';

export default function Hero() {
  return (
<section className="relative flex flex-col items-center justify-center min-h-screen pt-24 pb-12 w-full font-sans text-center bg-transparent">      
      {/* THE FIX: Replaced the muddy blur with a very soft, wide radial gradient
          that just slightly dims the bright snow behind the text without looking like a stain.
      */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[1000px] h-[500px] bg-[radial-gradient(ellipse_at_center,_rgba(0,0,0,0.4)_0%,_rgba(0,0,0,0)_70%)] pointer-events-none" />

      <div className="relative z-10 max-w-[900px] flex flex-col items-center space-y-8">
        
        {/* Status Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/15 bg-black/20 backdrop-blur-md text-xs font-mono tracking-wide text-neutral-300 shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          V1 MAINNET IS LIVE
        </div>

        {/* Main Headline - Added stronger drop shadows so the text pops off the snow */}
        <h1 className="text-6xl sm:text-7xl md:text-[6.5rem] font-medium tracking-tighter text-white leading-[1.05] drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]">
          Isolate Principal. <br />
          <span className="font-serif italic font-light tracking-normal text-neutral-300 drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]">
            Trade Volatility.
          </span>
        </h1>
        
        {/* Subheadline */}
        <p className="text-lg md:text-xl text-neutral-300 max-w-2xl leading-relaxed font-light drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] mx-auto">
          The first derivative-native bonding curve. Strip your token allocations into <span className="text-white font-mono text-sm px-1.5 py-0.5 rounded bg-black/30 border border-white/10">PT</span> for stability and <span className="text-white font-mono text-sm px-1.5 py-0.5 rounded bg-black/30 border border-white/10">RT</span> for pure leverage.
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-8 pt-6">
        <Link href={ROUTES.LAUNCH}>            <button className="bg-white text-black px-8 py-3.5 rounded-full text-sm font-semibold hover:bg-neutral-200 hover:scale-[1.02] transition-all duration-300 flex items-center gap-2 shadow-[0_0_30px_rgba(255,255,255,0.2)]">
              Launch App
            </button>
          </Link>
          
          <Link href="/docs" className="group flex items-center gap-2 text-sm font-medium text-neutral-300 hover:text-white transition-colors duration-300 drop-shadow-md">
            Read Documentation 
            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>
        </div>

      </div>
    </section>
  );
}