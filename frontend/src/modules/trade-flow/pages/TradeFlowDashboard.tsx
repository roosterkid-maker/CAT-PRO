import {
  useMemo,
  useState,
} from "react";

import type {
  ReactNode,
} from "react";

import {
  Activity,
  ArrowRight,
  BarChart3,
  Clock3,
  Coins,
  Database,
  Gauge,
  Network,
  RefreshCw,
  Route,
  ShieldCheck,
  Trophy,
  X,
} from "lucide-react";

import {
  useStrategyOneTradeIntelligence,
} from "../hooks/useTradeFlow";

import type {
  TradeIntelligenceExchangeRank,
  TradeIntelligenceHourBucket,
  TradeIntelligenceQuery,
  TradeIntelligenceRouteRank,
  TradeIntelligenceTradeDetail,
  TradeIntelligenceWindowId,
} from "../types/TradeFlow";

const IST_OFFSET_MS =
  5.5 * 60 * 60 * 1_000;

const WINDOW_OPTIONS: ReadonlyArray<{
  id: Exclude<TradeIntelligenceWindowId, "CUSTOM">;
  label: string;
}> = [
  {id: "TODAY", label: "Today"},
  {id: "24H", label: "24h"},
  {id: "48H", label: "48h"},
  {id: "7D", label: "7d"},
  {id: "14D", label: "14d"},
];

