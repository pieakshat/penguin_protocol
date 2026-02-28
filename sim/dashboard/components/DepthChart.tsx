'use client';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { TickBucket } from '@/engine/types';

interface Props {
  depthPT: TickBucket[];
  depthRT: TickBucket[];
  ptPrice: number;
  rtPrice: number;
}

export function DepthChart({ depthPT, depthRT, ptPrice, rtPrice }: Props) {
  const fmtLiq = (v: number) => {
    if (v === 0) return '0';
    if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
    return v.toFixed(0);
  };

  const renderDepth = (data: TickBucket[], currentPrice: number, color: string, label: string) => (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-1">{label} Liquidity Depth</h3>
      <p className="text-xs text-gray-500 mb-3">Liquidity per tick bucket around current price</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="price"
            tickFormatter={v => `$${Number(v).toFixed(3)}`}
            tick={{ fontSize: 9, fill: '#9ca3af' }}
          />
          <YAxis
            tickFormatter={fmtLiq}
            tick={{ fontSize: 9, fill: '#9ca3af' }}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
            labelFormatter={v => `Price: $${Number(v).toFixed(4)}`}
            formatter={(v: number | undefined) => [fmtLiq(v ?? 0), 'Liquidity']}
          />
          <ReferenceLine
            x={currentPrice}
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="3 2"
            label={{ value: 'Current', fill: '#f59e0b', fontSize: 10 }}
          />
          <Bar dataKey="liquidity" fill={color} opacity={0.8} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <div className="space-y-4">
      {renderDepth(depthPT, ptPrice, '#3b82f6', 'PT / USDC')}
      {renderDepth(depthRT, rtPrice, '#8b5cf6', 'RT / USDC')}
    </div>
  );
}
