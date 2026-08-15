import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Layers3,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  Workflow,
  XCircle,
} from "lucide-react";

import {
  useAutomationDashboard,
  usePaperPortfolioOptimizer,
} from "../hooks/useAutomationDashboard";

import OpportunityEconomicsDiagnosticsPanel from "@/modules/opportunity-diagnostics/components/OpportunityEconomicsDiagnosticsPanel";

import type {
  AutomationDashboardModuleState,
} from "../types/AutomationDashboard";

import type {
  PaperPortfolioRoutePerformance,
  PaperPortfolioRouteStatus,
} from "../types/PaperPortfolioOptimizer";

export default function AutomationCenterDashboard() {
  const {
    data:
      dashboardResponse,

    isPending:
      dashboardPending,

    isError:
      dashboardError,

    isFetching:
      dashboardFetching,

    refetch:
      refetchDashboard,
  } =
    useAutomationDashboard();

  const {
    data:
      portfolioResponse,

    isError:
      portfolioError,

    isFetching:
      portfolioFetching,

    refetch:
      refetchPortfolio,
  } =
    usePaperPortfolioOptimizer();

  const dashboard =
    dashboardResponse?.data;

  const portfolio =
    portfolioResponse?.data;

  const refreshing =
    dashboardFetching ||
    portfolioFetching;

  const refreshAll =
    async () => {
      await Promise.all([
        refetchDashboard(),
        refetchPortfolio(),
      ]);
    };

  if (
    dashboardPending &&
    !dashboard
  ) {
    return (
      <section className="rounded-xl border border-border-default bg-panel p-6">
        <div className="flex items-center gap-3 text-text-muted">
          <RefreshCw className="size-5 animate-spin" />

          Loading automation
          evidence...
        </div>
      </section>
    );
  }

  if (
    dashboardError ||
    !dashboard
  ) {
    return (
      <section className="rounded-xl border border-danger/30 bg-panel p-6">
        <div className="flex items-start gap-3">
          <XCircle className="mt-0.5 size-6 shrink-0 text-danger" />

          <div>
            <h1 className="text-xl font-bold text-danger">
              Automation evidence
              unavailable
            </h1>

            <p className="mt-2 max-w-3xl text-sm text-text-muted">
              The operator console
              cannot verify the
              automation pipeline.
              Missing evidence is not
              treated as healthy.
            </p>

            <button
              type="button"
              onClick={() =>
                void refreshAll()
              }
              className="mt-4 inline-flex items-center gap-2 rounded-md border border-border-default bg-panel-light px-3 py-2 text-sm font-semibold text-text-primary"
            >
              <RefreshCw className="size-4" />

              Retry
            </button>
          </div>
        </div>
      </section>
    );
  }

  const summary =
    dashboard.summary;

  return (
    <section className="space-y-6">
      <section className="rounded-xl border border-border-default bg-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-success">
              <Bot className="size-4" />

              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                Automation Center
              </p>
            </div>

            <h1 className="mt-2 text-3xl font-bold text-text-primary">
              Shadow & Paper
              Operations
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              Read-only operator
              visibility across
              opportunity monitoring,
              qualification, execution
              queue, shadow learning,
              paper automation,
              adaptive capital and
              accounting.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
              LIVE DISABLED
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

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <HeadlineMetric
            label="Stage"
            value={
              dashboard.stage
            }
            healthy={
              dashboard.stage !==
              "DEGRADED"
            }
          />

          <HeadlineMetric
            label="Scheduler"
            value={
              summary.schedulerRunning
                ? "RUNNING"
                : "STOPPED"
            }
            healthy={
              summary.schedulerRunning
            }
          />

          <HeadlineMetric
            label="Readiness"
            value={`${summary.readinessScore.toFixed(
              0,
            )}/100`}
            healthy={
              dashboard.safety
                .shadowReadinessPassed
            }
          />

          <HeadlineMetric
            label="Paper Execution"
            value={
              summary.paperExecutionAllowed
                ? "ALLOWED"
                : "BLOCKED"
            }
            healthy={
              summary.paperExecutionAllowed
            }
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active Opportunities"
          value={
            summary.activeOpportunities
          }
          detail="Monitored candidates"
        />

        <MetricCard
          label="Qualified"
          value={
            summary.qualifiedCandidates
          }
          detail="Qualification pass"
        />

        <MetricCard
          label="Queue Ready"
          value={
            summary.readyQueueItems
          }
          detail="Ready shadow candidates"
        />

        <MetricCard
          label="Shadow Dispatches"
          value={
            summary.shadowDispatches
          }
          detail="Synthetic dispatch count"
        />

        <MetricCard
          label="Shadow Outcomes"
          value={
            summary.completedShadowOutcomes
          }
          detail={`${summary.shadowSuccessRatePercent.toFixed(
            1,
          )}% success`}
        />

        <MetricCard
          label="Paper Trades"
          value={
            summary.paperTradesExecuted
          }
          detail="Automated paper executions"
        />

        <MetricCard
          label="Capital Allocations"
          value={
            summary.adaptiveCapitalAllocations
          }
          detail="Adaptive allocations"
        />

        <MetricCard
          label="Ledger Entries"
          value={
            summary.automationLedgerEntries
          }
          detail="Automation accounting"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex items-center gap-2">
            <Workflow className="size-5 text-brand" />

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                Pipeline
              </p>

              <h2 className="mt-1 text-xl font-bold text-text-primary">
                Automation Flow
              </h2>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <PipelineStage
              label="Scanner → Automation"
              healthy={
                dashboard.pipeline
                  .scannerToAutomation
              }
            />

            <PipelineStage
              label="Persistence"
              healthy={
                dashboard.pipeline
                  .persistence
              }
            />

            <PipelineStage
              label="Qualification"
              healthy={
                dashboard.pipeline
                  .qualification
              }
            />

            <PipelineStage
              label="Execution Queue"
              healthy={
                dashboard.pipeline
                  .queue
              }
            />

            <PipelineStage
              label="Shadow Dispatcher"
              healthy={
                dashboard.pipeline
                  .shadowDispatcher
              }
            />

            <PipelineStage
              label="Outcome Tracking"
              healthy={
                dashboard.pipeline
                  .outcomeTracking
              }
            />

            <PipelineStage
              label="Performance Analytics"
              healthy={
                dashboard.pipeline
                  .performanceAnalytics
              }
            />

            <PipelineStage
              label="Paper Controller"
              healthy={
                dashboard.pipeline
                  .paperController
              }
            />

            <PipelineStage
              label="Paper Scheduler"
              healthy={
                dashboard.pipeline
                  .paperScheduler
              }
            />

            <PipelineStage
              label="Adaptive Capital"
              healthy={
                dashboard.pipeline
                  .adaptiveCapital
              }
            />

            <PipelineStage
              label="Accounting"
              healthy={
                dashboard.pipeline
                  .accounting
              }
            />
          </div>
        </div>

        <div className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-brand" />

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                Automation Safety
              </p>

              <h2 className="mt-1 text-xl font-bold text-text-primary">
                Safety Gates
              </h2>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <SafetyRow
              label="Shadow readiness"
              passed={
                dashboard.safety
                  .shadowReadinessPassed
              }
            />

            <SafetyRow
              label="Paper armed"
              passed={
                dashboard.safety
                  .paperAutomationArmed
              }
            />

            <SafetyRow
              label="PAPER account mode"
              passed={
                dashboard.safety
                  .paperAccountMode
              }
            />

            <SafetyRow
              label="Accounting integrity"
              passed={
                dashboard.safety
                  .accountingIntegrityPassed
              }
            />

            <SafetyRow
              label="LIVE disabled"
              passed={
                dashboard.safety
                  .liveExecutionDisabled
              }
            />
          </div>

          {dashboard.safety.blockers
            .length > 0 ? (
            <div className="mt-4 space-y-2">
              {dashboard.safety.blockers.map(
                (
                  blocker,
                ) => (
                  <div
                    key={
                      blocker
                    }
                    className="rounded-lg border border-danger/20 bg-danger/10 p-3 text-xs leading-5 text-text-primary"
                  >
                    {blocker}
                  </div>
                ),
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-success/20 bg-success/10 p-3 text-sm text-success">
              No automation
              blockers reported.
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-xl border border-border-default bg-panel p-5">
          <div className="flex items-center gap-2">
            <WalletCards className="size-5 text-brand" />

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                Paper Capital
              </p>

              <h2 className="mt-1 text-xl font-bold text-text-primary">
                Accounting &
                Allocation
              </h2>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <MoneyMetric
              label="Current Capital"
              value={
                summary.currentPaperCapital
              }
            />

            <MoneyMetric
              label="Available Capital"
              value={
                summary.availablePaperCapital
              }
            />

            <MoneyMetric
              label="Automation Net P&L"
              value={
                summary.automationNetProfit
              }
            />

            <div className="rounded-lg border border-border-default bg-panel-light p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-text-muted">
                Readiness Level
              </p>

              <p className="mt-2 break-words font-mono text-sm font-bold text-text-primary">
                {
                  summary.readinessLevel
                }
              </p>
            </div>
          </div>
        </div>

        <PortfolioOptimizerPanel
          portfolio={
            portfolio
          }
          unavailable={
            portfolioError
          }
        />
      </section>

      <OpportunityEconomicsDiagnosticsPanel />

      <section className="rounded-xl border border-border-default bg-panel p-5">
        <div className="flex items-center gap-2">
          <Layers3 className="size-5 text-brand" />

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              Module Diagnostics
            </p>

            <h2 className="mt-1 text-xl font-bold text-text-primary">
              Automation Modules
            </h2>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {Object.entries(
            dashboard.modules,
          ).map(
            ([
              key,
              module,
            ]) => (
              <ModuleCard
                key={
                  key
                }
                module={
                  module
                }
              />
            ),
          )}
        </div>
      </section>
    </section>
  );
}

function HeadlineMetric({
  label,
  value,
  healthy,
}: {
  label: string;

  value: string;

  healthy: boolean;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-text-muted">
        {label}
      </p>

      <div className="mt-2 flex items-start gap-2">
        {healthy ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
        ) : (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        )}

        <p className="break-words font-mono text-sm font-bold text-text-primary">
          {value}
        </p>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;

  value: number;

  detail: string;
}) {
  return (
    <div className="rounded-xl border border-border-default bg-panel p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-text-muted">
        {label}
      </p>

      <p className="mt-2 text-2xl font-bold tabular-nums text-text-primary">
        {value.toLocaleString()}
      </p>

      <p className="mt-1 text-xs text-text-muted">
        {detail}
      </p>
    </div>
  );
}

function PipelineStage({
  label,
  healthy,
}: {
  label: string;

  healthy: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border-default bg-panel-light p-3">
      <span className="text-sm text-text-primary">
        {label}
      </span>

      {healthy ? (
        <CheckCircle2 className="size-4 shrink-0 text-success" />
      ) : (
        <XCircle className="size-4 shrink-0 text-danger" />
      )}
    </div>
  );
}

function SafetyRow({
  label,
  passed,
}: {
  label: string;

  passed: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border-default pb-2 last:border-b-0 last:pb-0">
      <span className="text-sm text-text-muted">
        {label}
      </span>

      <span
        className={`font-mono text-xs font-bold ${
          passed
            ? "text-success"
            : "text-danger"
        }`}
      >
        {passed
          ? "PASS"
          : "BLOCKED"}
      </span>
    </div>
  );
}

function MoneyMetric({
  label,
  value,
}: {
  label: string;

  value: number;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-text-muted">
        {label}
      </p>

      <p className="mt-2 font-mono text-lg font-bold text-text-primary">
        {formatMoney(
          value,
        )}
      </p>
    </div>
  );
}

function ModuleCard({
  module,
}: {
  module:
    AutomationDashboardModuleState;
}) {
  const details =
    Object.entries(
      module.details,
    );

  return (
    <article className="rounded-lg border border-border-default bg-panel-light p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-text-primary">
            {module.name}
          </p>

          <p className="mt-1 font-mono text-xs text-text-muted">
            {
              module.status
            }
          </p>
        </div>

        {module.healthy ? (
          <CheckCircle2 className="size-5 shrink-0 text-success" />
        ) : (
          <AlertTriangle className="size-5 shrink-0 text-warning" />
        )}
      </div>

      {details.length >
      0 ? (
        <div className="mt-4 space-y-2">
          {details.map(
            ([
              key,
              value,
            ]) => (
              <div
                key={
                  key
                }
                className="flex items-start justify-between gap-3 border-b border-border-default pb-2 text-xs last:border-b-0 last:pb-0"
              >
                <span className="break-words text-text-muted">
                  {formatLabel(
                    key,
                  )}
                </span>

                <span className="max-w-[55%] break-words text-right font-mono font-semibold text-text-primary">
                  {formatDetailValue(
                    value,
                  )}
                </span>
              </div>
            ),
          )}
        </div>
      ) : null}
    </article>
  );
}

function PortfolioOptimizerPanel({
  portfolio,
  unavailable,
}: {
  portfolio:
    | {
        totalRoutes: number;

        insufficientData: number;

        blocked: number;

        throttled: number;

        neutral: number;

        boosted: number;

        capitalMutationAllowed: false;

        liveExecutionAllowed: false;

        bestRoute:
          | PaperPortfolioRoutePerformance
          | null;

        worstRoute:
          | PaperPortfolioRoutePerformance
          | null;

        routes:
          PaperPortfolioRoutePerformance[];
      }
    | undefined;

  unavailable: boolean;
}) {
  return (
    <div className="rounded-xl border border-border-default bg-panel p-5">
      <div className="flex items-center gap-2">
        <Activity className="size-5 text-brand" />

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
            Portfolio Optimizer
          </p>

          <h2 className="mt-1 text-xl font-bold text-text-primary">
            Route Intelligence
          </h2>
        </div>
      </div>

      {unavailable ||
      !portfolio ? (
        <div className="mt-5 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          Paper portfolio
          optimizer evidence is
          currently unavailable.
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <RouteCount
              label="Routes"
              value={
                portfolio.totalRoutes
              }
            />

            <RouteCount
              label="Blocked"
              value={
                portfolio.blocked
              }
            />

            <RouteCount
              label="Boosted"
              value={
                portfolio.boosted
              }
            />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <RouteCount
              label="No Data"
              value={
                portfolio.insufficientData
              }
            />

            <RouteCount
              label="Throttle"
              value={
                portfolio.throttled
              }
            />

            <RouteCount
              label="Neutral"
              value={
                portfolio.neutral
              }
            />
          </div>

          <div className="mt-4 space-y-3">
            <RouteSummary
              title="Best Route"
              route={
                portfolio.bestRoute
              }
            />

            <RouteSummary
              title="Worst Route"
              route={
                portfolio.worstRoute
              }
            />
          </div>

          <div className="mt-4 rounded-lg border border-border-default bg-panel-light p-3 text-xs text-text-muted">
            Capital mutation:{" "}
            <strong className="text-success">
              DISABLED
            </strong>
            {" · "}
            LIVE execution:{" "}
            <strong className="text-success">
              DISABLED
            </strong>
          </div>
        </>
      )}
    </div>
  );
}

function RouteCount({
  label,
  value,
}: {
  label: string;

  value: number;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-3 text-center">
      <p className="font-mono text-lg font-bold text-text-primary">
        {value}
      </p>

      <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-text-muted">
        {label}
      </p>
    </div>
  );
}

function RouteSummary({
  title,
  route,
}: {
  title: string;

  route:
    | PaperPortfolioRoutePerformance
    | null;
}) {
  if (
    route === null
  ) {
    return (
      <div className="rounded-lg border border-border-default bg-panel-light p-3">
        <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
          {title}
        </p>

        <p className="mt-1 text-sm text-text-muted">
          Insufficient route
          evidence.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-text-muted">
            {title}
          </p>

          <p className="mt-1 text-sm font-bold uppercase text-text-primary">
            {route.buyExchange}
            {" → "}
            {route.sellExchange}
          </p>
        </div>

        <RouteStatusBadge
          status={
            route.status
          }
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-text-muted">
          Score
        </span>

        <span className="font-mono font-bold text-text-primary">
          {route.score.toFixed(
            1,
          )}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-text-muted">
          Capital Multiplier
        </span>

        <span className="font-mono font-bold text-text-primary">
          {route.capitalMultiplier.toFixed(
            2,
          )}
          x
        </span>
      </div>
    </div>
  );
}

function RouteStatusBadge({
  status,
}: {
  status:
    PaperPortfolioRouteStatus;
}) {
  const style =
    status === "BOOSTED"
      ? "border-success/30 bg-success/10 text-success"
      : status ===
            "BLOCKED"
        ? "border-danger/30 bg-danger/10 text-danger"
        : status ===
              "THROTTLED"
          ? "border-warning/30 bg-warning/10 text-warning"
          : "border-border-default bg-panel text-text-muted";

  return (
    <span
      className={`rounded-full border px-2 py-1 text-[10px] font-bold ${style}`}
    >
      {status}
    </span>
  );
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

function formatLabel(
  value: string,
): string {
  return value
    .replace(
      /([a-z0-9])([A-Z])/g,
      "$1 $2",
    )
    .replaceAll(
      "_",
      " ",
    );
}

function formatDetailValue(
  value:
    | string
    | number
    | boolean
    | null,
): string {
  if (
    value === null
  ) {
    return "N/A";
  }

  if (
    typeof value ===
    "boolean"
  ) {
    return value
      ? "YES"
      : "NO";
  }

  if (
    typeof value ===
    "number"
  ) {
    return value.toLocaleString(
      "en-IN",
      {
        maximumFractionDigits:
          4,
      },
    );
  }

  return value;
}
