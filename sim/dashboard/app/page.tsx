'use client';

import { useState, useCallback } from 'react';
import { ScenarioParams, SimulationResult } from '@/engine/types';
import { ConfigPanel } from '@/components/ConfigPanel';
import { AuctionChart } from '@/components/AuctionChart';
import { PoolPriceChart } from '@/components/PoolPriceChart';
import { DepthChart } from '@/components/DepthChart';
import { PnLChart } from '@/components/PnLChart';
import { SettlementChart } from '@/components/SettlementChart';
import { ComparisonChart } from '@/components/ComparisonChart';

const DEFAULT_PARAMS: ScenarioParams = {
  totalSupply: 1_000_000,
  minPrice: 0.10,
  rtCapMultiplier: 5,
  bidCount: 100,
  bidDistribution: 'powerlaw',
  traderCount: { random: 5, momentum: 3, arb: 2 },
  tradingDays: 7,
  tgePrice: 0.50,
  rtReserve: 200_000,
  seed: 42,
};

type Tab = 'auction' | 'pools' | 'traders' | 'settlement' | 'compare';

const TABS: { id: Tab; label: string }[] = [
  { id: 'auction',    label: 'Auction'    },
  { id: 'pools',      label: 'Pools'      },
  { id: 'traders',    label: 'Traders'    },
  { id: 'settlement', label: 'Settlement' },
  { id: 'compare',    label: 'vs Markets' },
];

export default function Home() {
  const [params, setParams] = useState<ScenarioParams>(DEFAULT_PARAMS);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('auction');

  const runSimulation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Simulation failed');
      }
      const data = await res.json();
      setResult(data);
      setActiveTab('auction');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [params]);

  const ptSnapshots = result?.pools.pt ?? [];
  const rtSnapshots = result?.pools.rt ?? [];
  const ptPrice = ptSnapshots[ptSnapshots.length - 1]?.price ?? 0;
  const rtPrice = rtSnapshots[rtSnapshots.length - 1]?.price ?? 0;

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      {/* Config Panel */}
      <ConfigPanel
        params={params}
        onChange={setParams}
        onRun={runSimulation}
        loading={loading}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-700">
          <h1 className="text-lg font-bold tracking-tight">
            Penguin Protocol Simulator
          </h1>
          {result && (
            <div className="flex gap-4 text-xs text-gray-400">
              <span>CP: <span className="text-white font-mono">${result.auction.clearingPrice.toFixed(4)}</span></span>
              <span>Raised: <span className="text-white font-mono">${(result.auction.usdcRaised / 1000).toFixed(1)}k</span></span>
              <span>PT: <span className="text-blue-400 font-mono">${ptPrice.toFixed(4)}</span></span>
              <span>RT: <span className="text-purple-400 font-mono">${rtPrice.toFixed(5)}</span></span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 bg-gray-900 px-6">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              disabled={!result}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200 disabled:text-gray-600 disabled:cursor-not-allowed'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-4 text-red-300 text-sm">
              Error: {error}
            </div>
          )}

          {!result && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <div className="text-5xl mb-4">🐧</div>
              <p className="text-lg font-medium text-gray-400 mb-2">Configure and run a simulation</p>
              <p className="text-sm">Adjust the parameters in the left panel, then click Run Simulation</p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <div className="text-4xl mb-4 animate-spin">⚙</div>
              <p className="text-sm">Running simulation...</p>
            </div>
          )}

          {result && !loading && (
            <>
              {activeTab === 'auction' && (
                <AuctionChart auction={result.auction} />
              )}

              {activeTab === 'pools' && (
                <div className="space-y-4">
                  <PoolPriceChart
                    ptSnapshots={result.pools.pt}
                    rtSnapshots={result.pools.rt}
                    trades={result.trades}
                    clearingPrice={result.auction.clearingPrice}
                  />
                  <DepthChart
                    depthPT={result.pools.depthPT}
                    depthRT={result.pools.depthRT}
                    ptPrice={ptPrice}
                    rtPrice={rtPrice}
                  />
                </div>
              )}

              {activeTab === 'traders' && (
                <PnLChart
                  traders={result.traders}
                  trades={result.trades}
                />
              )}

              {activeTab === 'settlement' && (
                <SettlementChart
                  settlement={result.settlement}
                  sensitivity={result.sensitivity}
                />
              )}

              {activeTab === 'compare' && (
                <ComparisonChart comparison={result.comparison} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
