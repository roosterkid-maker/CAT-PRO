import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  useArbitragePnL,
  useRecentExecutions,
} from "@/modules/execution-monitoring/hooks/useExecutionMonitoring";

import type {
  ExecutionHistoryItem,
} from "@/modules/execution-monitoring/services/executionHistoryApi";

import {
  useCoinStudy,
  useInrExecutor,
  useInrScanner,
  useLiveOnlyInventory,
  useLiveOnlyRuntime,
  useRefillPlan,
} from "@/modules/live-only/hooks/useLiveOnlyRuntime";

import type {
  InrScannedRoute,
  InrScannerResponse,
  LiveOnlyInventoryResponse,
} from "@/modules/live-only/types/LiveOnlyRuntime";

import {
  useSystemHealth,
} from "@/modules/system-health/hooks/useSystemHealth";

import {
  Bars,
  Donut,
  Gauge,
  Sparkline,
  type DonutSegment,
} from "../components/CommandCharts";

/*
 * COMMAND CENTER: one fixed, dense operator view over everything live -
 * realized P&L, trade rate, what each exchange holds, the executable
 * opportunities (a fixed scrolling window, never a pop-up), edge and trade
 * charts, and the state of every bot. Read-only; every number comes from
 * the same backend evidence as the other tabs.
 */

type Inventory = LiveOnlyInventoryResponse["data"];

const VENUES = ["coindcx", "binance", "unocoin", "coinswitch", "bybit"] as const;

const VENUE_NAME: Record<string, string> = {
  coindcx: "CoinDCX",
  binance: "Binance",
  unocoin: "UnoCoin",
  coinswitch: "CoinSwitch",
  bybit: "Bybit",
  zebpay: "ZebPay",
  giottus: "Giottus",
};

/* Fixed categorical order: a venue keeps its color everywhere. */
const VENUE_COLOR: Record<string, string> = {
  coindcx: "#00f0ff",
  binance: "#ffd000",
  unocoin: "#00ff41",
  coinswitch: "#b388ff",
  bybit: "#ff6b00",
};

const KIND_LABEL: Record<InrScannedRoute["kind"], string> = {
  USDT_USDT: "USDT↔USDT",
  INR_USDT: "USDT↔INR",
  INR_INR: "INR↔INR",
};

const KIND_COLOR: Record<InrScannedRoute["kind"], string> = {
  USDT_USDT: "#00f0ff",
  INR_USDT: "#00ff41",
  INR_INR: "#b388ff",
};

const EDGE_HISTORY = 160;
const DAILY_LOSS_LIMIT_INR = 500;
const MINIMUM_LEG_INR = 600;
const OPPORTUNITY_ROW_PX = 58;

