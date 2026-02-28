'use client';

import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend,
  ReferenceDot, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { PoolSnapshot, TradeEvent } from '@/engine/types';

interface Props {
  ptSnapshots: PoolSnapshot[];
  rtSnapshots: PoolSnapshot[];
  trades: TradeEvent[];
  clearingPrice: number;
}

// Custom dot for trade markers
function TradeDot(props: { cx?: number; cy?: number; payload?: PoolSnapshot & { hasBuy?: boolean; hasSell?: boolean } }) {
  const { cx, cy, payload } = props;
  if (!cx || !cy || !payload) return null;
  if (payload.hasBuy) return <polygon points={`${cx},${cy - 6} ${cx - 5},${cy + 3} ${cx + 5},${cy + 3}`} fill="#22c55e" />;
  if (payload.hasSell) return <polygon points={`${cx},${cy + 6} ${cx - 5},${cy - 3} ${cx + 5},${cy - 3}`} fill="#ef4444" />;
  return null;
}

export function PoolPriceChart({ ptSnapshots, rtSnapshots, trades, clearingPrice }: Props) {
  // Build a combined time series
  const len = Math.max(ptSnapshots.length, rtSnapshots.length);

  // Aggregate trade events by time step
  const buysByStep = new Map<string, boolean>();
  const sellsByStep = new Map<string, boolean>();
  for (const t of trades) {
    const key = `${t.pool}-${t.t}`;
    if (t.direction === 'buy') buysByStep.set(key, true);
    else sellsByStep.set(key, true);
  }

  const ptData = ptSnapshots.map((s, i) => ({
    t: s.t,
    ptPrice: s.price,
    ptVolume: s.volume1,
    hasBuy: buysByStep.get(`PT-${s.t}`),
    hasSell: sellsByStep.get(`PT-${s.t}`),
  }));

  const rtData = rtSnapshots.map((s, i) => ({
    t: s.t,
    rtPrice: s.price,
    rtVolume: s.volume1,
    hasBuy: buysByStep.get(`RT-${s.t}`),
    hasSell: sellsByStep.get(`RT-${s.t}`),
  }));

  const hourLabel = (v: number) => {
    if (v < 0) return 'Start';
    const day = Math.floor(v / 24);
    const hour = v % 24;
    return hour === 0 ? `Day ${day + 1}` : '';
  };

  return (
    <div className="space-y-4">
      {/* PT Pool */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-1">PT / USDC Price</h3>
        <p className="text-xs text-gray-500 mb-3">Principal Token — should trade near clearing price</p>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={ptData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="t" tickFormatter={hourLabel} tick={{ fontSize: 10, fill: '#9ca3af' }} />
            <YAxis yAxisId="price" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={v => `$${v.toFixed(3)}`} />
            <YAxis yAxisId="vol" orientation="right" tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
              formatter={(v: number | undefined, name: string | undefined) => [name?.includes('rice') ? `$${(v ?? 0).toFixed(4)}` : `${((v ?? 0) / 1000).toFixed(1)}k`, name]}
            />
            <Bar yAxisId="vol" dataKey="ptVolume" fill="#1d4ed8" opacity={0.4} name="Volume" />
            <Line yAxisId="price" type="monotone" dataKey="ptPrice" stroke="#60a5fa" strokeWidth={2} dot={false} name="PT Price" />
            <ReferenceDot yAxisId="price" x={ptData[0]?.t} y={clearingPrice}
              r={0} label={{ value: `CP $${clearingPrice.toFixed(3)}`, fill: '#f59e0b', fontSize: 10 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* RT Pool */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-1">RT / USDC Price</h3>
        <p className="text-xs text-gray-500 mb-3">Risk Token — pure upside, starts near zero</p>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={rtData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="t" tickFormatter={hourLabel} tick={{ fontSize: 10, fill: '#9ca3af' }} />
            <YAxis yAxisId="price" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={v => `$${v.toFixed(4)}`} />
            <YAxis yAxisId="vol" orientation="right" tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
              formatter={(v: number | undefined, name: string | undefined) => [name?.includes('rice') ? `$${(v ?? 0).toFixed(5)}` : `${((v ?? 0) / 1000).toFixed(1)}k`, name]}
            />
            <Bar yAxisId="vol" dataKey="rtVolume" fill="#7c3aed" opacity={0.4} name="Volume" />
            <Line yAxisId="price" type="monotone" dataKey="rtPrice" stroke="#a78bfa" strokeWidth={2} dot={false} name="RT Price" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
