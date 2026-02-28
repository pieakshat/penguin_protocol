'use client';

import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import { SettlementResult, SensitivityPoint } from '@/engine/types';

interface Props {
  settlement: SettlementResult;
  sensitivity: SensitivityPoint[];
}

export function SettlementChart({ settlement, sensitivity }: Props) {
  const { clearingPrice, tgePrice, payoutPerRT, proRataFactor, bidderSettlements } = settlement;

  return (
    <div className="space-y-4">
      {/* Settlement Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'TGE Price', value: `$${tgePrice.toFixed(4)}` },
          { label: 'Payout / RT', value: `$${payoutPerRT.toFixed(4)}` },
          { label: 'Pro-rata Factor', value: `${(proRataFactor * 100).toFixed(1)}%` },
          { label: 'Effective Price', value: `$${settlement.effectivePrice.toFixed(4)}` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-400">{label}</div>
            <div className="text-lg font-mono font-bold text-white">{value}</div>
          </div>
        ))}
      </div>

      {/* RT Payout Sensitivity */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-1">RT Payout Sensitivity</h3>
        <p className="text-xs text-gray-500 mb-3">How TGE price affects RT holder returns vs auction cost</p>
        <ResponsiveContainer width="100%" height={250}>
          <ComposedChart data={sensitivity}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="tgePrice"
              tickFormatter={v => `$${Number(v).toFixed(2)}`}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              label={{ value: 'TGE Price (USDC)', position: 'insideBottom', offset: -5, fill: '#6b7280', fontSize: 11 }}
            />
            <YAxis
              yAxisId="payout"
              tickFormatter={v => `$${Number(v).toFixed(4)}`}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              label={{ value: 'RT Payout/token', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 11 }}
            />
            <YAxis
              yAxisId="pnl"
              orientation="right"
              tickFormatter={v => `$${(Number(v) / 1000).toFixed(0)}k`}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
              formatter={(v: number | undefined, name: string | undefined) => [
                name === 'Payout/RT' ? `$${(v ?? 0).toFixed(4)}` : `$${(v ?? 0).toFixed(2)}`,
                name,
              ]}
              labelFormatter={v => `TGE: $${Number(v).toFixed(3)}`}
            />
            <ReferenceLine
              yAxisId="pnl"
              y={0}
              stroke="#6b7280"
              strokeDasharray="2 2"
            />
            <ReferenceLine
              x={tgePrice}
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="3 2"
              label={{ value: 'Current TGE', fill: '#f59e0b', fontSize: 10 }}
            />
            <Bar yAxisId="payout" dataKey="payoutPerRT" fill="#8b5cf6" opacity={0.6} name="Payout/RT" />
            <Line yAxisId="pnl" type="monotone" dataKey="avgBidderPnL" stroke="#22c55e" strokeWidth={2} dot={false} name="Avg Bidder P&L" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Allocation Table */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Bidder Allocation Table</h3>
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="w-full text-xs text-gray-300">
            <thead className="sticky top-0 bg-gray-800">
              <tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left py-1 pr-3">Bidder</th>
                <th className="text-right pr-3">Tokens</th>
                <th className="text-right pr-3">Auction Cost</th>
                <th className="text-right pr-3">PT Value</th>
                <th className="text-right pr-3">RT Payout</th>
                <th className="text-right">Net P&L</th>
              </tr>
            </thead>
            <tbody>
              {bidderSettlements.slice(0, 30).map(s => (
                <tr key={s.bidderId} className="border-b border-gray-700/30">
                  <td className="py-0.5 pr-3 font-mono">#{s.bidderId}</td>
                  <td className="text-right pr-3 font-mono">{(s.tokensFilled / 1000).toFixed(1)}k</td>
                  <td className="text-right pr-3 font-mono">${(s.auctionCost / 1000).toFixed(2)}k</td>
                  <td className="text-right pr-3 font-mono text-blue-400">${(s.ptValue / 1000).toFixed(2)}k</td>
                  <td className="text-right pr-3 font-mono text-purple-400">${(s.rtPayout / 1000).toFixed(2)}k</td>
                  <td className={`text-right font-mono ${s.netPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {s.netPnL >= 0 ? '+' : ''}${(s.netPnL / 1000).toFixed(2)}k
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {bidderSettlements.length > 30 && (
          <p className="text-xs text-gray-500 mt-2">Showing first 30 of {bidderSettlements.length} bidders</p>
        )}
      </div>
    </div>
  );
}
