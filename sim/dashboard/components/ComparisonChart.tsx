'use client';

import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Legend, Tooltip as RechartsTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { ComparisonResult, ICOMetrics } from '@/engine/types';

interface Props {
  comparison: ComparisonResult;
}

// ─── Color palette ────────────────────────────────────────────────────────

const MODEL_STYLE: Record<string, { color: string; fill: string; label: string }> = {
  penguin:   { color: '#3b82f6', fill: '#3b82f620', label: 'Penguin Protocol' },
  fcfs:      { color: '#ef4444', fill: '#ef444420', label: 'FCFS Fixed Price'  },
  whitelist: { color: '#f59e0b', fill: '#f59e0b20', label: 'Whitelist Sale'    },
  dutch:     { color: '#22c55e', fill: '#22c55e20', label: 'Dutch Auction'     },
};

// ─── Radar ────────────────────────────────────────────────────────────────

const RADAR_AXES = [
  { key: 'priceDiscovery',      label: 'Price Discovery'      },
  { key: 'distributionFairness',label: 'Fair Distribution'    },
  { key: 'retailAccess',        label: 'Retail Access'        },
  { key: 'capitalEfficiency',   label: 'Capital Efficiency'   },
  { key: 'dumpResistance',      label: 'Dump Resistance'      },
  { key: 'botResistance',       label: 'Bot Resistance'       },
];

function RadarSection({ models }: { models: ICOMetrics[] }) {
  const data = RADAR_AXES.map(axis => {
    const point: Record<string, number | string> = { axis: axis.label };
    for (const m of models) {
      point[m.model] = m.radar[axis.key as keyof ICOMetrics['radar']];
    }
    return point;
  });

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-1">Model Comparison — Radar</h3>
      <p className="text-xs text-gray-500 mb-3">
        6 dimensions scored 0–100. Higher is always better. Penguin's clearing price is used as the "true fair value" baseline for all models.
      </p>
      <ResponsiveContainer width="100%" height={340}>
        <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid stroke="#374151" />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fontSize: 9, fill: '#6b7280' }}
            tickCount={5}
          />
          <RechartsTooltip
            contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
            formatter={(v: number | undefined, name: string | undefined) => [`${(v ?? 0).toFixed(0)} / 100`, MODEL_STYLE[name ?? '']?.label ?? name]}
          />
          {models.map(m => (
            <Radar
              key={m.model}
              name={m.model}
              dataKey={m.model}
              stroke={MODEL_STYLE[m.model].color}
              fill={MODEL_STYLE[m.model].fill}
              strokeWidth={2}
            />
          ))}
          <Legend
            formatter={(value: string) => (
              <span style={{ color: MODEL_STYLE[value]?.color ?? '#fff', fontSize: 12 }}>
                {MODEL_STYLE[value]?.label ?? value}
              </span>
            )}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Bar comparison ───────────────────────────────────────────────────────

