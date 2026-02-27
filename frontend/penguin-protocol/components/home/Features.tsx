export default function Features() {
    return (
      // Added a smooth vertical gradient that pulls out the deeper mountain blues
<section className="relative z-20 w-full py-40 bg-gradient-to-b from-transparent via-[#0d1724] to-[#0a111a] font-sans overflow-hidden">        
        {/* THE ICE GLOW: A massive ambient light behind the cards to make the blue visible and cinematic */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-[#1e3a5f]/30 blur-[180px] pointer-events-none rounded-full" />

<div className="relative z-10 max-w-[1200px] mx-auto px-6">
  {/* ... rest of your header and cards ... */}          
          {/* Section Header */}
          <div className="text-center mb-20 space-y-6">
            <h2 className="text-4xl md:text-5xl font-medium text-white tracking-tight drop-shadow-md">
              Engineered for <span className="font-serif italic text-blue-200/60 font-light tracking-normal">Volatility.</span>
            </h2>
            <p className="text-blue-100/40 max-w-2xl mx-auto font-light leading-relaxed">
              A completely new primitive for token launches. Separate your exposure based on your risk profile before TGE even happens.
            </p>
          </div>
  
          {/* Feature Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FeatureCard 
              step="01"
              title="Bonding Curve Issuance"
              description="Fair launch mechanics via continuous price discovery. Early buyers secure the lowest entry with zero insider cliffs or hidden allocations."
              icon={
                <svg className="w-6 h-6 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                </svg>
              }
            />
            <FeatureCard 
              step="02"
              title="ARM Yield Stripping"
              description="Deposit Allocation NFTs into the Vault. Mint Principal Tokens (PT) for stable downside protection, and Risk Tokens (RT) for leveraged upside."
              icon={
                <svg className="w-6 h-6 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                </svg>
              }
            />
            <FeatureCard 
              step="03"
              title="Perpetual Launch Markets"
              description="Trade speculative exposure to upcoming TGEs on the secondary market. RTs function as perpetual instruments for unreleased alpha."
              icon={
                <svg className="w-6 h-6 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                </svg>
              }
            />
          </div>
        </div>
      </section>
    );
  }
  
  // Sub-component for the sleek cards
  function FeatureCard({ title, description, icon, step }: { title: string, description: string, icon: React.ReactNode, step: string }) {
    return (
      // Cards now have a deeper blue tint and an icy blue border on hover
      <div className="relative group p-8 rounded-2xl bg-[#0e1724]/60 border border-white/5 hover:bg-[#121e30]/80 hover:border-blue-500/20 hover:shadow-[0_0_30px_rgba(59,130,246,0.1)] transition-all duration-500 flex flex-col h-full overflow-hidden backdrop-blur-sm">
        
        {/* Subtle hover glow inside the top of the card */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-blue-400/10 blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
  
        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center justify-between mb-8">
            <div className="w-12 h-12 rounded-full border border-white/10 bg-[#0a111a] flex items-center justify-center shadow-inner group-hover:border-blue-500/30 transition-colors duration-500">
              {icon}
            </div>
            <span className="text-xs font-mono text-blue-200/30 tracking-widest">{step}</span>
          </div>
          
          <h3 className="text-xl font-medium text-white mb-4 tracking-tight group-hover:text-blue-50 transition-colors duration-300">{title}</h3>
          <p className="text-sm text-blue-100/50 leading-relaxed font-light flex-grow">
            {description}
          </p>
        </div>
      </div>
    );
  }