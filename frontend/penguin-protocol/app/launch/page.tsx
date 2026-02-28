"use client";

import { useEffect, useState, useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, parseUnits, formatUnits } from "viem";
import { bsc } from "viem/chains";
import dynamic from "next/dynamic";
import { getAuctionState, getUserBids } from "@/app/actions/auction";
import type { AuctionState, BidInfo } from "@/app/actions/auction";
import { ADDRESSES } from "@/lib/contracts";
import BatchAuctionABI from "@/lib/abi/BatchAuction.json";
import ERC20ABI from "@/lib/abi/ERC20Extended.json";

const BondingCurveChart = dynamic(() => import("@/components/ui/BondingCurveChart"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-blue-500/5 animate-pulse rounded-2xl" />,
});

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

export default function LaunchPage() {
  const { authenticated, ready, login } = usePrivy();
  const { wallets } = useWallets();

  const [auctionState, setAuctionState] = useState<AuctionState | null>(null);
  const [userBids, setUserBids] = useState<BidInfo[]>([]);
  const [tokenAmount, setTokenAmount] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [txStatus, setTxStatus] = useState<"idle" | "approving" | "bidding" | "done" | "error">("idle");
  const [txError, setTxError] = useState("");
  const [countdown, setCountdown] = useState("");

  const wallet = wallets[0];

  const loadData = useCallback(async () => {
    const state = await getAuctionState();
    setAuctionState(state);
    if (wallet?.address) {
      const bids = await getUserBids(wallet.address);
      setUserBids(bids);
    }
  }, [wallet?.address]);

  useEffect(() => { loadData(); }, [loadData]);

  // Live countdown
  useEffect(() => {
    if (!auctionState) return;
    const now = Math.floor(Date.now() / 1000);
    const target = now < auctionState.auctionStart ? auctionState.auctionStart : auctionState.auctionEnd;
    const tick = setInterval(() => setCountdown(formatCountdown(target)), 1000);
    return () => clearInterval(tick);
  }, [auctionState]);

  // tokenAmount in 1e18, maxPrice in USDC 6dp
  const tokenAmountBig = tokenAmount ? parseUnits(tokenAmount, 18) : 0n;
  const maxPriceBig = maxPrice ? parseUnits(maxPrice, 6) : 0n;
  // deposit(6dp) = tokenAmount(1e18) * maxPrice(6dp) / 1e18
  const depositBig = tokenAmountBig > 0n && maxPriceBig > 0n
    ? (tokenAmountBig * maxPriceBig) / parseUnits("1", 18)
    : 0n;
  const depositDisplay = depositBig > 0n ? Number(formatUnits(depositBig, 6)).toFixed(4) : "0.00";

  const minPriceDisplay = auctionState ? Number(formatUnits(BigInt(auctionState.minimumPrice), 6)).toFixed(6) : "—";
  const clearingPriceDisplay = auctionState && auctionState.clearingPrice !== "0"
    ? Number(formatUnits(BigInt(auctionState.clearingPrice), 6)).toFixed(6)
    : null;
  const totalSupplyDisplay = auctionState
    ? Number(formatUnits(BigInt(auctionState.totalTokenSupply), 18)).toLocaleString()
    : "—";
  const totalSubscribedDisplay = auctionState
    ? Number(formatUnits(BigInt(auctionState.totalSubscribed), 18)).toLocaleString()
    : "—";
  const fillPct = auctionState && BigInt(auctionState.totalTokenSupply) > 0n
    ? ((Number(auctionState.totalSubscribed) / Number(auctionState.totalTokenSupply)) * 100).toFixed(1)
    : "0.0";

  async function handleSubmitBid() {
    if (!wallet || !tokenAmount || !maxPrice) return;
    if (!ADDRESSES.batchAuction || !ADDRESSES.usdc) {
      setTxError("Contract addresses not set in .env.local");
      setTxStatus("error");
      return;
    }
    try {
      setTxError("");
      const provider = await wallet.getEthereumProvider();
      const walletClient = createWalletClient({ chain: bsc, transport: custom(provider) });
      const account = wallet.address as `0x${string}`;

      // 1. Approve USDC deposit amount
      setTxStatus("approving");
      await walletClient.writeContract({
        address: ADDRESSES.usdc,
        abi: ERC20ABI,
        functionName: "approve",
        args: [ADDRESSES.batchAuction, depositBig],
        account,
      });

      // 2. Submit bid
      setTxStatus("bidding");
      await walletClient.writeContract({
        address: ADDRESSES.batchAuction,
        abi: BatchAuctionABI,
        functionName: "submitBid",
        args: [tokenAmountBig, maxPriceBig],
        account,
      });

      setTxStatus("done");
      setTokenAmount("");
      setMaxPrice("");
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTxError(msg.includes("user rejected") ? "Transaction rejected." : msg.slice(0, 160));
      setTxStatus("error");
    }
  }

  const status = auctionState ? getAuctionStatus(auctionState) : null;
  const isLive = status?.label === "LIVE";

  if (ready && !authenticated) {
    return (
      <div className="relative min-h-screen flex items-center justify-center font-sans overflow-hidden bg-[#0a111a]">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent z-0" />
        <div className="relative z-10 text-center space-y-6">
          <h1 className="text-4xl font-medium text-white tracking-tight uppercase">Access Terminal</h1>
          <p className="text-neutral-500 max-w-xs mx-auto font-light text-sm">
            Connect your wallet to participate in the Penguin Protocol auction.
          </p>
          <button onClick={login} className="bg-white text-black px-10 py-4 rounded-full font-bold hover:bg-blue-50 transition-all shadow-[0_0_30px_rgba(255,255,255,0.1)]">
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen pt-32 pb-20 px-6 font-sans overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a111a]/60 via-[#0a111a]/90 to-[#0a111a] z-0" />

      <div className="relative z-10 max-w-[1300px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* LEFT: Chart + Stats */}
        <div className="lg:col-span-8 flex flex-col gap-6">

          {/* Auction Stats Bar */}
          {auctionState && (
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
          )}

          {/* Chart */}
          <div className="bg-[#0d1724]/40 backdrop-blur-3xl border border-white/5 rounded-3xl p-8 h-[480px] flex flex-col shadow-2xl">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-medium text-white tracking-tight">Batch Auction</h2>
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
              <BondingCurveChart />
            </div>
          </div>

          {/* User Bids */}
          {userBids.length > 0 && (
            <div className="bg-[#0d1724]/40 border border-white/5 rounded-2xl p-6">
              <h4 className="text-[10px] font-mono text-blue-400 uppercase tracking-widest mb-4">Your Bids</h4>
              <div className="space-y-2">
                {userBids.map((bid) => (
                  <div key={bid.bidId} className="flex justify-between items-center py-2 border-b border-white/5 text-[11px] font-mono">
                    <span className="text-neutral-500">Bid #{bid.bidId}</span>
                    <span className="text-white">{Number(formatUnits(BigInt(bid.tokenAmount), 18)).toLocaleString()} tokens</span>
                    <span className="text-blue-400">Max ${Number(formatUnits(BigInt(bid.maxPrice), 6)).toFixed(4)}</span>
                    <span className={bid.settled ? "text-emerald-400" : "text-yellow-400"}>{bid.settled ? "Settled" : "Pending"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Bid Panel */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-[#101926]/80 backdrop-blur-2xl border border-blue-500/20 rounded-3xl p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-lg font-medium text-white uppercase tracking-tight">Place Bid</h3>
              <div className={`px-2 py-1 rounded text-[10px] font-mono border ${status?.color ?? "text-neutral-500 border-white/10 bg-white/5"}`}>
                {status?.label ?? "LOADING"}
              </div>
            </div>

            <div className="space-y-5">
              {/* Token Amount */}
              <div className="space-y-2">
                <div className="flex justify-between px-1">
                  <label className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Token Amount</label>
                  <span className="text-[10px] font-mono text-neutral-500">in LaunchTokens</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="0.00"
                    value={tokenAmount}
                    onChange={(e) => setTokenAmount(e.target.value)}
                    disabled={!isLive}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-xl text-white focus:outline-none focus:border-blue-500/40 transition-all font-mono placeholder:text-neutral-800 disabled:opacity-40"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-neutral-500">TOKENS</span>
                </div>
              </div>

              {/* Max Price */}
              <div className="space-y-2">
                <div className="flex justify-between px-1">
                  <label className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Max Price / Token</label>
                  <span className="text-[10px] font-mono text-neutral-500">MIN: ${minPriceDisplay}</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    placeholder={minPriceDisplay !== "—" ? minPriceDisplay : "0.000000"}
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    disabled={!isLive}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-xl text-white focus:outline-none focus:border-blue-500/40 transition-all font-mono placeholder:text-neutral-800 disabled:opacity-40"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-neutral-500">USDC</span>
                </div>
              </div>

              {/* Summary */}
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

              {txStatus === "error" && (
                <p className="text-[10px] font-mono text-red-400 bg-red-400/5 border border-red-400/20 rounded-xl px-3 py-2">{txError}</p>
              )}
              {txStatus === "done" && (
                <p className="text-[10px] font-mono text-emerald-400 bg-emerald-400/5 border border-emerald-400/20 rounded-xl px-3 py-2">
                  Bid submitted! Settle after auction closes to receive your Allocation NFT.
                </p>
              )}

              <button
                onClick={handleSubmitBid}
                disabled={!isLive || !tokenAmount || !maxPrice || txStatus === "approving" || txStatus === "bidding"}
                className="w-full bg-white text-black font-bold py-5 rounded-2xl hover:bg-blue-50 transition-all transform active:scale-[0.98] shadow-[0_0_30px_rgba(255,255,255,0.05)] text-sm tracking-[0.2em] uppercase disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {txStatus === "approving" ? "Approving USDC..." : txStatus === "bidding" ? "Submitting Bid..." : "Submit Bid"}
              </button>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[#0d1724]/60 border border-white/5">
            <h4 className="text-[10px] font-mono text-blue-400 uppercase tracking-widest mb-3">How It Works</h4>
            <ul className="space-y-2 text-[11px] leading-relaxed text-neutral-500 font-light list-disc list-inside">
              <li>Set your token amount and the <span className="text-neutral-300">max price</span> you will pay per token.</li>
              <li>You deposit <span className="text-neutral-300">tokens × max price</span> in USDC upfront.</li>
              <li>After close, a single <span className="text-blue-200">clearing price</span> is set — the lowest price where demand meets supply.</li>
              <li>Winning bids receive an <span className="text-blue-200">Allocation NFT</span> + refund of excess USDC.</li>
              <li>Losing bids (max price below clearing) get a full USDC refund.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
