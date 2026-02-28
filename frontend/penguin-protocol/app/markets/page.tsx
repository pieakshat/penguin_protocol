"use client";

import { useEffect, useState, useCallback } from "react";
import { parseUnits, formatUnits, encodeAbiParameters } from "viem";
import { ADDRESSES, MM_ADDRESSES, MM_POOL_ID, demoWalletClient, demoAccount } from "@/lib/contracts";

import { getSettlementState, getUserBalances, getUserNFTs } from "@/app/actions/settlement";
import type { SettlementState, UserNFT } from "@/app/actions/settlement";
import SettlementABI from "@/lib/abi/Settlement.json";
import ERC20ABI from "@/lib/abi/ERC20Extended.json";
import LiquidityVaultABI from "@/lib/abi/LiquidityVault.json";
import StrategyManagerABI from "@/lib/abi/StrategyManager.json";

import { getMMPoolState, getMMModules, getInjectionHistory } from "@/app/actions/mm";
import type { MMPoolState, DecodedModule, InjectionEvent } from "@/app/actions/mm";


type MainTab = "strategy" | "settlement";
type SettleTab = "pt" | "rt" | "alloc";
type TxStatus = "idle" | "approving" | "depositing" | "submitting" | "done" | "error";
type ModuleType = "time" | "volume" | "price";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtInterval(seconds: number): string {
  if (seconds >= 86400) return `${seconds / 86400}d`;
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)}h`;
  return `${seconds}s`;
}

function timeUntil(unix: number): string {
  const diff = unix - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "Ready now";
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function pctDeployed(deployed: string, total: string): number {
  const d = parseFloat(deployed.replace(/,/g, ""));
  const t = parseFloat(total.replace(/,/g, ""));
  return t === 0 ? 0 : Math.min(100, (d / t) * 100);
}

/** price → sqrtPriceX96 as BigInt */
function priceToSqrtX96(price: number): bigint {
  const sqrtPrice = Math.sqrt(price);
  return BigInt(Math.floor(sqrtPrice * 2 ** 96));
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MarketsPage() {

  const [mainTab, setMainTab] = useState<MainTab>("strategy");

  // ── MM state ──────────────────────────────────────────────────────────────
  const [mmState, setMmState] = useState<MMPoolState | null>(null);
  const [modules, setModules] = useState<DecodedModule[]>([]);
  const [injections, setInjections] = useState<InjectionEvent[]>([]);
  const [mmLoading, setMmLoading] = useState(true);

  // Admin state
  const [deposit0, setDeposit0] = useState("");
  const [deposit1, setDeposit1] = useState("");
  const [withdraw0, setWithdraw0] = useState("");
  const [withdraw1, setWithdraw1] = useState("");
  const [adminStatus, setAdminStatus] = useState<TxStatus>("idle");
  const [adminError, setAdminError] = useState("");

  // ── Settlement state ──────────────────────────────────────────────────────
  const [settlement, setSettlement] = useState<SettlementState | null>(null);
  const [ptBalance, setPtBalance] = useState("0");
  const [rtBalance, setRtBalance] = useState("0");
  const [settleTab, setSettleTab] = useState<SettleTab>("pt");
  const [redeemAmount, setRedeemAmount] = useState("");
  const [settleTxStatus, setSettleTxStatus] = useState<TxStatus>("idle");
  const [settleTxError, setSettleTxError] = useState("");
  // alloc sub-tab
  const [userNFTs, setUserNFTs] = useState<UserNFT[]>([]);
  const [nftsLoading, setNftsLoading] = useState(false);
  const [allocTxStatus, setAllocTxStatus] = useState<Record<string, TxStatus>>({});
  const [allocTxError, setAllocTxError] = useState<Record<string, string>>({});

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadMMData = useCallback(async () => {
    setMmLoading(true);
    const [state, mods, hist] = await Promise.all([
      getMMPoolState(),
      getMMModules(),
      getInjectionHistory(),
    ]);
    setMmState(state);
    setModules(mods);
    setInjections(hist);
    setMmLoading(false);
  }, []);

  const loadSettlementData = useCallback(async () => {
    const [state, balances] = await Promise.all([
      getSettlementState(),
      getUserBalances(demoAccount.address),
    ]);
    setSettlement(state);
    setPtBalance(balances.ptBalance);
    setRtBalance(balances.rtBalance);
  }, []);

  const loadUserNFTs = useCallback(async () => {
    setNftsLoading(true);
    const nfts = await getUserNFTs(demoAccount.address);
    setUserNFTs(nfts);
    setNftsLoading(false);
  }, []);

  useEffect(() => { loadMMData(); }, [loadMMData]);
  useEffect(() => { loadSettlementData(); }, [loadSettlementData]);

  // ── Admin writes ──────────────────────────────────────────────────────────

  async function handleVaultDeposit() {
    if (!deposit0 || !deposit1) return;
    try {
      setAdminError(""); setAdminStatus("approving");
      const amt0 = parseUnits(deposit0, 18);
      const amt1 = parseUnits(deposit1, 18);
      await demoWalletClient.writeContract({ address: MM_ADDRESSES.token0, abi: ERC20ABI, functionName: "approve", args: [MM_ADDRESSES.liquidityVault, amt0], account: demoAccount });
      await demoWalletClient.writeContract({ address: MM_ADDRESSES.token1, abi: ERC20ABI, functionName: "approve", args: [MM_ADDRESSES.liquidityVault, amt1], account: demoAccount });
      setAdminStatus("depositing");
      await demoWalletClient.writeContract({ address: MM_ADDRESSES.liquidityVault, abi: LiquidityVaultABI, functionName: "deposit", args: [MM_POOL_ID, MM_ADDRESSES.token0, MM_ADDRESSES.token1, amt0, amt1], account: demoAccount });
      setAdminStatus("done"); setDeposit0(""); setDeposit1("");
      await loadMMData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setAdminError(msg.includes("user rejected") ? "Rejected." : msg.slice(0, 160));
      setAdminStatus("error");
    }
  }

  async function handleVaultWithdraw() {
    if (!withdraw0 && !withdraw1) return;
    try {
      setAdminError(""); setAdminStatus("submitting");
      const amt0 = withdraw0 ? parseUnits(withdraw0, 18) : 0n;
      const amt1 = withdraw1 ? parseUnits(withdraw1, 18) : 0n;
      await demoWalletClient.writeContract({ address: MM_ADDRESSES.liquidityVault, abi: LiquidityVaultABI, functionName: "withdraw", args: [MM_POOL_ID, amt0, amt1], account: demoAccount });
      setAdminStatus("done"); setWithdraw0(""); setWithdraw1("");
      await loadMMData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setAdminError(msg.includes("user rejected") ? "Rejected." : msg.slice(0, 160));
      setAdminStatus("error");
    }
  }

  async function handlePauseToggle() {
    if (!mmState) return;
    try {
      setAdminError("");
      await demoWalletClient.writeContract({ address: MM_ADDRESSES.strategyManager, abi: StrategyManagerABI, functionName: "setPoolPaused", args: [MM_POOL_ID, !mmState.isPaused], account: demoAccount });
      await loadMMData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setAdminError(msg.includes("user rejected") ? "Rejected." : msg.slice(0, 160));
    }
  }

  async function handleExecuteStrategy() {
    try {
      setAdminError("");
      await demoWalletClient.writeContract({ address: MM_ADDRESSES.strategyManager, abi: StrategyManagerABI, functionName: "executeStrategyUpdate", args: [MM_POOL_ID], account: demoAccount });
      await loadMMData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setAdminError(msg.includes("user rejected") ? "Rejected." : msg.slice(0, 160));
    }
  }

  async function handleCancelStrategy() {
    try {
      setAdminError("");
      await demoWalletClient.writeContract({ address: MM_ADDRESSES.strategyManager, abi: StrategyManagerABI, functionName: "cancelStrategyUpdate", args: [MM_POOL_ID], account: demoAccount });
      await loadMMData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setAdminError(msg.includes("user rejected") ? "Rejected." : msg.slice(0, 160));
    }
  }

  async function handleQueueStrategy(moduleAddrs: string[], encodedConfigs: `0x${string}`[]) {
    try {
      setAdminError("");
      await demoWalletClient.writeContract({
        address: MM_ADDRESSES.strategyManager,
        abi: StrategyManagerABI,
        functionName: "queueStrategyUpdate",
        args: [MM_POOL_ID, moduleAddrs as `0x${string}`[], encodedConfigs],
        account: demoAccount,
      });
      await loadMMData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setAdminError(msg.includes("user rejected") ? "Rejected." : msg.slice(0, 160));
    }
  }

  // ── Settlement redeem ─────────────────────────────────────────────────────
  async function handleRedeem() {
    if (!redeemAmount || !ADDRESSES.settlement) {
      setSettleTxError("Settlement address not set"); setSettleTxStatus("error"); return;
    }
    try {
      setSettleTxError("");
      const amount = parseUnits(redeemAmount, 18);
      if (settleTab === "pt") {
        setSettleTxStatus("approving");
        await demoWalletClient.writeContract({ address: ADDRESSES.principalToken, abi: ERC20ABI, functionName: "approve", args: [ADDRESSES.settlement, amount], account: demoAccount });
        setSettleTxStatus("submitting");
        await demoWalletClient.writeContract({ address: ADDRESSES.settlement, abi: SettlementABI, functionName: "redeemPT", args: [amount], account: demoAccount });
      } else {
        setSettleTxStatus("approving");
        await demoWalletClient.writeContract({ address: ADDRESSES.riskToken, abi: ERC20ABI, functionName: "approve", args: [ADDRESSES.settlement, amount], account: demoAccount });
        setSettleTxStatus("submitting");
        await demoWalletClient.writeContract({ address: ADDRESSES.settlement, abi: SettlementABI, functionName: "settleRT", args: [amount], account: demoAccount });
      }
      setSettleTxStatus("done"); setRedeemAmount(""); await loadSettlementData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setSettleTxError(msg.includes("user rejected") ? "Transaction rejected." : msg.slice(0, 160));
      setSettleTxStatus("error");
    }
  }

  // ── Allocation NFT redeem ─────────────────────────────────────────────────
  async function handleRedeemAlloc(tokenId: string) {
    if (!ADDRESSES.settlement) return;
    try {
      setAllocTxError((prev) => ({ ...prev, [tokenId]: "" }));
      setAllocTxStatus((prev) => ({ ...prev, [tokenId]: "submitting" }));
      await demoWalletClient.writeContract({
        address: ADDRESSES.settlement,
        abi: SettlementABI,
        functionName: "redeemAllocation",
        args: [BigInt(tokenId)],
        account: demoAccount,
      });
      setAllocTxStatus((prev) => ({ ...prev, [tokenId]: "done" }));
      await loadUserNFTs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setAllocTxError((prev) => ({ ...prev, [tokenId]: msg.includes("user rejected") ? "Rejected." : msg.slice(0, 120) }));
      setAllocTxStatus((prev) => ({ ...prev, [tokenId]: "error" }));
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const pct0 = mmState ? pctDeployed(mmState.deployed0, mmState.total0) : 0;
  const isOwner = demoAccount.address.toLowerCase() === mmState?.vaultOwner?.toLowerCase();
  const now = Math.floor(Date.now() / 1000);

  const ptBalanceFmt = ptBalance !== "0" ? Number(formatUnits(BigInt(ptBalance), 18)).toLocaleString() : "0";
  const rtBalanceFmt = rtBalance !== "0" ? Number(formatUnits(BigInt(rtBalance), 18)).toLocaleString() : "0";
  const tgePriceFmt = settlement?.tgePrice && settlement.tgePrice !== "0" ? Number(formatUnits(BigInt(settlement.tgePrice), 6)).toFixed(6) : null;
  const clearingPriceFmt = settlement?.clearingPrice && settlement.clearingPrice !== "0" ? Number(formatUnits(BigInt(settlement.clearingPrice), 6)).toFixed(6) : null;
  const payoutPerRTFmt = settlement?.payoutPerRT && settlement.payoutPerRT !== "0" ? Number(formatUnits(BigInt(settlement.payoutPerRT), 6)).toFixed(6) : null;
  const unlocked = settlement ? now >= settlement.unlockTime : false;
  const tgeSet = settlement?.tgePriceSet ?? false;
  const redeemAmountBig = redeemAmount ? parseUnits(redeemAmount, 18) : 0n;
  const estimatedUSDC = settlement && redeemAmountBig > 0n && settlement.payoutPerRT !== "0"
    ? Number(formatUnits((redeemAmountBig * BigInt(settlement.payoutPerRT)) / parseUnits("1", 18), 6)).toFixed(4) : "0.00";
  const canRedeemPT = unlocked && settleTab === "pt";
  const canRedeemRT = tgeSet && settleTab === "rt";
  const canSubmit = (canRedeemPT || canRedeemRT) && !!redeemAmount && settleTxStatus !== "approving" && settleTxStatus !== "submitting";

  return (
    <div className="min-h-screen pt-20 flex flex-col bg-[#0a111a] font-sans">

      {/* Top tab bar */}
      <div className="w-full bg-[#0d1724]/60 backdrop-blur-xl border-b border-white/5 px-8 flex items-center gap-1 pt-2">
        <TabBtn active={mainTab === "strategy"} onClick={() => setMainTab("strategy")} accent="blue">Strategy</TabBtn>
        <TabBtn active={mainTab === "settlement"} onClick={() => setMainTab("settlement")} accent="emerald">Settlement</TabBtn>
      </div>

      {/* ═══════════ STRATEGY TAB ═══════════ */}
      {mainTab === "strategy" && (
        <div className="flex-1 flex flex-col">

          {/* Stats bar — all live reads */}
          <div className="w-full bg-[#0d1724]/60 border-b border-white/5 py-3 px-8 flex items-center gap-8 overflow-x-auto">
            <StatCell label="Pool" value="TKA / TKB" color="text-white" />
            <StatCell label="Price" value={mmLoading ? "…" : `${mmState?.currentPrice.toFixed(6) ?? "—"} TKB/TKA`} color="text-blue-300" />
            <StatCell label="Tick" value={mmLoading ? "…" : String(mmState?.currentTick ?? "—")} color="text-neutral-400" />
            <StatCell label="Liquidity" value={mmLoading ? "…" : (mmState?.currentLiquidity ?? "—")} color="text-purple-400" />
            <StatCell label="Status" value={mmLoading ? "…" : mmState?.isPaused ? "Paused" : "Active"} color={mmLoading ? "text-neutral-500" : mmState?.isPaused ? "text-red-400" : "text-emerald-400"} />
            <StatCell label="Deployed" value={mmLoading ? "…" : `${pct0.toFixed(1)}%`} color="text-blue-400" />
            <StatCell label="Vol Δ" value={mmLoading ? "…" : `${mmState?.volumeSinceCheckpoint ?? "0"} TKA`} color="text-orange-400" />
            <StatCell label="Last Unlock" value={mmLoading ? "…" : mmState?.lastUnlockTime ? new Date(mmState.lastUnlockTime * 1000).toLocaleDateString() : "None"} color="text-neutral-300" />
          </div>

          <div className="flex-1 grid grid-cols-12 overflow-hidden border-t border-white/5">

            {/* LEFT */}
            <div className="col-span-12 lg:col-span-8 p-6 space-y-6 overflow-y-auto">

              {/* Pool state */}
              <Section title="Pool State">
                {mmLoading ? <Skeleton /> : !mmState ? <NoData /> : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <DataBox label="Current Price" value={`${mmState.currentPrice.toFixed(6)}`} sub="TKB per TKA" />
                    <DataBox label="Current Tick" value={String(mmState.currentTick)} sub="Uniswap v4" />
                    <DataBox label="LP Liquidity" value={mmState.currentLiquidity} sub="units" />
                    <DataBox label="Cum. Volume" value={mmState.cumulativeVolume} sub="TKA since init" />
                    <DataBox label="Vol Since Checkpoint" value={mmState.volumeSinceCheckpoint} sub="TKA since last unlock" />
                    <DataBox label="Last Unlock" value={mmState.lastUnlockTime ? new Date(mmState.lastUnlockTime * 1000).toLocaleString() : "Never"} sub="timestamp" />
                    <DataBox label="Timelock Delay" value={fmtInterval(mmState.timelockDelay)} sub="strategy queue delay" />
                    <DataBox label="Max Modules" value={String(mmState.maxModulesPerPool)} sub="per pool" />
                  </div>
                )}
              </Section>

              {/* Vault balances */}
              <Section title="Vault Balances">
                {mmLoading ? <Skeleton /> : !mmState ? <NoData /> : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <VaultCell label="Available TKA" value={mmState.available0} />
                      <VaultCell label="Deployed TKA" value={mmState.deployed0} />
                      <VaultCell label="Total TKA" value={mmState.total0} />
                      <VaultCell label="Available TKB" value={mmState.available1} />
                      <VaultCell label="Deployed TKB" value={mmState.deployed1} />
                      <VaultCell label="Total TKB" value={mmState.total1} />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] font-mono text-neutral-500 mb-1">
                        <span>TKA Deployed</span><span>{pct0.toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct0}%` }} />
                      </div>
                    </div>
                  </div>
                )}
              </Section>

              {/* Active modules */}
              <Section title="Active Modules">
                {mmLoading ? <Skeleton h={16} /> : modules.length === 0
                  ? <p className="text-[11px] font-mono text-neutral-600">No modules configured.</p>
                  : <div className="space-y-2">{modules.map((m, i) => <ModuleCard key={i} mod={m} />)}</div>}
              </Section>

              {/* Injection history */}
              <Section title="Injection History">
                {mmLoading ? <Skeleton h={20} /> : injections.length === 0
                  ? <p className="text-[11px] font-mono text-neutral-600">No injections yet.</p>
                  : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[10px] font-mono">
                        <thead>
                          <tr className="text-neutral-600 border-b border-white/5">
                            <th className="text-left pb-2">Block</th>
                            <th className="text-right pb-2">Amount0 TKA</th>
                            <th className="text-right pb-2">Amount1 TKB</th>
                            <th className="text-right pb-2">Liquidity Δ</th>
                            <th className="text-right pb-2">Tx</th>
                          </tr>
                        </thead>
                        <tbody>
                          {injections.slice().reverse().map((ev, i) => (
                            <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                              <td className="py-1.5 text-neutral-400">{ev.blockNumber}</td>
                              <td className="py-1.5 text-right text-white">{ev.amount0}</td>
                              <td className="py-1.5 text-right text-white">{ev.amount1}</td>
                              <td className="py-1.5 text-right text-blue-400">{Number(ev.liquidityAdded).toLocaleString()}</td>
                              <td className="py-1.5 text-right text-neutral-500">{ev.txHash.slice(0, 10)}…</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </Section>
            </div>

            {/* RIGHT: admin */}
            <div className="col-span-12 lg:col-span-4 border-l border-white/5 bg-[#101926]/20 p-6 flex flex-col gap-4 overflow-y-auto">
              {!isOwner ? (
                <div className="text-center pt-10 space-y-1">
                  <p className="text-[11px] font-mono text-neutral-500">Read-only view</p>
                  <p className="text-[10px] text-neutral-700 font-mono">Owner: {mmState?.vaultOwner?.slice(0, 10)}…</p>
                  <p className="text-[10px] text-neutral-700 font-mono">Hook: {mmState?.hookAddress?.slice(0, 10)}…</p>
                </div>
              ) : (
                <>
                  {/* Emergency */}
                  <AdminSection title="Emergency">
                    <button
                      onClick={handlePauseToggle}
                      className={`w-full py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${mmState?.isPaused ? "bg-emerald-500 text-black" : "bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30"}`}
                    >
                      {mmState?.isPaused ? "Unpause Pool" : "Pause Pool"}
                    </button>
                  </AdminSection>

                  {/* Pending strategy */}
                  {mmState?.pendingUpdate && (
                    <AdminSection title="Pending Strategy Update">
                      <InfoRow label="Update ID" value={`${mmState.pendingUpdate.updateId.slice(0, 10)}…`} />
                      <InfoRow label="Executable in" value={timeUntil(mmState.pendingUpdate.executableAt)} color="text-yellow-400" />
                      <InfoRow label="Timelock delay" value={fmtInterval(mmState.timelockDelay)} />
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={handleExecuteStrategy}
                          disabled={now < mmState.pendingUpdate.executableAt}
                          className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-black text-[10px] font-bold uppercase tracking-widest disabled:opacity-40"
                        >Execute</button>
                        <button
                          onClick={handleCancelStrategy}
                          className="flex-1 py-2.5 rounded-xl bg-white/5 text-neutral-400 text-[10px] font-bold uppercase tracking-widest hover:text-white"
                        >Cancel</button>
                      </div>
                    </AdminSection>
                  )}

                  {/* Deposit */}
                  <AdminSection title="Deposit to Vault">
                    <input type="number" placeholder="TKA amount" value={deposit0} onChange={(e) => setDeposit0(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500/40" />
                    <input type="number" placeholder="TKB amount" value={deposit1} onChange={(e) => setDeposit1(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500/40" />
                    <button
                      onClick={handleVaultDeposit}
                      disabled={!deposit0 || !deposit1 || adminStatus === "approving" || adminStatus === "depositing"}
                      className="w-full py-2.5 rounded-xl bg-blue-500 text-black text-[10px] font-bold uppercase tracking-widest disabled:opacity-40 hover:bg-blue-400"
                    >
                      {adminStatus === "approving" ? "Approving…" : adminStatus === "depositing" ? "Depositing…" : "Approve + Deposit"}
                    </button>
                  </AdminSection>

                  {/* Withdraw */}
                  <AdminSection title="Withdraw from Vault">
                    <input type="number" placeholder="TKA to withdraw (0 = skip)" value={withdraw0} onChange={(e) => setWithdraw0(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-white font-mono text-xs focus:outline-none focus:border-orange-500/40" />
                    <input type="number" placeholder="TKB to withdraw (0 = skip)" value={withdraw1} onChange={(e) => setWithdraw1(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-white font-mono text-xs focus:outline-none focus:border-orange-500/40" />
                    <p className="text-[9px] font-mono text-neutral-600">Available: {mmState?.available0 ?? "—"} TKA · {mmState?.available1 ?? "—"} TKB</p>
                    <button
                      onClick={handleVaultWithdraw}
                      disabled={(!withdraw0 && !withdraw1) || adminStatus === "submitting"}
                      className="w-full py-2.5 rounded-xl bg-orange-500/20 border border-orange-500/30 text-orange-400 text-[10px] font-bold uppercase tracking-widest disabled:opacity-40 hover:bg-orange-500/30"
                    >
                      {adminStatus === "submitting" ? "Withdrawing…" : "Withdraw"}
                    </button>
                  </AdminSection>

                  {/* Queue strategy */}
                  {!mmState?.pendingUpdate && (
                    <QueueStrategyPanel
                      currentPrice={mmState?.currentPrice ?? 1}
                      timelockDelay={mmState?.timelockDelay ?? 86400}
                      onQueue={handleQueueStrategy}
                    />
                  )}

                  {adminStatus === "done" && <p className="text-[10px] font-mono text-emerald-400">Done.</p>}
                  {adminError && <p className="text-[10px] font-mono text-red-400 bg-red-400/5 border border-red-400/20 rounded-xl px-3 py-2">{adminError}</p>}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ SETTLEMENT TAB ═══════════ */}
      {mainTab === "settlement" && (
        <div className="flex-1 flex flex-col">
          <div className="w-full bg-[#0d1724]/60 border-b border-white/5 py-3 px-8 flex items-center gap-10 overflow-x-auto">
            <StatCell label="TGE Price" value={tgePriceFmt ? `$${tgePriceFmt}` : "Pending"} color={tgePriceFmt ? "text-blue-400" : "text-neutral-500"} />
            <StatCell label="Clearing Price" value={clearingPriceFmt ? `$${clearingPriceFmt}` : "—"} color="text-white" />
            <StatCell label="RT Payout / RT" value={payoutPerRTFmt ? `$${payoutPerRTFmt}` : "—"} color="text-orange-400" />
            <StatCell label="Your PT" value={`${ptBalanceFmt} PT`} color="text-emerald-400" />
            <StatCell label="Your RT" value={`${rtBalanceFmt} RT`} color="text-orange-400" />
            <StatCell label="Settlement" value={!unlocked ? "Locked" : !tgeSet ? "Awaiting TGE" : "Open"} color={!unlocked ? "text-red-400" : !tgeSet ? "text-yellow-400" : "text-emerald-400"} />
          </div>

          <div className="flex-1 grid grid-cols-12 overflow-hidden border-t border-white/5">
            <div className="col-span-12 lg:col-span-8 p-6 flex flex-col space-y-6">
              <div className="min-h-[200px] bg-[#0d1724]/40 rounded-[2rem] p-6 border border-white/5 grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest block">TGE Price</span>
                  <span className="text-2xl font-mono text-white">
                    {tgePriceFmt ? `$${tgePriceFmt}` : "—"}
                  </span>
                  <span className="text-[9px] font-mono text-neutral-600">set by protocol at token generation event</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest block">Payout / RT</span>
                  <span className="text-2xl font-mono text-orange-400">
                    {settlement && settlement.payoutPerRT !== "0"
                      ? `$${Number(formatUnits(BigInt(settlement.payoutPerRT), 6)).toFixed(6)}`
                      : "—"}
                  </span>
                  <span className="text-[9px] font-mono text-neutral-600">USDC per Risk Token</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest block">Clearing Price</span>
                  <span className="text-xl font-mono text-blue-400">
                    {settlement && settlement.clearingPrice !== "0"
                      ? `$${Number(formatUnits(BigInt(settlement.clearingPrice), 6)).toFixed(6)}`
                      : "—"}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest block">Unlock Date</span>
                  <span className="text-xl font-mono text-white">
                    {settlement ? new Date(settlement.unlockTime * 1000).toLocaleDateString() : "—"}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoBox label="RT Cap Multiplier" value={settlement ? `${settlement.rtCapMultiplier}x` : "—"} />
                <InfoBox label="Unlock Date" value={settlement ? new Date(settlement.unlockTime * 1000).toLocaleDateString() : "—"} />
                <InfoBox label="Settlement Deadline" value={settlement?.tgePriceSet && settlement.settlementWindowDeadline ? new Date(settlement.settlementWindowDeadline * 1000).toLocaleDateString() : "—"} />
                <InfoBox label="RT Reserve" value={settlement && settlement.rtReserve !== "0" ? `$${Number(formatUnits(BigInt(settlement.rtReserve), 6)).toLocaleString()}` : "$0"} />
              </div>
            </div>

            <div className="col-span-12 lg:col-span-4 border-l border-white/5 bg-[#101926]/20 p-6 flex flex-col gap-6">
              <div className="flex gap-2">
                <button onClick={() => { setSettleTab("pt"); setRedeemAmount(""); setSettleTxStatus("idle"); }}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${settleTab === "pt" ? "bg-emerald-500 text-black" : "bg-white/5 text-neutral-500 hover:text-white"}`}>Redeem PT</button>
                <button onClick={() => { setSettleTab("rt"); setRedeemAmount(""); setSettleTxStatus("idle"); }}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${settleTab === "rt" ? "bg-orange-500 text-black" : "bg-white/5 text-neutral-500 hover:text-white"}`}>Settle RT</button>
                <button onClick={() => { setSettleTab("alloc"); loadUserNFTs(); }}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${settleTab === "alloc" ? "bg-purple-500 text-black" : "bg-white/5 text-neutral-500 hover:text-white"}`}>Redeem Alloc</button>
              </div>

              {settleTab !== "alloc" && (
                <>
                  <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-2 font-mono text-[11px]">
                    {settleTab === "pt" ? (
                      <>
                        <InfoRow label="Your PT Balance" value={`${ptBalanceFmt} PT`} />
                        <InfoRow label="Receive" value="1:1 LaunchToken" color="text-emerald-400" />
                        <InfoRow label="Clearing Price" value={clearingPriceFmt ? `$${clearingPriceFmt}` : "—"} color="text-blue-400" />
                        <InfoRow label="Unlock" value={unlocked ? "Unlocked" : settlement ? new Date(settlement.unlockTime * 1000).toLocaleDateString() : "—"} color={unlocked ? "text-emerald-400" : "text-red-400"} />
                      </>
                    ) : (
                      <>
                        <InfoRow label="Your RT Balance" value={`${rtBalanceFmt} RT`} />
                        <InfoRow label="Payout Per RT" value={payoutPerRTFmt ? `$${payoutPerRTFmt}` : "TBD"} color="text-orange-400" />
                        <InfoRow label="TGE Price" value={tgePriceFmt ? `$${tgePriceFmt}` : "Not set"} color={tgeSet ? "text-blue-400" : "text-yellow-400"} />
                        <InfoRow label="RT Cap Multiplier" value={settlement ? `${settlement.rtCapMultiplier}x` : "—"} />
                        <InfoRow label="Est. USDC Out" value={`${estimatedUSDC} USDC`} color="text-white" />
                      </>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between px-1">
                      <label className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">{settleTab === "pt" ? "PT Amount" : "RT Amount"}</label>
                      <button onClick={() => setRedeemAmount(settleTab === "pt" ? formatUnits(BigInt(ptBalance), 18) : formatUnits(BigInt(rtBalance), 18))}
                        className="text-[10px] font-mono text-blue-400 hover:text-white">MAX</button>
                    </div>
                    <input type="number" placeholder="0.00" value={redeemAmount} onChange={(e) => setRedeemAmount(e.target.value)}
                      disabled={settleTab === "pt" ? !unlocked : !tgeSet}
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-mono text-sm focus:outline-none focus:border-blue-500/40 disabled:opacity-40" />
                  </div>

                  {settleTab === "pt" && !unlocked && <Warning>PT redemption unlocks on {settlement ? new Date(settlement.unlockTime * 1000).toLocaleString() : "—"}</Warning>}
                  {settleTab === "rt" && !tgeSet && <Warning>TGE price not set yet. RT settlement opens after unlock + 24h delay.</Warning>}
                  {settleTxStatus === "error" && <ErrorMsg>{settleTxError}</ErrorMsg>}
                  {settleTxStatus === "done" && <SuccessMsg>{settleTab === "pt" ? "PT redeemed! LaunchTokens sent." : "RT settled! USDC sent."}</SuccessMsg>}
                  <button onClick={handleRedeem} disabled={!canSubmit}
                    className={`w-full py-4 font-bold text-[10px] uppercase rounded-xl tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 ${settleTab === "pt" ? "bg-emerald-500 text-black" : "bg-orange-500 text-black"}`}>
                    {settleTxStatus === "approving" ? "Approving…" : settleTxStatus === "submitting" ? (settleTab === "pt" ? "Redeeming…" : "Settling…") : settleTab === "pt" ? "Redeem PT → LaunchToken" : "Settle RT → USDC"}
                  </button>
                </>
              )}

              {settleTab === "alloc" && (
                <div className="flex flex-col gap-3">
                  {nftsLoading && <p className="text-[10px] font-mono text-neutral-500 text-center py-4">Loading NFTs…</p>}
                  {!nftsLoading && userNFTs.length === 0 && (
                    <p className="text-[10px] font-mono text-neutral-500 text-center py-4">No allocation NFTs found for this wallet.</p>
                  )}
                  {!nftsLoading && userNFTs.map((nft) => {
                    const nftUnlocked = now >= nft.unlockTime;
                    const status = allocTxStatus[nft.tokenId] ?? "idle";
                    const err = allocTxError[nft.tokenId] ?? "";
                    return (
                      <div key={nft.tokenId} className="p-4 bg-white/[0.02] border border-purple-500/20 rounded-2xl space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">NFT #{nft.tokenId}</span>
                          <span className={`text-[9px] font-mono px-2 py-0.5 rounded ${nftUnlocked ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                            {nftUnlocked ? "Unlocked" : new Date(nft.unlockTime * 1000).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="space-y-1 font-mono text-[11px]">
                          <InfoRow label="Allocation" value={`${Number(nft.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })} tokens`} />
                          <InfoRow label="Clearing Price" value={`$${nft.clearingPrice}`} color="text-blue-400" />
                        </div>
                        {err && <ErrorMsg>{err}</ErrorMsg>}
                        {status === "done" && <SuccessMsg>Redeemed! LaunchTokens sent.</SuccessMsg>}
                        <button
                          onClick={() => handleRedeemAlloc(nft.tokenId)}
                          disabled={!nftUnlocked || status === "submitting" || status === "done"}
                          className="w-full py-3 rounded-xl bg-purple-500 text-black text-[10px] font-bold uppercase tracking-widest hover:bg-purple-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                          {status === "submitting" ? "Redeeming…" : status === "done" ? "Redeemed ✓" : "Redeem → LaunchToken"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, accent, children }: { active: boolean; onClick: () => void; accent: string; children: React.ReactNode }) {
  const colors: Record<string, string> = { blue: "border-blue-400 text-blue-400", emerald: "border-emerald-400 text-emerald-400" };
  return (
    <button onClick={onClick}
      className={`px-5 py-3 text-[11px] font-mono uppercase tracking-widest border-b-2 transition-all ${active ? colors[accent] : "border-transparent text-neutral-500 hover:text-neutral-300"}`}>
      {children}
    </button>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-3">{title}</h3>
      {children}
    </div>
  );
}

function AdminSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-2">
      <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mb-2">{title}</p>
      {children}
    </div>
  );
}

function DataBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl">
      <span className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest block mb-1">{label}</span>
      <span className="text-sm font-mono text-white">{value}</span>
      {sub && <span className="text-[9px] font-mono text-neutral-600 block mt-0.5">{sub}</span>}
    </div>
  );
}

function VaultCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl">
      <span className="text-[9px] font-mono text-neutral-600 uppercase tracking-widest block mb-1">{label}</span>
      <span className="text-sm font-mono text-white">{value}</span>
    </div>
  );
}

function ModuleCard({ mod }: { mod: DecodedModule }) {
  const palette: Record<string, string> = {
    TimeUnlock: "border-blue-500/20 bg-blue-500/5 text-blue-400",
    VolumeUnlock: "border-purple-500/20 bg-purple-500/5 text-purple-400",
    PriceUnlock: "border-orange-500/20 bg-orange-500/5 text-orange-400",
    Unknown: "border-white/5 bg-white/5 text-neutral-400",
  };
  function describe(m: DecodedModule): string {
    if (m.name === "TimeUnlock") return `${(m.basisPoints! / 100).toFixed(1)}% every ${fmtInterval(m.interval!)}`;
    if (m.name === "VolumeUnlock") return `${(m.basisPoints! / 100).toFixed(1)}% after ${m.volumeThreshold} TKA volume`;
    if (m.name === "PriceUnlock") return `${(m.basisPoints! / 100).toFixed(1)}% when price ${m.triggerAbove ? "≥" : "≤"} ${m.targetPrice?.toFixed(4)} · cooldown ${fmtInterval(m.cooldown!)}`;
    return m.address;
  }
  return (
    <div className={`p-3 rounded-xl border ${palette[mod.name]} flex items-start gap-3`}>
      <span className="text-[9px] font-mono uppercase tracking-widest shrink-0 mt-0.5">{mod.name}</span>
      <span className="text-[10px] font-mono text-neutral-300">{describe(mod)}</span>
    </div>
  );
}

function InfoRow({ label, value, color = "text-white" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-neutral-500">{label}</span>
      <span className={color}>{value}</span>
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

function Skeleton({ h = 24 }: { h?: number }) {
  return <div className={`h-${h} bg-white/5 animate-pulse rounded-2xl`} />;
}
function NoData() { return <p className="text-[11px] font-mono text-neutral-500">Anvil not running or addresses misconfigured.</p>; }
function Warning({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-mono text-yellow-400 bg-yellow-400/5 border border-yellow-400/20 rounded-xl px-3 py-2">{children}</p>;
}
function ErrorMsg({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-mono text-red-400 bg-red-400/5 border border-red-400/20 rounded-xl px-3 py-2">{children}</p>;
}
function SuccessMsg({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-mono text-emerald-400 bg-emerald-400/5 border border-emerald-400/20 rounded-xl px-3 py-2">{children}</p>;
}

// ── Queue Strategy Panel (all 3 module types) ─────────────────────────────────

function QueueStrategyPanel({
  currentPrice,
  timelockDelay,
  onQueue,
}: {
  currentPrice: number;
  timelockDelay: number;
  onQueue: (addrs: string[], configs: `0x${string}`[]) => void;
}) {
  const [moduleType, setModuleType] = useState<ModuleType>("time");
  // TimeUnlock
  const [intervalDays, setIntervalDays] = useState("7");
  const [timeBp, setTimeBp] = useState("500");
  // VolumeUnlock
  const [volThreshold, setVolThreshold] = useState("");
  const [volBp, setVolBp] = useState("1000");
  // PriceUnlock
  const [targetPrice, setTargetPrice] = useState(currentPrice.toFixed(4));
  const [triggerAbove, setTriggerAbove] = useState(true);
  const [cooldownHours, setCooldownHours] = useState("24");
  const [priceBp, setPriceBp] = useState("1500");

  function buildConfig(): { moduleAddr: string; cfg: `0x${string}` } | null {
    try {
      if (moduleType === "time") {
        const cfg = encodeAbiParameters(
          [{ type: "uint256" }, { type: "uint256" }],
          [BigInt(Math.round(Number(intervalDays) * 86400)), BigInt(timeBp)],
        );
        return { moduleAddr: MM_ADDRESSES.timeModule, cfg };
      }
      if (moduleType === "volume") {
        const thresholdBig = parseUnits(volThreshold || "0", 18);
        const cfg = encodeAbiParameters(
          [{ type: "uint256" }, { type: "uint256" }],
          [thresholdBig, BigInt(volBp)],
        );
        return { moduleAddr: MM_ADDRESSES.volumeModule, cfg };
      }
      if (moduleType === "price") {
        const sqrtX96 = BigInt(Math.floor(Math.sqrt(Number(targetPrice)) * (2 ** 96)));
        const cfg = encodeAbiParameters(
          [{ type: "uint160" }, { type: "bool" }, { type: "uint256" }, { type: "uint256" }],
          [sqrtX96, triggerAbove, BigInt(Math.round(Number(cooldownHours) * 3600)), BigInt(priceBp)],
        );
        return { moduleAddr: MM_ADDRESSES.priceModule, cfg };
      }
    } catch { /* bad inputs */ }
    return null;
  }

  function handleQueue() {
    const result = buildConfig();
    if (!result) return;
    onQueue([result.moduleAddr], [result.cfg]);
  }

  return (
    <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-3">
      <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Queue Strategy Update</p>

      {/* Module type selector */}
      <div className="flex gap-1">
        {(["time", "volume", "price"] as ModuleType[]).map((t) => (
          <button key={t} onClick={() => setModuleType(t)}
            className={`flex-1 py-1.5 rounded-lg text-[9px] font-mono uppercase tracking-widest transition-all ${moduleType === t ? "bg-white/10 text-white" : "text-neutral-600 hover:text-neutral-400"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* TimeUnlock inputs */}
      {moduleType === "time" && (
        <>
          <div className="flex gap-2">
            <InputField label="Interval (days)" value={intervalDays} onChange={setIntervalDays} />
            <InputField label="Basis Points (100=1%)" value={timeBp} onChange={setTimeBp} />
          </div>
          <p className="text-[9px] font-mono text-neutral-600">Releases {(Number(timeBp) / 100).toFixed(1)}% every {intervalDays} days</p>
        </>
      )}

      {/* VolumeUnlock inputs */}
      {moduleType === "volume" && (
        <>
          <InputField label="Volume Threshold (TKA)" value={volThreshold} onChange={setVolThreshold} />
          <InputField label="Basis Points (100=1%)" value={volBp} onChange={setVolBp} />
          <p className="text-[9px] font-mono text-neutral-600">Releases {(Number(volBp) / 100).toFixed(1)}% after {volThreshold || "?"} TKA volume</p>
        </>
      )}

      {/* PriceUnlock inputs */}
      {moduleType === "price" && (
        <>
          <InputField label={`Target Price (current: ${currentPrice.toFixed(4)})`} value={targetPrice} onChange={setTargetPrice} />
          <div className="flex gap-2">
            <InputField label="Cooldown (hours)" value={cooldownHours} onChange={setCooldownHours} />
            <InputField label="Basis Points" value={priceBp} onChange={setPriceBp} />
          </div>
          <div className="flex gap-2">
            {[true, false].map((v) => (
              <button key={String(v)} onClick={() => setTriggerAbove(v)}
                className={`flex-1 py-1.5 rounded-lg text-[9px] font-mono uppercase tracking-widest transition-all ${triggerAbove === v ? "bg-white/10 text-white" : "text-neutral-600 hover:text-neutral-400"}`}>
                {v ? "Trigger ≥ (price pumps)" : "Trigger ≤ (price dips)"}
              </button>
            ))}
          </div>
          <p className="text-[9px] font-mono text-neutral-600">
            Releases {(Number(priceBp) / 100).toFixed(1)}% when price {triggerAbove ? "≥" : "≤"} {targetPrice} · {cooldownHours}h cooldown
          </p>
        </>
      )}

      <button onClick={handleQueue}
        className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-neutral-300 text-[10px] font-bold uppercase tracking-widest hover:border-blue-500/30 hover:text-white transition-all">
        Queue Update (timelock: {fmtInterval(timelockDelay)})
      </button>
    </div>
  );
}

function InputField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex-1">
      <label className="text-[9px] font-mono text-neutral-600 block mb-1">{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-white font-mono text-xs focus:outline-none focus:border-blue-500/40" />
    </div>
  );
}

