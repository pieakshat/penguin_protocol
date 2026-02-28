'use client';

import { ScenarioParams } from '@/engine/types';

interface Props {
  params: ScenarioParams;
  onChange: (p: ScenarioParams) => void;
  onRun: () => void;
  loading: boolean;
}

function Slider({
  label, value, min, max, step, onChange, format,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  const fmt = format ?? ((v) => v.toLocaleString());
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{label}</span>
        <span className="font-mono text-gray-200">{fmt(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-700 rounded appearance-none cursor-pointer accent-blue-500"
      />
    </div>
  );
}

export function ConfigPanel({ params, onChange, onRun, loading }: Props) {
  const set = <K extends keyof ScenarioParams>(key: K, value: ScenarioParams[K]) =>
    onChange({ ...params, [key]: value });

  return (
    <div className="w-64 min-w-[16rem] bg-gray-900 border-r border-gray-700 p-4 overflow-y-auto flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-2">Config</h2>

      {/* Auction */}
      <div className="text-xs text-blue-400 font-semibold mb-1">Auction</div>
      <Slider label="Total Supply" value={params.totalSupply} min={100_000} max={10_000_000} step={100_000}
        onChange={v => set('totalSupply', v)} format={v => `${(v / 1e6).toFixed(1)}M`} />
      <Slider label="Min Price (USDC)" value={params.minPrice} min={0.01} max={1.0} step={0.01}
        onChange={v => set('minPrice', v)} format={v => `$${v.toFixed(2)}`} />
      <Slider label="Bid Count" value={params.bidCount} min={20} max={500} step={10}
        onChange={v => set('bidCount', v)} />
      <div className="mb-3">
        <div className="text-xs text-gray-400 mb-1">Bid Distribution</div>
        <select
          value={params.bidDistribution}
          onChange={e => set('bidDistribution', e.target.value as ScenarioParams['bidDistribution'])}
          className="w-full bg-gray-800 text-gray-200 text-xs rounded px-2 py-1 border border-gray-600"
        >
          <option value="powerlaw">Power Law</option>
          <option value="random">Log-uniform</option>
          <option value="uniform">Uniform</option>
        </select>
      </div>

      {/* Settlement */}
      <div className="text-xs text-blue-400 font-semibold mb-1">Settlement</div>
      <Slider label="RT Cap Multiplier" value={params.rtCapMultiplier} min={1} max={20} step={0.5}
        onChange={v => set('rtCapMultiplier', v)} format={v => `${v}x`} />
      <Slider label="TGE Price (USDC)" value={params.tgePrice} min={0.05} max={5.0} step={0.05}
        onChange={v => set('tgePrice', v)} format={v => `$${v.toFixed(2)}`} />
      <Slider label="RT Reserve (USDC)" value={params.rtReserve} min={10_000} max={1_000_000} step={10_000}
        onChange={v => set('rtReserve', v)} format={v => `$${(v / 1000).toFixed(0)}k`} />

      {/* Trading */}
      <div className="text-xs text-blue-400 font-semibold mb-1">Traders</div>
      <Slider label="Random Traders" value={params.traderCount.random} min={0} max={20} step={1}
        onChange={v => set('traderCount', { ...params.traderCount, random: v })} />
      <Slider label="Momentum Traders" value={params.traderCount.momentum} min={0} max={20} step={1}
        onChange={v => set('traderCount', { ...params.traderCount, momentum: v })} />
      <Slider label="Arb Bots" value={params.traderCount.arb} min={0} max={10} step={1}
        onChange={v => set('traderCount', { ...params.traderCount, arb: v })} />
      <Slider label="Trading Days" value={params.tradingDays} min={1} max={30} step={1}
        onChange={v => set('tradingDays', v)} format={v => `${v}d`} />

      <div className="mt-auto pt-4">
        <button
          onClick={onRun}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-semibold py-2 rounded transition-colors"
        >
          {loading ? 'Simulating...' : 'Run Simulation ▶'}
        </button>
      </div>
    </div>
  );
}
