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
  useCentralLiveTriangularBridge,
} from "@/modules/strategies/hooks/useStrategies";

import {
  useInrCrossShadow,
  useLiveOnlyInventory,
} from "../hooks/useLiveOnlyRuntime";

import type {
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

const FRESH_EDGE_MAX_AGE_MS = 5_000;
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
  const triangularQuery = useCentralLiveTriangularBridge();
  const inventory = inventoryQuery.data?.data;
  const orders = useMemo(
    () => [...(historyQuery.data?.executions ?? [])].sort((first, second) => second.timestamp - first.timestamp),
    [historyQuery.data?.executions],
  );
  const cycles = useMemo(() => pairArbCycles(orders), [orders]);
  const usdtInr = inventory?.usdtInr ?? null;
  const bestEdge = currentBestEdge(runtime);
  const edgeHistory = useEdgeHistory(bestEdge, runtime.capitalStudy.routes.length > 0);

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
            <MetricCell label="Best edge now" value={bestEdge === null ? "—" : `${bestEdge.toFixed(3)}%`} tone={bestEdge !== null && bestEdge >= runtime.policy.minimumCurrentNetProfitPercent ? "good" : "plain"} />
            <MetricCell label="Orders filled" value={`${filledOrders}/${orders.length}`} tone="plain" />
          </div>

          <div className="min-w-0 p-5">
            <EdgeChart points={edgeHistory} gate={runtime.policy.minimumCurrentNetProfitPercent} />
          </div>
        </section>

        <NetWorthPanel inventory={inventory} loading={inventoryQuery.isPending} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(16rem,20rem)]">
        <LiveOrdersPanel orders={orders} loading={historyQuery.isPending} />
        <BotsPanel runtime={runtime} triangular={triangularQuery.data?.data} />
        <div className="space-y-4">
          <TopRoutesPanel runtime={runtime} />
          <CoinsPanel inventory={inventory} />
        </div>
      </div>

      <MissingCoinsPanel runtime={runtime} />

      <InrShadowPanel />
    </div>
  );
}

