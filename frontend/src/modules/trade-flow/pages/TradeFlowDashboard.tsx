import {
  useState,
} from "react";

import type {
  ReactNode,
} from "react";

import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Coins,
  Network,
  RefreshCw,
  Route,
  Trophy,
} from "lucide-react";

import {
  useStrategyOneTradeFlow,
} from "../hooks/useTradeFlow";

import type {
  TradeFlowExchangeRank,
  TradeFlowInventoryRank,
  TradeFlowWindowId,
} from "../types/TradeFlow";

const WINDOWS:
  ReadonlyArray<{
    id: TradeFlowWindowId;
    label: string;
  }> = [
  {
    id:
      "TODAY",
    label:
      "Today",
  },
  {
    id:
      "7D",
    label:
      "7 Days",
  },
  {
    id:
      "14D",
    label:
      "14 Days",
  },
  {
    id:
      "LIFETIME",
    label:
      "Lifetime",
  },
];

export default function TradeFlowDashboard() {
  const [
    selectedWindow,
    setSelectedWindow,
  ] =
    useState<TradeFlowWindowId>(
      "TODAY",
    );

  const {
    data:
      response,
    isLoading,
    isFetching,
    isError,
    refetch,
  } =
    useStrategyOneTradeFlow();

  const report =
    response?.data;
  const flow =
    report?.windows[
      selectedWindow
    ];

  if (
    isLoading &&
    !flow
  ) {
    return (
      <PageState
        title="Building trade-flow matrix"
        detail="Reading credible Strategy #1 PAPER settlements..."
        spinning
      />
    );
  }

  if (
    isError ||
    !report ||
    !flow
  ) {
    return (
      <PageState
        title="Trade-flow evidence unavailable"
        detail="The report failed closed. No ranking has been inferred from missing data."
        onRetry={() =>
          void refetch()
        }
      />
    );
  }

  const topBuy =
    flow.buyExchanges[0] ??
    null;
  const topSell =
    flow.sellExchanges[0] ??
    null;
  const topMarket =
    flow.markets[0] ??
    null;

  return (
    <section className="space-y-5 pb-8">
      <header className="relative overflow-hidden rounded-2xl border border-brand/25 bg-panel p-5 shadow-[0_0_40px_rgba(13,211,196,0.06)] sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-brand/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 size-56 rounded-full bg-sky-500/10 blur-3xl" />

        <div className="relative flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-brand">
              <Network className="size-4" />
              <p className="text-xs font-bold uppercase tracking-[0.22em]">
                Strategy #1 · Flow Intelligence
              </p>
            </div>

            <h1 className="mt-3 text-2xl font-black tracking-tight text-text-primary sm:text-3xl">
              Exchange Coin Flow
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
              Credible closed PAPER executions ranked by pair, BUY venue,
              SELL venue and base-coin inventory movement. This report is
              observational and never moves funds.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-brand/30 bg-brand/10 px-3 py-1.5 text-[11px] font-bold tracking-[0.14em] text-brand">
              PAPER · READ ONLY
            </span>

            <button
              type="button"
              disabled={
                isFetching
              }
              onClick={() =>
                void refetch()
              }
              className="inline-flex items-center gap-2 rounded-lg border border-border-default bg-panel-light px-3 py-2 text-xs font-semibold text-text-primary transition hover:border-brand/50 disabled:opacity-60"
            >
              <RefreshCw
                className={`size-4 ${
                  isFetching
                    ? "animate-spin"
                    : ""
                }`}
              />
              Refresh
            </button>
          </div>
        </div>

        <div className="relative mt-5 flex max-w-full gap-1 overflow-x-auto rounded-xl border border-border-default bg-app-bg/60 p-1 [scrollbar-width:none]">
          {WINDOWS.map(
            (
              window,
            ) => (
              <button
                key={
                  window.id
                }
                type="button"
                aria-pressed={
                  selectedWindow ===
                  window.id
                }
                onClick={() =>
                  setSelectedWindow(
                    window.id,
                  )
                }
                className={`min-w-max flex-1 rounded-lg px-4 py-2 text-xs font-bold transition ${
                  selectedWindow ===
                  window.id
                    ? "bg-brand text-slate-950 shadow-[0_0_18px_rgba(13,211,196,0.24)]"
                    : "text-text-muted hover:bg-panel-light hover:text-text-primary"
                }`}
              >
                {
                  window.label
                }
              </button>
            ),
          )}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <MetricCard
          label="Settled trades"
          value={
            formatCount(
              flow.summary
                .settlements,
            )
          }
          detail={`${flow.summary.uniqueMarkets} pairs · ${flow.summary.uniqueRoutes} routes`}
          icon={
            <Activity className="size-4" />
          }
          tone="brand"
        />
        <MetricCard
          label="Top pair"
          value={
            topMarket?.market ??
            "NO DATA"
          }
          detail={
            topMarket
              ? `${topMarket.settlements} trades · ${formatPercent(topMarket.settlementSharePercent)} share`
              : "No credible settlement"
          }
          icon={
            <Trophy className="size-4" />
          }
          tone="warning"
        />
        <MetricCard
          label="Cycle turnover"
          value={
            formatInr(
              flow.summary
                .capitalTurnoverInr,
            )
          }
          detail="One capital value per cycle"
          icon={
            <Coins className="size-4" />
          }
          tone="sky"
        />
        <MetricCard
          label="Realized P&L"
          value={
            formatInr(
              flow.summary
                .realizedPnlInr,
            )
          }
          detail={`Deployable ${formatInr(flow.summary.deployableCashPnlInr)}`}
          icon={
            <BarChart3 className="size-4" />
          }
          tone={
            flow.summary
              .realizedPnlInr >=
            0
              ? "success"
              : "danger"
          }
        />
        <MetricCard
          label="Win rate"
          value={
            formatPercent(
              flow.summary
                .winRatePercent,
            )
          }
          detail={`${flow.summary.profitableSettlements} positive · ${flow.summary.negativeSettlements} negative`}
          icon={
            <BarChart3 className="size-4" />
          }
          tone="success"
          wideOnMobile
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-border-default bg-panel p-4 sm:p-5">
          <SectionTitle
            icon={
              <Network className="size-4" />
            }
            eyebrow="Venue matrix"
            title="Where the bot buys and sells"
            detail="Ranked by completed credible cycles; ties use deployed cycle capital."
          />

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <ExchangeRanking
              title="BUY exchanges"
              side="BUY"
              rows={
                flow.buyExchanges
              }
            />
            <ExchangeRanking
              title="SELL exchanges"
              side="SELL"
              rows={
                flow.sellExchanges
              }
            />
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-brand/20 bg-panel p-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(13,211,196,0.08),transparent_60%)]" />
          <SectionTitle
            icon={
              <Route className="size-4" />
            }
            eyebrow="Leader route"
            title="Dominant exchange flow"
            detail="The most frequent BUY and SELL venues in the selected window."
          />

          <div className="relative mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <FlowNode
              label="Top BUY"
              exchange={
                topBuy?.exchange ??
                "NO DATA"
              }
              trades={
                topBuy?.settlements ??
                0
              }
              side="BUY"
            />

            <div className="relative flex size-14 items-center justify-center rounded-full border border-brand/40 bg-brand/10 text-brand shadow-[0_0_28px_rgba(13,211,196,0.18)]">
              <ArrowRight className="size-5" />
              <span className="absolute inset-[-7px] animate-[spin_10s_linear_infinite] rounded-full border border-dashed border-brand/25" />
            </div>

            <FlowNode
              label="Top SELL"
              exchange={
                topSell?.exchange ??
                "NO DATA"
              }
              trades={
                topSell?.settlements ??
                0
              }
              side="SELL"
            />
          </div>

          <div className="relative mt-7 grid grid-cols-3 gap-2 border-t border-border-default pt-4 text-center">
            <MiniMetric
              label="Exchanges"
              value={
                String(
                  flow.summary
                    .activeExchanges,
                )
              }
            />
            <MiniMetric
              label="Fees"
              value={
                formatInr(
                  flow.summary
                    .feesInr,
                )
              }
            />
            <MiniMetric
              label="TDS held"
              value={
                formatInr(
                  flow.summary
                    .tdsWithheldInr,
                )
              }
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border-default bg-panel p-4 sm:p-5">
        <SectionTitle
          icon={
            <Coins className="size-4" />
          }
          eyebrow="Inventory radar"
          title="Exchange coin flow"
          detail="BUY increases base coin at that exchange; SELL reduces it. Coin units are never mixed across assets."
        />

        <InventoryFlowTable
          rows={
            flow.inventoryFlows
          }
        />
      </section>

      <section className="grid gap-4 2xl:grid-cols-2">
        <div className="rounded-2xl border border-border-default bg-panel p-4 sm:p-5">
          <SectionTitle
            icon={
              <Trophy className="size-4" />
            }
            eyebrow="Pair leaderboard"
            title="Most traded markets"
            detail="Every credible settled pair, ordered by execution count."
          />

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="border-b border-border-default text-[10px] uppercase tracking-[0.14em] text-text-muted">
                <tr>
                  <th className="px-3 py-3">Rank / Pair</th>
                  <th className="px-3 py-3">Trades</th>
                  <th className="px-3 py-3">Flow leader</th>
                  <th className="px-3 py-3 text-right">Turnover</th>
                  <th className="px-3 py-3 text-right">Net P&L</th>
                  <th className="px-3 py-3 text-right">Win rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default/70">
                {flow.markets.map(
                  (
                    market,
                  ) => (
                    <tr
                      key={
                        market.market
                      }
                      className="transition hover:bg-panel-light/60"
                    >
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-3">
                          <RankBadge
                            rank={
                              market.rank
                            }
                          />
                          <div>
                            <p className="font-bold text-text-primary">
                              {
                                market.market
                              }
                            </p>
                            <p className="mt-0.5 text-[10px] text-text-muted">
                              {market.baseAsset}/{market.quoteAsset}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        <p className="font-bold text-text-primary">
                          {
                            market.settlements
                          }
                        </p>
                        <p className="text-[10px] text-text-muted">
                          {formatPercent(market.settlementSharePercent)} share
                        </p>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <span className="text-success">
                            {formatExchange(market.leadingBuyExchange)}
                          </span>
                          <ArrowRight className="size-3 text-text-muted" />
                          <span className="text-sky-400">
                            {formatExchange(market.leadingSellExchange)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-right font-semibold text-text-primary">
                        {formatInr(market.capitalTurnoverInr)}
                      </td>
                      <td className={`px-3 py-3.5 text-right font-bold ${pnlTone(market.realizedPnlInr)}`}>
                        {formatSignedInr(market.realizedPnlInr)}
                      </td>
                      <td className="px-3 py-3.5 text-right font-semibold text-text-primary">
                        {formatPercent(market.winRatePercent)}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>

            {flow.markets.length ===
            0 ? (
              <EmptyRows />
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-border-default bg-panel p-4 sm:p-5">
          <SectionTitle
            icon={
              <Route className="size-4" />
            }
            eyebrow="Route leaderboard"
            title="Exact BUY → SELL routes"
            detail="Direction is preserved; reverse routes are ranked separately."
          />

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="border-b border-border-default text-[10px] uppercase tracking-[0.14em] text-text-muted">
                <tr>
                  <th className="px-3 py-3">Rank / Market</th>
                  <th className="px-3 py-3">Route</th>
                  <th className="px-3 py-3 text-right">Trades</th>
                  <th className="px-3 py-3 text-right">Share</th>
                  <th className="px-3 py-3 text-right">Net P&L</th>
                  <th className="px-3 py-3 text-right">Last settled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default/70">
                {flow.routes.map(
                  (
                    route,
                  ) => (
                    <tr
                      key={
                        route.routeKey
                      }
                      className="transition hover:bg-panel-light/60"
                    >
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-3">
                          <RankBadge
                            rank={
                              route.rank
                            }
                          />
                          <span className="font-bold text-text-primary">
                            {route.market}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <span className="rounded bg-success/10 px-2 py-1 font-semibold text-success">
                            {formatExchange(route.buyExchange)}
                          </span>
                          <ArrowRight className="size-3 text-brand" />
                          <span className="rounded bg-sky-500/10 px-2 py-1 font-semibold text-sky-400">
                            {formatExchange(route.sellExchange)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-right font-bold text-text-primary">
                        {route.settlements}
                      </td>
                      <td className="px-3 py-3.5 text-right text-text-muted">
                        {formatPercent(route.settlementSharePercent)}
                      </td>
                      <td className={`px-3 py-3.5 text-right font-bold ${pnlTone(route.realizedPnlInr)}`}>
                        {formatSignedInr(route.realizedPnlInr)}
                      </td>
                      <td className="px-3 py-3.5 text-right text-text-muted">
                        {formatIstTime(route.lastSettledAt)}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>

            {flow.routes.length ===
            0 ? (
              <EmptyRows />
            ) : null}
          </div>
        </div>
      </section>

      <footer className="rounded-xl border border-border-default bg-panel/70 px-4 py-3 text-[11px] leading-5 text-text-muted">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <p>
            Evidence: {report.evidence.credibleSettlements} credible / {report.evidence.uniqueStrategyOneSettlements} unique Strategy #1 settlements · {report.evidence.excludedDistortedSettlements} distorted excluded.
          </p>
          <p className="shrink-0">
            IST · revision {report.sourceRevision} · built {formatIstDateTime(report.generatedAt)}
          </p>
        </div>
        <p className="mt-1 text-[10px] text-warning/90">
          {report.interpretation.exchangePnlWarning}
        </p>
      </footer>
    </section>
  );
}

function ExchangeRanking({
  title,
  side,
  rows,
}: {
  title: string;
  side: "BUY" | "SELL";
  rows: readonly TradeFlowExchangeRank[];
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-text-primary">
          {title}
        </p>
        <span className={side === "BUY" ? "text-success" : "text-sky-400"}>
          {side === "BUY" ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
        </span>
      </div>

      <div className="space-y-2.5">
        {rows.map(
          (
            row,
          ) => (
            <div
              key={`${side}-${row.exchange}`}
              className="rounded-xl border border-border-default bg-app-bg/50 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <RankBadge
                    rank={
                      row.rank
                    }
                  />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-text-primary">
                      {formatExchange(row.exchange)}
                    </p>
                    <p className="text-[10px] text-text-muted">
                      {row.uniqueMarkets} pairs · {formatInr(row.capitalTurnoverInr)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-text-primary">
                    {row.settlements}
                  </p>
                  <p className="text-[10px] text-text-muted">
                    {formatPercent(row.settlementSharePercent)}
                  </p>
                </div>
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-panel-light">
                <div
                  className={`h-full rounded-full ${
                    side ===
                    "BUY"
                      ? "bg-success shadow-[0_0_8px_rgba(34,197,94,0.55)]"
                      : "bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.55)]"
                  }`}
                  style={{
                    width:
                      `${Math.max(2, Math.min(100, row.settlementSharePercent))}%`,
                  }}
                />
              </div>
            </div>
          ),
        )}

        {rows.length ===
        0 ? (
          <p className="rounded-xl border border-dashed border-border-default p-5 text-center text-xs text-text-muted">
            No credible settled flow yet.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function InventoryFlowTable({
  rows,
}: {
  rows: readonly TradeFlowInventoryRank[];
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-xs">
        <thead className="border-b border-border-default text-[10px] uppercase tracking-[0.14em] text-text-muted">
          <tr>
            <th className="px-3 py-3">Rank / Venue</th>
            <th className="px-3 py-3">Asset</th>
            <th className="px-3 py-3 text-right">BUY flow</th>
            <th className="px-3 py-3 text-right">SELL flow</th>
            <th className="px-3 py-3 text-right">Net inventory</th>
            <th className="px-3 py-3 text-right">Direction</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-default/70">
          {rows.map(
            (
              row,
            ) => (
              <tr
                key={`${row.exchange}-${row.asset}`}
                className="transition hover:bg-panel-light/60"
              >
                <td className="px-3 py-3.5">
                  <div className="flex items-center gap-3">
                    <RankBadge
                      rank={
                        row.rank
                      }
                    />
                    <span className="font-bold text-text-primary">
                      {formatExchange(row.exchange)}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3.5">
                  <span className="rounded-md border border-brand/25 bg-brand/10 px-2 py-1 font-black text-brand">
                    {row.asset}
                  </span>
                </td>
                <td className="px-3 py-3.5 text-right">
                  <p className="font-bold text-success">
                    +{formatQuantity(row.boughtQuantity)}
                  </p>
                  <p className="text-[10px] text-text-muted">
                    {row.buySettlements} trades
                  </p>
                </td>
                <td className="px-3 py-3.5 text-right">
                  <p className="font-bold text-sky-400">
                    −{formatQuantity(row.soldQuantity)}
                  </p>
                  <p className="text-[10px] text-text-muted">
                    {row.sellSettlements} trades
                  </p>
                </td>
                <td className={`px-3 py-3.5 text-right font-black ${inventoryTone(row.netQuantity)}`}>
                  {formatSignedQuantity(row.netQuantity)} {row.asset}
                </td>
                <td className="px-3 py-3.5 text-right">
                  <FlowBadge
                    direction={
                      row.direction
                    }
                  />
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>

      {rows.length ===
      0 ? (
        <EmptyRows />
      ) : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  tone,
  wideOnMobile =
    false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone:
    | "brand"
    | "success"
    | "danger"
    | "warning"
    | "sky";
  wideOnMobile?: boolean;
}) {
  const tones = {
    brand:
      "border-brand/25 text-brand",
    success:
      "border-success/25 text-success",
    danger:
      "border-danger/25 text-danger",
    warning:
      "border-warning/25 text-warning",
    sky:
      "border-sky-400/25 text-sky-400",
  } as const;

  return (
    <article className={`rounded-xl border bg-panel p-4 ${tones[tone]} ${wideOnMobile ? "col-span-2 xl:col-span-1" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted">
          {label}
        </p>
        {icon}
      </div>
      <p className="mt-3 truncate text-xl font-black text-text-primary">
        {value}
      </p>
      <p className="mt-1 truncate text-[10px] text-text-muted">
        {detail}
      </p>
    </article>
  );
}

function SectionTitle({
  icon,
  eyebrow,
  title,
  detail,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  detail: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-brand">
        {icon}
        <p className="text-[10px] font-bold uppercase tracking-[0.18em]">
          {eyebrow}
        </p>
      </div>
      <h2 className="mt-1.5 text-lg font-black text-text-primary">
        {title}
      </h2>
      <p className="mt-1 text-xs leading-5 text-text-muted">
        {detail}
      </p>
    </div>
  );
}

function FlowNode({
  label,
  exchange,
  trades,
  side,
}: {
  label: string;
  exchange: string;
  trades: number;
  side: "BUY" | "SELL";
}) {
  return (
    <div className="min-w-0 text-center">
      <div className={`mx-auto flex size-20 items-center justify-center rounded-full border bg-app-bg/80 shadow-inner sm:size-24 ${side === "BUY" ? "border-success/35" : "border-sky-400/35"}`}>
        <div>
          <p className={`text-[9px] font-bold tracking-[0.14em] ${side === "BUY" ? "text-success" : "text-sky-400"}`}>
            {label}
          </p>
          <p className="mt-1 max-w-16 truncate text-xs font-black text-text-primary sm:max-w-20">
            {formatExchange(exchange)}
          </p>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-text-muted">
        {trades} settled trades
      </p>
    </div>
  );
}

function RankBadge({
  rank,
}: {
  rank: number;
}) {
  return (
    <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg border text-[10px] font-black ${rank === 1 ? "border-warning/40 bg-warning/10 text-warning" : rank === 2 ? "border-slate-400/30 bg-slate-400/10 text-slate-300" : rank === 3 ? "border-orange-500/30 bg-orange-500/10 text-orange-400" : "border-border-default bg-panel-light text-text-muted"}`}>
      #{rank}
    </span>
  );
}

function FlowBadge({
  direction,
}: {
  direction:
    TradeFlowInventoryRank["direction"];
}) {
  const style =
    direction ===
      "ACCUMULATING"
      ? "border-success/25 bg-success/10 text-success"
      : direction ===
          "DISTRIBUTING"
        ? "border-sky-400/25 bg-sky-400/10 text-sky-400"
        : "border-border-default bg-panel-light text-text-muted";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black tracking-[0.1em] ${style}`}>
      {direction}
    </span>
  );
}

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-sm font-black text-text-primary">
        {value}
      </p>
      <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-text-muted">
        {label}
      </p>
    </div>
  );
}

function EmptyRows() {
  return (
    <p className="py-8 text-center text-xs text-text-muted">
      No credible settled Strategy #1 trades in this window.
    </p>
  );
}

function PageState({
  title,
  detail,
  spinning =
    false,
  onRetry,
}: {
  title: string;
  detail: string;
  spinning?: boolean;
  onRetry?: () => void;
}) {
  return (
    <section className="flex min-h-[420px] items-center justify-center rounded-2xl border border-border-default bg-panel p-6 text-center">
      <div>
        <RefreshCw className={`mx-auto size-8 text-brand ${spinning ? "animate-spin" : ""}`} />
        <h1 className="mt-4 text-xl font-black text-text-primary">
          {title}
        </h1>
        <p className="mt-2 max-w-md text-sm text-text-muted">
          {detail}
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={
              onRetry
            }
            className="mt-5 rounded-lg border border-brand/30 bg-brand/10 px-4 py-2 text-xs font-bold text-brand"
          >
            Retry report
          </button>
        ) : null}
      </div>
    </section>
  );
}

function formatInr(
  value:
    number,
): string {
  return new Intl.NumberFormat(
    "en-IN",
    {
      style:
        "currency",
      currency:
        "INR",
      maximumFractionDigits:
        0,
    },
  ).format(
    value,
  );
}

function formatSignedInr(
  value:
    number,
): string {
  const formatted =
    formatInr(
      Math.abs(
        value,
      ),
    );

  return value >
    0
    ? `+${formatted}`
    : value <
        0
      ? `−${formatted}`
      : formatted;
}

function formatCount(
  value:
    number,
): string {
  return new Intl.NumberFormat(
    "en-IN",
    {
      maximumFractionDigits:
        0,
    },
  ).format(
    value,
  );
}

function formatPercent(
  value:
    number,
): string {
  return `${value.toFixed(2).replace(/\.00$/, "")}%`;
}

function formatQuantity(
  value:
    number,
): string {
  return new Intl.NumberFormat(
    "en-IN",
    {
      maximumFractionDigits:
        8,
    },
  ).format(
    value,
  );
}

function formatSignedQuantity(
  value:
    number,
): string {
  return value >
    0
    ? `+${formatQuantity(value)}`
    : value <
        0
      ? `−${formatQuantity(Math.abs(value))}`
      : "0";
}

function formatExchange(
  exchange:
    string,
): string {
  const names:
    Record<string, string> = {
    binance:
      "Binance",
    bybit:
      "Bybit",
    coindcx:
      "CoinDCX",
    coinswitch:
      "CoinSwitch",
    unocoin:
      "UnoCoin",
  };

  return names[
    exchange
      .toLowerCase()
  ] ??
    exchange;
}

function formatIstTime(
  timestamp:
    number,
): string {
  return new Intl.DateTimeFormat(
    "en-IN",
    {
      timeZone:
        "Asia/Kolkata",
      hour:
        "2-digit",
      minute:
        "2-digit",
      hour12:
        false,
    },
  ).format(
    timestamp,
  );
}

function formatIstDateTime(
  timestamp:
    number,
): string {
  return new Intl.DateTimeFormat(
    "en-IN",
    {
      timeZone:
        "Asia/Kolkata",
      day:
        "2-digit",
      month:
        "short",
      hour:
        "2-digit",
      minute:
        "2-digit",
      hour12:
        false,
    },
  ).format(
    timestamp,
  );
}

function pnlTone(
  value:
    number,
): string {
  return value >
    0
    ? "text-success"
    : value <
        0
      ? "text-danger"
      : "text-text-muted";
}

function inventoryTone(
  value:
    number,
): string {
  return value >
    0
    ? "text-success"
    : value <
        0
      ? "text-sky-400"
      : "text-text-muted";
}
