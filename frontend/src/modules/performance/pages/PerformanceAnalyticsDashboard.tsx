import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";

import {
  usePaperPortfolioOptimizer,
} from "@/modules/automation/hooks/useAutomationDashboard";

import {
  useAgentSakhondraReport,
} from "@/modules/agent-sakhondra/agentSakhondraApi";

import {
  useLivePerformance,
  usePaperAnalytics,
  useShadowPerformance,
} from "../hooks/usePerformanceAnalytics";

import type {
  ExchangePairPerformanceRecord,
  PerformanceEvidenceLevel,
  RoutePerformanceRecord,
} from "../types/PerformanceAnalytics";

export default function PerformanceAnalyticsDashboard() {
  const {
    data:
      paperResponse,

    isFetching:
      paperFetching,

    isError:
      paperError,

    refetch:
      refetchPaper,
  } =
    usePaperAnalytics();

  const {
    data:
      shadowResponse,

    isFetching:
      shadowFetching,

    isError:
      shadowError,

    refetch:
      refetchShadow,
  } =
    useShadowPerformance();

  const {
    data:
      liveResponse,

    isFetching:
      liveFetching,

    isError:
      liveError,

    refetch:
      refetchLive,
  } =
    useLivePerformance();

  const {
    data:
      portfolioResponse,

    isFetching:
      portfolioFetching,

    refetch:
      refetchPortfolio,
  } =
    usePaperPortfolioOptimizer();

  const {
    data:
      tinyLiveResponse,

    isFetching:
      tinyLiveFetching,

    isError:
      tinyLiveError,

    refetch:
      refetchTinyLive,
  } =
    useAgentSakhondraReport();

  const paper =
    paperResponse?.data;

  const shadow =
    shadowResponse?.data;

  const live =
    liveResponse?.data;

  const portfolio =
    portfolioResponse?.data;

  const tinyLive =
    tinyLiveResponse?.data;

  const refreshing =
    paperFetching ||
    shadowFetching ||
    liveFetching ||
    tinyLiveFetching ||
    portfolioFetching;

  const refreshAll =
    async () => {
      await Promise.all([
        refetchPaper(),
        refetchShadow(),
        refetchLive(),
        refetchTinyLive(),
        refetchPortfolio(),
      ]);
    };

  const partialEvidence =
    paperError ||
    shadowError ||
    liveError ||
    tinyLiveError;

  const largestRouteLoss =
    portfolio?.routes.length
      ? Math.min(
          ...portfolio.routes.map(
            (
              route,
            ) =>
              route.paper
                .largestLoss,
          ),
        )
      : null;

  return (
    <section className="space-y-6">
      <section className="rounded-xl border border-border-default bg-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-success">
              <BarChart3 className="size-4" />

              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                Performance
                Analytics
              </p>
            </div>

            <h1 className="mt-2 text-3xl font-bold text-text-primary">
              Trading Evidence
              & Performance
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              Shadow, paper and
              historical LIVE
              execution evidence.
              Metrics are
              observational only and
              do not enable LIVE
              execution or promote
              capital automatically.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
              ANALYTICS ONLY
            </span>

            <button
              type="button"
              disabled={
                refreshing
              }
              onClick={() =>
                void refreshAll()
              }
              className="inline-flex items-center gap-2 rounded-md border border-border-default bg-panel-light px-3 py-2 text-xs font-semibold text-text-primary hover:border-brand/50 disabled:opacity-60"
            >
              <RefreshCw
                className={`size-4 ${
                  refreshing
                    ? "animate-spin"
                    : ""
                }`}
              />

              Refresh
            </button>
          </div>
        </div>
      </section>

      {partialEvidence ? (
        <section className="rounded-xl border border-warning/30 bg-warning/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 text-warning" />

            <div>
              <p className="font-semibold text-warning">
                Partial analytics
                evidence
              </p>

              <p className="mt-1 text-sm text-text-muted">
                One or more
                analytics sources
                could not be loaded.
                Missing evidence is
                not inferred or
                replaced.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-3">
        <EvidencePanel
          title="Shadow"
          status={
            shadow?.readiness
              .level ??
            "NO DATA"
          }
          detail={
            shadow
              ? `${shadow.summary.completed} completed outcomes`
              : "Evidence unavailable"
          }
          healthy={
            shadow?.readiness
              .readyForPaperAutomation ??
            false
          }
        />

        <EvidencePanel
          title="Paper"
          status={
            paper
              ? `${paper.overview.closedTrades} CLOSED`
              : "NO DATA"
          }
          detail={
            paper
              ? `${paper.overview.winRate.toFixed(
                  1,
                )}% win rate`
              : "Evidence unavailable"
          }
          healthy={
            (
              paper?.overview
                .closedTrades ??
              0
            ) > 0
          }
        />

        <EvidencePanel
          title="LIVE Evidence"
          status={
            live?.evidenceStatus ??
            "NO DATA"
          }
          detail={
            live
              ? `${live.execution.totalExecutions} executions`
              : "Evidence unavailable"
          }
          healthy={
            live?.evidenceStatus ===
            "AVAILABLE"
          }
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <SectionTitle
            title="Shadow Performance"
            subtitle="Learning evidence"
          />

          {!shadow ? (
            <EmptyEvidence />
          ) : (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric
                  label="Completed"
                  value={String(
                    shadow.summary
                      .completed,
                  )}
                />

                <Metric
                  label="Success Rate"
                  value={percent(
                    shadow.summary
                      .successRatePercent,
                  )}
                />

                <Metric
                  label="Executable"
                  value={percent(
                    shadow
                      .executionQuality
                      .executableRatePercent,
                  )}
                />

                <Metric
                  label="Profit Retention"
                  value={percent(
                    shadow
                      .profitability
                      .averageProfitRetentionPercent,
                  )}
                />
              </div>

              <div className="mt-5 space-y-3">
                <ProgressMetric
                  label="Freshness"
                  value={
                    shadow
                      .executionQuality
                      .freshnessRatePercent
                  }
                />

                <ProgressMetric
                  label="Executability"
                  value={
                    shadow
                      .executionQuality
                      .executableRatePercent
                  }
                />

                <ProgressMetric
                  label="Profitable Samples"
                  value={
                    shadow
                      .executionQuality
                      .profitableSampleRatePercent
                  }
                />

                <ProgressMetric
                  label="Readiness"
                  value={
                    shadow.readiness
                      .score
                  }
                />
              </div>

              <div className="mt-5 rounded-lg border border-border-default bg-panel-light p-4">
                <DataRow
                  label="Required Samples"
                  value={String(
                    shadow
                      .sampleRequirement
                      .minimumCompletedOutcomes,
                  )}
                />

                <DataRow
                  label="Remaining"
                  value={String(
                    shadow
                      .sampleRequirement
                      .remaining,
                  )}
                />

                <DataRow
                  label="Avg Predicted Profit"
                  value={formatMoney(
                    shadow
                      .profitability
                      .averagePredictedNetProfit,
                  )}
                />

                <DataRow
                  label="Avg Observed Profit"
                  value={formatMoney(
                    shadow
                      .profitability
                      .averageObservedNetProfit,
                  )}
                />
              </div>
            </>
          )}
        </section>

        <section className="rounded-xl border border-border-default bg-panel p-5">
          <SectionTitle
            title="Paper Performance"
            subtitle="Simulated trading evidence"
          />

          {!paper ? (
            <EmptyEvidence />
          ) : (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric
                  label="Trades"
                  value={String(
                    paper.overview
                      .totalTrades,
                  )}
                />

                <Metric
                  label="Win Rate"
                  value={percent(
                    paper.overview
                      .winRate,
                  )}
                />

                <Metric
                  label="ROI"
                  value={percent(
                    paper.overview
                      .roi,
                  )}
                />

                <Metric
                  label="Net P&L"
                  value={formatMoney(
                    paper.overview
                      .totalProfit,
                  )}
                />
              </div>

              <div className="mt-5 rounded-lg border border-border-default bg-panel-light p-4">
                <DataRow
                  label="Winning Trades"
                  value={String(
                    paper.overview
                      .winningTrades,
                  )}
                />

                <DataRow
                  label="Losing Trades"
                  value={String(
                    paper.overview
                      .losingTrades,
                  )}
                />

                <DataRow
                  label="Average Win"
                  value={formatMoney(
                    paper.overview
                      .averageProfit,
                  )}
                />

                <DataRow
                  label="Average Loss"
                  value={formatMoney(
                    paper.overview
                      .averageLoss,
                  )}
                />

                <DataRow
                  label="Capital In Use"
                  value={formatMoney(
                    paper.overview
                      .capitalInUse,
                  )}
                />

                <DataRow
                  label="Largest Route Loss"
                  value={
                    largestRouteLoss ===
                    null
                      ? "NOT REPORTED"
                      : formatMoney(
                          largestRouteLoss,
                        )
                  }
                />

                <DataRow
                  label="Aggregate Max Drawdown"
                  value="NOT REPORTED"
                />
              </div>

              <p className="mt-3 text-xs leading-5 text-text-muted">
                Current backend does
                not expose a genuine
                aggregate
                max-drawdown metric.
                The UI therefore does
                not derive or invent
                one.
              </p>
            </>
          )}
        </section>
      </section>

      <section className="rounded-xl border border-border-default bg-panel p-5">
        <SectionTitle
          title="Strategy #1 Tiny-LIVE Execution Evidence"
          subtitle="Dedicated LIVE session journal + linked persistent settlements"
        />

        {!tinyLive ? (
          <EmptyEvidence />
        ) : (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Tiny-LIVE Attempts"
                value={String(
                  tinyLive.conversion
                    .liveAttempts,
                )}
              />

              <Metric
                label="Completed Two-Leg"
                value={String(
                  tinyLive.conversion
                    .completedTwoLeg,
                )}
              />

              <Metric
                label="Settled Trades"
                value={String(
                  tinyLive.conversion
                    .settledLiveTrades,
                )}
              />

              <Metric
                label="Unsuccessful"
                value={String(
                  tinyLive.conversion
                    .unsuccessfulLiveAttempts,
                )}
              />

              <Metric
                label="Recovery / Exposure"
                value={String(
                  tinyLive.conversion
                    .possibleExposureOrRecovery,
                )}
              />

              <Metric
                label="Settlement Rate"
                value={tinyLive.conversion.attemptToSettlementPercent === null
                  ? "N/A"
                  : percent(tinyLive.conversion.attemptToSettlementPercent)}
              />

              <Metric
                label="LIVE Win Rate"
                value={tinyLive.economics.settledSamples === 0
                  ? "N/A"
                  : percent(
                      tinyLive.economics.profitableSettlements /
                        tinyLive.economics.settledSamples *
                        100,
                    )}
              />

              <Metric
                label="LIVE Net P&L"
                value={tinyLive.economics.realizedNetProfit === null
                  ? "NOT SETTLED"
                  : formatMoney(tinyLive.economics.realizedNetProfit)}
              />
            </div>

            <div className="mt-6 grid gap-5 xl:grid-cols-2">
              <div className="rounded-lg border border-border-default bg-panel-light p-4">
                <SectionTitle
                  title="Settlement Economics"
                  subtitle="Session-linked SETTLED records only"
                  compact
                />

                <div className="mt-4 space-y-3">
                  <DataRow
                    label="Profitable Settlements"
                    value={String(tinyLive.economics.profitableSettlements)}
                  />

                  <DataRow
                    label="Loss Settlements"
                    value={String(tinyLive.economics.lossSettlements)}
                  />

                  <DataRow
                    label="Total Fees"
                    value={tinyLive.economics.totalFees === null
                      ? "NO SETTLEMENT"
                      : formatMoney(tinyLive.economics.totalFees)}
                  />

                  <DataRow
                    label="Average ROI"
                    value={tinyLive.economics.averageRoiPercent === null
                      ? "N/A"
                      : percent(tinyLive.economics.averageRoiPercent)}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-border-default bg-panel-light p-4">
                <SectionTitle
                  title="Journal Linkage"
                  subtitle="No PAPER or synthetic records"
                  compact
                />

                <div className="mt-4 space-y-3">
                  <DataRow
                    label="Retained LIVE Sessions"
                    value={String(
                      tinyLive.window
                        .retainedLiveSessions,
                    )}
                  />

                  <DataRow
                    label="Completed → Settlement"
                    value={tinyLive.conversion.completedToSettlementPercent === null
                      ? "N/A"
                      : percent(tinyLive.conversion.completedToSettlementPercent)}
                  />

                  <DataRow
                    label="PAPER Included"
                    value="NO"
                  />

                  <DataRow
                    label="Synthetic Included"
                    value="NO"
                  />

                  <DataRow
                    label="Evidence State"
                    value={tinyLive.agent.state.replaceAll("_", " ")}
                  />
                </div>
              </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-text-muted">
              Attempts come only from the durable Strategy #1 two-leg LIVE journal. P&amp;L appears only after an exact sessionId-linked persistent settlement; failed-safe or recovery-required attempts remain visible but are never fabricated as settled profit or loss.
            </p>
          </>
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <SectionTitle
            title="Route Performance"
            subtitle="Market + exchange route evidence"
          />

          {!live ||
          live.routePerformance
            .routes.length ===
            0 ? (
            <EmptyEvidence text="No established route-performance evidence yet." />
          ) : (
            <RouteTable
              routes={
                live.routePerformance
                  .routes
              }
            />
          )}
        </section>

        <section className="rounded-xl border border-border-default bg-panel p-5">
          <SectionTitle
            title="Exchange Pair Performance"
            subtitle="Aggregated cross-exchange evidence"
          />

          {!live ||
          live.routePerformance
            .exchangePairs
            .length ===
            0 ? (
            <EmptyEvidence text="No exchange-pair performance evidence yet." />
          ) : (
            <ExchangePairTable
              routes={
                live.routePerformance
                  .exchangePairs
              }
            />
          )}
        </section>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-border-default bg-panel p-5">
          <SectionTitle
            title="Shadow Exchange Pairs"
            subtitle="Learning performance by route"
          />

          {!shadow ||
          shadow.exchangePairs
            .length ===
            0 ? (
            <EmptyEvidence text="No shadow exchange-pair evidence yet." />
          ) : (
            <div className="mt-4 space-y-3">
              {shadow.exchangePairs.map(
                (
                  route,
                ) => (
                  <div
                    key={
                      route.key
                    }
                    className="rounded-lg border border-border-default bg-panel-light p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <strong className="uppercase text-text-primary">
                        {
                          route.buyExchange
                        }
                        {" → "}
                        {
                          route.sellExchange
                        }
                      </strong>

                      <span className="font-mono text-xs text-text-muted">
                        {
                          route.completed
                        }{" "}
                        samples
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs lg:grid-cols-4">
                      <MiniValue
                        label="Success"
                        value={percent(
                          route.successRatePercent,
                        )}
                      />

                      <MiniValue
                        label="Executable"
                        value={percent(
                          route.executableSampleRatePercent,
                        )}
                      />

                      <MiniValue
                        label="Profitable"
                        value={percent(
                          route.profitableSampleRatePercent,
                        )}
                      />

                      <MiniValue
                        label="Retention"
                        value={percent(
                          route.averageProfitRetentionPercent,
                        )}
                      />
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border-default bg-panel p-5">
          <SectionTitle
            title="Paper Exchange Performance"
            subtitle="Closed paper trades grouped by buy exchange"
          />

          {!paper ||
          paper.exchanges.length ===
            0 ? (
            <EmptyEvidence text="No closed paper exchange performance yet." />
          ) : (
            <div className="mt-4 space-y-3">
              {paper.exchanges.map(
                (
                  exchange,
                ) => (
                  <div
                    key={
                      exchange.exchange
                    }
                    className="rounded-lg border border-border-default bg-panel-light p-4"
                  >
                    <div className="flex items-center justify-between">
                      <strong className="uppercase text-text-primary">
                        {
                          exchange.exchange
                        }
                      </strong>

                      <span className="font-mono text-xs text-text-muted">
                        {
                          exchange.totalTrades
                        }{" "}
                        trades
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <MiniValue
                        label="Win Rate"
                        value={percent(
                          exchange.winRate,
                        )}
                      />

                      <MiniValue
                        label="Profit"
                        value={formatMoney(
                          exchange.totalProfit,
                        )}
                      />

                      <MiniValue
                        label="Average"
                        value={formatMoney(
                          exchange.averageProfit,
                        )}
                      />
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </section>
      </section>
    </section>
  );
}

function EvidencePanel({
  title,
  status,
  detail,
  healthy,
}: {
  title: string;

  status: string;

  detail: string;

  healthy: boolean;
}) {
  return (
    <div className="rounded-xl border border-border-default bg-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-text-muted">
            {title}
          </p>

          <p className="mt-2 font-mono text-lg font-bold text-text-primary">
            {status}
          </p>

          <p className="mt-1 text-xs text-text-muted">
            {detail}
          </p>
        </div>

        {healthy ? (
          <CheckCircle2 className="size-5 text-success" />
        ) : (
          <AlertTriangle className="size-5 text-warning" />
        )}
      </div>
    </div>
  );
}

function SectionTitle({
  title,
  subtitle,
  compact = false,
}: {
  title: string;

  subtitle: string;

  compact?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
        {subtitle}
      </p>

      <h2
        className={`mt-1 font-bold text-text-primary ${
          compact
            ? "text-lg"
            : "text-xl"
        }`}
      >
        {title}
      </h2>
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;

  value: string;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-4">
      <p className="text-xs uppercase tracking-[0.13em] text-text-muted">
        {label}
      </p>

      <p className="mt-2 font-mono text-lg font-bold text-text-primary">
        {value}
      </p>
    </div>
  );
}

function ProgressMetric({
  label,
  value,
}: {
  label: string;

  value: number;
}) {
  const normalized =
    Math.max(
      0,
      Math.min(
        100,
        value,
      ),
    );

  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-muted">
          {label}
        </span>

        <span className="font-mono text-text-primary">
          {normalized.toFixed(
            1,
          )}
          %
        </span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel-light">
        <div
          className="h-full bg-success"
          style={{
            width: `${normalized}%`,
          }}
        />
      </div>
    </div>
  );
}

function DataRow({
  label,
  value,
}: {
  label: string;

  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border-default pb-2 text-sm last:border-b-0 last:pb-0">
      <span className="text-text-muted">
        {label}
      </span>

      <span className="text-right font-mono text-xs font-semibold text-text-primary">
        {value}
      </span>
    </div>
  );
}

function EmptyEvidence({
  text =
    "No evidence available yet.",
}: {
  text?: string;
}) {
  return (
    <div className="mt-5 rounded-lg border border-border-default bg-panel-light p-5 text-sm text-text-muted">
      {text}
    </div>
  );
}

function RouteTable({
  routes,
}: {
  routes: RoutePerformanceRecord[];
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead className="text-text-muted">
          <tr className="border-b border-border-default">
            <th className="pb-3">
              Route
            </th>

            <th className="pb-3">
              Evidence
            </th>

            <th className="pb-3 text-right">
              Cycles
            </th>

            <th className="pb-3 text-right">
              Win %
            </th>

            <th className="pb-3 text-right">
              ROI %
            </th>

            <th className="pb-3 text-right">
              Retention
            </th>
          </tr>
        </thead>

        <tbody>
          {routes.map(
            (
              route,
            ) => (
              <tr
                key={
                  route.routeKey
                }
                className="border-b border-border-default last:border-b-0"
              >
                <td className="py-3">
                  <strong className="text-text-primary">
                    {
                      route.market
                    }
                  </strong>

                  <p className="mt-1 uppercase text-text-muted">
                    {
                      route.buyExchange
                    }
                    {" → "}
                    {
                      route.sellExchange
                    }
                  </p>
                </td>

                <td>
                  <EvidenceBadge
                    level={
                      route.evidenceLevel
                    }
                  />
                </td>

                <td className="text-right font-mono">
                  {
                    route.matchedCycles
                  }
                </td>

                <td className="text-right font-mono">
                  {percent(
                    route.winRatePercent,
                  )}
                </td>

                <td className="text-right font-mono">
                  {percent(
                    route.averageRoiPercent,
                  )}
                </td>

                <td className="text-right font-mono">
                  {route.profitRetentionPercent ===
                  null
                    ? "N/A"
                    : percent(
                        route.profitRetentionPercent,
                      )}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function ExchangePairTable({
  routes,
}: {
  routes: ExchangePairPerformanceRecord[];
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[680px] text-left text-xs">
        <thead className="text-text-muted">
          <tr className="border-b border-border-default">
            <th className="pb-3">
              Pair
            </th>

            <th className="pb-3">
              Evidence
            </th>

            <th className="pb-3 text-right">
              Markets
            </th>

            <th className="pb-3 text-right">
              Cycles
            </th>

            <th className="pb-3 text-right">
              Win %
            </th>

            <th className="pb-3 text-right">
              Slippage
            </th>
          </tr>
        </thead>

        <tbody>
          {routes.map(
            (
              route,
            ) => (
              <tr
                key={
                  route.exchangePairKey
                }
                className="border-b border-border-default last:border-b-0"
              >
                <td className="py-3 font-semibold uppercase text-text-primary">
                  {
                    route.buyExchange
                  }
                  {" → "}
                  {
                    route.sellExchange
                  }
                </td>

                <td>
                  <EvidenceBadge
                    level={
                      route.evidenceLevel
                    }
                  />
                </td>

                <td className="text-right font-mono">
                  {
                    route.marketsObserved
                      .length
                  }
                </td>

                <td className="text-right font-mono">
                  {
                    route.matchedCycles
                  }
                </td>

                <td className="text-right font-mono">
                  {percent(
                    route.winRatePercent,
                  )}
                </td>

                <td className="text-right font-mono">
                  {percent(
                    route.averageAdverseSlippagePercent,
                  )}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function EvidenceBadge({
  level,
}: {
  level: PerformanceEvidenceLevel;
}) {
  const className =
    level ===
    "ESTABLISHED"
      ? "border-success/30 bg-success/10 text-success"
      : level ===
          "DEVELOPING"
        ? "border-brand/30 bg-brand/10 text-brand"
        : level ===
              "INSUFFICIENT"
          ? "border-warning/30 bg-warning/10 text-warning"
          : "border-border-default bg-panel-light text-text-muted";

  return (
    <span
      className={`rounded-full border px-2 py-1 font-mono text-[10px] font-bold ${className}`}
    >
      {level}
    </span>
  );
}

function MiniValue({
  label,
  value,
}: {
  label: string;

  value: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-text-muted">
        {label}
      </p>

      <p className="mt-1 break-words font-mono font-semibold text-text-primary">
        {value}
      </p>
    </div>
  );
}

function percent(
  value: number,
): string {
  return `${value.toFixed(
    2,
  )}%`;
}

function formatMoney(
  value: number,
): string {
  return new Intl.NumberFormat(
    "en-IN",
    {
      style:
        "currency",

      currency:
        "INR",

      maximumFractionDigits:
        2,
    },
  ).format(
    value,
  );
}