export default function TradeFlowDashboard() {
  const [query, setQuery] = useState<TradeIntelligenceQuery>({window: "48H"});
  const [customStart, setCustomStart] = useState(
    () => formatIstInput(Date.now() - 48 * 60 * 60 * 1_000),
  );
  const [customEnd, setCustomEnd] = useState(
    () => formatIstInput(Date.now()),
  );
  const [customError, setCustomError] = useState<string | null>(null);
  const [selectedTrade, setSelectedTrade] =
    useState<TradeIntelligenceTradeDetail | null>(null);

  const {
    data: response,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useStrategyOneTradeIntelligence(query);

  const report = response?.data;

  if (isLoading && !report) {
    return (
      <PageState
        title="Compiling Trade Intelligence"
        detail="Reading the revision-cached Strategy #1 PAPER evidence index..."
        spinning
      />
    );
  }

  if (isError || !report) {
    return (
      <PageState
        title="Trade Intelligence unavailable"
        detail="The read model failed closed. No rankings were inferred from missing evidence."
        onRetry={() => void refetch()}
      />
    );
  }

  const applyCustomRange = () => {
    const startAt = parseIstInput(customStart);
    const endAt = parseIstInput(customEnd);

    if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) {
      setCustomError("Valid IST start and end time required.");
      return;
    }

    if (startAt >= endAt) {
      setCustomError("Start time must be before end time.");
      return;
    }

    if (endAt - startAt > 31 * 24 * 60 * 60 * 1_000) {
      setCustomError("Custom range maximum 31 days hai.");
      return;
    }

    setCustomError(null);
    setQuery({window: "CUSTOM", startAt, endAt});
  };

  return (
    <section className="space-y-4 pb-8">
      <header className="relative overflow-hidden rounded-2xl border border-cyan-400/30 bg-[linear-gradient(145deg,rgba(7,19,34,0.98),rgba(11,13,31,0.98)_55%,rgba(24,9,35,0.96))] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-fuchsia-400" />
        <div className="pointer-events-none absolute -left-1/4 top-0 h-20 w-3/4 -skew-x-12 bg-gradient-to-r from-cyan-400/0 via-cyan-400/10 to-emerald-300/0 blur-2xl" />
        <div className="pointer-events-none absolute -right-1/4 bottom-0 h-20 w-3/4 skew-x-12 bg-gradient-to-r from-fuchsia-500/0 via-fuchsia-500/10 to-cyan-300/0 blur-2xl" />

        <div className="relative flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-cyan-300">
              <Network className="size-4" />
              <p className="text-[10px] font-black uppercase tracking-[0.24em]">
                V154 · Strategy #1 evidence command deck
              </p>
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">
              Trade Intelligence
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
              Credible, unique, closed Strategy #1 settlements—ranked by route,
              market, exchange and fixed IST hour. Analytics is read-only and
              never changes policy, balances or execution.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-[10px] font-black tracking-[0.14em] text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              PAPER EVIDENCE
            </span>
            <span className="border border-slate-600/70 bg-slate-900/70 px-3 py-2 text-[10px] font-black tracking-[0.14em] text-slate-500">
              LIVE · NO DATA
            </span>
            <button
              type="button"
              disabled={isFetching}
              onClick={() => void refetch()}
              className="inline-flex items-center gap-2 border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-bold text-cyan-200 transition hover:border-cyan-300/60 disabled:opacity-60"
            >
              <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="relative mt-5 grid gap-3 xl:grid-cols-[auto_1fr]">
          <div className="flex max-w-full gap-1 overflow-x-auto border border-border-default bg-black/20 p-1 [scrollbar-width:none]">
            {WINDOW_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={query.window === option.id}
                onClick={() => {
                  setCustomError(null);
                  setQuery({window: option.id});
                }}
                className={`min-w-14 px-3 py-2 text-xs font-black transition ${
                  query.window === option.id
                    ? "bg-gradient-to-r from-cyan-300 to-emerald-300 text-slate-950 shadow-[0_0_16px_rgba(34,211,238,0.24)]"
                    : "text-text-muted hover:bg-white/5 hover:text-white"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <IstDateInput label="Custom start · IST" value={customStart} onChange={setCustomStart} />
            <IstDateInput label="Custom end · IST" value={customEnd} onChange={setCustomEnd} />
            <button
              type="button"
              onClick={applyCustomRange}
              className={`border px-4 py-2 text-xs font-black transition ${
                query.window === "CUSTOM"
                  ? "border-fuchsia-400/60 bg-fuchsia-400/15 text-fuchsia-200"
                  : "border-border-default bg-panel-light text-text-primary hover:border-fuchsia-400/50"
              }`}
            >
              Apply custom
            </button>
          </div>
        </div>
        {customError ? (
          <p className="relative mt-2 text-xs font-semibold text-danger">{customError}</p>
        ) : null}
        <p className="relative mt-3 text-[10px] text-text-muted">
          {report.window.label}: {formatIstDateTime(report.window.startAt)} → {formatIstDateTime(report.window.endAt)} · auto-refresh 30s
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4 2xl:grid-cols-8">
        <MetricCard icon={<Activity />} label="Credible closes" value={formatCount(report.summary.settlements)} detail={`${report.summary.successfulSettlements} positive`} tone="cyan" />
        <MetricCard icon={<Coins />} label="Cycle turnover" value={formatInr(report.summary.capitalTurnoverInr)} detail="one capital value / cycle" tone="violet" />
        <MetricCard icon={<BarChart3 />} label="Realized P&L" value={formatSignedInr(report.summary.realizedPnlInr)} detail={`deployable ${formatInr(report.summary.deployableCashPnlInr)}`} tone={report.summary.realizedPnlInr >= 0 ? "green" : "red"} />
        <MetricCard icon={<Gauge />} label="Capital efficiency" value={formatPercent(report.summary.capitalEfficiencyPercent)} detail="P&L ÷ cycle turnover" tone="amber" />
        <MetricCard icon={<Trophy />} label="Success rate" value={formatPercent(report.summary.successRatePercent)} detail={`${report.summary.negativeSettlements} negative · ${report.summary.flatSettlements} flat`} tone="green" />
        <MetricCard icon={<Database />} label="Avg / median" value={formatInr(report.summary.averagePnlInr)} detail={`median ${formatInr(report.summary.medianPnlInr)}`} tone="cyan" />
        <MetricCard icon={<Route />} label="Markets / routes" value={`${report.summary.uniqueMarkets} / ${report.summary.uniqueRoutes}`} detail={`${report.summary.activeExchanges} active venues`} tone="violet" />
        <MetricCard icon={<ShieldCheck />} label="Excluded evidence" value={formatCount(totalExcluded(report))} detail={`${report.evidence.exclusions.distortedSettlements} distorted`} tone="amber" />
      </section>

      {report.presentation.noData ? (
        <NoDataPanel />
      ) : (
        <>
          <section className="grid gap-4 2xl:grid-cols-[1.2fr_0.8fr]">
            <CyberPanel>
              <SectionTitle eyebrow="Execution lattice" title="24-hour IST heatmap" detail="Each bucket combines all dates in the selected window. Zero means observed window but no credible close; NO DATA means the entire selected window has no evidence." icon={<Clock3 />} />
              <HourlyHeatmap rows={report.hourlyIst} />
            </CyberPanel>

            <CyberPanel accent="violet">
              <SectionTitle eyebrow="Venue flow" title="BUY / SELL exchange ranking" detail={report.presentation.exchangePnlWarning} icon={<Network />} />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <ExchangeRanking title="BUY venues" rows={report.buyExchanges} tone="buy" />
                <ExchangeRanking title="SELL venues" rows={report.sellExchanges} tone="sell" />
              </div>
            </CyberPanel>
          </section>

          <section className="grid gap-4 2xl:grid-cols-2">
            <CyberPanel>
              <SectionTitle eyebrow="Route leaderboard" title="Top 10 exact BUY → SELL routes" detail="Reverse direction remains a separate route. Ranking uses credible completed cycles." icon={<Route />} />
              <RouteTable rows={report.routes} />
            </CyberPanel>

            <CyberPanel accent="violet">
              <SectionTitle eyebrow="Market leaderboard" title="Top 10 markets" detail="Directions are combined per market while the leading venue flow stays visible." icon={<Trophy />} />
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {report.markets.map((market) => (
                  <article key={market.market} className="border border-border-default bg-black/20 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black text-fuchsia-300">#{market.rank}</p>
                        <p className="mt-1 font-black text-white">{market.market}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-black text-cyan-200">{market.settlements}</p>
                        <p className="text-[9px] text-text-muted">closes</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-1 text-[10px]">
                      <span className="font-bold text-emerald-300">{formatExchange(market.leadingBuyExchange)}</span>
                      <ArrowRight className="size-3 text-text-muted" />
                      <span className="font-bold text-fuchsia-300">{formatExchange(market.leadingSellExchange)}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border-default pt-2 text-[9px] text-text-muted">
                      <span>{formatSignedInr(market.realizedPnlInr)}</span>
                      <span>{formatPercent(market.successRatePercent)}</span>
                      <span>{formatHour(market.bestIstHour)}</span>
                    </div>
                  </article>
                ))}
              </div>
            </CyberPanel>
          </section>

          <CyberPanel accent="green">
            <SectionTitle eyebrow="Individual evidence" title="Top 10 successful settlements" detail="Click any row for exact price, quantity, fees, TDS, deployable cash and lifecycle timing. At most 10 compact details are sent." icon={<ShieldCheck />} />
            <TradeTable rows={report.topSuccessfulTrades} onSelect={setSelectedTrade} />
          </CyberPanel>
        </>
      )}

      <footer className="border border-border-default bg-panel/70 px-4 py-4 text-[10px] leading-5 text-text-muted">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          <EvidenceStat label="Stored PAPER" value={report.evidence.storedPaperTrades} />
          <EvidenceStat label="Credible Strategy #1" value={report.evidence.credibleStrategyOneSettlements} />
          <EvidenceStat label="Duplicate IDs" value={report.evidence.exclusions.duplicateIdsIgnored} />
          <EvidenceStat label="Distorted" value={report.evidence.exclusions.distortedSettlements} />
          <EvidenceStat label="Open / failed" value={report.evidence.exclusions.openOrFailed} />
          <EvidenceStat label="Unattributed / other" value={report.evidence.exclusions.unattributedOrOtherStrategy} />
        </div>
        <div className="mt-3 flex flex-col justify-between gap-1 border-t border-border-default pt-3 sm:flex-row">
          <p>{report.evidence.syntheticDemoNote}</p>
          <p className="shrink-0">IST · revision {report.sourceRevision} · {formatIstDateTime(report.generatedAt)}</p>
        </div>
        <p className="mt-1 text-amber-300/90">{report.presentation.turnoverDefinition}</p>
      </footer>

      {selectedTrade ? (
        <TradeDetailDrawer trade={selectedTrade} onClose={() => setSelectedTrade(null)} />
      ) : null}
    </section>
  );
}

function IstDateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="border border-border-default bg-black/20 px-3 py-1.5">
      <span className="block text-[8px] font-black uppercase tracking-[0.14em] text-text-muted">{label}</span>
      <input
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-0.5 w-full bg-transparent text-[11px] font-semibold text-text-primary outline-none [color-scheme:dark]"
      />
    </label>
  );
}

function CyberPanel({
  children,
  accent = "cyan",
}: {
  children: ReactNode;
  accent?: "cyan" | "violet" | "green";
}) {
  const accentClass = {
    cyan: "before:from-cyan-300 before:via-cyan-300/20",
    violet: "before:from-fuchsia-400 before:via-violet-400/20",
    green: "before:from-emerald-300 before:via-emerald-300/20",
  }[accent];

  return (
    <div className={`relative overflow-hidden border border-border-default bg-[linear-gradient(145deg,rgba(8,20,34,0.96),rgba(9,14,28,0.98))] p-4 shadow-[0_14px_34px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.04)] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:to-transparent sm:p-5 ${accentClass}`}>
      <div className="relative">{children}</div>
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  detail,
  icon,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-cyan-300 [&>svg]:size-4">
        {icon}
        <p className="text-[9px] font-black uppercase tracking-[0.2em]">{eyebrow}</p>
      </div>
      <h2 className="mt-1.5 text-lg font-black text-white">{title}</h2>
      <p className="mt-1 max-w-4xl text-[11px] leading-5 text-text-muted">{detail}</p>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: "cyan" | "violet" | "green" | "amber" | "red";
}) {
  const tones = {
    cyan: "border-cyan-400/25 text-cyan-300",
    violet: "border-fuchsia-400/25 text-fuchsia-300",
    green: "border-emerald-400/25 text-emerald-300",
    amber: "border-amber-400/25 text-amber-300",
    red: "border-rose-400/25 text-rose-300",
  }[tone];

  return (
    <article className={`border bg-[linear-gradient(145deg,rgba(10,25,40,0.96),rgba(7,14,27,0.98))] p-3 shadow-[0_10px_22px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-4 ${tones}`}>
      <div className="flex items-center justify-between gap-2 [&>svg]:size-4">
        <p className="text-[8px] font-black uppercase tracking-[0.16em] text-text-muted">{label}</p>
        {icon}
      </div>
      <p className="mt-3 truncate text-lg font-black text-white">{value}</p>
      <p className="mt-1 truncate text-[9px] text-text-muted">{detail}</p>
    </article>
  );
}

function HourlyHeatmap({rows}: {rows: readonly TradeIntelligenceHourBucket[]}) {
  const maxTrades = useMemo(
    () => Math.max(1, ...rows.map((row) => row.settlements)),
    [rows],
  );

  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-6">
      {rows.map((row) => {
        const strength = row.state === "DATA" ? 0.08 + row.settlements / maxTrades * 0.24 : 0;
        return (
          <article
            key={row.hour}
            className={`min-w-0 border p-2.5 ${row.state === "DATA" ? "border-cyan-300/30" : "border-border-default/70 bg-black/15"}`}
            style={row.state === "DATA" ? {background: `linear-gradient(145deg, rgba(34,211,238,${strength}), rgba(16,185,129,${strength / 2}))`} : undefined}
          >
            <p className="truncate text-[8px] font-black text-text-muted">{row.label}</p>
            <div className="mt-2 flex items-end justify-between gap-2">
              <p className={`text-lg font-black ${row.state === "NO_DATA" ? "text-slate-600" : row.settlements > 0 ? "text-white" : "text-text-muted"}`}>
                {row.state === "NO_DATA" ? "—" : row.settlements}
              </p>
              <p className={`truncate text-[9px] font-bold ${pnlTone(row.realizedPnlInr)}`}>
                {row.state === "NO_DATA" ? "NO DATA" : formatSignedInr(row.realizedPnlInr)}
              </p>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ExchangeRanking({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: readonly TradeIntelligenceExchangeRank[];
  tone: "buy" | "sell";
}) {
  return (
    <div>
      <p className={`text-[10px] font-black uppercase tracking-[0.14em] ${tone === "buy" ? "text-emerald-300" : "text-fuchsia-300"}`}>{title}</p>
      <div className="mt-2 space-y-2">
        {rows.map((row) => (
          <article key={`${row.side}-${row.exchange}`} className="border border-border-default bg-black/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-black text-white">#{row.rank} {formatExchange(row.exchange)}</p>
                <p className="mt-1 text-[9px] text-text-muted">{row.uniqueMarkets} markets · {formatInr(row.capitalTurnoverInr)}</p>
              </div>
              <div className="text-right">
                <p className="text-base font-black text-cyan-200">{row.settlements}</p>
                <p className="text-[8px] text-text-muted">{formatPercent(row.settlementSharePercent)}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function RouteTable({rows}: {rows: readonly TradeIntelligenceRouteRank[]}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[780px] text-left text-[10px]">
        <thead className="border-b border-border-default uppercase tracking-[0.12em] text-text-muted">
          <tr>
            <th className="px-2 py-3">Rank / Market</th>
            <th className="px-2 py-3">Direction</th>
            <th className="px-2 py-3 text-right">Trades</th>
            <th className="px-2 py-3 text-right">Success</th>
            <th className="px-2 py-3 text-right">Turnover</th>
            <th className="px-2 py-3 text-right">Net P&L</th>
            <th className="px-2 py-3 text-right">Best IST</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-default/70">
          {rows.map((row) => (
            <tr key={row.routeKey} className="transition hover:bg-white/[0.03]">
              <td className="px-2 py-3 font-black text-white">#{row.rank} · {row.market}</td>
              <td className="px-2 py-3">
                <span className="font-bold text-emerald-300">{formatExchange(row.buyExchange)}</span>
                <ArrowRight className="mx-1 inline size-3 text-cyan-300" />
                <span className="font-bold text-fuchsia-300">{formatExchange(row.sellExchange)}</span>
              </td>
              <td className="px-2 py-3 text-right font-black text-white">{row.settlements}</td>
              <td className="px-2 py-3 text-right text-text-muted">{formatPercent(row.successRatePercent)}</td>
              <td className="px-2 py-3 text-right text-text-muted">{formatInr(row.capitalTurnoverInr)}</td>
              <td className={`px-2 py-3 text-right font-black ${pnlTone(row.realizedPnlInr)}`}>{formatSignedInr(row.realizedPnlInr)}</td>
              <td className="px-2 py-3 text-right text-text-muted">{formatHour(row.bestIstHour)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TradeTable({
  rows,
  onSelect,
}: {
  rows: readonly TradeIntelligenceTradeDetail[];
  onSelect: (trade: TradeIntelligenceTradeDetail) => void;
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-[10px]">
        <thead className="border-b border-border-default uppercase tracking-[0.12em] text-text-muted">
          <tr>
            <th className="px-2 py-3">Rank / Time</th>
            <th className="px-2 py-3">Market / route</th>
            <th className="px-2 py-3 text-right">Capital</th>
            <th className="px-2 py-3 text-right">Fees</th>
            <th className="px-2 py-3 text-right">TDS held</th>
            <th className="px-2 py-3 text-right">Net P&L</th>
            <th className="px-2 py-3 text-right">Evidence</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-default/70">
          {rows.map((trade) => (
            <tr
              key={trade.id}
              tabIndex={0}
              role="button"
              onClick={() => onSelect(trade)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onSelect(trade);
              }}
              className="cursor-pointer transition hover:bg-emerald-300/[0.04] focus:bg-emerald-300/[0.05] focus:outline-none"
            >
              <td className="px-2 py-3"><span className="font-black text-emerald-300">#{trade.rank}</span><span className="ml-2 text-text-muted">{formatIstDateTime(trade.settledAt)}</span></td>
              <td className="px-2 py-3"><p className="font-black text-white">{trade.market}</p><p className="mt-1 text-[9px] text-text-muted">{formatExchange(trade.buyExchange)} → {formatExchange(trade.sellExchange)}</p></td>
              <td className="px-2 py-3 text-right text-white">{formatInr(trade.capitalInr)}</td>
              <td className="px-2 py-3 text-right text-text-muted">{formatInr(trade.feesInr)}</td>
              <td className="px-2 py-3 text-right text-amber-300">{formatInr(trade.tdsWithheldInr)}</td>
              <td className="px-2 py-3 text-right font-black text-emerald-300">{formatSignedInr(trade.realizedPnlInr)}</td>
              <td className="px-2 py-3 text-right"><span className="border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-[8px] font-black text-emerald-300">CREDIBLE PAPER</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TradeDetailDrawer({
  trade,
  onClose,
}: {
  trade: TradeIntelligenceTradeDetail;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] bg-black/65 backdrop-blur-sm" role="presentation" onMouseDown={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${trade.market} settlement details`}
        onMouseDown={(event) => event.stopPropagation()}
        className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto border-l border-cyan-300/30 bg-[linear-gradient(160deg,#071526,#100b20)] p-5 shadow-[-20px_0_60px_rgba(0,0,0,0.55)] sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300">Credible Strategy #1 PAPER</p>
            <h2 className="mt-2 text-2xl font-black text-white">{trade.market}</h2>
            <p className="mt-1 text-xs text-text-muted">{formatIstDateTime(trade.settledAt)} IST</p>
          </div>
          <button type="button" onClick={onClose} className="border border-border-default p-2 text-text-muted hover:text-white" aria-label="Close trade details"><X className="size-4" /></button>
        </div>

        <div className="mt-6 border border-border-default bg-black/20 p-4">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-text-muted">Exact route</p>
          <div className="mt-3 flex items-center gap-2 text-sm font-black">
            <span className="text-emerald-300">BUY {formatExchange(trade.buyExchange)}</span>
            <ArrowRight className="size-4 text-cyan-300" />
            <span className="text-fuchsia-300">SELL {formatExchange(trade.sellExchange)}</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <DetailStat label="Capital" value={formatInr(trade.capitalInr)} />
          <DetailStat label="Quantity" value={formatQuantity(trade.quantity)} />
          <DetailStat label="BUY price" value={formatQuantity(trade.buyPrice)} />
          <DetailStat label="SELL price" value={formatQuantity(trade.sellPrice)} />
          <DetailStat label="Fees" value={formatInr(trade.feesInr)} />
          <DetailStat label="TDS held" value={formatInr(trade.tdsWithheldInr)} />
          <DetailStat label="Economic P&L" value={formatSignedInr(trade.realizedPnlInr)} good />
          <DetailStat label="Deployable cash" value={formatSignedInr(trade.deployableCashPnlInr)} good />
          <DetailStat label="Return" value={formatPercent(trade.returnPercent)} />
          <DetailStat label="Lifecycle" value={`${formatCount(trade.executionDurationMs)} ms`} />
        </div>
        <p className="mt-5 break-all border-t border-border-default pt-4 text-[9px] text-text-muted">Evidence ID: {trade.id}</p>
      </aside>
    </div>
  );
}

function DetailStat({label, value, good = false}: {label: string; value: string; good?: boolean}) {
  return <div className="border border-border-default bg-black/20 p-3"><p className="text-[8px] font-black uppercase tracking-[0.12em] text-text-muted">{label}</p><p className={`mt-2 truncate text-sm font-black ${good ? "text-emerald-300" : "text-white"}`}>{value}</p></div>;
}

function EvidenceStat({label, value}: {label: string; value: number}) {
  return <p><span className="font-black text-text-primary">{formatCount(value)}</span> {label}</p>;
}

function NoDataPanel() {
  return (
    <div className="border border-dashed border-amber-300/30 bg-amber-300/[0.04] px-5 py-12 text-center">
      <Database className="mx-auto size-8 text-amber-300" />
      <h2 className="mt-4 text-lg font-black text-white">NO DATA in selected window</h2>
      <p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-text-muted">Zero was not fabricated. Select a wider IST window; only credible, unique, closed Strategy #1 PAPER settlements qualify.</p>
    </div>
  );
}

function PageState({
  title,
  detail,
  spinning = false,
  onRetry,
}: {
  title: string;
  detail: string;
  spinning?: boolean;
  onRetry?: () => void;
}) {
  return (
    <section className="flex min-h-[420px] items-center justify-center border border-border-default bg-panel p-6 text-center">
      <div>
        <RefreshCw className={`mx-auto size-8 text-cyan-300 ${spinning ? "animate-spin" : ""}`} />
        <h1 className="mt-4 text-xl font-black text-white">{title}</h1>
        <p className="mt-2 max-w-md text-sm text-text-muted">{detail}</p>
        {onRetry ? <button type="button" onClick={onRetry} className="mt-5 border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-200">Retry report</button> : null}
      </div>
    </section>
  );
}

function totalExcluded(report: {evidence: {exclusions: Record<string, number>}}): number {
  return Object.values(report.evidence.exclusions).reduce((total, value) => total + value, 0);
}

function parseIstInput(value: string): number {
  return new Date(`${value}:00+05:30`).getTime();
}

function formatIstInput(timestamp: number): string {
  return new Date(timestamp + IST_OFFSET_MS).toISOString().slice(0, 16);
}

function formatInr(value: number): string {
  return new Intl.NumberFormat("en-IN", {style: "currency", currency: "INR", maximumFractionDigits: 0}).format(value);
}

function formatSignedInr(value: number): string {
  const formatted = formatInr(Math.abs(value));
  return value > 0 ? `+${formatted}` : value < 0 ? `−${formatted}` : formatted;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-IN", {maximumFractionDigits: 0}).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(2).replace(/\.00$/, "")}%`;
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("en-IN", {maximumFractionDigits: 10}).format(value);
}

function formatExchange(exchange: string): string {
  const names: Record<string, string> = {binance: "Binance", bybit: "Bybit", coindcx: "CoinDCX", coinswitch: "CoinSwitch", unocoin: "UnoCoin"};
  return names[exchange.toLowerCase()] ?? exchange;
}

function formatIstDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en-IN", {timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false}).format(timestamp);
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function pnlTone(value: number): string {
  return value > 0 ? "text-emerald-300" : value < 0 ? "text-rose-300" : "text-text-muted";
}
