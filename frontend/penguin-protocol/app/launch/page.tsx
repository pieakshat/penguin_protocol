"use client";

import { useEffect, useState, useCallback } from "react";
import { parseUnits, formatUnits } from "viem";
import dynamic from "next/dynamic";
import { getAuctionState, getUserBids, getAllBids, getUserUSDCBalance } from "@/app/actions/auction";
import type { AuctionState, BidInfo } from "@/app/actions/auction";
import { ADDRESSES, demoWalletClient, demoAccount, publicClient } from "@/lib/contracts";
import BatchAuctionABI from "@/lib/abi/BatchAuction.json";
import FactoryABI from "@/lib/abi/Factory.json";
import ERC20ABI from "@/lib/abi/ERC20Extended.json";

const BondingCurveChart = dynamic(() => import("@/components/ui/BondingCurveChart"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-blue-500/5 animate-pulse rounded-2xl" />,
});

type PageTab = "create" | "auction";

interface CreatedCampaign {
  campaignId: string;
  launchToken: string;
  allocationNFT: string;
  batchAuction: string;
  principalToken: string;
  riskToken: string;
  armVault: string;
  settlement: string;
}

function getAuctionStatus(state: AuctionState): { label: string; color: string } {
  const now = Math.floor(Date.now() / 1000);
  if (state.finalized) return { label: "FINALIZED", color: "text-emerald-400 border-emerald-400/20 bg-emerald-400/5" };
  if (now < state.auctionStart) return { label: "UPCOMING", color: "text-yellow-400 border-yellow-400/20 bg-yellow-400/5" };
  if (now > state.auctionEnd) return { label: "ENDED", color: "text-red-400 border-red-400/20 bg-red-400/5" };
  return { label: "LIVE", color: "text-emerald-400 border-emerald-400/20 bg-emerald-400/5" };
}

