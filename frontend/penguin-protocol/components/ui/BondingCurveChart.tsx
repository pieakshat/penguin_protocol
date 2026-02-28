"use client";
import { useMemo } from "react";

interface BidPoint {
  tokenAmount: string // raw bigint string (18 decimals)
  maxPrice: string    // raw bigint string (6 decimals USDC)
}

interface Props {
  bids?: BidPoint[]
  totalTokenSupply?: string  // raw bigint string (18 decimals)
  clearingPrice?: string     // raw bigint string (6 decimals)
  minimumPrice?: string      // raw bigint string (6 decimals)
}

export default function BondingCurveChart({
  bids = [],
  totalTokenSupply = "0",
  clearingPrice = "0",
  minimumPrice = "0",
}: Props) {
  const curve = useMemo(() => {
    const validBids = bids.filter((b) => BigInt(b.tokenAmount) > 0n)
    if (!validBids.length) return null

    // Sort by maxPrice descending (highest bidders first)
    const sorted = [...validBids].sort((a, b) =>
      BigInt(b.maxPrice) > BigInt(a.maxPrice) ? 1 : -1
    )

    // Build staircase points: step right (qty), then down (price)
    // Each point is [cumulativeTokens (float), priceUSDC (float)]
    const pts: [number, number][] = []
    let cumQty = 0
    for (const bid of sorted) {
      const qty = Number(BigInt(bid.tokenAmount)) / 1e18
      const price = Number(BigInt(bid.maxPrice)) / 1e6
      pts.push([cumQty, price]) // left edge of step (vertical drop)
      cumQty += qty
      pts.push([cumQty, price]) // right edge of step (horizontal)
    }

    const supplyTokens = Number(BigInt(totalTokenSupply)) / 1e18
    const maxQty = Math.max(supplyTokens, cumQty) || 1
    const minP = Number(BigInt(minimumPrice)) / 1e6
    const maxP = Number(BigInt(sorted[0].maxPrice)) / 1e6
    const priceRange = maxP > minP ? maxP - minP : maxP * 0.2 || 1
    const clearP = Number(BigInt(clearingPrice)) / 1e6

    return { pts, cumQty, maxQty, minP, maxP, priceRange, clearP, supplyTokens }
  }, [bids, totalTokenSupply, clearingPrice, minimumPrice])

  // SVG layout
  const W = 560, H = 240
  const mt = 16, mb = 38, ml = 58, mr = 16
  const plotW = W - ml - mr
  const plotH = H - mt - mb

  function xs(qty: number) {
    if (!curve) return ml
    return ml + (qty / curve.maxQty) * plotW
  }
  function ys(price: number) {
    if (!curve) return mt + plotH
    return mt + (1 - (price - curve.minP) / curve.priceRange) * plotH
  }
  function fmtQty(q: number) {
    if (q >= 1e6) return `${(q / 1e6).toFixed(1)}M`
    if (q >= 1e3) return `${(q / 1e3).toFixed(0)}K`
    return q.toFixed(0)
  }

  if (!curve) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-[11px] font-mono text-neutral-600 uppercase tracking-widest">Demand Curve</p>
          <p className="text-[10px] text-neutral-700 font-light">No bids yet — curve appears as bids are submitted</p>
        </div>
      </div>
    )
  }

  // Staircase path
  const pathD = curve.pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${xs(x).toFixed(1)} ${ys(y).toFixed(1)}`)
    .join(" ")

  // Close area to bottom-left
  const lastX = xs(curve.cumQty)
  const bottomY = mt + plotH
  const areaD = `${pathD} L ${lastX.toFixed(1)} ${bottomY} L ${ml} ${bottomY} Z`

  // Clearing price horizontal line
  const clearY = ys(curve.clearP)
  // Total supply vertical line
  const supplyX = xs(curve.supplyTokens)

  // Axis ticks
  const yTicks = [
    curve.minP,
    curve.minP + curve.priceRange * 0.5,
    curve.maxP,
  ]
  const xTicks = [0, curve.supplyTokens / 2, curve.supplyTokens]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-full"
      style={{ overflow: "visible" }}
    >
      {/* Area fill */}
      <path d={areaD} fill="rgba(59,130,246,0.08)" />

      {/* Demand curve */}
      <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />

      {/* Total supply vertical line */}
      {curve.supplyTokens > 0 && (
        <>
          <line
            x1={supplyX} y1={mt}
            x2={supplyX} y2={mt + plotH}
            stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="4 3"
          />
          <text x={supplyX + 4} y={mt + 10} fill="rgba(255,255,255,0.3)" fontSize="8" fontFamily="monospace">
            Supply
          </text>
        </>
      )}

      {/* Clearing price horizontal line */}
      {curve.clearP > 0 && curve.clearP >= curve.minP && (
        <>
          <line
            x1={ml} y1={clearY}
            x2={ml + plotW} y2={clearY}
            stroke="rgba(52,211,153,0.55)" strokeWidth="1" strokeDasharray="4 3"
          />
          <text x={ml + 4} y={clearY - 4} fill="rgba(52,211,153,0.75)" fontSize="8" fontFamily="monospace">
            Clear ${curve.clearP.toFixed(4)}
          </text>
        </>
      )}

      {/* Y-axis ticks + labels */}
      {yTicks.map((p, i) => {
        const y = ys(p)
        return (
          <g key={i}>
            <line x1={ml - 4} y1={y} x2={ml} y2={y} stroke="rgba(255,255,255,0.1)" />
            <text
              x={ml - 6} y={y + 3}
              fill="rgba(255,255,255,0.3)" fontSize="8" fontFamily="monospace" textAnchor="end"
            >
              ${p.toFixed(3)}
            </text>
          </g>
        )
      })}

      {/* X-axis ticks + labels */}
      {xTicks.map((q, i) => {
        const x = xs(q)
        return (
          <g key={i}>
            <line x1={x} y1={mt + plotH} x2={x} y2={mt + plotH + 4} stroke="rgba(255,255,255,0.1)" />
            <text
              x={x} y={mt + plotH + 14}
              fill="rgba(255,255,255,0.3)" fontSize="8" fontFamily="monospace" textAnchor="middle"
            >
              {fmtQty(q)}
            </text>
          </g>
        )
      })}

      {/* Axes */}
      <line x1={ml} y1={mt} x2={ml} y2={mt + plotH} stroke="rgba(255,255,255,0.1)" />
      <line x1={ml} y1={mt + plotH} x2={ml + plotW} y2={mt + plotH} stroke="rgba(255,255,255,0.1)" />

      {/* Axis labels */}
      <text
        x={ml + plotW / 2} y={H - 4}
        fill="rgba(255,255,255,0.2)" fontSize="8" fontFamily="monospace" textAnchor="middle"
      >
        Cumulative Token Quantity
      </text>
      <text
        x={10} y={mt + plotH / 2}
        fill="rgba(255,255,255,0.2)" fontSize="8" fontFamily="monospace" textAnchor="middle"
        transform={`rotate(-90, 10, ${mt + plotH / 2})`}
      >
        Price (USDC)
      </text>
    </svg>
  )
}
