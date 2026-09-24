import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useRecentExecutions,
} from "@/modules/execution-monitoring/hooks/useExecutionMonitoring";

import type {
  ExecutionHistoryItem,
} from "@/modules/execution-monitoring/services/executionHistoryApi";


import {
  useInrScanner,
  useLiveOnlyInventory,
} from "../hooks/useLiveOnlyRuntime";

import type {
  InrScannerResponse,
  LiveOnlyInventoryResponse,
  LiveOnlyRuntimeResponse,
} from "../types/LiveOnlyRuntime";

type Runtime = LiveOnlyRuntimeResponse["data"];
type Inventory = LiveOnlyInventoryResponse["data"];

/*
 * Operator overview in the terminal-grid layout. Every figure is derived
 * from real backend evidence - order history, runner diagnostics, capital
 * study routes and the normalized wallet inventory. Nothing is simulated;
 * a panel with no evidence says so instead of showing a placeholder number.
 */

const EDGE_HISTORY_POINTS = 300;

interface ArbCycle {
  id: string;
  market: string;
  completedAt: number;
  filled: boolean;
  grossUsdt: number;
}

export function BotOverviewPanels({runtime}: {runtime: Runtime}) {
  const inventoryQuery = useLiveOnlyInventory();
  const historyQuery = useRecentExecutions(100);
  const scanner = useInrScanner().data?.data;
  const inventory = inventoryQuery.data?.data;
  const orders = useMemo(
    () => [...(historyQuery.data?.executions ?? [])].sort((first, second) => second.timestamp - first.timestamp),
    [historyQuery.data?.executions],
  );
  const cycles = useMemo(() => pairArbCycles(orders), [orders]);
  const usdtInr = inventory?.usdtInr ?? null;
  // Best real (BOOK, non-suspect) net across all three route kinds right now.
  const bestEdge = scanner
    ? [...scanner.opportunities, ...scanner.nearMisses].reduce<number | null>((best, route) => (best === null || route.netEdgePercent > best ? route.netEdgePercent : best), null)
    : null;
  const edgeHistory = useEdgeHistory(bestEdge, scanner?.running ?? false);
  const scannerGate = scanner?.config.minimumNetPercent ?? runtime.policy.minimumCurrentNetProfitPercent;

  const filledCycles = cycles.filter((cycle) => cycle.filled);
  const grossUsdt = filledCycles.reduce((sum, cycle) => sum + cycle.grossUsdt, 0);
  const pairFillRate = cycles.length > 0 ? (filledCycles.length / cycles.length) * 100 : null;
  const streak = profitableStreak(filledCycles);
  const filledOrders = orders.filter((order) => order.status === "FILLED").length;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
        <section className="panel grid min-w-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="flex min-w-0 flex-col justify-between gap-6 border-b border-border-default p-6 lg:border-r lg:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-label">Realized gross · live</p>
              {filledCycles.length > 0 ? (
                <span className="border border-emerald-400/40 px-2 py-1 font-mono text-[11px] text-emerald-300">
                  ↗ {formatMoney(grossUsdt / filledCycles.length, usdtInr, true)}/cycle
                </span>
              ) : null}
            </div>
            <p className={`font-mono text-5xl font-medium tabular-nums ${grossUsdt >= 0 ? "text-emerald-400 glow-green" : "text-red-400"}`}>
              {formatMoney(grossUsdt, usdtInr)}
            </p>
            <p className="font-mono text-[11px] tracking-[0.12em] text-text-muted">
              ARB <span className="text-emerald-300">{filledCycles.length} filled</span>
              <span className="mx-2 text-text-muted/50">·</span>
              {cycles.length} cycles · before fees
            </p>
          </div>

          <div className="grid grid-cols-2 border-b border-border-default lg:border-r lg:border-b-0">
            <MetricCell label="Pair fill rate" value={pairFillRate === null ? "—" : `${pairFillRate.toFixed(1)}%`} tone="good" />
            <MetricCell label="Win streak" value={`${streak}×`} tone="good" />
            <MetricCell label="Best edge now" value={bestEdge === null ? "—" : `${bestEdge.toFixed(3)}%`} tone={bestEdge !== null && bestEdge >= scannerGate ? "good" : "plain"} />
            <MetricCell label="Orders filled" value={`${filledOrders}/${orders.length}`} tone="plain" />
          </div>

          <div className="min-w-0 p-5">
            <EdgeChart points={edgeHistory} gate={scannerGate} />
          </div>
        </section>

        <NetWorthPanel inventory={inventory} loading={inventoryQuery.isPending} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(16rem,20rem)]">
        <LiveOrdersPanel orders={orders} loading={historyQuery.isPending} />
        <BotsPanel runtime={runtime} scanner={scanner} />
        <CoinsPanel inventory={inventory} />
      </div>
    </div>
  );
}

