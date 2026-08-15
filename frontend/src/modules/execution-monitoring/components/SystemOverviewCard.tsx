import {
  Activity,
  Bell,
  CircleDollarSign,
  Radio,
  Server,
  TrendingUp,
  Wifi,
  WifiOff,
} from "lucide-react";

import {
  useOpportunities,
} from "@/modules/arbitrage/hooks/useOpportunities";

import {
  useSocketStore,
} from "@/store/socket.store";

import {
  useArbitragePnL,
  useExecutionHealth,
  useExecutionMetrics,
  useRecentExecutions,
} from "../hooks/useExecutionMonitoring";

type OverviewTone =
  | "positive"
  | "warning"
  | "negative"
  | "neutral";

export function SystemOverviewCard() {
  const socketStatus =
    useSocketStore(
      (state) =>
        state.status,
    );

  const healthQuery =
    useExecutionHealth();

  const metricsQuery =
    useExecutionMetrics();

  const pnlQuery =
    useArbitragePnL(
      10,
    );

  const opportunityQuery =
    useOpportunities();

  const historyQuery =
    useRecentExecutions(
      50,
    );

  const health =
    healthQuery.data;

  const metrics =
    metricsQuery.data;

  const pnl =
    pnlQuery.data;

  const opportunities =
    opportunityQuery.data
      ?.data ??
    [];

  const executions =
    historyQuery.data
      ?.executions ??
    [];

  const actionableOpportunities =
    opportunities.filter(
      (opportunity) =>
        opportunity.decision ===
          "EXECUTE" ||
        opportunity.decision ===
          "REVIEW",
    ).length;

  const executionOpportunities =
    opportunities.filter(
      (opportunity) =>
        opportunity.decision ===
        "EXECUTE",
    ).length;

  const activeAlerts =
    calculateActiveAlerts(
      health?.exchanges ??
        [],
      executions,
    );

  const verifiedExecutionAdapters =
    health?.exchanges.filter(
      (exchange) =>
        exchange.authenticationVerified &&
        exchange.exchangeApiReachable &&
        exchange.readOnlyVerificationFresh,
    ).length ??
    0;

  const totalExchanges =
    health?.exchanges.length ??
    0;

  const healthyExchanges =
    health?.healthyExchanges ??
    0;

  const backendConnected =
    socketStatus ===
    "connected";

  const netProfit =
    pnl?.netProfit ??
    0;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-panel">
      <header className="flex flex-col gap-4 border-b border-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Radio
              size={18}
              className="text-primary"
            />

            <h2 className="text-lg font-semibold text-text-primary">
              System Overview
            </h2>
          </div>

          <p className="mt-1 text-sm text-text-muted">
            Live operational status across execution, exchanges and profitability.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            label={
              backendConnected
                ? "Platform Online"
                : "Platform Offline"
            }
            tone={
              backendConnected
                ? "positive"
                : "negative"
            }
          />

          <StatusBadge
            label={
              health?.status ??
              "NO_DATA"
            }
            tone={
              getHealthTone(
                health?.status,
              )
            }
          />
        </div>
      </header>

      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewMetric
          label="Backend"
          value={
            backendConnected
              ? "Connected"
              : formatSocketStatus(
                  socketStatus,
                )
          }
          description="Frontend API and socket link"
          icon={
            backendConnected
              ? <Server size={18} />
              : <WifiOff size={18} />
          }
          tone={
            backendConnected
              ? "positive"
              : socketStatus ===
                  "connecting"
                ? "warning"
                : "negative"
          }
        />

        <OverviewMetric
          label="Socket"
          value={
            formatSocketStatus(
              socketStatus,
            )
          }
          description="Real-time market stream"
          icon={
            socketStatus ===
            "connected"
              ? <Wifi size={18} />
              : <WifiOff size={18} />
          }
          tone={
            socketStatus ===
            "connected"
              ? "positive"
              : socketStatus ===
                  "connecting"
                ? "warning"
                : "negative"
          }
        />

        <OverviewMetric
          label="Verified Read Access"
          value={`${verifiedExecutionAdapters}/${totalExchanges}`}
          description={`${healthyExchanges} execution-health reports healthy; LIVE disabled`}
          icon={
            <Activity size={18} />
          }
          tone={
            totalExchanges > 0 &&
            verifiedExecutionAdapters ===
              totalExchanges
              ? "positive"
              : verifiedExecutionAdapters > 0
                ? "warning"
                : "negative"
          }
        />

        <OverviewMetric
          label="Total Executions"
          value={String(
            metrics?.totalExecutions ??
            0,
          )}
          description="Recorded live attempts"
          icon={
            <Activity size={18} />
          }
        />

        <OverviewMetric
          label="Live Opportunities"
          value={String(
            actionableOpportunities,
          )}
          description={`${executionOpportunities} ready to execute`}
          icon={
            <TrendingUp size={18} />
          }
          tone={
            executionOpportunities > 0
              ? "positive"
              : actionableOpportunities > 0
                ? "warning"
                : "neutral"
          }
        />

        <OverviewMetric
          label="Active Alerts"
          value={String(
            activeAlerts,
          )}
          description="Health and execution warnings"
          icon={
            <Bell size={18} />
          }
          tone={
            activeAlerts === 0
              ? "positive"
              : activeAlerts <= 2
                ? "warning"
                : "negative"
          }
        />

        <OverviewMetric
          label="Completed Cycles"
          value={String(
            pnl?.completedCycles ??
            0,
          )}
          description={`${pnl?.winRatePercent.toFixed(
            1,
          ) ?? "0.0"}% win rate`}
          icon={
            <Activity size={18} />
          }
          tone={
            (
              pnl?.completedCycles ??
              0
            ) > 0
              ? "positive"
              : "neutral"
          }
        />

        <OverviewMetric
          label="Net P&L"
          value={`₹${formatCurrency(
            netProfit,
          )}`}
          description={`₹${formatCurrency(
            pnl?.totalFees ??
              0,
          )} total fees`}
          icon={
            <CircleDollarSign
              size={18}
            />
          }
          tone={
            netProfit > 0
              ? "positive"
              : netProfit < 0
                ? "negative"
                : "neutral"
          }
        />
      </div>
    </section>
  );
}

