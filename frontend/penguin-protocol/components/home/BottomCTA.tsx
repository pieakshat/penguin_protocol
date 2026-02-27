import Link from 'next/link';

export default function BottomCTA() {
  return (
    <section className="w-full py-40 bg-gradient-to-b from-[#050505] to-black relative z-20 font-sans overflow-hidden">
      
      {/* Large, very soft bottom-center glow to highlight the button */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-500/10 blur-[150px] pointer-events-none rounded-full" />

      <div className="relative z-10 max-w-[800px] mx-auto px-6 text-center space-y-10">
        <h2 className="text-5xl md:text-7xl font-medium tracking-tighter text-white leading-[1.1]">
          Stop launching in <br />
          <span className="font-serif italic font-light text-blue-200/30">the dark.</span>
        </h2>
        
        <p className="text-lg text-blue-100/30 font-light max-w-xl mx-auto">
          Deploy your capital with precision. Isolate your principal and trade the volatility of unreleased alpha today.
        </p>

        <div className="pt-8">
          <Link href="/launch">
            <button className="bg-white text-black px-10 py-4 rounded-full text-base font-semibold hover:bg-blue-50 hover:scale-[1.05] transition-all duration-500 shadow-[0_0_50px_rgba(255,255,255,0.1)]">
              Launch Application
            </button>
          </Link>
        </div>
      </div>
    </section>
  );
}