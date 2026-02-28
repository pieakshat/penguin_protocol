'use client';

import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import { TraderResult, TradeEvent } from '@/engine/types';

interface Props {
  traders: TraderResult[];
  trades: TradeEvent[];
}

const TYPE_COLORS: Record<string, string> = {
  random: '#6b7280',
  momentum: '#f59e0b',
  arb: '#22c55e',
};

export function PnLChart({ traders, trades }: Props) {
  if (!traders.length) return <div className="text-gray-500 text-sm">No trader data</div>;

  const maxLen = Math.max(...traders.map(t => t.cumulativePnL.length));

  // Build time-series grouped by trader type (average P&L per type)
  const byType: Record<string, { pnl: number[]; count: number }> = {};
  for (const trader of traders) {
    if (!byType[trader.type]) byType[trader.type] = { pnl: [], count: 0 };
    byType[trader.type].count++;
    for (let i = 0; i < trader.cumulativePnL.length; i++) {
      byType[trader.type].pnl[i] = (byType[trader.type].pnl[i] ?? 0) + trader.cumulativePnL[i];
    }
  }

  const chartData = Array.from({ length: maxLen }, (_, i) => {
    const point: Record<string, number> = { t: i };
    for (const [type, data] of Object.entries(byType)) {
      point[type] = (data.pnl[i] ?? 0) / data.count;
    }
    return point;
  });

  const hourLabel = (v: number) => {
    const day = Math.floor(v / 24);
    const hour = v % 24;
    return hour === 0 ? `D${day + 1}` : '';
  };

  // Recent trade log (last 50)
  const recentTrades = [...trades].reverse().slice(0, 50);

  return (
    <div className="space-y-4">
      {/* P&L Chart */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-1">Cumulative P&L by Trader Type</h3>
        <p className="text-xs text-gray-500 mb-3">Average P&L across traders of the same archetype</p>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="t" tickFormatter={hourLabel} tick={{ fontSize: 10, fill: '#9ca3af' }} />
            <YAxis tickFormatter={v => `$${(v / 1000).toFixed(1)}k`} tick={{ fontSize: 10, fill: '#9ca3af' }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
              formatter={(v: number | undefined, name: string | undefined) => [`$${(v ?? 0).toFixed(2)}`, name]}
            />
            <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="2 2" />
            <Legend />
            {Object.keys(byType).map(type => (
              <Line
                key={type}
                type="monotone"
                dataKey={type}
                stroke={TYPE_COLORS[type] ?? '#94a3b8'}
                strokeWidth={2}
                dot={false}
                name={`${type} (avg)`}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Trade Summary */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Trader Summary</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-gray-300">
            <thead>
              <tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left py-1 pr-4">Type</th>
                <th className="text-right pr-4">Trades</th>
                <th className="text-right pr-4">Volume</th>
                <th className="text-right">Final P&L</th>
              </tr>
            </thead>
            <tbody>
              {traders.map(t => (
                <tr key={t.id} className="border-b border-gray-700/50">
                  <td className="py-1 pr-4">
                    <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: TYPE_COLORS[t.type] ?? '#94a3b8' }} />
                    {t.type} #{t.id}
                  </td>
                  <td className="text-right pr-4">{t.tradeCount}</td>
                  <td className="text-right pr-4">${(t.totalVolume / 1000).toFixed(1)}k</td>
                  <td className={`text-right font-mono ${t.finalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {t.finalPnL >= 0 ? '+' : ''}${t.finalPnL.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trade Log */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Recent Trades (last 50)</h3>
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-xs text-gray-300">
            <thead className="sticky top-0 bg-gray-800">
              <tr className="text-gray-500 border-b border-gray-700">
                <th className="text-left py-1 pr-3">T</th>
                <th className="text-left pr-3">Type</th>
                <th className="text-left pr-3">Pool</th>
                <th className="text-left pr-3">Dir</th>
                <th className="text-right pr-3">Amount</th>
                <th className="text-right pr-3">Price</th>
                <th className="text-right">P&L Δ</th>
              </tr>
            </thead>
            <tbody>
              {recentTrades.map((t, i) => (
                <tr key={i} className="border-b border-gray-700/30">
                  <td className="py-0.5 pr-3 font-mono">{t.t}</td>
                  <td className="pr-3" style={{ color: TYPE_COLORS[t.traderType] ?? '#94a3b8' }}>{t.traderType}</td>
                  <td className="pr-3">{t.pool}</td>
                  <td className={`pr-3 ${t.direction === 'buy' ? 'text-green-400' : 'text-red-400'}`}>{t.direction}</td>
                  <td className="text-right pr-3 font-mono">${t.amountIn.toFixed(1)}</td>
                  <td className="text-right pr-3 font-mono">${t.price.toFixed(4)}</td>
                  <td className={`text-right font-mono ${t.pnlDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {t.pnlDelta >= 0 ? '+' : ''}{t.pnlDelta.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
