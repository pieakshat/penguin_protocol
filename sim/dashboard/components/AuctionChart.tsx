'use client';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer, Cell,
} from 'recharts';
import { AuctionResult } from '@/engine/types';

interface Props {
  auction: AuctionResult;
}

export function AuctionChart({ auction }: Props) {
  const { bids, clearingPrice, usdcRaised, fillRatio, lpAllocation } = auction;

  // Build bid ladder: group into 30 price buckets
  const winners = bids.filter(b => b.isWinner);
  const losers = bids.filter(b => !b.isWinner && b.price >= auction.bids.reduce((m, b) => Math.min(m, b.price), Infinity));

  const allPrices = bids.map(b => b.price);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const bucketCount = 40;
  const bucketSize = (maxPrice - minPrice) / bucketCount;

  const buckets: { price: number; winQty: number; loseQty: number }[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const lo = minPrice + i * bucketSize;
    const hi = lo + bucketSize;
    const mid = (lo + hi) / 2;
    let winQty = 0, loseQty = 0;
    for (const b of bids) {
      if (b.price >= lo && b.price < hi) {
        if (b.isWinner) winQty += b.filled;
        else loseQty += b.qty;
      }
    }
    buckets.push({ price: mid, winQty, loseQty });
  }

  const fmt = (v: number) => `$${v.toFixed(3)}`;
  const fmtK = (v: number) => `${(v / 1000).toFixed(0)}k`;

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Clearing Price', value: `$${clearingPrice.toFixed(4)}` },
          { label: 'USDC Raised', value: `$${(usdcRaised / 1000).toFixed(1)}k` },
          { label: 'Fill Ratio', value: `${(fillRatio * 100).toFixed(1)}%` },
          { label: 'LP Allocation (10%)', value: `$${(lpAllocation / 1000).toFixed(1)}k` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-400">{label}</div>
            <div className="text-lg font-mono font-bold text-white">{value}</div>
          </div>
        ))}
      </div>

      {/* Bid Ladder */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Bid Ladder</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={buckets} margin={{ left: 10, right: 10 }}>
            <XAxis
              dataKey="price"
              tickFormatter={fmt}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              label={{ value: 'Price (USDC)', position: 'insideBottom', offset: -5, fill: '#6b7280', fontSize: 11 }}
            />
            <YAxis
              tickFormatter={fmtK}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              label={{ value: 'Qty', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
              labelFormatter={v => `Price: $${Number(v).toFixed(4)}`}
              formatter={(v: number | undefined, name: string) => [`${((v ?? 0) / 1000).toFixed(1)}k`, name === 'winQty' ? 'Filled' : 'Refunded']}
            />
            <ReferenceLine
              x={clearingPrice}
              stroke="#ef4444"
              strokeWidth={2}
              strokeDasharray="4 2"
              label={{ value: 'CP', fill: '#ef4444', fontSize: 10 }}
            />
            <Bar dataKey="winQty" stackId="a" fill="#3b82f6" name="Filled" />
            <Bar dataKey="loseQty" stackId="a" fill="#4b5563" name="Refunded" />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2 justify-center text-xs text-gray-400">
          <span><span className="inline-block w-3 h-3 bg-blue-500 rounded mr-1" />Filled</span>
          <span><span className="inline-block w-3 h-3 bg-gray-600 rounded mr-1" />Refunded</span>
          <span><span className="inline-block w-3 h-3 bg-red-500 rounded mr-1" />Clearing Price</span>
        </div>
      </div>
    </div>
  );
}
