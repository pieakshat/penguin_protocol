"use client";

import { useEffect, useState, useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, parseUnits, formatUnits } from "viem";
import { bsc } from "viem/chains";
import dynamic from "next/dynamic";
import { getSettlementState, getUserBalances } from "@/app/actions/settlement";
import type { SettlementState } from "@/app/actions/settlement";
import { ADDRESSES } from "@/lib/contracts";
import SettlementABI from "@/lib/abi/Settlement.json";
import ERC20ABI from "@/lib/abi/ERC20Extended.json";

const BondingCurveChart = dynamic(() => import("@/components/ui/BondingCurveChart"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-blue-500/5 animate-pulse rounded-3xl" />,
});

type Tab = "pt" | "rt";
type TxStatus = "idle" | "approving" | "redeeming" | "done" | "error";

export default function MarketsPage() {
  const { authenticated } = usePrivy();
  const { wallets: privyWallets } = useWallets();

  const [settlement, setSettlement] = useState<SettlementState | null>(null);
  const [ptBalance, setPtBalance] = useState("0");
  const [rtBalance, setRtBalance] = useState("0");
  const [tab, setTab] = useState<Tab>("pt");
  const [redeemAmount, setRedeemAmount] = useState("");
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txError, setTxError] = useState("");

  const wallet = privyWallets[0];

  const loadData = useCallback(async () => {
    const [state, balances] = await Promise.all([
      getSettlementState(),
      wallet?.address ? getUserBalances(wallet.address) : Promise.resolve({ ptBalance: "0", rtBalance: "0" }),
    ]);
    setSettlement(state);
    setPtBalance(balances.ptBalance);
    setRtBalance(balances.rtBalance);
  }, [wallet?.address]);

  useEffect(() => { loadData(); }, [loadData]);

  const ptBalanceFmt = ptBalance !== "0" ? Number(formatUnits(BigInt(ptBalance), 18)).toLocaleString() : "0";
  const rtBalanceFmt = rtBalance !== "0" ? Number(formatUnits(BigInt(rtBalance), 18)).toLocaleString() : "0";

  const tgePriceFmt = settlement?.tgePrice && settlement.tgePrice !== "0"
    ? Number(formatUnits(BigInt(settlement.tgePrice), 6)).toFixed(6)
    : null;
  const clearingPriceFmt = settlement?.clearingPrice && settlement.clearingPrice !== "0"
    ? Number(formatUnits(BigInt(settlement.clearingPrice), 6)).toFixed(6)
    : null;
  const payoutPerRTFmt = settlement?.payoutPerRT && settlement.payoutPerRT !== "0"
    ? Number(formatUnits(BigInt(settlement.payoutPerRT), 6)).toFixed(6)
    : null;

  const now = Math.floor(Date.now() / 1000);
  const unlocked = settlement ? now >= settlement.unlockTime : false;
  const tgeSet = settlement?.tgePriceSet ?? false;

  // Estimated payout for RT tab
  const redeemAmountBig = redeemAmount ? parseUnits(redeemAmount, 18) : 0n;
  const estimatedUSDC = settlement && redeemAmountBig > 0n && settlement.payoutPerRT !== "0"
    ? Number(formatUnits((redeemAmountBig * BigInt(settlement.payoutPerRT)) / parseUnits("1", 18), 6)).toFixed(4)
    : "0.00";

  async function handleRedeem() {
    if (!wallet || !redeemAmount) return;
    if (!ADDRESSES.settlement) {
      setTxError("Settlement address not set in .env.local");
      setTxStatus("error");
      return;
    }
    try {
      setTxError("");
      const provider = await wallet.getEthereumProvider();
      const walletClient = createWalletClient({ chain: bsc, transport: custom(provider) });
      const account = wallet.address as `0x${string}`;
      const amount = parseUnits(redeemAmount, 18);

      if (tab === "pt") {
        // Approve PT → Settlement, then redeemPT
        setTxStatus("approving");
        await walletClient.writeContract({
          address: ADDRESSES.principalToken,
          abi: ERC20ABI,
          functionName: "approve",
          args: [ADDRESSES.settlement, amount],
          account,
        });
        setTxStatus("redeeming");
        await walletClient.writeContract({
          address: ADDRESSES.settlement,
          abi: SettlementABI,
          functionName: "redeemPT",
          args: [amount],
          account,
        });
      } else {
        // Approve RT → Settlement, then settleRT
        setTxStatus("approving");
        await walletClient.writeContract({
          address: ADDRESSES.riskToken,
          abi: ERC20ABI,
          functionName: "approve",
          args: [ADDRESSES.settlement, amount],
          account,
        });
        setTxStatus("redeeming");
        await walletClient.writeContract({
          address: ADDRESSES.settlement,
          abi: SettlementABI,
          functionName: "settleRT",
          args: [amount],
          account,
        });
      }

      setTxStatus("done");
      setRedeemAmount("");
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTxError(msg.includes("user rejected") ? "Transaction rejected." : msg.slice(0, 160));
      setTxStatus("error");
    }
  }

  const canRedeemPT = unlocked && tab === "pt";
  const canRedeemRT = tgeSet && tab === "rt";
  const canSubmit = (canRedeemPT || canRedeemRT) && !!redeemAmount && txStatus !== "approving" && txStatus !== "redeeming";

  return (
    <div className="min-h-screen pt-20 flex flex-col bg-[#0a111a] font-sans">

      {/* Stats Bar */}
      <div className="w-full bg-[#0d1724]/60 backdrop-blur-xl border-b border-white/5 py-4 px-8 flex items-center gap-10 overflow-x-auto">
        <StatCell label="TGE Price" value={tgePriceFmt ? `$${tgePriceFmt}` : "Pending"} color={tgePriceFmt ? "text-blue-400" : "text-neutral-500"} />
        <StatCell label="Clearing Price" value={clearingPriceFmt ? `$${clearingPriceFmt}` : "—"} color="text-white" />
        <StatCell label="RT Payout / RT" value={payoutPerRTFmt ? `$${payoutPerRTFmt}` : "—"} color="text-orange-400" />
        <StatCell label="Your PT" value={`${ptBalanceFmt} PT`} color="text-emerald-400" />
        <StatCell label="Your RT" value={`${rtBalanceFmt} RT`} color="text-orange-400" />
        <StatCell
          label="Settlement Status"
          value={!unlocked ? "Locked" : !tgeSet ? "Awaiting TGE Price" : "Open"}
          color={!unlocked ? "text-red-400" : !tgeSet ? "text-yellow-400" : "text-emerald-400"}
        />
      </div>

      <div className="flex-1 grid grid-cols-12 overflow-hidden border-t border-white/5">

        {/* LEFT: Chart */}
        <div className="col-span-12 lg:col-span-8 p-6 flex flex-col space-y-6">
          <div className="flex-1 min-h-[400px] bg-[#0d1724]/40 rounded-[2rem] p-6 border border-white/5 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 flex gap-2">
              <span className="px-2 py-1 bg-blue-500/10 border border-blue-500/20 text-[9px] text-blue-400 font-mono rounded">PT</span>
              <span className="px-2 py-1 bg-orange-500/10 border border-orange-500/20 text-[9px] text-orange-400 font-mono rounded">RT</span>
            </div>
            <BondingCurveChart />
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InfoBox label="RT Cap Multiplier" value={settlement ? `${settlement.rtCapMultiplier}x` : "—"} />
            <InfoBox
              label="Unlock Date"
              value={settlement ? new Date(settlement.unlockTime * 1000).toLocaleDateString() : "—"}
            />
            <InfoBox
              label="Settlement Deadline"
              value={
                settlement?.tgePriceSet && settlement.settlementWindowDeadline
                  ? new Date(settlement.settlementWindowDeadline * 1000).toLocaleDateString()
                  : "—"
              }
            />
            <InfoBox
              label="RT Reserve"
              value={
                settlement && settlement.rtReserve !== "0"
                  ? `$${Number(formatUnits(BigInt(settlement.rtReserve), 6)).toLocaleString()}`
                  : "$0"
              }
            />
          </div>
        </div>

        {/* RIGHT: Redemption Panel */}
        <div className="col-span-12 lg:col-span-4 border-l border-white/5 bg-[#101926]/20 p-6 flex flex-col gap-6">

          {/* Tab toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => { setTab("pt"); setRedeemAmount(""); setTxStatus("idle"); }}
              className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                tab === "pt" ? "bg-emerald-500 text-black" : "bg-white/5 text-neutral-500 hover:text-white"
              }`}
            >
              Redeem PT
            </button>
            <button
              onClick={() => { setTab("rt"); setRedeemAmount(""); setTxStatus("idle"); }}
              className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                tab === "rt" ? "bg-orange-500 text-black" : "bg-white/5 text-neutral-500 hover:text-white"
              }`}
            >
              Settle RT
            </button>
          </div>

          {/* Status info */}
          <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-2 font-mono text-[11px]">
            {tab === "pt" ? (
              <>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Your PT Balance</span>
                  <span className="text-white">{ptBalanceFmt} PT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Receive</span>
                  <span className="text-emerald-400">1:1 LaunchToken</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Unlock</span>
                  <span className={unlocked ? "text-emerald-400" : "text-red-400"}>
                    {unlocked ? "Unlocked" : settlement ? new Date(settlement.unlockTime * 1000).toLocaleDateString() : "—"}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Your RT Balance</span>
                  <span className="text-white">{rtBalanceFmt} RT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Payout Per RT</span>
                  <span className="text-orange-400">{payoutPerRTFmt ? `$${payoutPerRTFmt}` : "TBD"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">TGE Price</span>
                  <span className={tgeSet ? "text-blue-400" : "text-yellow-400"}>
                    {tgePriceFmt ? `$${tgePriceFmt}` : "Not set"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Est. USDC Out</span>
                  <span className="text-white">{estimatedUSDC} USDC</span>
                </div>
              </>
            )}
          </div>

          {/* Amount input */}
          <div className="space-y-2">
            <div className="flex justify-between px-1">
              <label className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
                {tab === "pt" ? "PT Amount" : "RT Amount"}
              </label>
              <button
                onClick={() => setRedeemAmount(
                  tab === "pt"
                    ? formatUnits(BigInt(ptBalance), 18)
                    : formatUnits(BigInt(rtBalance), 18)
                )}
                className="text-[10px] font-mono text-blue-400 hover:text-white transition-colors"
              >
                MAX
              </button>
            </div>
            <input
              type="number"
              placeholder="0.00"
              value={redeemAmount}
              onChange={(e) => setRedeemAmount(e.target.value)}
              disabled={tab === "pt" ? !unlocked : !tgeSet}
              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-mono text-sm focus:outline-none focus:border-blue-500/40 disabled:opacity-40"
            />
          </div>

          {/* Not yet unlocked warnings */}
          {tab === "pt" && !unlocked && (
            <p className="text-[10px] font-mono text-yellow-400 bg-yellow-400/5 border border-yellow-400/20 rounded-xl px-3 py-2">
              PT redemption unlocks on {settlement ? new Date(settlement.unlockTime * 1000).toLocaleString() : "—"}
            </p>
          )}
          {tab === "rt" && !tgeSet && (
            <p className="text-[10px] font-mono text-yellow-400 bg-yellow-400/5 border border-yellow-400/20 rounded-xl px-3 py-2">
              TGE price has not been set yet. RT settlement opens after unlock + 24h delay.
            </p>
          )}

          {txStatus === "error" && (
            <p className="text-[10px] font-mono text-red-400 bg-red-400/5 border border-red-400/20 rounded-xl px-3 py-2">{txError}</p>
          )}
          {txStatus === "done" && (
            <p className="text-[10px] font-mono text-emerald-400 bg-emerald-400/5 border border-emerald-400/20 rounded-xl px-3 py-2">
              {tab === "pt" ? "PT redeemed! LaunchTokens sent to your wallet." : "RT settled! USDC sent to your wallet."}
            </p>
          )}

          {!authenticated && (
            <p className="text-[10px] font-mono text-neutral-500 text-center">Connect wallet to redeem.</p>
          )}

          <button
            onClick={handleRedeem}
            disabled={!canSubmit || !authenticated}
            className={`w-full py-4 font-bold text-[10px] uppercase rounded-xl tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 ${
              tab === "pt" ? "bg-emerald-500 text-black" : "bg-orange-500 text-black"
            }`}
          >
            {txStatus === "approving"
              ? "Approving..."
              : txStatus === "redeeming"
              ? tab === "pt" ? "Redeeming PT..." : "Settling RT..."
              : tab === "pt" ? "Redeem PT → LaunchToken" : "Settle RT → USDC"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col shrink-0">
      <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">{label}</span>
      <span className={`text-sm font-mono ${color}`}>{value}</span>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 rounded-2xl bg-[#101926]/40 border border-white/5">
      <span className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest block mb-1">{label}</span>
      <span className="text-sm font-medium text-white">{value}</span>
    </div>
  );
}