interface OverviewMetricProps {
  label: string;

  value: string;

  description: string;

  icon:
    React.ReactNode;

  tone?: OverviewTone;
}

function OverviewMetric({
  label,
  value,
  description,
  icon,
  tone = "neutral",
}: OverviewMetricProps) {
  const config =
    getToneConfig(
      tone,
    );

  return (
    <article className="rounded-xl border border-border bg-panel-light/35 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
            {label}
          </p>

          <p
            className={`mt-2 text-xl font-semibold tracking-tight ${config.valueClassName}`}
          >
            {value}
          </p>
        </div>

        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${config.iconClassName}`}
        >
          {icon}
        </div>
      </div>

      <p className="mt-3 text-xs text-text-muted">
        {description}
      </p>
    </article>
  );
}

interface StatusBadgeProps {
  label: string;

  tone: OverviewTone;
}

function StatusBadge({
  label,
  tone,
}: StatusBadgeProps) {
  const config =
    getToneConfig(
      tone,
    );

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${config.badgeClassName}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${config.dotClassName}`}
      />

      {label.replaceAll(
        "_",
        " ",
      )}
    </span>
  );
}

function calculateActiveAlerts(
  exchanges: Array<{
    credentialsConfigured: boolean;

    authenticationVerified: boolean;

    exchangeApiReachable: boolean;

    readOnlyVerificationFresh: boolean;

    status:
      | "HEALTHY"
      | "DEGRADED"
      | "UNHEALTHY"
      | "NO_DATA";
  }>,
  executions: Array<{
    status: string;

    failureReason:
      | string
      | null;
  }>,
): number {
  const exchangeAlerts =
    exchanges.filter(
      (exchange) =>
        !exchange.credentialsConfigured ||
        !exchange.authenticationVerified ||
        !exchange.exchangeApiReachable ||
        !exchange.readOnlyVerificationFresh ||
        exchange.status ===
          "DEGRADED" ||
        exchange.status ===
          "UNHEALTHY",
    ).length;

  const executionAlerts =
    executions.filter(
      (execution) =>
        execution.status ===
          "FAILED" ||
        execution.status ===
          "REJECTED" ||
        execution.status ===
          "TIMED_OUT" ||
        execution.failureReason !==
          null,
    ).length;

  return (
    exchangeAlerts +
    executionAlerts
  );
}

function formatSocketStatus(
  status: string,
): string {
  switch (status) {
    case "connected":
      return "Connected";

    case "connecting":
      return "Connecting";

    default:
      return "Disconnected";
  }
}

function getHealthTone(
  status:
    | "HEALTHY"
    | "DEGRADED"
    | "UNHEALTHY"
    | "NO_DATA"
    | undefined,
): OverviewTone {
  switch (status) {
    case "HEALTHY":
      return "positive";

    case "DEGRADED":
      return "warning";

    case "UNHEALTHY":
      return "negative";

    default:
      return "neutral";
  }
}

function getToneConfig(
  tone: OverviewTone,
) {
  switch (tone) {
    case "positive":
      return {
        valueClassName:
          "text-emerald-400",

        iconClassName:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",

        badgeClassName:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",

        dotClassName:
          "bg-emerald-400",
      };

    case "warning":
      return {
        valueClassName:
          "text-amber-400",

        iconClassName:
          "border-amber-500/30 bg-amber-500/10 text-amber-400",

        badgeClassName:
          "border-amber-500/30 bg-amber-500/10 text-amber-400",

        dotClassName:
          "bg-amber-400",
      };

    case "negative":
      return {
        valueClassName:
          "text-red-400",

        iconClassName:
          "border-red-500/30 bg-red-500/10 text-red-400",

        badgeClassName:
          "border-red-500/30 bg-red-500/10 text-red-400",

        dotClassName:
          "bg-red-400",
      };

    default:
      return {
        valueClassName:
          "text-text-primary",

        iconClassName:
          "border-border bg-panel-light text-primary",

        badgeClassName:
          "border-border bg-panel-light text-text-muted",

        dotClassName:
          "bg-text-muted",
      };
  }
}

function formatCurrency(
  value: number,
): string {
  if (
    !Number.isFinite(value)
  ) {
    return "0.00";
  }

  return new Intl.NumberFormat(
    "en-IN",
    {
      minimumFractionDigits:
        2,

      maximumFractionDigits:
        2,
    },
  ).format(
    value,
  );
}
