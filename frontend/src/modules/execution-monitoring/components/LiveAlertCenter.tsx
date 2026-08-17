import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  CircleAlert,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";

import {
  useOpportunities,
} from "@/modules/arbitrage/hooks/useOpportunities";

import {
  useExecutionHealth,
  useRecentExecutions,
} from "../hooks/useExecutionMonitoring";

type AlertSeverity =
  | "critical"
  | "warning"
  | "opportunity"
  | "info";

interface MonitoringAlert {
  id: string;

  severity:
    AlertSeverity;

  title: string;

  message: string;

  timestamp: number;
}

const MAXIMUM_ALERTS =
  10;

export function LiveAlertCenter() {
  const healthQuery =
    useExecutionHealth();

  const historyQuery =
    useRecentExecutions(
      30,
    );

  const opportunityQuery =
    useOpportunities();

  const isFetching =
    healthQuery.isFetching ||
    historyQuery.isFetching ||
    opportunityQuery.isFetching;

  const error =
    healthQuery.error ??
    historyQuery.error ??
    opportunityQuery.error;

  const alerts =
    createAlerts({
      health:
        healthQuery.data,

      executions:
        historyQuery.data
          ?.executions ??
        [],

      opportunities:
        opportunityQuery.data
          ?.data ??
        [],
    })
      .sort(
        (
          first,
          second,
        ) =>
          second.timestamp -
          first.timestamp,
      )
      .slice(
        0,
        MAXIMUM_ALERTS,
      );

  const refreshAll =
    async () => {
      await Promise.all([
        healthQuery.refetch(),
        historyQuery.refetch(),
        opportunityQuery.refetch(),
      ]);
    };

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-panel">
      <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <Bell
              size={18}
              className="text-primary"
            />

            <h2 className="text-lg font-semibold text-text-primary">
              Live Alert Center
            </h2>
          </div>

          <p className="mt-1 text-sm text-text-muted">
            Execution failures, exchange health warnings and actionable opportunities.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="rounded-full border border-border bg-panel-light px-3 py-1 text-xs font-medium text-text-muted">
            {alerts.length} alerts
          </span>

          <button
            type="button"
            onClick={() => {
              void refreshAll();
            }}
            disabled={
              isFetching
            }
            className="flex items-center gap-2 rounded-md border border-border bg-panel-light px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              size={14}
              className={
                isFetching
                  ? "animate-spin"
                  : undefined
              }
            />

            Refresh
          </button>
        </div>
      </header>

      {error ? (
        <div className="flex min-h-52 items-center justify-center gap-3 px-6 text-center text-sm text-red-400">
          <CircleAlert
            size={18}
          />

          {error instanceof Error
            ? error.message
            : "Unable to load monitoring alerts."}
        </div>
      ) : alerts.length ===
        0 ? (
        <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
            <CheckCircle2
              size={22}
              className="text-emerald-400"
            />
          </div>

          <div>
            <p className="text-sm font-medium text-text-primary">
              No active alerts
            </p>

            <p className="mt-1 text-xs text-text-muted">
              Execution and exchange conditions are currently clear.
            </p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {alerts.map(
            (
              alert,
            ) => (
              <AlertRow
                key={
                  alert.id
                }
                alert={
                  alert
                }
              />
            ),
          )}
        </div>
      )}
    </section>
  );
}