function MetricCell({label, value, tone}: {label: string; value: string; tone: "good" | "plain"}) {
  return (
    <div className="flex min-w-0 flex-col justify-between gap-3 border-border-default p-5 odd:border-r [&:nth-child(-n+2)]:border-b">
      <p className="text-label">{label}</p>
      <p className={`truncate font-mono text-2xl font-medium tabular-nums ${tone === "good" ? "text-emerald-400" : "text-text-primary"}`}>{value}</p>
    </div>
  );
}

function EdgeChart({points, gate}: {points: Array<{at: number; value: number}>; gate: number}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 320;
  const height = 150;
  const pad = {top: 8, right: 44, bottom: 18, left: 4};

  const values = points.map((point) => point.value);
  const max = Math.max(gate * 1.5, ...values, 0.05);
  const min = Math.min(0, ...values);
  const x = (index: number) => pad.left + (points.length <= 1 ? 0 : (index / (points.length - 1)) * (width - pad.left - pad.right));
  const y = (value: number) => pad.top + (1 - (value - min) / (max - min)) * (height - pad.top - pad.bottom);
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join("");
  const ticks = [min, (min + max) / 2, max];
  const hovered = hover === null ? null : points[hover];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <p className="text-label">Best valid net · all routes · this session</p>
        <p className="flex items-center gap-2 font-mono text-[10px] text-text-muted">
          <span className="inline-block h-px w-4 border-t border-dashed border-amber-400" /> gate {gate.toFixed(2)}%
        </p>
      </div>
      {points.length < 2 ? (
        <p className="mt-6 text-xs text-text-muted">Waiting for a valid route (≥ the net gate) from the arbitrage scanner…</p>
      ) : (
        <div className="relative mt-3 flex-1">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-full min-h-36 w-full overflow-visible"
            role="img"
            aria-label={`Best fresh net edge over this session, latest ${points[points.length - 1].value.toFixed(3)} percent`}
            onPointerLeave={() => setHover(null)}
            onPointerMove={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              const relative = ((event.clientX - box.left) / box.width) * width;
              const ratio = (relative - pad.left) / (width - pad.left - pad.right);
              setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
            }}
          >
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="currentColor" className="text-text-muted" strokeOpacity={0.12} />
                <text x={width - pad.right + 6} y={y(tick) + 3} className="fill-current text-text-muted" fontSize={9} fontFamily="JetBrains Mono, monospace">{tick.toFixed(2)}%</text>
              </g>
            ))}
            <line x1={pad.left} x2={width - pad.right} y1={y(gate)} y2={y(gate)} stroke="var(--neon-orange)" strokeDasharray="3 3" strokeWidth={1} />
            <path d={`${path}L${x(points.length - 1)},${y(min)}L${x(0)},${y(min)}Z`} fill="var(--neon-green)" fillOpacity={0.08} />
            <path d={path} fill="none" stroke="var(--neon-green)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {hovered ? (
              <g>
                <line x1={x(hover!)} x2={x(hover!)} y1={pad.top} y2={height - pad.bottom} stroke="currentColor" className="text-text-muted" strokeOpacity={0.4} />
                <circle cx={x(hover!)} cy={y(hovered.value)} r={4} fill="var(--neon-green)" stroke="var(--crt)" strokeWidth={2} />
              </g>
            ) : null}
            <text x={pad.left} y={height - 4} className="fill-current text-text-muted" fontSize={9} fontFamily="JetBrains Mono, monospace">{formatClock(points[0].at)}</text>
            <text x={width - pad.right} y={height - 4} textAnchor="end" className="fill-current text-text-muted" fontSize={9} fontFamily="JetBrains Mono, monospace">{formatClock(points[points.length - 1].at)}</text>
          </svg>
          {hovered ? (
            <div
              className="pointer-events-none absolute top-0 border border-border-default bg-[var(--panel-solid)] px-2 py-1 font-mono text-[11px] text-text-primary"
              style={{left: `${Math.min(70, (x(hover!) / width) * 100)}%`}}
            >
              {formatClock(hovered.at)} · <span className="text-emerald-300">{hovered.value.toFixed(3)}%</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function NetWorthPanel({inventory, loading}: {inventory: Inventory | undefined; loading: boolean}) {
  const exchangeTotal = (exchange: Inventory["exchanges"][number]) => exchange.knownTotalValueUsdt + exchange.estimatedValueUsdt;
  const exchanges = [...(inventory?.exchanges ?? [])].sort((first, second) => exchangeTotal(second) - exchangeTotal(first));
  const unit = inventory?.usdtInr ? "INR" : "USDT";

  return (
    <section className="panel p-6">
      <p className="text-label">Net worth · {unit}</p>
      {loading ? (
        <p className="mt-4 text-xs text-text-muted">Reading wallet inventory…</p>
      ) : !inventory ? (
        <p className="mt-4 text-xs text-red-300">Wallet inventory unavailable.</p>
      ) : (
        <>
          <p className="mt-3 font-mono text-4xl font-medium tabular-nums text-text-primary">{formatMoney(inventory.knownTotalValueUsdt + inventory.estimatedValueUsdt, inventory.usdtInr)}</p>
          {inventory.estimatedValueUsdt > 0 ? (
            <p className="mt-1 text-[10px] text-text-muted">incl. {formatMoney(inventory.estimatedValueUsdt, inventory.usdtInr)} valued from other-venue prices <span className="text-cyan-300">≈</span></p>
          ) : null}
          {inventory.unavailableValuations > 0 ? (
            <p className="mt-1 text-[10px] text-amber-300">{inventory.unavailableValuations} asset(s) without any price are not counted</p>
          ) : null}
          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5">
            {exchanges.map((exchange) => (
              <div key={exchange.exchange} className="min-w-0">
                <p className="text-label flex items-center gap-1.5">
                  <span className={`inline-block size-1.5 ${exchange.balanceUsableForDecision ? "bg-emerald-400" : "bg-amber-400"}`} />
                  {exchange.displayName}
                </p>
                <p className="mt-1 truncate font-mono text-base tabular-nums text-text-primary">
                  {formatMoney(exchangeTotal(exchange), inventory.usdtInr)}
                  {exchange.estimatedValueUsdt > 0 ? <span className="ml-1 text-cyan-300" title="Includes assets valued from other-venue prices">≈</span> : null}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function LiveOrdersPanel({orders, loading}: {orders: ExecutionHistoryItem[]; loading: boolean}) {
  return (
    <section className="panel min-w-0">
      <PanelHeader title="Live orders" aside={<><span className="inline-block size-1.5 bg-emerald-400" /> {orders.length} recent</>} />
      {loading ? (
        <p className="p-5 text-xs text-text-muted">Loading order history…</p>
      ) : orders.length === 0 ? (
        <p className="p-5 text-xs text-text-muted">No live orders recorded yet.</p>
      ) : (
        <div className="max-h-[26rem] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border-default">
                <th className="px-5 py-3 font-normal">Time</th>
                <th className="px-3 py-3 font-normal">Type</th>
                <th className="px-3 py-3 font-normal">Symbol</th>
                <th className="px-3 py-3 font-normal">Side</th>
                <th className="px-5 py-3 text-right font-normal">Fill</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-border-default/60">
                  <td className="px-5 py-2.5 font-mono text-text-muted">
                    <span className="block">{formatDay(order.timestamp)}</span>
                    <span className="text-text-primary">{formatClock(order.timestamp)}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`border px-1.5 py-0.5 font-mono text-[10px] ${order.clientOrderId?.startsWith("arb-") ? "border-amber-400/40 bg-amber-400/10 text-amber-300" : "border-cyan-300/40 bg-cyan-300/10 text-cyan-300"}`}>
                      {order.clientOrderId?.startsWith("arb-") ? "ARB" : "REC"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-text-primary">
                    {order.market.replace(/USDT$/, "")}
                    <span className="block text-[10px] uppercase text-text-muted">{order.exchange}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`px-1.5 py-0.5 font-mono text-[10px] uppercase ${order.side === "buy" ? "bg-emerald-400/15 text-emerald-300" : "bg-red-400/15 text-red-300"}`}>{order.side}</span>
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono">
                    <span className={order.status === "FILLED" ? "text-text-primary" : "text-amber-300"}>{order.status === "FILLED" ? formatQuantity(order.filledQuantity) : order.status.replace("_", " ")}</span>
                    {order.status === "FILLED" ? <span className="block text-[10px] text-text-muted">@ {order.averageFillPrice}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function BotsPanel({runtime, scanner}: {runtime: Runtime; scanner: InrScannerResponse["data"] | undefined}) {
  const runner = runtime.runner;
  const capitalRunner = runtime.capitalManager.runner;
  const poller = scanner?.coinSwitchInrDepth ?? null;
  const bots: Array<{name: string; online: boolean; value: string; detail: string; age: string}> = [
    {
      name: "Arbitrage scanner",
      online: scanner?.running ?? false,
      value: scanner ? `${scanner.opportunities.length} valid` : "—",
      detail: scanner ? `${formatCount(scanner.routesEvaluated)} routes · ${scanner.lastScanDurationMs ?? "—"} ms` : "not reporting",
      age: "1s",
    },
    {
      name: "Live executor",
      online: runner.running && !runner.halted,
      value: runner.halted ? "HALTED" : runner.inFlight ? "IN FLIGHT" : runner.running ? "WATCHING" : "STOPPED",
      detail: `USDT↔USDT ≥ ${runtime.policy.minimumCurrentNetProfitPercent}% · ${runner.completed}/${runner.attempts} done`,
      age: "live",
    },
    {
      name: "CoinSwitch INR depth",
      online: poller !== null && poller.running && poller.pausedUntil === null,
      value: poller ? `${poller.activeMarkets.length} mkts` : "—",
      detail: poller ? `${poller.successes}/${poller.requests} reads ok` : "not reporting",
      age: poller?.lastSuccessAt ? formatAgo(poller.lastSuccessAt) : "—",
    },
    {
      name: "Capital manager",
      online: runtime.capitalManager.enabled && capitalRunner.running,
      value: runtime.capitalManager.enabled ? "ENABLED" : "LOCKED",
      detail: capitalRunner.lastError ? "last cycle errored" : `${runtime.capitalManager.withdrawalWhitelistEntries} whitelisted`,
      age: capitalRunner.lastCycleAt ? formatAgo(capitalRunner.lastCycleAt) : "—",
    },
  ];
  const online = bots.filter((bot) => bot.online).length;

  return (
    <section className="panel min-w-0">
      <PanelHeader title={<>Bots <span className="ml-2 text-text-primary">{online}/{bots.length} online</span></>} aside="now" />
      <div>
        {bots.map((bot) => (
          <div key={bot.name} className="flex items-center gap-4 border-b border-border-default/60 px-5 py-3.5 last:border-b-0">
            <span className="w-9 shrink-0 font-mono text-[11px] text-amber-300">{bot.age}</span>
            <span className={`inline-block size-2 shrink-0 ${bot.online ? "bg-emerald-400 shadow-[0_0_8px_var(--neon-green)]" : "bg-red-400"}`} aria-label={bot.online ? "online" : "offline"} />
            <span className="min-w-0 flex-1 truncate font-mono text-xs uppercase tracking-[0.14em] text-text-primary">{bot.name}</span>
            <span className="text-right">
              <span className={`block font-mono text-base tabular-nums ${bot.online ? "text-emerald-400" : "text-text-primary"}`}>{bot.value}</span>
              <span className="block font-mono text-[10px] text-text-muted">{bot.detail}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CoinsPanel({inventory}: {inventory: Inventory | undefined}) {
  const coins = useMemo(() => {
    const byAsset = new Map<string, number>();
    for (const exchange of inventory?.exchanges ?? []) {
      for (const asset of exchange.assets) {
        byAsset.set(asset.asset, (byAsset.get(asset.asset) ?? 0) + (asset.totalValueUsdt ?? 0));
      }
    }
    return [...byAsset.entries()].sort((first, second) => second[1] - first[1]);
  }, [inventory]);
  const total = coins.reduce((sum, [, value]) => sum + value, 0);

  return (
    <section className="panel">
      <PanelHeader title={<>Your coins <span className="ml-2 text-text-primary">{coins.length}</span></>} aside={<span className="text-text-primary">{formatMoney(total, inventory?.usdtInr ?? null)}</span>} />
      {coins.length === 0 ? (
        <p className="p-5 text-xs text-text-muted">No held assets reported.</p>
      ) : (
        <ul className="max-h-64 overflow-auto">
          {coins.map(([asset, value]) => (
            <li key={asset} className="flex items-center gap-3 px-5 py-2.5 font-mono text-xs">
              <span className="w-14 shrink-0 text-text-primary">{asset}</span>
              <span className="h-0.5 flex-1 bg-border-default">
                <span className="block h-full bg-cyan-400" style={{width: `${total > 0 ? Math.max(2, (value / total) * 100) : 0}%`}} />
              </span>
              <span className="w-20 shrink-0 text-right tabular-nums text-text-primary">{formatMoney(value, inventory?.usdtInr ?? null)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}


function PanelHeader({title, aside}: {title: React.ReactNode; aside: React.ReactNode}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-default px-5 py-4">
      <h2 className="font-mono text-xs font-medium text-text-muted">{title}</h2>
      <span className="flex items-center gap-1.5 font-mono text-[11px] text-text-muted">{aside}</span>
    </div>
  );
}

/* ------------------------------------------------------------- derivations */

/**
 * Groups the two legs of each arbitrage attempt by the shared suffix of
 * their `arb-buy-<id>` / `arb-sell-<id>` client order ids. A cycle counts as
 * filled only when both legs filled; gross is matched quantity times the
 * sell-minus-buy average price (USDT, before fees - fee assets differ by
 * venue, so they are not netted here).
 */
function pairArbCycles(orders: ExecutionHistoryItem[]): ArbCycle[] {
  const legs = new Map<string, {buy?: ExecutionHistoryItem; sell?: ExecutionHistoryItem}>();
  for (const order of orders) {
    const match = order.clientOrderId?.match(/^arb-(buy|sell)-(.+)$/);
    if (!match) continue;
    const entry = legs.get(match[2]) ?? {};
    entry[match[1] as "buy" | "sell"] = order;
    legs.set(match[2], entry);
  }

  return [...legs.entries()]
    .map(([id, {buy, sell}]) => {
      const filled = buy?.status === "FILLED" && sell?.status === "FILLED";
      const matched = filled ? Math.min(buy!.filledQuantity, sell!.filledQuantity) : 0;
      return {
        id,
        market: (buy ?? sell)!.market,
        completedAt: Math.max(buy?.timestamp ?? 0, sell?.timestamp ?? 0),
        filled,
        grossUsdt: filled ? matched * (sell!.averageFillPrice - buy!.averageFillPrice) : 0,
      };
    })
    .sort((first, second) => second.completedAt - first.completedAt);
}

function profitableStreak(filledCycles: ArbCycle[]): number {
  let streak = 0;
  for (const cycle of filledCycles) {
    if (cycle.grossUsdt <= 0) break;
    streak += 1;
  }
  return streak;
}

/** Samples the best fresh edge once per runtime poll for this browser session. */
function useEdgeHistory(value: number | null, enabled: boolean) {
  const [points, setPoints] = useState<Array<{at: number; value: number}>>([]);
  const lastSampleAt = useRef(0);

  useEffect(() => {
    const now = Date.now();
    if (!enabled || value === null || now - lastSampleAt.current < 1_500) return;
    lastSampleAt.current = now;
    setPoints((current) => [...current, {at: now, value}].slice(-EDGE_HISTORY_POINTS));
  }, [value, enabled]);

  return points;
}

/* -------------------------------------------------------------- formatting */

function formatMoney(usdt: number, usdtInr: number | null, compact = false): string {
  const sign = usdt < 0 ? "-" : "";
  const absolute = Math.abs(usdt);
  if (usdtInr === null) {
    return `${sign}$${absolute.toLocaleString("en-US", {maximumFractionDigits: absolute < 10 ? 2 : 0})}`;
  }
  const inr = absolute * usdtInr;
  if (inr >= 1e7) return `${sign}₹${(inr / 1e7).toFixed(2)} Cr`;
  if (inr >= 1e5) return `${sign}₹${(inr / 1e5).toFixed(2)} L`;
  return `${sign}₹${inr.toLocaleString("en-IN", {maximumFractionDigits: compact || inr < 100 ? 2 : 0})}`;
}

function formatQuantity(quantity: number): string {
  return quantity.toLocaleString("en-US", {maximumFractionDigits: 4});
}

function formatCount(count: number): string {
  return count >= 1_000_000 ? `${(count / 1_000_000).toFixed(1)}M` : count >= 1_000 ? `${(count / 1_000).toFixed(1)}K` : String(count);
}

function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-GB", {hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false});
}

function formatDay(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-GB", {day: "2-digit", month: "2-digit"});
}

function formatAgo(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1_000));
  return seconds < 60 ? `${seconds}s` : seconds < 3_600 ? `${Math.round(seconds / 60)}m` : `${Math.round(seconds / 3_600)}h`;
}
