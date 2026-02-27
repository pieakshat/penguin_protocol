"use client";
import { TrendingUp, ShieldCheck, Wallet } from "lucide-react";

export function VaultStats() {
  const stats = [
    { 
      label: 'Vault TVL', 
      value: '$14.2M', 
      trend: '+12.4%', 
      icon: <ShieldCheck className="w-4 h-4 text-blue-400" />,
      description: 'Total Value Locked in ARM' 
    },
    { 
      label: 'Personal Position', 
      value: '42,069', 
      subValue: 'LCH', 
      icon: <Wallet className="w-4 h-4 text-white" />,
      description: 'Your staked allocation'
    },
    { 
      label: 'Avg. APY', 
      value: '18.2%', 
      trend: 'Predictive', 
      icon: <TrendingUp className="w-4 h-4 text-emerald-400" />,
      description: 'Next 24h forecast' 
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 relative">
      {/* Background ambient glow behind stats */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-blue-500/5 blur-[100px] pointer-events-none" />

      {stats.map((stat) => (
        <div key={stat.label} className="relative group overflow-hidden bg-[#101926]/60 backdrop-blur-2xl border border-white/5 rounded-[2rem] p-8 transition-all hover:border-blue-500/30">
          <div className="flex justify-between items-start mb-6">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:border-blue-500/30 transition-colors">
              {stat.icon}
            </div>
            {stat.trend && (
              <span className={`text-[10px] font-mono px-2 py-1 rounded-full border ${
                stat.trend.includes('+') ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5' : 'text-blue-400 border-blue-400/20 bg-blue-400/5'
              }`}>
                {stat.trend}
              </span>
            )}
          </div>
          
          <div className="space-y-1">
            <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-[0.2em]">{stat.label}</span>
            <div className="flex items-baseline gap-2">
              <h2 className="text-3xl font-mono font-medium text-white tracking-tighter">{stat.value}</h2>
              {stat.subValue && <span className="text-sm font-mono text-neutral-500">{stat.subValue}</span>}
            </div>
            <p className="text-[10px] text-neutral-600 font-light mt-2">{stat.description}</p>
          </div>

          {/* Glacial highlight on hover */}
          <div className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-blue-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      ))}
    </div>
  );
}