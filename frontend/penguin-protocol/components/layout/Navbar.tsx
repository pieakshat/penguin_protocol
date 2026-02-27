import Link from 'next/link';

export default function Navbar() {
  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-[1200px] px-6">
      <nav className="nav-pill flex items-center justify-between px-6 py-3">
        
        {/* Logo & Left Links */}
        <div className="flex items-center gap-10">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center">
              <div className="w-2 h-2 bg-black rounded-full" />
            </div>
            <span className="font-medium text-lg tracking-tight text-white">Penguin</span>
          </Link>
          
          <div className="hidden md:flex gap-6 text-sm text-neutral-400">
            <Link href="/" className="text-white">Home</Link>
            <Link href="/launch" className="hover:text-white transition-colors">Launchpad</Link>
            <Link href="/markets" className="hover:text-white transition-colors">Markets</Link>
            <Link href="/docs" className="hover:text-white transition-colors flex items-center gap-1">
              Resources 
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
            </Link>
          </div>
        </div>

        {/* Right Side: Protocol Stats & App Button */}
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-4 text-xs text-neutral-400 border border-white/10 rounded-full px-4 py-1.5 bg-white/5">
            <span className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
              $14.2M <span className="text-neutral-600">|</span>
            </span>
            <span className="flex items-center gap-1.5 text-white">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              12.4% APY
            </span>
          </div>
          
          <Link href="/launch">
            <button className="btn-outline">Launch App</button>
          </Link>
        </div>

      </nav>
    </div>
  );
}