function InrShadowPanel() {
  const query = useInrCrossShadow();
  const report = query.data?.data;
  const [view, setView] = useState<"live" | "log">("live");
  const rows = view === "live" ? report?.routes ?? [] : report?.recentConfirmed ?? [];

  return (
    <section className="panel min-w-0">
      <PanelHeader
        title={<>INR routes · CoinDCX + UnoCoin <span className="ml-2 border border-cyan-300/40 px-1.5 py-0.5 text-[10px] text-cyan-300">SHADOW · no orders</span></>}
        aside={report ? (
          <span>
            USDT/INR {report.conversion.bid ?? "—"}/{report.conversion.ask ?? "—"}
            <span className="mx-2 text-text-muted/50">·</span>
            CDX {report.coverage.venues.coindcx?.pairedWithUsdtVenue ?? 0}↔USDT · UNO {report.coverage.venues.unocoin?.pairedWithUsdtVenue ?? 0}↔USDT · {report.coverage.inrInrPairs} INR↔INR
          </span>
        ) : null}
      />
      {query.isPending ? (
        <p className="p-5 text-xs text-text-muted">Loading INR study…</p>
      ) : !report ? (
        <p className="p-5 text-xs text-amber-300">INR study not running yet (waits for CoinDCX market data).</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-default px-5 py-3">
            <div className="flex gap-4">
              {(["live", "log"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setView(option)}
                  data-active={view === option}
                  className="border-b-2 border-transparent pb-1 font-mono text-[11px] tracking-[0.12em] text-text-muted data-[active=true]:border-emerald-400 data-[active=true]:text-emerald-300"
                >
                  {option === "live" ? "BEST NOW" : `CONFIRMED LOG (${report.recentConfirmed.length})`}
                </button>
              ))}
            </div>
            <p className="font-mono text-[11px] text-text-muted">
              best confirmed net{" "}
              <span className={report.bestConfirmedNetEdgePercent !== null && report.bestConfirmedNetEdgePercent > 0 ? "text-emerald-300" : "text-text-primary"}>
                {report.bestConfirmedNetEdgePercent === null ? "—" : `${report.bestConfirmedNetEdgePercent.toFixed(3)}%`}
              </span>
              <span className="mx-2 text-text-muted/50">·</span>
              at ₹{report.targetLegInr} leg{" "}
              <span className={report.bestSizedNetEdgePercent !== null && report.bestSizedNetEdgePercent > 0 ? "text-emerald-300" : "text-text-primary"}>
                {report.bestSizedNetEdgePercent === null ? "—" : `${report.bestSizedNetEdgePercent.toFixed(3)}%`}
              </span>
              <span className="mx-2 text-text-muted/50">·</span>
              demand books {report.demandSubscriptions.accepted}/{report.demandSubscriptions.requested}
            </p>
          </div>
          {!report.conversion.executable ? (
            <p className="border-b border-border-default px-5 py-2 text-[11px] text-amber-300">USDT/INR book is not executable right now; only INR↔INR routes are priced.</p>
          ) : null}
          {rows.length === 0 ? (
            <p className="p-5 text-xs text-text-muted">{view === "live" ? "No INR↔USDT route priced yet." : "No confirmed positive-net INR route yet. Confirmation needs a live CoinDCX INR book."}</p>
          ) : (
            <div className="max-h-[24rem] overflow-auto">
              <table className="w-full min-w-[52rem] text-left text-xs">
                <thead>
                  <tr className="border-b border-border-default">
                    <th className="px-5 py-3 font-normal">Coin</th>
                    <th className="px-3 py-3 font-normal">Route</th>
                    <th className="px-3 py-3 font-normal">Evidence</th>
                    <th className="px-3 py-3 text-right font-normal">Gross</th>
                    <th className="px-3 py-3 text-right font-normal">Fees</th>
                    <th className="px-3 py-3 text-right font-normal">Net</th>
                    <th className="px-3 py-3 text-right font-normal">TDS lock</th>
                    <th className="px-3 py-3 text-right font-normal">Net @ leg</th>
                    <th className="px-3 py-3 text-right font-normal">Fillable</th>
                    <th className="px-5 py-3 text-right font-normal">Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((route) => (
                    <tr key={`${route.routeKey}-${route.observedAt}`} className="border-b border-border-default/60">
                      <td className="px-5 py-2.5 font-mono text-text-primary">{route.coin}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-text-muted">
                        <span className={`mr-1.5 px-1 text-[9px] ${route.kind === "INR_INR" ? "bg-violet-400/15 text-violet-300" : "bg-cyan-300/15 text-cyan-300"}`}>{route.kind === "INR_INR" ? "INR↔INR" : "INR↔USDT"}</span>
                        buy {venueLabel(route.buyVenue, route.buyMarket)} → sell {venueLabel(route.sellVenue, route.sellMarket)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-1.5 py-0.5 font-mono text-[10px] ${route.confirmed ? "bg-emerald-400/15 text-emerald-300" : "bg-amber-400/15 text-amber-300"}`}>
                          {route.confirmed ? "BOOK" : "TICKER"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-primary">{route.grossEdgePercent.toFixed(2)}%</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-muted">−{route.feesPercent.toFixed(2)}%</td>
                      <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${route.netEdgePercent > 0 ? (route.confirmed ? "text-emerald-300" : "text-amber-300") : "text-text-muted"}`}>
                        {route.netEdgePercent.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-muted">{route.cashLockedPercent.toFixed(1)}%{route.tdsVerified ? null : <span className="ml-0.5 text-amber-300" title="Venue TDS treatment unverified">?</span>}</td>
                      <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${route.sizedNetEdgePercent !== null && route.sizedNetEdgePercent > 0 ? "text-emerald-300" : "text-text-muted"}`} title={`Walked through both books for a ₹${route.targetLegInr} leg`}>
                        {route.sizedNetEdgePercent === null ? (route.confirmed ? "thin" : "—") : `${route.sizedNetEdgePercent.toFixed(2)}%`}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-muted">{route.fillableDepthInr === null ? "—" : `₹${Math.round(route.fillableDepthInr).toLocaleString("en-IN")}`}</td>
                      <td className="px-5 py-2.5 text-right font-mono text-text-muted">{formatAgo(route.observedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-border-default px-5 py-3 text-[11px] text-text-muted">
            Net = gross − every taker fee on the route (INR↔USDT also pays one USDT/INR conversion fee). TDS is a recoverable cash lock shown separately; ? = venue TDS treatment unverified (UnoCoin). TICKER rows are unconfirmed hints (≥{report.thresholds.nominationGrossEdgePercent}% gross opens a live CoinDCX book; UnoCoin books are REST-polled, ≤20s old); only BOOK rows count. Net @ leg walks every published level of both books for one full leg ("thin" = not enough depth for it); Fillable = INR both sides can absorb. Shadow study: no order can be placed from here.
          </p>
        </>
      )}
    </section>
  );
}

interface MissingCoin {
  key: string;
  asset: string;
  exchange: string;
  side: "SELL" | "BUY";
  required: number;
  available: number | null;
  routes: string[];
  bestNet: number;
  passedGate: boolean;
  lastSeenAt: number | null;
}

/**
 * Every studied route whose own funding check fails, folded by the coin and
 * venue it is missing. SELL-side gaps are base coins the account must
 * already hold (never auto-bought); BUY-side gaps are quote balance the
 * Capital Manager may top up. Ranked so the coin that would unlock the
 * best recently-seen edge comes first.
 */
function collectMissingCoins(runtime: Runtime): MissingCoin[] {
  const byKey = new Map<string, MissingCoin>();
  const gate = runtime.policy.minimumCurrentNetProfitPercent;

  for (const route of runtime.capitalStudy.routes) {
    const funding = route.funding;
    if (!funding) continue;
    const net = route.latestNetProfitPercent ?? Number.NEGATIVE_INFINITY;
    const gaps: Array<Omit<MissingCoin, "key" | "routes" | "bestNet" | "passedGate" | "lastSeenAt">> = [];

    if (!funding.sellSufficient && funding.sellRequired !== null) {
      gaps.push({asset: funding.sellAsset, exchange: funding.sellExchange, side: "SELL", required: funding.sellRequired, available: funding.sellAvailable});
    }
    if (!funding.buySufficient && funding.buyRequired !== null) {
      gaps.push({asset: funding.buyAsset, exchange: funding.buyExchange, side: "BUY", required: funding.buyRequired, available: funding.buyAvailable});
    }

    for (const gap of gaps) {
      const key = `${gap.exchange}|${gap.asset}`;
      const existing = byKey.get(key);
      const routeLabel = `${route.market.replace(/USDT$/, "")} ${route.buyExchange.slice(0, 3)}→${route.sellExchange.slice(0, 3)}`;
      if (existing) {
        existing.required = Math.max(existing.required, gap.required);
        existing.routes.push(routeLabel);
        existing.bestNet = Math.max(existing.bestNet, net);
        existing.passedGate ||= net >= gate;
        existing.lastSeenAt = Math.max(existing.lastSeenAt ?? 0, route.latestObservedAt ?? 0) || null;
      } else {
        byKey.set(key, {...gap, key, routes: [routeLabel], bestNet: net, passedGate: net >= gate, lastSeenAt: route.latestObservedAt ?? null});
      }
    }
  }

  return [...byKey.values()].sort((first, second) => second.bestNet - first.bestNet);
}

function MissingCoinsPanel({runtime}: {runtime: Runtime}) {
  const missing = collectMissingCoins(runtime);
  const legInr = runtime.policy.preferredCapitalPerLegInr;

  return (
    <section className="panel min-w-0">
      <PanelHeader
        title={<>Missing coins <span className="ml-2 text-text-primary">{missing.length}</span></>}
        aside={<span>what blocks studied routes · one ₹{legInr} leg each</span>}
      />
      {missing.length === 0 ? (
        <p className="p-5 text-xs text-text-muted">Every studied route is funded on both legs.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-xs">
            <thead>
              <tr className="border-b border-border-default">
                <th className="px-5 py-3 font-normal">Coin</th>
                <th className="px-3 py-3 font-normal">Needed on</th>
                <th className="px-3 py-3 text-right font-normal">Need</th>
                <th className="px-3 py-3 text-right font-normal">Have</th>
                <th className="px-3 py-3 font-normal">Unlocks</th>
                <th className="px-3 py-3 text-right font-normal">Best net</th>
                <th className="px-5 py-3 text-right font-normal">Seen</th>
              </tr>
            </thead>
            <tbody>
              {missing.map((coin) => (
                <tr key={coin.key} className="border-b border-border-default/60">
                  <td className="px-5 py-2.5 font-mono text-text-primary">
                    {coin.asset}
                    <span className={`ml-2 px-1.5 py-0.5 text-[10px] ${coin.side === "SELL" ? "bg-red-400/15 text-red-300" : "bg-cyan-300/15 text-cyan-300"}`}>{coin.side === "SELL" ? "SELL LEG" : "BUY LEG"}</span>
                  </td>
                  <td className="px-3 py-2.5 font-mono uppercase text-text-muted">{coin.exchange}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-primary">{formatQuantity(coin.required)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-amber-300">{coin.available === null ? "none" : formatQuantity(coin.available)}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-text-muted">
                    {coin.routes.slice(0, 2).join(", ")}
                    {coin.routes.length > 2 ? ` +${coin.routes.length - 2}` : ""}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${coin.passedGate ? "text-emerald-300" : "text-text-primary"}`}>
                    {Number.isFinite(coin.bestNet) ? `${coin.bestNet.toFixed(3)}%` : "—"}
                    {coin.passedGate ? <span className="ml-1" title="Cleared the net gate">✓</span> : null}
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono text-text-muted">{coin.lastSeenAt ? formatAgo(coin.lastSeenAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-border-default px-5 py-3 text-[11px] text-text-muted">
            SELL-leg coins must already sit on that exchange; the Capital Manager never buys base coins. ✓ = the route's latest edge cleared the {runtime.policy.minimumCurrentNetProfitPercent.toFixed(2)}% gate.
          </p>
        </div>
      )}
    </section>
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
        <p className="text-label">Best net edge · this session</p>
        <p className="flex items-center gap-2 font-mono text-[10px] text-text-muted">
          <span className="inline-block h-px w-4 border-t border-dashed border-amber-400" /> gate {gate.toFixed(2)}%
        </p>
      </div>
      {points.length < 2 ? (
        <p className="mt-6 text-xs text-text-muted">Collecting live edge samples from the capital study…</p>
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

function BotsPanel({runtime, triangular}: {runtime: Runtime; triangular: {bridge: {running: boolean; recentOutcomes: unknown[]}; arm: {currentlyArmed: boolean}} | undefined}) {
  const runner = runtime.runner;
  const capitalRunner = runtime.capitalManager.runner;
  const bots: Array<{name: string; online: boolean; value: string; detail: string; age: string}> = [
    {
      name: "Strategy #1 live",
      online: runner.running && !runner.halted,
      value: runner.halted ? "HALTED" : runner.inFlight ? "IN FLIGHT" : runner.running ? "WATCHING" : "STOPPED",
      detail: `${runner.completed}/${runner.attempts} completed`,
      age: "live",
    },
    {
      name: "Snapshot scanner",
      online: runner.running,
      value: formatCount(runner.snapshotsObserved),
      detail: `${runner.candidatesObserved} candidates`,
      age: "live",
    },
    {
      name: "Capital study",
      online: runtime.capitalStudy.running,
      value: `${runtime.capitalStudy.trackedRoutes} routes`,
      detail: `${runtime.capitalStudy.executionStudyReadyRoutes} ready`,
      age: "live",
    },
    {
      name: "Capital manager",
      online: runtime.capitalManager.enabled && capitalRunner.running,
      value: runtime.capitalManager.enabled ? "ENABLED" : "LOCKED",
      detail: capitalRunner.lastError ? "last cycle errored" : `${runtime.capitalManager.withdrawalWhitelistEntries} whitelisted`,
      age: capitalRunner.lastCycleAt ? formatAgo(capitalRunner.lastCycleAt) : "—",
    },
    {
      name: "Triangular bridge",
      online: triangular?.bridge.running ?? false,
      value: triangular ? (triangular.arm.currentlyArmed ? "ARMED" : "DISARMED") : "—",
      detail: triangular ? `${triangular.bridge.recentOutcomes.length} outcomes` : "no evidence",
      age: "live",
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

function TopRoutesPanel({runtime}: {runtime: Runtime}) {
  const [view, setView] = useState<"gainers" | "losers">("gainers");
  const routes = runtime.capitalStudy.routes
    .filter((route) => route.latestNetProfitPercent !== null && route.latestNetProfitPercent !== undefined)
    .sort((first, second) => (view === "gainers" ? 1 : -1) * ((second.latestNetProfitPercent ?? 0) - (first.latestNetProfitPercent ?? 0)))
    .slice(0, 5);

  return (
    <section className="panel">
      <PanelHeader title="Top routes" aside="latest net" />
      <div className="grid grid-cols-2 border-b border-border-default">
        {(["gainers", "losers"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setView(option)}
            data-active={view === option}
            className="border-b-2 border-transparent py-2.5 font-mono text-[11px] capitalize tracking-[0.12em] text-text-muted data-[active=true]:border-emerald-400 data-[active=true]:text-emerald-300"
          >
            {option}
          </button>
        ))}
      </div>
      {routes.length === 0 ? (
        <p className="p-5 text-xs text-text-muted">No studied routes yet.</p>
      ) : (
        <ol>
          {routes.map((route, index) => (
            <li key={route.routeKey} className="flex items-center gap-3 px-5 py-2.5 font-mono text-xs">
              <span className="w-3 text-text-muted">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-text-primary">
                {route.market.replace(/USDT$/, "")}
                <span className="ml-2 text-[10px] uppercase text-text-muted">{route.buyExchange.slice(0, 3)}→{route.sellExchange.slice(0, 3)}</span>
              </span>
              <span className={(route.latestNetProfitPercent ?? 0) >= route.effectiveMinimumCurrentNetProfitPercent ? "text-emerald-300" : "text-text-primary"}>
                {(route.latestNetProfitPercent ?? 0) >= 0 ? "+" : ""}{(route.latestNetProfitPercent ?? 0).toFixed(3)}%
              </span>
            </li>
          ))}
        </ol>
      )}
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

function venueLabel(venue: string, market: string): string {
  const short = venue === "coindcx" ? "cdx" : venue === "unocoin" ? "uno" : venue;
  return `${short} ${market.endsWith("INR") ? "INR" : "USDT"}`;
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

function currentBestEdge(runtime: Runtime): number | null {
  const fresh = runtime.capitalStudy.routes
    .filter((route) => route.latestNetProfitPercent !== null && route.latestNetProfitPercent !== undefined && route.latestEvidenceAgeMs !== null && route.latestEvidenceAgeMs !== undefined && route.latestEvidenceAgeMs <= FRESH_EDGE_MAX_AGE_MS)
    .map((route) => route.latestNetProfitPercent as number);
  return fresh.length > 0 ? Math.max(...fresh) : null;
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