function AlertRow({
  alert,
}: {
  alert:
    MonitoringAlert;
}) {
  const config =
    getSeverityConfig(
      alert.severity,
    );

  const Icon =
    config.icon;

  return (
    <article className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-panel-light/40">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${config.containerClassName}`}
      >
        <Icon
          size={17}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary">
              {alert.title}
            </h3>

            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${config.badgeClassName}`}
            >
              {config.label}
            </span>
          </div>

          <span className="shrink-0 text-xs text-text-muted">
            {formatAlertTime(
              alert.timestamp,
            )}
          </span>
        </div>

        <p className="mt-2 text-sm text-text-muted">
          {alert.message}
        </p>
      </div>
    </article>
  );
}

function createAlerts({
  health,
  executions,
  opportunities,
}: {
  health:
    | {
        status:
          | "HEALTHY"
          | "DEGRADED"
          | "UNHEALTHY"
          | "NO_DATA";

        exchanges: Array<{
          exchange: string;

          status:
            | "HEALTHY"
            | "DEGRADED"
            | "UNHEALTHY"
            | "NO_DATA";

          adapterConnected:
            boolean;

          credentialsConfigured:
            boolean;

          authenticationVerified:
            boolean;

          exchangeApiReachable:
            boolean;

          readOnlyVerificationFresh:
            boolean;

          liveExecutionEnabled:
            boolean;

          verificationState:
            | "NOT_CONFIGURED"
            | "CONFIGURED_UNVERIFIED"
            | "VERIFICATION_STALE"
            | "VERIFIED";

          reasons:
            string[];
        }>;
      }
    | undefined;

  executions: Array<{
    id: string;

    timestamp: number;

    exchange: string;

    market: string;

    status: string;

    failureReason:
      | string
      | null;

    message:
      | string
      | null;
  }>;

  opportunities: Array<{
    id: string;

    timestamp: number;

    market: string;

    buyExchange: string;

    sellExchange: string;

    decision:
      | "EXECUTE"
      | "REVIEW"
      | "SKIP";

    netProfitPercent: number;
  }>;
}): MonitoringAlert[] {
  const alerts:
    MonitoringAlert[] = [];

  for (
    const exchange
    of health?.exchanges ??
    []
  ) {
    if (
      !exchange.credentialsConfigured
    ) {
      alerts.push({
        id:
          `exchange-not-configured-${exchange.exchange}`,

        severity:
          "critical",

        title:
          `${formatExchange(
            exchange.exchange,
          )} execution not configured`,

        message:
          "Required execution credentials are not configured. LIVE execution remains blocked.",

        timestamp:
          Date.now(),
      });

      continue;
    }

    if (
      !exchange.authenticationVerified ||
      !exchange.exchangeApiReachable ||
      !exchange.readOnlyVerificationFresh
    ) {
      alerts.push({
        id:
          `exchange-unverified-${exchange.exchange}`,

        severity:
          "warning",

        title:
          `${formatExchange(
            exchange.exchange,
          )} read verification ${
            exchange.verificationState ===
            "VERIFICATION_STALE"
              ? "stale"
              : "unavailable"
          }`,

        message:
          exchange.reasons[0] ??
          "Credentials are configured, but fresh authenticated read-only API evidence is unavailable. LIVE execution remains blocked.",

        timestamp:
          Date.now(),
      });

      continue;
    }

    if (
      !exchange.liveExecutionEnabled
    ) {
      alerts.push({
        id:
          `exchange-live-disabled-${exchange.exchange}`,

        severity:
          "info",

        title:
          `${formatExchange(
            exchange.exchange,
          )} read access verified`,

        message:
          "Authenticated read-only access is fresh. LIVE execution capability remains disabled.",

        timestamp:
          Date.now(),
      });

      continue;
    }

    if (
      !exchange.adapterConnected
    ) {
      alerts.push({
        id:
          `exchange-verification-unavailable-${exchange.exchange}`,

        severity:
          "critical",

        title:
          `${formatExchange(
            exchange.exchange,
          )} execution verification unavailable`,

        message:
          `Strict execution connectivity is unavailable despite ${exchange.verificationState.replaceAll(
            "_",
            " ",
          )} evidence. LIVE execution remains blocked.`,

        timestamp:
          Date.now(),
      });

      continue;
    }

    if (
      exchange.status ===
      "UNHEALTHY"
    ) {
      alerts.push({
        id:
          `exchange-unhealthy-${exchange.exchange}`,

        severity:
          "critical",

        title:
          `${formatExchange(
            exchange.exchange,
          )} unhealthy`,

        message:
          exchange.reasons[0] ??
          "Execution metrics exceeded critical limits.",

        timestamp:
          Date.now(),
      });
    } else if (
      exchange.status ===
      "DEGRADED"
    ) {
      alerts.push({
        id:
          `exchange-degraded-${exchange.exchange}`,

        severity:
          "warning",

        title:
          `${formatExchange(
            exchange.exchange,
          )} degraded`,

        message:
          exchange.reasons[0] ??
          "Execution performance requires attention.",

        timestamp:
          Date.now(),
      });
    }
  }

  for (
    const execution
    of executions
  ) {
    const isFailure =
      execution.status ===
        "FAILED" ||
      execution.status ===
        "REJECTED" ||
      execution.status ===
        "TIMED_OUT";

    if (!isFailure) {
      continue;
    }

    alerts.push({
      id:
        `execution-${execution.id}`,

      severity:
        execution.status ===
        "TIMED_OUT"
          ? "warning"
          : "critical",

      title:
        `${execution.market} ${execution.status.replaceAll(
          "_",
          " ",
        )}`,

      message:
        execution.failureReason ??
        execution.message ??
        `${formatExchange(
          execution.exchange,
        )} execution did not complete successfully.`,

      timestamp:
        execution.timestamp,
    });
  }

  for (
    const opportunity
    of opportunities
  ) {
    if (
      opportunity.decision !==
      "EXECUTE"
    ) {
      continue;
    }

    alerts.push({
      id:
        `opportunity-${opportunity.id}`,

      severity:
        "opportunity",

      title:
        `${opportunity.market} execution opportunity`,

      message:
        `Buy on ${formatExchange(
          opportunity.buyExchange,
        )}, sell on ${formatExchange(
          opportunity.sellExchange,
        )}; estimated net return ${opportunity.netProfitPercent.toFixed(
          3,
        )}%.`,

      timestamp:
        opportunity.timestamp,
    });
  }

  return alerts;
}

function getSeverityConfig(
  severity:
    AlertSeverity,
) {
  switch (severity) {
    case "critical":
      return {
        label:
          "Critical",

        icon:
          ShieldAlert,

        containerClassName:
          "border-red-500/30 bg-red-500/10 text-red-400",

        badgeClassName:
          "border-red-500/30 bg-red-500/10 text-red-400",
      };

    case "warning":
      return {
        label:
          "Warning",

        icon:
          AlertTriangle,

        containerClassName:
          "border-amber-500/30 bg-amber-500/10 text-amber-400",

        badgeClassName:
          "border-amber-500/30 bg-amber-500/10 text-amber-400",
      };

    case "opportunity":
      return {
        label:
          "Opportunity",

        icon:
          TrendingUp,

        containerClassName:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",

        badgeClassName:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
      };

    default:
      return {
        label:
          "Info",

        icon:
          Bell,

        containerClassName:
          "border-brand/30 bg-brand/10 text-brand",

        badgeClassName:
          "border-brand/30 bg-brand/10 text-brand",
      };
  }
}

function formatAlertTime(
  timestamp: number,
): string {
  if (
    !Number.isFinite(
      timestamp,
    ) ||
    timestamp <= 0
  ) {
    return "Unknown";
  }

  const differenceMs =
    Date.now() -
    timestamp;

  if (
    differenceMs >= 0 &&
    differenceMs < 60_000
  ) {
    return "Just now";
  }

  if (
    differenceMs >= 0 &&
    differenceMs < 3_600_000
  ) {
    return `${Math.floor(
      differenceMs /
      60_000,
    )}m ago`;
  }

  return new Date(
    timestamp,
  ).toLocaleString();
}

function formatExchange(
  exchange: string,
): string {
  const normalized =
    exchange
      .trim()
      .toLowerCase();

  if (
    normalized ===
    "coindcx"
  ) {
    return "CoinDCX";
  }

  if (
    normalized ===
    "binance"
  ) {
    return "Binance";
  }

  if (
    normalized ===
    "bybit"
  ) {
    return "Bybit";
  }

  if (
    normalized ===
    "unocoin"
  ) {
    return "UnoCoin";
  }

  if (
    normalized ===
    "coinswitch"
  ) {
    return "CoinSwitch";
  }

  return exchange;
}