function formatCountdown(targetTs: number): string {
  const diff = targetTs - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "—";
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${h}h ${m}m ${s}s`;
}

// Default to now+1h for auction start, formatted as datetime-local string
function defaultDateTimeLocal(offsetSeconds: number): string {
  const d = new Date(Date.now() + offsetSeconds * 1000);
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function LaunchPage() {
  const [pageTab, setPageTab] = useState<PageTab>("create");

  // ── Create Campaign state ─────────────────────────────────────────────────
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [totalSupply, setTotalSupply] = useState("");
  const [auctionStart, setAuctionStart] = useState("");
  const [auctionEnd, setAuctionEnd] = useState("");
  const [unlockDate, setUnlockDate] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [rtCap, setRtCap] = useState("5");
  const [createStatus, setCreateStatus] = useState<"idle" | "creating" | "done" | "error">("idle");
  const [createError, setCreateError] = useState("");
  const [createdCampaign, setCreatedCampaign] = useState<CreatedCampaign | null>(null);

  // ── Bid state ─────────────────────────────────────────────────────────────
  const [auctionState, setAuctionState] = useState<AuctionState | null>(null);
  const [userBids, setUserBids] = useState<BidInfo[]>([]);
  const [allBids, setAllBids] = useState<BidInfo[]>([]);
  const [usdcBalance, setUsdcBalance] = useState("0");
  const [tokenAmount, setTokenAmount] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [bidStatus, setBidStatus] = useState<"idle" | "approving" | "bidding" | "done" | "error">("idle");
  const [bidError, setBidError] = useState("");
  const [settleTxStatus, setSettleTxStatus] = useState<Record<number, "idle" | "settling" | "done" | "error">>({});
  const [countdown, setCountdown] = useState("");

  // Set date defaults only on client (avoids SSR hydration mismatch)
  useEffect(() => {
    setAuctionStart(defaultDateTimeLocal(3600));
    setAuctionEnd(defaultDateTimeLocal(3600 + 7 * 86400));
    setUnlockDate(defaultDateTimeLocal(3600 + 7 * 86400 + 30 * 86400));
  }, []);

  const loadAuctionData = useCallback(async () => {
    const [state, bids, all, usdc] = await Promise.all([
      getAuctionState(),
      getUserBids(demoAccount.address),
      getAllBids(),
      getUserUSDCBalance(demoAccount.address),
    ]);
    setAuctionState(state);
    setUserBids(bids);
    setAllBids(all);
    setUsdcBalance(usdc);
  }, []);

  useEffect(() => { loadAuctionData(); }, [loadAuctionData]);

  useEffect(() => {
    if (!auctionState) return;
    const now = Math.floor(Date.now() / 1000);
    const target = now < auctionState.auctionStart ? auctionState.auctionStart : auctionState.auctionEnd;
    const tick = setInterval(() => setCountdown(formatCountdown(target)), 1000);
    return () => clearInterval(tick);
  }, [auctionState]);

  // ── Create Campaign handler ───────────────────────────────────────────────
  async function handleCreateCampaign() {
    if (!ADDRESSES.factory) { setCreateError("Factory address not set in .env.local"); setCreateStatus("error"); return; }
    if (!tokenName || !tokenSymbol || !totalSupply || !minPrice || !auctionStart || !auctionEnd || !unlockDate) {
      setCreateError("All fields are required"); setCreateStatus("error"); return;
    }
    const startTs = BigInt(Math.floor(new Date(auctionStart).getTime() / 1000));
    const endTs = BigInt(Math.floor(new Date(auctionEnd).getTime() / 1000));
    const unlockTs = BigInt(Math.floor(new Date(unlockDate).getTime() / 1000));
    if (endTs <= startTs) { setCreateError("Auction end must be after start"); setCreateStatus("error"); return; }
    if (unlockTs <= endTs) { setCreateError("Unlock must be after auction end"); setCreateStatus("error"); return; }

    setCreateError("");
    setCreateStatus("creating");
    try {
      const supply = parseUnits(totalSupply, 18);
      const minPriceBig = parseUnits(minPrice, 6);
      const rtCapBig = BigInt(rtCap || "5");

      const campaignArgs = [{
        tokenName,
        tokenSymbol,
        maxSupply: supply,
        totalTokenSupply: supply,
        auctionStart: startTs,
        auctionEnd: endTs,
        unlockTime: unlockTs,
        minimumPrice: minPriceBig,
        rtCapMultiplier: rtCapBig,
        paymentToken: ADDRESSES.usdc as `0x${string}`,
        campaignOwner: demoAccount.address,
      }] as const;

      // Simulate first to get campaignId return value
      const { result: campaignId } = await publicClient.simulateContract({
        address: ADDRESSES.factory,
        abi: FactoryABI,
        functionName: "createCampaign",
        args: campaignArgs,
        account: demoAccount.address,
      });

      const hash = await demoWalletClient.writeContract({
        address: ADDRESSES.factory,
        abi: FactoryABI,
        functionName: "createCampaign",
        args: campaignArgs,
        account: demoAccount,
      });

      await publicClient.waitForTransactionReceipt({ hash });

      // Read campaign addresses directly from factory via getCampaign
      const data = await publicClient.readContract({
        address: ADDRESSES.factory,
        abi: FactoryABI,
        functionName: "getCampaign",
        args: [campaignId as bigint],
      }) as {
        launchToken: string; allocationNFT: string; batchAuction: string;
        principalToken: string; riskToken: string; armVault: string;
        settlement: string; liquidityBootstrap: string; campaignOwner: string;
      };

      setCreatedCampaign({
        campaignId: (campaignId as bigint).toString(),
        launchToken: data.launchToken,
        allocationNFT: data.allocationNFT,
        batchAuction: data.batchAuction,
        principalToken: data.principalToken,
        riskToken: data.riskToken,
        armVault: data.armVault,
        settlement: data.settlement,
      });
      setCreateStatus("done");
      await loadAuctionData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setCreateError(msg.slice(0, 200));
      setCreateStatus("error");
    }
  }

  // ── Bid handlers ──────────────────────────────────────────────────────────
  const tokenAmountBig = tokenAmount ? parseUnits(tokenAmount, 18) : 0n;
  const maxPriceBig = maxPrice ? parseUnits(maxPrice, 6) : 0n;
  const depositBig = tokenAmountBig > 0n && maxPriceBig > 0n
    ? (tokenAmountBig * maxPriceBig) / parseUnits("1", 18) : 0n;
  const depositDisplay = depositBig > 0n ? Number(formatUnits(depositBig, 6)).toFixed(4) : "0.00";

  async function handleSubmitBid() {
    if (!tokenAmount || !maxPrice || !ADDRESSES.batchAuction || !ADDRESSES.usdc) return;
    try {
      setBidError("");
      setBidStatus("approving");
      await demoWalletClient.writeContract({
        address: ADDRESSES.usdc, abi: ERC20ABI, functionName: "approve",
        args: [ADDRESSES.batchAuction, depositBig], account: demoAccount,
      });
      setBidStatus("bidding");
      await demoWalletClient.writeContract({
        address: ADDRESSES.batchAuction, abi: BatchAuctionABI, functionName: "submitBid",
        args: [tokenAmountBig, maxPriceBig], account: demoAccount,
      });
      setBidStatus("done");
      setTokenAmount(""); setMaxPrice("");
      await loadAuctionData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setBidError(msg.includes("user rejected") ? "Transaction rejected." : msg.slice(0, 160));
      setBidStatus("error");
    }
  }

  async function handleSettle(bidId: number) {
    if (!ADDRESSES.batchAuction) return;
    setSettleTxStatus((p) => ({ ...p, [bidId]: "settling" }));
    try {
      await demoWalletClient.writeContract({
        address: ADDRESSES.batchAuction, abi: BatchAuctionABI,
        functionName: "settle", args: [BigInt(bidId)], account: demoAccount,
      });
      setSettleTxStatus((p) => ({ ...p, [bidId]: "done" }));
      await loadAuctionData();
    } catch (err: unknown) {
      setSettleTxStatus((p) => ({ ...p, [bidId]: "error" }));
    }
  }

  const usdcBalanceDisplay = usdcBalance !== "0"
    ? Number(formatUnits(BigInt(usdcBalance), 6)).toFixed(2) : "0.00";
  const status = auctionState ? getAuctionStatus(auctionState) : null;
  const isLive = status?.label === "LIVE";
  const isFinalized = auctionState?.finalized ?? false;
  const minPriceDisplay = auctionState ? Number(formatUnits(BigInt(auctionState.minimumPrice), 6)).toFixed(4) : "—";
  const clearingPriceDisplay = auctionState && auctionState.clearingPrice !== "0"
    ? Number(formatUnits(BigInt(auctionState.clearingPrice), 6)).toFixed(6) : null;
  const totalSupplyDisplay = auctionState ? Number(formatUnits(BigInt(auctionState.totalTokenSupply), 18)).toLocaleString() : "—";
  const totalSubscribedDisplay = auctionState ? Number(formatUnits(BigInt(auctionState.totalSubscribed), 18)).toLocaleString() : "—";
  const fillPct = auctionState && BigInt(auctionState.totalTokenSupply) > 0n
    ? ((Number(auctionState.totalSubscribed) / Number(auctionState.totalTokenSupply)) * 100).toFixed(1) : "0.0";

  const canCreate = tokenName && tokenSymbol && totalSupply && minPrice && auctionStart && auctionEnd && unlockDate && createStatus !== "creating";

  return (
    <div className="relative min-h-screen pt-28 pb-20 px-6 font-sans overflow-hidden bg-[#0a111a]">
      <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 via-transparent to-transparent z-0 pointer-events-none" />

      <div className="relative z-10 max-w-[1300px] mx-auto">

        {/* Page tab switcher */}
        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setPageTab("create")}
            className={`px-6 py-3 rounded-xl text-[11px] font-mono font-bold uppercase tracking-widest transition-all ${pageTab === "create" ? "bg-white text-black" : "bg-white/5 text-neutral-500 hover:text-white border border-white/10"}`}
          >
            Launch Token
          </button>
          <button
            onClick={() => setPageTab("auction")}
            className={`px-6 py-3 rounded-xl text-[11px] font-mono font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${pageTab === "auction" ? "bg-white text-black" : "bg-white/5 text-neutral-500 hover:text-white border border-white/10"}`}
          >
            Active Auction
            {auctionState && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${status?.color}`}>{status?.label}</span>
            )}
          </button>
        </div>

        {/* ── CREATE CAMPAIGN TAB ─────────────────────────────────────────── */}
        {pageTab === "create" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* LEFT: Form */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-[#0d1724]/60 border border-white/5 rounded-3xl p-8">
                <h2 className="text-2xl font-medium text-white tracking-tight mb-1">Launch a Token</h2>
                <p className="text-[11px] font-mono text-neutral-600 uppercase tracking-widest mb-8">Create a Penguin Protocol campaign via factory</p>

                {/* Token Identity */}
                <div className="mb-6">
                  <p className="text-[10px] font-mono text-blue-400/70 uppercase tracking-widest mb-3">Token Identity</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Token Name</label>
                      <input
                        type="text" placeholder="e.g. XProtocol" value={tokenName}
                        onChange={(e) => setTokenName(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-blue-500/40 placeholder:text-neutral-700"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Token Symbol</label>
                      <input
                        type="text" placeholder="e.g. XPC" value={tokenSymbol}
                        onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-blue-500/40 placeholder:text-neutral-700"
                      />
                    </div>
                  </div>
                </div>

                {/* Supply + Price */}
                <div className="mb-6">
                  <p className="text-[10px] font-mono text-blue-400/70 uppercase tracking-widest mb-3">Supply & Price</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Total Supply</label>
                      <div className="relative">
                        <input
                          type="number" placeholder="1000000" value={totalSupply}
                          onChange={(e) => setTotalSupply(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-blue-500/40 placeholder:text-neutral-700"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-neutral-600">TOKENS</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Floor Price</label>
                      <div className="relative">
                        <input
                          type="number" placeholder="1.00" value={minPrice}
                          onChange={(e) => setMinPrice(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-blue-500/40 placeholder:text-neutral-700"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-neutral-600">USDC</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dates */}
                <div className="mb-6">
                  <p className="text-[10px] font-mono text-blue-400/70 uppercase tracking-widest mb-3">Auction Timeline</p>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Auction Start</label>
                        <input
                          type="datetime-local" value={auctionStart}
                          onChange={(e) => setAuctionStart(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-blue-500/40 [color-scheme:dark]"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Auction End</label>
                        <input
                          type="datetime-local" value={auctionEnd}
                          onChange={(e) => setAuctionEnd(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-blue-500/40 [color-scheme:dark]"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Token Unlock Date</label>
                      <input
                        type="datetime-local" value={unlockDate}
                        onChange={(e) => setUnlockDate(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-blue-500/40 [color-scheme:dark]"
                      />
                    </div>
                  </div>
                </div>

                {/* RT Cap Multiplier */}
                <div className="mb-8">
                  <p className="text-[10px] font-mono text-blue-400/70 uppercase tracking-widest mb-3">Risk Parameters</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">RT Cap Multiplier</label>
                      <div className="relative">
                        <input
                          type="number" min="1" max="100" placeholder="5" value={rtCap}
                          onChange={(e) => setRtCap(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-blue-500/40 placeholder:text-neutral-700"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-neutral-600">×</span>
                      </div>
                      <p className="text-[9px] text-neutral-700 font-light">Max RT payout = clearing price × RT cap multiplier</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Payment Token</label>
                      <div className="bg-black/20 border border-white/5 rounded-xl px-4 py-3 font-mono text-[11px] text-neutral-500">
                        {ADDRESSES.usdc ? shortAddr(ADDRESSES.usdc) : "—"} <span className="text-neutral-700">(USDC)</span>
                      </div>
                    </div>
                  </div>
                </div>

                {createStatus === "error" && (
                  <p className="mb-4 text-[10px] font-mono text-red-400 bg-red-400/5 border border-red-400/20 rounded-xl px-3 py-2">{createError}</p>
                )}

                <button
                  onClick={handleCreateCampaign}
                  disabled={!canCreate}
                  className="w-full bg-white text-black font-bold py-4 rounded-2xl hover:bg-blue-50 transition-all text-sm tracking-[0.2em] uppercase disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {createStatus === "creating" ? "Deploying Contracts…" : "Launch Token"}
                </button>
              </div>
            </div>

            {/* RIGHT: Summary + Result */}
            <div className="lg:col-span-5 space-y-6">

              {/* Live preview */}
              <div className="bg-[#101926]/60 border border-white/5 rounded-3xl p-8">
                <h4 className="text-[10px] font-mono text-blue-400 uppercase tracking-widest mb-5">Campaign Preview</h4>
                <div className="space-y-4">
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-neutral-500">Token</span>
                    <span className="text-white">{tokenName || "—"} <span className="text-neutral-500">({tokenSymbol || "—"})</span></span>
                  </div>
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-neutral-500">Supply</span>
                    <span className="text-white">{totalSupply ? Number(totalSupply).toLocaleString() : "—"} tokens</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-neutral-500">Floor Price</span>
                    <span className="text-white">{minPrice ? `$${minPrice}` : "—"} USDC</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-neutral-500">Fully Diluted</span>
                    <span className="text-emerald-400">
                      {totalSupply && minPrice ? `$${(Number(totalSupply) * Number(minPrice)).toLocaleString()} FDV floor` : "—"}
                    </span>
                  </div>
                  <div className="h-px bg-white/5" />
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-neutral-500">Auction Start</span>
                    <span className="text-white">{auctionStart ? new Date(auctionStart).toLocaleString() : "—"}</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-neutral-500">Auction End</span>
                    <span className="text-white">{auctionEnd ? new Date(auctionEnd).toLocaleString() : "—"}</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-neutral-500">Unlock Date</span>
                    <span className="text-white">{unlockDate ? new Date(unlockDate).toLocaleString() : "—"}</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-neutral-500">RT Cap Multiplier</span>
                    <span className="text-orange-400">{rtCap || "5"}×</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-neutral-500">Campaign Owner</span>
                    <span className="text-neutral-300 font-mono text-[10px]">{shortAddr(demoAccount.address)}</span>
                  </div>
                </div>
              </div>

              {/* What gets deployed */}
              <div className="bg-[#0d1724]/40 border border-white/5 rounded-2xl p-6">
                <h4 className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-4">Contracts Deployed On Launch</h4>
                <ul className="space-y-2 text-[11px] font-mono text-neutral-500">
                  {["LaunchToken (ERC-20)", "BatchAuction (uniform clearing price)", "AllocationNFT (ERC-721)", "ARMVault (PT+RT splitter)", "Settlement (redemption)"].map((c) => (
                    <li key={c} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500/50 flex-shrink-0" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Created campaign addresses */}
              {createStatus === "done" && createdCampaign && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6">
                  <h4 className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest mb-4">
                    Campaign #{createdCampaign.campaignId} Deployed
                  </h4>
                  <div className="space-y-2">
                    {[
                      ["LaunchToken", createdCampaign.launchToken],
                      ["BatchAuction", createdCampaign.batchAuction],
                      ["AllocationNFT", createdCampaign.allocationNFT],
                      ["ARMVault", createdCampaign.armVault],
                      ["Settlement", createdCampaign.settlement],
                      ["PrincipalToken", createdCampaign.principalToken],
                      ["RiskToken", createdCampaign.riskToken],
                    ].map(([label, addr]) => (
                      <div key={label} className="flex justify-between text-[10px] font-mono">
                        <span className="text-neutral-500">{label}</span>
                        <span className="text-emerald-300">{addr}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[9px] text-neutral-600 mt-4">Copy these addresses into your .env.local to use this campaign.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ACTIVE AUCTION TAB ──────────────────────────────────────────── */}
        {pageTab === "auction" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* LEFT: Chart + Stats */}
            <div className="lg:col-span-8 flex flex-col gap-6">

              {/* Auction Stats Bar */}
              {auctionState ? (
                <div className="bg-[#0d1724]/60 border border-white/5 rounded-2xl px-6 py-4 grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div>
                    <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">Status</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${status?.color}`}>{status?.label}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">Floor Price</span>
                    <span className="text-sm font-mono text-white">${minPriceDisplay}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">Clearing Price</span>
                    <span className="text-sm font-mono text-blue-400">{clearingPriceDisplay ? `$${clearingPriceDisplay}` : "TBD"}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">Fill</span>
                    <span className="text-sm font-mono text-emerald-400">{fillPct}%</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">
                      {!auctionState.finalized && Math.floor(Date.now() / 1000) < auctionState.auctionStart ? "Starts In" : "Ends In"}
                    </span>
                    <span className="text-sm font-mono text-white">{auctionState.finalized ? "—" : countdown}</span>
                  </div>
                </div>
              ) : (
                <div className="bg-[#0d1724]/40 border border-white/5 rounded-2xl px-6 py-4 text-center">
                  <p className="text-[11px] font-mono text-neutral-600">No active auction — create one in the Launch Token tab</p>
                </div>
              )}

              {/* Demand curve chart */}
              <div className="bg-[#0d1724]/40 backdrop-blur-3xl border border-white/5 rounded-3xl p-8 h-[460px] flex flex-col shadow-2xl">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-medium text-white tracking-tight">Demand Curve</h2>
                    <p className="text-xs font-mono text-blue-400/60 uppercase tracking-[0.2em] mt-1 italic">Uniform Clearing Price · Pro-Rata Fill</p>
                  </div>
                  <div className="flex gap-8">
                    <div className="text-right">
                      <span className="block text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1">Total Supply</span>
                      <span className="text-xl font-mono text-white">{totalSupplyDisplay}</span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-1">Subscribed</span>
                      <span className="text-xl font-mono text-emerald-400">{totalSubscribedDisplay}</span>
                    </div>
                  </div>
                </div>
                <div className="flex-1 w-full min-h-0">
                  <BondingCurveChart
                    bids={allBids}
                    totalTokenSupply={auctionState?.totalTokenSupply ?? "0"}
                    clearingPrice={auctionState?.clearingPrice ?? "0"}
                    minimumPrice={auctionState?.minimumPrice ?? "0"}
                  />
                </div>
              </div>

              {/* User Bids */}
              {userBids.length > 0 && (
                <div className="bg-[#0d1724]/40 border border-white/5 rounded-2xl p-6">
                  <h4 className="text-[10px] font-mono text-blue-400 uppercase tracking-widest mb-4">Your Bids</h4>
                  <div className="space-y-2">
                    {userBids.map((bid) => {
                      const isWinning = auctionState && BigInt(auctionState.clearingPrice) > 0n
                        ? BigInt(bid.maxPrice) >= BigInt(auctionState.clearingPrice) : null;
                      const sStatus = settleTxStatus[bid.bidId] ?? "idle";
                      return (
                        <div key={bid.bidId} className="flex flex-wrap justify-between items-center gap-2 py-2 border-b border-white/5 text-[11px] font-mono">
                          <span className="text-neutral-500">Bid #{bid.bidId}</span>
                          <span className="text-white">{Number(formatUnits(BigInt(bid.tokenAmount), 18)).toLocaleString()} tokens</span>
                          <span className="text-blue-400">Max ${Number(formatUnits(BigInt(bid.maxPrice), 6)).toFixed(4)}</span>
                          {bid.settled ? (
                            <span className="text-emerald-400">Claimed</span>
                          ) : isFinalized ? (
                            <button
                              onClick={() => handleSettle(bid.bidId)}
                              disabled={sStatus === "settling" || sStatus === "done"}
                              className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-40 ${
                                isWinning
                                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30"
                                  : "bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30"
                              }`}
                            >
                              {sStatus === "settling" ? "Claiming…" : sStatus === "done" ? "Done" : isWinning ? "Claim NFT" : "Get Refund"}
                            </button>
                          ) : (
                            <span className="text-yellow-400">Pending</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT: Bid Panel */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              <div className="bg-[#101926]/80 backdrop-blur-2xl border border-blue-500/20 rounded-3xl p-8 shadow-2xl">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-medium text-white uppercase tracking-tight">Place Bid</h3>
                  <div className={`px-2 py-1 rounded text-[10px] font-mono border ${status?.color ?? "text-neutral-500 border-white/10 bg-white/5"}`}>
                    {status?.label ?? "NO AUCTION"}
                  </div>
                </div>
                <div className="flex items-center justify-between mb-6 px-1">
                  <span className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest">USDC Balance</span>
                  <span className="text-[11px] font-mono text-neutral-300">{usdcBalanceDisplay} USDC</span>
                </div>

                <div className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex justify-between px-1">
                      <label className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Token Amount</label>
                      <span className="text-[10px] font-mono text-neutral-500">LaunchTokens</span>
                    </div>
                    <div className="relative">
                      <input type="number" placeholder="0.00" value={tokenAmount}
                        onChange={(e) => setTokenAmount(e.target.value)} disabled={!isLive}
                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-xl text-white focus:outline-none focus:border-blue-500/40 transition-all font-mono placeholder:text-neutral-800 disabled:opacity-40"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-neutral-500">TOKENS</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between px-1">
                      <label className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Max Price / Token</label>
                      <span className="text-[10px] font-mono text-neutral-500">MIN: ${minPriceDisplay}</span>
                    </div>
                    <div className="relative">
                      <input type="number" placeholder={minPriceDisplay !== "—" ? minPriceDisplay : "0.000000"}
                        value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} disabled={!isLive}
                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-xl text-white focus:outline-none focus:border-blue-500/40 transition-all font-mono placeholder:text-neutral-800 disabled:opacity-40"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-neutral-500">USDC</span>
                    </div>
                  </div>

                  <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5 space-y-3 font-mono">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-neutral-500 uppercase">USDC Deposit</span>
                      <span className="text-white">{depositDisplay} USDC</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-neutral-500 uppercase">Clearing Price</span>
                      <span className="text-blue-400">{clearingPriceDisplay ? `$${clearingPriceDisplay}` : "Set at close"}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-neutral-500 uppercase">Unlock Date</span>
                      <span className="text-white">
                        {auctionState ? new Date(auctionState.unlockTime * 1000).toLocaleDateString() : "—"}
                      </span>
                    </div>
                  </div>

                  {bidStatus === "error" && (
                    <p className="text-[10px] font-mono text-red-400 bg-red-400/5 border border-red-400/20 rounded-xl px-3 py-2">{bidError}</p>
                  )}
                  {bidStatus === "done" && (
                    <p className="text-[10px] font-mono text-emerald-400 bg-emerald-400/5 border border-emerald-400/20 rounded-xl px-3 py-2">
                      Bid submitted! Settle after auction closes to claim your Allocation NFT.
                    </p>
                  )}

                  <button
                    onClick={handleSubmitBid}
                    disabled={!isLive || !tokenAmount || !maxPrice || bidStatus === "approving" || bidStatus === "bidding"}
                    className="w-full bg-white text-black font-bold py-5 rounded-2xl hover:bg-blue-50 transition-all transform active:scale-[0.98] shadow-[0_0_30px_rgba(255,255,255,0.05)] text-sm tracking-[0.2em] uppercase disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {bidStatus === "approving" ? "Approving USDC…" : bidStatus === "bidding" ? "Submitting Bid…" : "Submit Bid"}
                  </button>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-[#0d1724]/60 border border-white/5">
                <h4 className="text-[10px] font-mono text-blue-400 uppercase tracking-widest mb-3">How It Works</h4>
                <ul className="space-y-2 text-[11px] leading-relaxed text-neutral-500 font-light list-disc list-inside">
                  <li>Set your token amount and <span className="text-neutral-300">max price</span> per token.</li>
                  <li>Deposit <span className="text-neutral-300">amount × max price</span> in USDC upfront.</li>
                  <li>After close, a single <span className="text-blue-200">clearing price</span> is set.</li>
                  <li>Winning bids → <span className="text-blue-200">Allocation NFT</span> + USDC refund.</li>
                  <li>Losing bids → full USDC refund.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