export default function CommandCenter() {
  const runtime = useLiveOnlyRuntime().data?.data;
  const inventory = useLiveOnlyInventory().data?.data;
  const scanner = useInrScanner().data?.data;
  const executor = useInrExecutor().data?.data;
  const pnl = useArbitragePnL(200).data;
  const orders = useRecentExecutions(200).data?.executions;
  const study = useCoinStudy().data?.data;
  const refill = useRefillPlan().data?.data;
  const health = useSystemHealth().data?.data;
  const now = useNow(1_000);

  const usdtInr = inventory?.usdtInr ?? null;
  const tradeSizeInr = runtime?.policy.preferredCapitalPerLegInr ?? 1_500;
  const opportunities = scanner?.opportunities ?? [];
  const bestNow = opportunities[0]?.netEdgePercent ?? 0;
  const edgeHistory = useRollingHistory(scanner?.lastScanAt ?? null, bestNow);

  /* ---------------- P&L: bot-hedged trades only (manual hedges are not bot P&L) */
  const istDay = (timestamp: number) => new Date(timestamp + 330 * 60_000).toISOString().slice(0, 10);
  const today = istDay(now);
  const s1Records = pnl?.latest ?? [];
  const s1TotalInr = usdtInr !== null ? (pnl?.netProfit ?? 0) * usdtInr : 0;
  const s1TodayInr = usdtInr !== null
    ? s1Records.filter((record) => record.status === "COMPLETED" && istDay(record.completedAt) === today).reduce((sum, record) => sum + record.netProfit, 0) * usdtInr
    : 0;
  const inrTodayInr = executor?.realizedNetInrToday ?? 0;
  const inrTotalInr = (executor?.recentSessions ?? []).reduce((sum, session) => sum + (session.realizedNetInr ?? 0), 0);
  const pnlTodayInr = s1TodayInr + inrTodayInr;
  const pnlTotalInr = s1TotalInr + inrTotalInr;

  /* ---------------- trades per hour (filled orders, last 24 h) */
  const hourly = useMemo(() => tradesPerHour(orders ?? [], now), [orders, now]);
  const trades24h = hourly.values.reduce((sum, value) => sum + value, 0);

  /* ---------------- exchanges */
  const venueValues = VENUES.map((venue) => ({venue, ...venueValue(inventory, venue, usdtInr)}));
  const netWorthInr = inventory && usdtInr !== null ? (inventory.knownTotalValueUsdt + inventory.estimatedValueUsdt) * usdtInr : null;

  /* ---------------- charts */
  const edgeByHour = useMemo(() => {
    const minutes = new Array<number>(24).fill(0);
    for (const coin of study?.coins ?? []) coin.hourlyEdgeMinutes.forEach((value, hour) => (minutes[hour] += value));
    return minutes;
  }, [study]);
  const routeMix: DonutSegment[] = (["INR_USDT", "USDT_USDT", "INR_INR"] as const).map((kind) => ({
    label: KIND_LABEL[kind],
    value: opportunities.filter((route) => route.kind === kind).length,
    color: KIND_COLOR[kind],
  }));
  const assetMix = useMemo(() => assetAllocation(inventory, usdtInr), [inventory, usdtInr]);

  const halted = Boolean(runtime?.runner.halted || executor?.halted);
  const feeds = health?.exchanges ?? [];
  const feedsUp = feeds.filter((feed) => feed.connected).length;

  return (
    <section className="cc-root space-y-4">
      {/* ======================= headline ======================= */}
      <header className="cc-hero">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="cc-kicker">CAT PRO // COMMAND CENTER</p>
            <h1 className="cc-title">
              {halted ? <span className="text-red-300">TRADING HALTED</span> : <span>ARBITRAGE ENGINE <span className="cc-live">LIVE</span></span>}
            </h1>
            <p className="mt-1 font-mono text-[11px] text-text-muted">
              {scanner ? `${formatCount(scanner.routesEvaluated)} routes / ${scanner.lastScanDurationMs ?? "—"} ms scan · ` : ""}
              {feeds.length > 0 ? `${feedsUp}/${feeds.length} feeds · ` : ""}
              USDT/INR {usdtInr?.toFixed(2) ?? "—"} · {new Date(now).toLocaleTimeString("en-GB", {hour12: false})}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 font-mono text-[10px]">
            <StatusChip label="USDT runner" state={!runtime ? "unknown" : runtime.runner.halted ? "halted" : runtime.runner.running ? "live" : "off"} />
            <StatusChip label="INR executor" state={!executor ? "unknown" : executor.halted ? "halted" : executor.mode === "live" ? "live" : executor.mode === "shadow" ? "shadow" : "off"} />
            <StatusChip label="Capital mgr" state={!runtime ? "unknown" : runtime.capitalManager.enabled && runtime.capitalManager.runner.running ? "live" : "off"} />
            <StatusChip label="Scanner" state={!scanner ? "unknown" : scanner.running ? "live" : "off"} />
          </div>
        </div>
      </header>

      {/* ======================= KPI strip ======================= */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Kpi label="Net worth" value={netWorthInr === null ? "—" : inr(netWorthInr)} sub="all exchanges, live prices" accent="cyan" />
        <Kpi label="Bot P&L today (IST)" value={signedInr(pnlTodayInr)} sub={`all-time ${signedInr(pnlTotalInr)} · bot-hedged only`} accent={pnlTodayInr >= 0 ? "green" : "red"} />
        <Kpi label="Trades / hour" value={(trades24h / 24).toFixed(1)} sub={`${trades24h} filled orders · 24h · last hr ${hourly.values[hourly.values.length - 1] ?? 0}`} accent="green" />
        <Kpi label="Live edges" value={String(opportunities.length)} sub={opportunities.length > 0 ? `best +${bestNow.toFixed(2)}% · ${opportunities[0].coin}` : "none ≥ gate right now"} accent={opportunities.length > 0 ? "green" : "muted"} />
        <Kpi label="Win rate" value={pnl && pnl.completedCycles > 0 ? `${pnl.winRatePercent.toFixed(0)}%` : "—"} sub={pnl ? `${pnl.completedCycles} USDT cycles · ${pnl.profitableCycles} won` : "no cycles yet"} accent="cyan" />
        <div className="cc-kpi flex flex-col items-center justify-center">
          <Gauge used={Math.max(0, -pnlTodayInr)} limit={DAILY_LOSS_LIMIT_INR} label="daily loss stop" valueText={`₹${Math.round(Math.max(0, -pnlTodayInr))} / ${DAILY_LOSS_LIMIT_INR}`} />
        </div>
      </div>

      {/* ======================= exchanges ======================= */}
      <HudPanel title="EXCHANGE VALUE" meta={netWorthInr === null ? "" : `total ${inr(netWorthInr)}`}>
        <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {venueValues.map((venue) => (
              <div key={venue.venue} className="cc-venue" style={{"--venue": VENUE_COLOR[venue.venue]} as React.CSSProperties}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] tracking-[0.18em] text-text-primary">{(VENUE_NAME[venue.venue] ?? venue.venue).toUpperCase()}</span>
                  <span className={`size-1.5 ${venue.synced ? "bg-emerald-400 shadow-[0_0_6px_var(--neon-green)]" : "bg-amber-400"}`} title={venue.synced ? "balances synced" : "balances stale"} />
                </div>
                <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-text-primary">{venue.totalInr === null ? "—" : inr(venue.totalInr)}</p>
                <div className="mt-2 h-1 w-full bg-border-default">
                  <div className="h-full" style={{width: `${netWorthInr && venue.totalInr ? Math.min(100, (venue.totalInr / netWorthInr) * 100) : 0}%`, background: VENUE_COLOR[venue.venue]}} />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-1 font-mono text-[10px]">
                  <div><dt className="text-text-muted">INR</dt><dd className="tabular-nums text-text-primary">{venue.inrCash === null ? "—" : inr(venue.inrCash)}</dd></div>
                  <div><dt className="text-text-muted">USDT</dt><dd className="tabular-nums text-text-primary">{venue.usdtInr === null ? "—" : inr(venue.usdtInr)}</dd></div>
                  <div><dt className="text-text-muted">COINS</dt><dd className="tabular-nums text-text-primary">{venue.coinsInr === null ? "—" : inr(venue.coinsInr)}</dd></div>
                </dl>
              </div>
            ))}
          </div>
          <Donut
            segments={venueValues.map((venue) => ({label: VENUE_NAME[venue.venue], value: venue.totalInr ?? 0, color: VENUE_COLOR[venue.venue]}))}
            centerLabel="allocation"
            centerValue={netWorthInr === null ? "—" : compactInr(netWorthInr)}
            format={compactInr}
          />
        </div>
      </HudPanel>

      {/* ======================= opportunities + mixes ======================= */}
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <HudPanel
          title="EXECUTABLE OPPORTUNITIES"
          meta={`net ≥ ${scanner?.config.minimumNetPercent ?? 1}% · valid + executable only · ${opportunities.length} live`}
        >
          <OpportunityWindow routes={opportunities} scanner={scanner} inventory={inventory} usdtInr={usdtInr} tradeSizeInr={tradeSizeInr} now={now} />
        </HudPanel>
        <div className="space-y-4">
          <HudPanel title="ROUTE MIX" meta="live opportunities">
            <Donut segments={routeMix} centerLabel="routes" centerValue={String(opportunities.length)} format={(value) => String(value)} size={140} />
          </HudPanel>
          <HudPanel title="ASSET MIX" meta="top holdings">
            <Donut segments={assetMix} centerLabel="assets" centerValue={String(assetMix.length)} format={compactInr} size={140} />
          </HudPanel>
        </div>
      </div>

      {/* ======================= charts ======================= */}
      <div className="grid gap-4 lg:grid-cols-3">
        <HudPanel title="TRADES / HOUR" meta="filled orders · last 24 h">
          <Bars values={hourly.values} labels={hourly.labels} color="var(--neon-green)" format={(value) => `${value} fills`} highlightIndex={hourly.values.length - 1} />
        </HudPanel>
        <HudPanel title="EDGE BY HOUR (IST)" meta={study ? `${study.studyDays}-day coin study · edge-minutes` : "coin study"}>
          <Bars
            values={edgeByHour}
            labels={edgeByHour.map((_, hour) => `${String(hour).padStart(2, "0")}:00 IST`)}
            color="var(--neon-cyan)"
            format={(value) => `${value.toFixed(1)} edge-min`}
            highlightIndex={new Date(now + 330 * 60_000).getUTCHours()}
          />
        </HudPanel>
        <HudPanel title="BEST EDGE · LIVE" meta={`gate ${scanner?.config.minimumNetPercent ?? 1}% (dashed)`}>
          <div className="mb-2 flex items-baseline justify-between font-mono">
            <span className={`text-3xl font-semibold tabular-nums ${bestNow > 0 ? "text-emerald-300" : "text-text-muted"}`}>{bestNow > 0 ? `+${bestNow.toFixed(2)}%` : "0.00%"}</span>
            <span className="text-[10px] text-text-muted">{opportunities[0] ? `${opportunities[0].coin} · ${VENUE_NAME[opportunities[0].buyVenue]} → ${VENUE_NAME[opportunities[0].sellVenue]}` : "no edge ≥ gate"}</span>
          </div>
          <Sparkline points={edgeHistory} color="var(--neon-green)" baseline={scanner?.config.minimumNetPercent ?? 1} height={92} />
        </HudPanel>
      </div>

      {/* ======================= tape + systems + refill ======================= */}
      <div className="grid gap-4 xl:grid-cols-3">
        <HudPanel title="ORDER TAPE" meta="latest exchange orders">
          <OrderTape orders={orders ?? []} />
        </HudPanel>
        <HudPanel title="SYSTEMS" meta="live state">
          <SystemRow name="USDT runner" value={runtime ? (runtime.runner.halted ? "HALTED" : runtime.runner.inFlight ? "IN FLIGHT" : "WATCHING") : "—"} detail={runtime ? `USDT↔USDT ≥ ${runtime.policy.minimumCurrentNetProfitPercent}% · ${runtime.runner.completed} done` : ""} bad={runtime?.runner.halted} />
          <SystemRow name="INR executor" value={executor ? (executor.halted ? "HALTED" : executor.inFlight ? "IN FLIGHT" : executor.mode.toUpperCase()) : "—"} detail={executor ? `USDT↔INR · INR↔INR · ${executor.policy?.inrVenues.map((venue) => VENUE_NAME[venue] ?? venue).join(", ") ?? ""}` : ""} bad={executor?.halted} />
          <SystemRow name="Top blocker" value={topBlocker(executor?.blockers)} detail="why routes are being skipped" />
          <SystemRow name="Capital manager" value={refill ? (refill.automation.enabled ? "AUTO" : "OFF") : "—"} detail={refill ? `${refill.actions.filter((action) => action.mode === "AUTO").length} auto · ${refill.actions.filter((action) => action.mode === "MANUAL").length} manual refills${Object.keys(refill.automation.blocked ?? {}).length ? " · paused" : ""}` : ""} bad={Boolean(refill && Object.keys(refill.automation.blocked ?? {}).length)} />
          <SystemRow name="CoinSwitch depth" value={scanner?.coinSwitchInrDepth ? `${scanner.coinSwitchInrDepth.activeMarkets.length} mkts` : "—"} detail={scanner?.coinSwitchInrDepth ? `${scanner.coinSwitchInrDepth.successes}/${scanner.coinSwitchInrDepth.requests} reads ok` : ""} bad={Boolean(scanner?.coinSwitchInrDepth?.pausedUntil)} />
          <SystemRow name="Core basket" value={study?.coreBasket.join(" · ") || "—"} detail={study ? `${study.dataSpanHours.toFixed(1)} h of study data` : ""} />
        </HudPanel>
        <HudPanel title="REFILL QUEUE" meta="capital manager plan">
          {refill && refill.actions.length > 0 ? (
            <ul className="space-y-2">
              {refill.actions.slice(0, 6).map((action) => (
                <li key={action.id} className="cc-refill">
                  <span className={`px-1.5 py-0.5 font-mono text-[9px] ${action.mode === "AUTO" ? "bg-emerald-400/15 text-emerald-300" : "bg-amber-400/15 text-amber-300"}`}>{action.mode}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-primary">
                    {action.kind.replace("_", " ").toLowerCase()} {action.asset} {action.fromVenue ? `${VENUE_NAME[action.fromVenue]} → ` : "→ "}{VENUE_NAME[action.toVenue]}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-text-muted">{inr(action.amountInr)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-mono text-[11px] text-emerald-300">Core basket stocked. Nothing to refill.</p>
          )}
        </HudPanel>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- window */

function OpportunityWindow({
  routes,
  scanner,
  inventory,
  usdtInr,
  tradeSizeInr,
  now,
}: {
  routes: readonly InrScannedRoute[];
  scanner: InrScannerResponse["data"] | undefined;
  inventory: Inventory | undefined;
  usdtInr: number | null;
  tradeSizeInr: number;
  now: number;
}) {
  const startedAt = new Map((scanner?.activeWindows ?? []).map((window) => [window.routeKey, window.startedAt]));
  return (
    <div>
      <div className="cc-opp-head">
        <span>COIN</span>
        <span>ROUTE</span>
        <span className="text-right">NET</span>
        <span className="text-right">DEPTH ≥ GATE</span>
        <span className="text-right">QTY @ ₹{tradeSizeInr.toLocaleString("en-IN")}</span>
        <span className="text-right">MIN ORDER</span>
        <span className="text-right">LIVE FOR</span>
        <span className="text-right">FUNDS</span>
      </div>
      <div className="cc-opp-body" style={{height: OPPORTUNITY_ROW_PX * 5}}>
        {routes.length === 0 ? (
          <div className="cc-empty">
            <div className="cc-radar" aria-hidden="true" />
            <p className="font-mono text-sm tracking-[0.3em] text-text-muted">NOT AVAILABLE NOW</p>
            <p className="font-mono text-[10px] text-text-muted">scanning {formatCount(scanner?.routesEvaluated ?? 0)} routes every second</p>
          </div>
        ) : (
          routes.map((route) => {
            const sizeInr = Math.min(tradeSizeInr, route.depthAtThresholdInr ?? tradeSizeInr);
            const quantity = route.buyPriceInr > 0 ? sizeInr / route.buyPriceInr : null;
            const live = startedAt.get(route.routeKey);
            const funds = fundsFor(route, inventory, usdtInr);
            return (
              <div key={route.routeKey} className="cc-opp-row" style={{height: OPPORTUNITY_ROW_PX}}>
                <span className="font-mono text-sm font-semibold text-text-primary">{route.coin}</span>
                <span className="min-w-0 font-mono text-[11px]">
                  <span className="mr-1.5 px-1 py-0.5 text-[9px]" style={{color: KIND_COLOR[route.kind], background: `${KIND_COLOR[route.kind]}22`}}>{KIND_LABEL[route.kind]}</span>
                  <span className="text-text-primary">{VENUE_NAME[route.buyVenue] ?? route.buyVenue}</span>
                  <span className="text-text-muted"> {route.buyMarket.endsWith("INR") ? "INR" : "USDT"} → </span>
                  <span className="text-text-primary">{VENUE_NAME[route.sellVenue] ?? route.sellVenue}</span>
                  <span className="text-text-muted"> {route.sellMarket.endsWith("INR") ? "INR" : "USDT"}</span>
                </span>
                <span className="text-right font-mono text-base font-semibold tabular-nums text-emerald-300 [text-shadow:0_0_8px_rgb(0_255_65/45%)]">+{route.netEdgePercent.toFixed(2)}%</span>
                <span className="text-right font-mono text-[11px] tabular-nums text-text-primary">{route.depthAtThresholdInr === null ? "—" : inr(route.depthAtThresholdInr)}</span>
                <span className="text-right font-mono text-[11px] tabular-nums text-text-primary">{quantity === null ? "—" : formatQuantity(quantity)} {route.coin}</span>
                <span className="text-right font-mono text-[11px] tabular-nums text-text-muted">{route.minimumOrderInr === null ? "—" : inr(route.minimumOrderInr)}</span>
                <span className="text-right font-mono text-[11px] tabular-nums text-amber-300">{live ? duration(now - live) : "new"}</span>
                <span className="text-right">
                  <span className={`px-1.5 py-0.5 font-mono text-[9px] ${funds.ready ? "bg-emerald-400/15 text-emerald-300" : "bg-red-400/10 text-red-300"}`} title={funds.detail}>
                    {funds.ready ? "READY" : funds.short}
                  </span>
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- parts */

function HudPanel({title, meta, children}: {title: string; meta?: string; children: ReactNode}) {
  return (
    <section className="cc-panel">
      <span className="cc-corner cc-corner-tl" aria-hidden="true" />
      <span className="cc-corner cc-corner-br" aria-hidden="true" />
      <header className="cc-panel-head">
        <h2><span className="text-emerald-400">//</span> {title}</h2>
        {meta ? <span className="truncate">{meta}</span> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Kpi({label, value, sub, accent}: {label: string; value: string; sub: string; accent: "green" | "cyan" | "red" | "muted"}) {
  const color = accent === "green" ? "text-emerald-300" : accent === "cyan" ? "text-cyan-300" : accent === "red" ? "text-red-300" : "text-text-muted";
  return (
    <div className="cc-kpi">
      <p className="text-label">{label}</p>
      <p className={`cc-kpi-value ${color}`}>{value}</p>
      <p className="mt-1 truncate font-mono text-[10px] text-text-muted">{sub}</p>
    </div>
  );
}

function StatusChip({label, state}: {label: string; state: "live" | "halted" | "shadow" | "off" | "unknown"}) {
  const tone =
    state === "live" ? "border-emerald-400/40 text-emerald-300" :
    state === "halted" ? "border-red-400/50 text-red-300" :
    state === "shadow" ? "border-cyan-300/40 text-cyan-300" :
    "border-border-default text-text-muted";
  return (
    <span className={`inline-flex items-center gap-1.5 border px-2 py-1 ${tone}`}>
      <span className={`size-1.5 ${state === "live" ? "bg-emerald-400 animate-pulse" : state === "halted" ? "bg-red-400" : "bg-current"}`} />
      {label.toUpperCase()} · {state.toUpperCase()}
    </span>
  );
}

function SystemRow({name, value, detail, bad}: {name: string; value: string; detail: string; bad?: boolean}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border-default/60 py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="font-mono text-[11px] text-text-primary">{name}</p>
        <p className="truncate font-mono text-[10px] text-text-muted">{detail}</p>
      </div>
      <span className={`shrink-0 font-mono text-[11px] ${bad ? "text-red-300" : "text-emerald-300"}`}>{value}</span>
    </div>
  );
}

function OrderTape({orders}: {orders: readonly ExecutionHistoryItem[]}) {
  const latest = [...orders].sort((a, b) => b.timestamp - a.timestamp).slice(0, 9);
  if (latest.length === 0) return <p className="font-mono text-[11px] text-text-muted">No orders yet.</p>;
  return (
    <ul className="space-y-1.5 font-mono text-[11px]">
      {latest.map((order) => (
        <li key={order.id} className="grid grid-cols-[64px_62px_1fr_auto] items-center gap-2">
          <span className="tabular-nums text-text-muted">{new Date(order.timestamp).toLocaleTimeString("en-GB", {hour12: false})}</span>
          <span className={order.side === "buy" ? "text-emerald-300" : "text-red-300"}>{order.side.toUpperCase()}</span>
          <span className="truncate text-text-primary">{order.market} <span className="text-text-muted">{VENUE_NAME[order.exchange] ?? order.exchange}</span></span>
          <span className={order.status === "FILLED" ? "text-emerald-300" : "text-text-muted"}>{order.status === "FILLED" ? formatQuantity(order.filledQuantity) : order.status.toLowerCase()}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- logic */

function venueValue(inventory: Inventory | undefined, venue: string, usdtInr: number | null) {
  const exchange = inventory?.exchanges.find((item) => item.exchange === venue);
  if (!exchange || usdtInr === null) return {totalInr: null, inrCash: null, usdtInr: null, coinsInr: null, synced: false};
  const totalInr = (exchange.knownTotalValueUsdt + exchange.estimatedValueUsdt) * usdtInr;
  const inrCash = exchange.assets.find((asset) => asset.asset === "INR")?.totalBalance ?? 0;
  const usdt = (exchange.assets.find((asset) => asset.asset === "USDT")?.totalBalance ?? 0) * usdtInr;
  return {
    totalInr,
    inrCash,
    usdtInr: usdt,
    coinsInr: Math.max(0, totalInr - inrCash - usdt),
    synced: exchange.balanceUsableForDecision,
  };
}

function holdingInr(inventory: Inventory | undefined, venue: string, asset: string, usdtInr: number | null): number {
  const position = inventory?.exchanges.find((item) => item.exchange === venue)?.assets.find((item) => item.asset === asset);
  if (!position || usdtInr === null) return 0;
  if (asset === "INR") return position.availableAfterReservations;
  if (asset === "USDT") return position.availableAfterReservations * usdtInr;
  const share = position.totalBalance > 0 ? position.availableAfterReservations / position.totalBalance : 0;
  return (position.totalValueUsdt ?? 0) * share * usdtInr;
}

/* Is the route funded now: coin on the sell venue, cash on the buy venue. */
function fundsFor(route: InrScannedRoute, inventory: Inventory | undefined, usdtInr: number | null) {
  const cashAsset = route.buyMarket.endsWith("INR") ? "INR" : "USDT";
  const coinHave = holdingInr(inventory, route.sellVenue, route.coin, usdtInr);
  const cashHave = holdingInr(inventory, route.buyVenue, cashAsset, usdtInr);
  const coinOk = coinHave >= MINIMUM_LEG_INR;
  const cashOk = cashHave >= MINIMUM_LEG_INR;
  return {
    ready: coinOk && cashOk,
    short: !coinOk && !cashOk ? "NO FUNDS" : !coinOk ? `NO ${route.coin}` : `NO ${cashAsset}`,
    detail: `${route.coin} on ${VENUE_NAME[route.sellVenue]}: ₹${Math.round(coinHave)} · ${cashAsset} on ${VENUE_NAME[route.buyVenue]}: ₹${Math.round(cashHave)} (≥ ₹${MINIMUM_LEG_INR} each)`,
  };
}

function assetAllocation(inventory: Inventory | undefined, usdtInr: number | null): DonutSegment[] {
  if (!inventory || usdtInr === null) return [];
  const totals = new Map<string, number>();
  for (const exchange of inventory.exchanges) {
    for (const asset of exchange.assets) {
      const value = asset.asset === "INR" ? asset.totalBalance : (asset.totalValueUsdt ?? 0) * usdtInr;
      if (value > 0) totals.set(asset.asset, (totals.get(asset.asset) ?? 0) + value);
    }
  }
  const palette = ["#00ff41", "#00f0ff", "#ffd000", "#ff6b00", "#b388ff", "#ff5fa2"];
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 5).map(([asset, value], index) => ({label: asset, value, color: palette[index]}));
  const rest = sorted.slice(5).reduce((sum, [, value]) => sum + value, 0);
  return rest > 0 ? [...top, {label: "Other", value: rest, color: "#5c5c5c"}] : top;
}

function tradesPerHour(orders: readonly ExecutionHistoryItem[], now: number) {
  const hourMs = 3_600_000;
  const start = Math.floor(now / hourMs) * hourMs - 23 * hourMs;
  const values = new Array<number>(24).fill(0);
  const labels = values.map((_, index) => `${new Date(start + index * hourMs).toLocaleTimeString("en-GB", {hour: "2-digit", minute: "2-digit", hour12: false})}`);
  const seen = new Set<string>();
  for (const order of orders) {
    if (order.status !== "FILLED" || order.filledQuantity <= 0 || order.timestamp < start) continue;
    const key = order.orderId ?? order.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const index = Math.floor((order.timestamp - start) / hourMs);
    if (index >= 0 && index < 24) values[index] += 1;
  }
  return {values, labels};
}

function topBlocker(blockers: Record<string, number> | undefined): string {
  const entries = Object.entries(blockers ?? {}).sort((a, b) => b[1] - a[1]);
  return entries[0] ? `${entries[0][0].replace(/_/gu, " ").toLowerCase()} (${entries[0][1]})` : "none";
}

/* -------------------------------------------------------------- helpers */

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/* Best live edge per scan, kept client-side for the sparkline. */
function useRollingHistory(scanAt: number | null, value: number): number[] {
  const [points, setPoints] = useState<number[]>([]);
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (scanAt === null || scanAt === last.current) return;
    last.current = scanAt;
    setPoints((current) => [...current, value].slice(-EDGE_HISTORY));
  }, [scanAt, value]);
  return points;
}

function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function compactInr(value: number): string {
  if (value >= 1e7) return `₹${(value / 1e7).toFixed(2)}Cr`;
  if (value >= 1e5) return `₹${(value / 1e5).toFixed(2)}L`;
  if (value >= 1e3) return `₹${(value / 1e3).toFixed(1)}k`;
  return `₹${Math.round(value)}`;
}

function signedInr(value: number): string {
  const sign = value > 0.005 ? "+" : value < -0.005 ? "−" : "";
  return `${sign}₹${Math.abs(value).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

function formatQuantity(value: number): string {
  return value >= 1_000 ? value.toLocaleString("en-IN", {maximumFractionDigits: 0}) : Number(value.toPrecision(4)).toString();
}

function formatCount(count: number): string {
  return count >= 1_000 ? `${(count / 1_000).toFixed(1)}K` : String(count);
}

function duration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ${String(seconds % 60).padStart(2, "0")}s` : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}
