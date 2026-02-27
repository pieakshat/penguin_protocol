export default function Mechanism() {
    return (
      // Continuing the glacial gradient to prevent any new lines from appearing
      <section className="w-full py-32 bg-gradient-to-b from-[#0a111a] to-[#050505] relative z-20 font-sans overflow-hidden">
        
        {/* Side ambient light to keep the "blue" theme visible but sophisticated */}
        <div className="absolute -left-[10%] top-1/4 w-[500px] h-[500px] bg-blue-500/5 blur-[120px] pointer-events-none rounded-full" />
  
        <div className="max-w-[1200px] mx-auto px-6">
          
          <div className="mb-24 text-center md:text-left">
            <h2 className="text-4xl md:text-5xl font-medium text-white tracking-tight mb-6">
              The Protocol <span className="font-serif italic text-blue-200/40 font-light tracking-normal">Pipeline.</span>
            </h2>
            <p className="text-blue-100/30 font-light max-w-2xl leading-relaxed">
              From initial issuance to absolute yield stripping. The entire lifecycle is executed on-chain with zero counterparty risk and deterministic outcomes.
            </p>
          </div>
  
          <div className="relative flex flex-col md:flex-row gap-6 md:gap-10">
            {/* Faded connecting line */}
            <div className="hidden md:block absolute top-[4.5rem] left-[10%] w-[80%] h-[1px] bg-gradient-to-r from-transparent via-blue-500/20 to-transparent z-0" />
  
            <PipelineStep num="01" title="Bonding Curve Buy" desc="Deposit USDC into the continuous linear curve. Receive an Allocation NFT locking in your entry price." />
            <PipelineStep num="02" title="ARM Vault Deposit" desc="Stake your Allocation NFT into the ARM smart vault. The protocol securely reads your lockup metadata." />
            <PipelineStep num="03" title="Yield Stripping" desc="The vault mints 1:1 PT and RT tokens directly to your wallet for leveraged or stable exposure." />
          </div>
        </div>
      </section>
    );
  }
  
  function PipelineStep({ num, title, desc }: { num: string, title: string, desc: string }) {
    return (
      <div className="relative z-10 flex-1 bg-[#101926]/40 backdrop-blur-md border border-white/5 rounded-2xl p-8 hover:-translate-y-2 hover:border-blue-500/20 transition-all duration-500 group">
        <div className="relative z-10 w-12 h-12 rounded-full bg-[#0a111a] border border-white/10 flex items-center justify-center text-sm font-mono text-blue-200/40 group-hover:text-blue-200 transition-colors duration-300 mb-8">
          {num}
        </div>
        <h3 className="text-xl font-medium text-white mb-4 tracking-tight group-hover:text-blue-50 transition-colors">{title}</h3>
        <p className="text-sm text-blue-100/40 font-light leading-relaxed">{desc}</p>
      </div>
    );
  }