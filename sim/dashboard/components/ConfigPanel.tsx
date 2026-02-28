'use client';

import { useState } from 'react';
import { ScenarioParams } from '@/engine/types';

interface Props {
  params: ScenarioParams;
  onChange: (p: ScenarioParams) => void;
  onRun: () => void;
  loading: boolean;
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function Tooltip({ text }: { text: string }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function handleMouseEnter(e: React.MouseEvent<HTMLSpanElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({ top: rect.top, left: rect.right + 8 });
  }

  return (
    <span className="relative inline-flex items-center ml-1">
      <span
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setPos(null)}
        className="text-gray-600 hover:text-gray-400 cursor-help text-[10px] leading-none select-none"
      >
        ?
      </span>
      {pos && (
        <span
          style={{ position: 'fixed', top: pos.top, left: pos.left }}
          className="z-[9999] w-56 bg-gray-950 border border-gray-600 text-gray-300 text-[11px] leading-relaxed rounded px-2.5 py-2 shadow-xl pointer-events-none"
        >
          {text}
        </span>
      )}
    </span>
  );
}

// ─── Slider ───────────────────────────────────────────────────────────────────

function Slider({
  label, value, min, max, step, onChange, format, tooltip,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string; tooltip: string;
}) {
  const fmt = format ?? ((v) => v.toLocaleString());
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span className="flex items-center">
          {label}
          <Tooltip text={tooltip} />
        </span>
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

// ─── Select with tooltip ──────────────────────────────────────────────────────

function SelectField({
  label, value, onChange, options, tooltip,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; tooltip: string;
}) {
  return (
    <div className="mb-3">
      <div className="text-xs text-gray-400 mb-1 flex items-center">
        {label}
        <Tooltip text={tooltip} />
      </div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-gray-800 text-gray-200 text-xs rounded px-2 py-1 border border-gray-600"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function ConfigPanel({ params, onChange, onRun, loading }: Props) {
  const set = <K extends keyof ScenarioParams>(key: K, value: ScenarioParams[K]) =>
    onChange({ ...params, [key]: value });

  return (
    <div className="w-64 min-w-[16rem] bg-gray-900 border-r border-gray-700 p-4 overflow-y-auto flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-2">Config</h2>

      {/* ── Auction ── */}
      <div className="text-xs text-blue-400 font-semibold mb-1">Auction</div>

      <Slider
        label="Total Supply"
        value={params.totalSupply}
        min={100_000} max={10_000_000} step={100_000}
        onChange={v => set('totalSupply', v)}
        format={v => `${(v / 1e6).toFixed(1)}M`}
        tooltip="Total number of project tokens being sold in the auction. All tokens are sold at a single clearing price — the lowest price where cumulative demand meets this supply."
      />

      <Slider
        label="Min Price (USDC)"
        value={params.minPrice}
        min={0.01} max={1.0} step={0.01}
        onChange={v => set('minPrice', v)}
        format={v => `$${v.toFixed(2)}`}
        tooltip="Floor price per token. Bids below this are rejected outright. The clearing price can never be below this value. If demand is weak, the clearing price lands here."
      />

      <Slider
        label="Bid Count"
        value={params.bidCount}
        min={20} max={500} step={10}
        onChange={v => set('bidCount', v)}
        tooltip="Number of synthetic bidders to generate. Each bidder gets a random price and quantity drawn from the chosen distribution. Max on-chain is 500 bids."
      />

      <SelectField
        label="Bid Distribution"
        value={params.bidDistribution}
        onChange={v => set('bidDistribution', v as ScenarioParams['bidDistribution'])}
        tooltip="How bid prices are spread across the price range. Power Law: most bids near the floor, a few aggressive whales at high prices (most realistic). Log-uniform: evenly spread on a log scale. Uniform: perfectly even spread."
        options={[
          { value: 'powerlaw', label: 'Power Law' },
          { value: 'random',   label: 'Log-uniform' },
          { value: 'uniform',  label: 'Uniform' },
        ]}
      />

      {/* ── Settlement ── */}
      <div className="text-xs text-blue-400 font-semibold mb-1">Settlement</div>

      <Slider
        label="RT Cap Multiplier"
        value={params.rtCapMultiplier}
        min={1} max={20} step={0.5}
        onChange={v => set('rtCapMultiplier', v)}
        format={v => `${v}x`}
        tooltip="Caps the maximum RT payout. RT pays out: max(0, min(TGE price, clearingPrice × cap) − clearingPrice). At 5x: if clearing was $0.10, RT maxes out at $0.40/token regardless of how high TGE price goes. Higher cap = more upside for RT holders, more liability for the protocol."
      />

      <Slider
        label="TGE Price (USDC)"
        value={params.tgePrice}
        min={0.05} max={5.0} step={0.05}
        onChange={v => set('tgePrice', v)}
        format={v => `$${v.toFixed(2)}`}
        tooltip="The market price of the LaunchToken at TGE. This drives RT payout: if TGE price > clearing price, RT holders profit. If TGE price ≤ clearing price, RT pays out $0. PT holders always get tokens 1:1 regardless."
      />

      <Slider
        label="RT Reserve (USDC)"
        value={params.rtReserve}
        min={10_000} max={1_000_000} step={10_000}
        onChange={v => set('rtReserve', v)}
        format={v => `$${(v / 1000).toFixed(0)}k`}
        tooltip="USDC the protocol deposits to fund RT payouts. If the reserve is less than the total RT liability, payouts are pro-rated: everyone gets the same fraction. If the reserve is more than enough, the rate is uncapped and any unused USDC is returned."
      />

      {/* ── Traders ── */}
      <div className="text-xs text-blue-400 font-semibold mb-1">Traders</div>

      <Slider
        label="Random Traders"
        value={params.traderCount.random}
        min={0} max={20} step={1}
        onChange={v => set('traderCount', { ...params.traderCount, random: v })}
        tooltip="Noise traders. Each step they have a 50% chance to trade. Pool, direction (buy/sell), and size are all random. They add volume and randomness to price but have no edge — expect near-zero long-run P&L."
      />

      <Slider
        label="Momentum Traders"
        value={params.traderCount.momentum}
        min={0} max={20} step={1}
        onChange={v => set('traderCount', { ...params.traderCount, momentum: v })}
        tooltip="Trend-followers. They look back 3 steps: if price rose they buy, if it fell they sell. Size scales with the strength of the move. They amplify trends and increase volatility. Profitable in trending markets, lose in choppy ones."
      />

      <Slider
        label="Arb Bots"
        value={params.traderCount.arb}
        min={0} max={10} step={1}
        onChange={v => set('traderCount', { ...params.traderCount, arb: v })}
        tooltip="Arbitrageurs. They compare PT and RT prices to their theoretical fair values (PT ≈ clearing price, RT ≈ expected payout). When price deviates > 2% from fair value, they trade toward it. They dampen volatility and keep prices rational."
      />

      <Slider
        label="Trading Days"
        value={params.tradingDays}
        min={1} max={30} step={1}
        onChange={v => set('tradingDays', v)}
        format={v => `${v}d`}
        tooltip="Length of the simulated trading window between ARM vault opening and TGE. Each day = 24 discrete time steps (hourly). Longer windows give momentum traders more time to amplify trends and arb bots more time to correct mispricing."
      />

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