function MetricBar({
  title, description, models, dataKey, format, higherIsBetter = true,
}: {
  title: string;
  description: string;
  models: ICOMetrics[];
  dataKey: keyof ICOMetrics;
  format: (v: number) => string;
  higherIsBetter?: boolean;
}) {
  const data = models.map(m => ({
    name: MODEL_STYLE[m.model].label,
    model: m.model,
    value: m[dataKey] as number,
  }));

  const best = higherIsBetter
    ? Math.max(...data.map(d => d.value))
    : Math.min(...data.map(d => d.value));

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-baseline gap-2 mb-1">
        <h4 className="text-sm font-semibold text-gray-300">{title}</h4>
        <span className="text-[10px] text-gray-500">{higherIsBetter ? '↑ higher better' : '↓ lower better'}</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">{description}</p>
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={format} domain={[0, 'dataMax']} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#9ca3af' }} width={110} />
          <Tooltip
            contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
            formatter={(v: number | undefined) => [format(v ?? 0), title]}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map(d => (
              <Cell
                key={d.model}
                fill={d.value === best ? MODEL_STYLE[d.model].color : '#374151'}
                opacity={d.value === best ? 1 : 0.6}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Summary metrics table ────────────────────────────────────────────────

function SummaryTable({ models, fairPrice }: { models: ICOMetrics[]; fairPrice: number }) {
  const rows: {
    metric: string;
    description: string;
    values: (m: ICOMetrics) => string;
    best: (vals: ICOMetrics[]) => string;
    higherIsBetter: boolean;
    extract: (m: ICOMetrics) => number;
  }[] = [
    {
      metric: 'Sale Price',
      description: 'Effective price paid per token',
      values: m => `$${m.salePrice.toFixed(4)}`,
      best: ms => `Fair: $${fairPrice.toFixed(4)}`,
      higherIsBetter: true,
      extract: m => m.salePrice,
    },
    {
      metric: 'USDC Raised',
      description: 'Net protocol revenue',
      values: m => `$${(m.totalRaised / 1000).toFixed(1)}k`,
      best: ms => `Best: $${(Math.max(...ms.map(m => m.totalRaised)) / 1000).toFixed(1)}k`,
      higherIsBetter: true,
      extract: m => m.totalRaised,
    },
    {
      metric: 'Gini Coefficient',
      description: 'Token distribution inequality (0=equal, 1=one holder)',
      values: m => m.giniCoefficient.toFixed(3),
      best: ms => `Best: ${Math.min(...ms.map(m => m.giniCoefficient)).toFixed(3)}`,
      higherIsBetter: false,
      extract: m => m.giniCoefficient,
    },
    {
      metric: 'Whale Capture',
      description: 'Top-10% of winners\' share of supply',
      values: m => `${(m.whaleCapture * 100).toFixed(1)}%`,
      best: ms => `Best: ${(Math.min(...ms.map(m => m.whaleCapture)) * 100).toFixed(1)}%`,
      higherIsBetter: false,
      extract: m => m.whaleCapture,
    },
    {
      metric: 'Retail Fill Rate',
      description: '% of small participants who received tokens',
      values: m => `${(m.retailFillRate * 100).toFixed(1)}%`,
      best: ms => `Best: ${(Math.max(...ms.map(m => m.retailFillRate)) * 100).toFixed(1)}%`,
      higherIsBetter: true,
      extract: m => m.retailFillRate,
    },
    {
      metric: 'Refund Rate',
      description: '% of deposited capital returned',
      values: m => `${(m.refundRate * 100).toFixed(1)}%`,
      best: ms => ``,
      higherIsBetter: false,
      extract: m => m.refundRate,
    },
    {
      metric: 'Day-1 Dump Risk',
      description: '% of supply with immediate flip incentive',
      values: m => `${(m.day1DumpRisk * 100).toFixed(1)}%`,
      best: ms => `Best: ${(Math.min(...ms.map(m => m.day1DumpRisk)) * 100).toFixed(1)}%`,
      higherIsBetter: false,
      extract: m => m.day1DumpRisk,
    },
    {
      metric: 'Bot Advantage',
      description: 'Whale fill rate / retail fill rate (1.0 = equal access)',
      values: m => `${m.botAdvantage.toFixed(2)}x`,
      best: ms => `Best: ${Math.min(...ms.map(m => m.botAdvantage)).toFixed(2)}x`,
      higherIsBetter: false,
      extract: m => m.botAdvantage,
    },
    {
      metric: 'Price Discovery',
      description: 'How closely sale price matches true market value',
      values: m => `${m.priceDiscovery.toFixed(0)} / 100`,
      best: ms => `Best: ${Math.max(...ms.map(m => m.priceDiscovery)).toFixed(0)}`,
      higherIsBetter: true,
      extract: m => m.priceDiscovery,
    },
  ];

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-1">Full Metrics Comparison</h3>
      <p className="text-xs text-gray-500 mb-3">
        All models use the same synthetic participant pool (same wealth distribution, same desired token amounts).
        Penguin clearing price = <span className="text-white font-mono">${fairPrice.toFixed(4)}</span> is the fair value baseline.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-gray-300">
          <thead>
            <tr className="border-b border-gray-700 text-gray-500">
              <th className="text-left py-2 pr-4 font-medium">Metric</th>
              {models.map(m => (
                <th key={m.model} className="text-right pr-4 font-medium" style={{ color: MODEL_STYLE[m.model].color }}>
                  {MODEL_STYLE[m.model].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const values = models.map(m => row.extract(m));
              const bestVal = row.higherIsBetter ? Math.max(...values) : Math.min(...values);
              const worstVal = row.higherIsBetter ? Math.min(...values) : Math.max(...values);

              return (
                <tr key={row.metric} className="border-b border-gray-700/40 hover:bg-gray-700/20">
                  <td className="py-2 pr-4">
                    <div className="font-medium text-gray-200">{row.metric}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{row.description}</div>
                  </td>
                  {models.map((m, i) => {
                    const val = values[i];
                    const isBest = val === bestVal;
                    const isWorst = val === worstVal && bestVal !== worstVal;
                    return (
                      <td key={m.model} className="text-right pr-4 py-2 font-mono">
                        <span className={
                          isBest ? 'text-green-400 font-bold' :
                          isWorst ? 'text-red-400' :
                          'text-gray-300'
                        }>
                          {row.values(m)}
                          {isBest && <span className="ml-1 text-[9px] text-green-500">BEST</span>}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────

export function ComparisonChart({ comparison }: Props) {
  const { models, fairPrice } = comparison;

  return (
    <div className="space-y-4">
      {/* Context banner */}
      <div className="bg-blue-950/40 border border-blue-800/50 rounded-lg p-3 text-xs text-blue-300 leading-relaxed">
        <span className="font-semibold text-blue-200">Methodology: </span>
        Same synthetic participant pool (log-normal wealth distribution, {models[0] ? `n=${Math.round(models[0].totalRaised / models[0].salePrice / (models[0].whaleCapture * 10 + 1))}+` : ''} participants) runs through all four mechanisms.
        Penguin's uniform clearing price <span className="font-mono text-white">${fairPrice.toFixed(4)}</span> anchors all "fair value" comparisons.
        FCFS prices at 30% discount, Whitelist at 20% discount. Dutch auction starts at 3× fair and drops to 0.3×.
      </div>

      {/* Radar */}
      <RadarSection models={models} />

      {/* Bar charts — 3 key metrics */}
      <div className="grid grid-cols-1 gap-4">
        <MetricBar
          title="Gini Coefficient"
          description="Token distribution inequality. Lower = more equal distribution across all participants. Penguin's pro-rata fill and uniform price create the most equitable outcome."
          models={models}
          dataKey="giniCoefficient"
          format={v => v.toFixed(3)}
          higherIsBetter={false}
        />
        <MetricBar
          title="Day-1 Dump Risk"
          description="Fraction of supply with immediate flip incentive (bought at >5% discount to fair value). FCFS underpricing means 100% of winners can dump profitably on day 1."
          models={models}
          dataKey="day1DumpRisk"
          format={v => `${(v * 100).toFixed(0)}%`}
          higherIsBetter={false}
        />
        <MetricBar
          title="Retail Fill Rate"
          description="% of small participants who received any tokens. FCFS locks out retail with bot-driven speed ordering. Whitelist restores access but caps to a random 40%."
          models={models}
          dataKey="retailFillRate"
          format={v => `${(v * 100).toFixed(0)}%`}
          higherIsBetter={true}
        />
        <MetricBar
          title="Bot / Whale Advantage"
          description="Ratio of whale fill rate to retail fill rate. 1.0 = equal access. FCFS is dominated by speed → bots capture most supply. Penguin's sealed bid removes this entirely."
          models={models}
          dataKey="botAdvantage"
          format={v => `${v.toFixed(2)}×`}
          higherIsBetter={false}
        />
      </div>

      {/* Full table */}
      <SummaryTable models={models} fairPrice={fairPrice} />

      {/* Verdict */}
      <div className="grid grid-cols-2 gap-3">
        {models.map(m => {
          const s = MODEL_STYLE[m.model];
          const radarTotal = Object.values(m.radar).reduce((a, b) => a + b, 0);
          const radarMax = Object.keys(m.radar).length * 100;
          const score = Math.round(radarTotal / radarMax * 100);
          return (
            <div key={m.model} className="bg-gray-800 rounded-lg p-3 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold" style={{ color: s.color }}>{s.label}</span>
                <span className="text-lg font-bold text-white">{score}<span className="text-xs text-gray-500">/100</span></span>
              </div>
              <div className="text-[11px] text-gray-400 leading-relaxed">
                {m.model === 'penguin' && 'Market-discovered price, uniform clearing, PT/RT split reduces dump pressure. Most capital-efficient with highest price discovery.'}
                {m.model === 'fcfs' && 'Team-set discount price creates guaranteed dump. Bots dominate. Retail gets nothing. Simple to execute but worst outcomes for the ecosystem.'}
                {m.model === 'whitelist' && 'Random selection is fair but lottery-like. Equal allocations per slot improve distribution. Still no price discovery — team guesses the right price.'}
                {m.model === 'dutch' && 'Theoretically optimal but strategic waiting creates a timing rush similar to FCFS at the bottom. Partial price discovery. Whales with larger capital wait more comfortably.'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
