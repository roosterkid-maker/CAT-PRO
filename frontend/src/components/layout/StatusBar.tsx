import {
  Activity,
  CircleDollarSign,
  Server,
  TrendingUp,
  Wifi,
} from "lucide-react";

import {
  useOpportunities,
} from "@/modules/arbitrage/hooks/useOpportunities";

import {
  useArbitragePnL,
  useExecutionHealth,
  useExecutionMetrics,
} from "@/modules/execution-monitoring/hooks/useExecutionMonitoring";

import {
  useSocketStore,
} from "@/store/socket.store";

const socketStatusConfig = {
  connected: {
    label:
      "Connected",

    dotClassName:
      "bg-success",

    textClassName:
      "text-success",
  },

  connecting: {
    label:
      "Connecting",

    dotClassName:
      "bg-warning",

    textClassName:
      "text-warning",
  },

  disconnected: {
    label:
      "Disconnected",

    dotClassName:
      "bg-danger",

    textClassName:
      "text-danger",
  },
} as const;

const healthStatusConfig = {
  HEALTHY: {
    label:
      "Healthy",

    dotClassName:
      "bg-success",

    textClassName:
      "text-success",
  },

  DEGRADED: {
    label:
      "Degraded",

    dotClassName:
      "bg-warning",

    textClassName:
      "text-warning",
  },

  UNHEALTHY: {
    label:
      "Unhealthy",

    dotClassName:
      "bg-danger",

    textClassName:
      "text-danger",
  },

  NO_DATA: {
    label:
      "No Data",

    dotClassName:
      "bg-text-muted",

    textClassName:
      "text-text-muted",
  },
} as const;

export default function StatusBar() {
  const socketStatus =
    useSocketStore(
      (state) =>
        state.status,
    );

  const socketConfig =
    socketStatusConfig[
      socketStatus
    ];

  const healthQuery =
    useExecutionHealth();

  const metricsQuery =
    useExecutionMetrics();

  const pnlQuery =
    useArbitragePnL(
      5,
    );

  const opportunityQuery =
    useOpportunities();

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

  const actionableOpportunities =
    opportunities.filter(
      (opportunity) =>
        opportunity.decision ===
          "EXECUTE" ||
        opportunity.decision ===
          "REVIEW",
    ).length;

  const healthConfig =
    healthStatusConfig[
      health?.status ??
      "NO_DATA"
    ];

  const netProfit =
    pnl?.netProfit ??
    0;

  const pnlClassName =
    netProfit > 0
      ? "text-success"
      : netProfit < 0
        ? "text-danger"
        : "text-text-muted";

  const backendConnected =
    socketStatus ===
    "connected";

  return (
    <footer className="cat-pro-status-bar flex h-10 shrink-0 items-center border-t px-4 text-xs text-text-muted">
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden sm:gap-4 xl:gap-5">
        <StatusItem
          className="hidden sm:flex"
          icon={
            <Server
              size={13}
            />
          }
          label="Backend"
          value={
            backendConnected
              ? "Connected"
              : socketConfig.label
          }
          dotClassName={
            socketConfig
              .dotClassName
          }
          valueClassName={
            socketConfig
              .textClassName
          }
        />

        <StatusItem
          icon={
            <Wifi
              size={13}
            />
          }
          label="Socket"
          value={
            socketConfig.label
          }
          dotClassName={
            socketConfig
              .dotClassName
          }
          valueClassName={
            socketConfig
              .textClassName
          }
        />

        <StatusItem
          icon={
            <Activity
              size={13}
            />
          }
          label="Execution"
          value={
            healthConfig.label
          }
          dotClassName={
            healthConfig
              .dotClassName
          }
          valueClassName={
            healthConfig
              .textClassName
          }
        />

        <TextMetric
          className="hidden sm:flex"
          icon={
            <TrendingUp
              size={13}
            />
          }
          label="Opportunities"
          value={String(
            actionableOpportunities,
          )}
          valueClassName={
            actionableOpportunities >
            0
              ? "text-success"
              : "text-text-muted"
          }
        />

        <TextMetric
          className="hidden md:flex"
          icon={
            <Activity
              size={13}
            />
          }
          label="Executions"
          value={String(
            metrics
              ?.totalExecutions ??
              0,
          )}
        />

        <TextMetric
          className="hidden lg:flex"
          icon={
            <CircleDollarSign
              size={13}
            />
          }
          label="Net P&L"
          value={`₹${formatCurrency(
            netProfit,
          )}`}
          valueClassName={
            pnlClassName
          }
        />
      </div>

      <div className="ml-5 hidden shrink-0 items-center gap-2 xl:flex">
        <span className="text-text-muted">
          Read Verified
        </span>

        <ExchangeBadge
          name="CoinDCX"
          connected={
            getExchangeVerification(
              health?.exchanges,
              "coindcx",
            )
          }
        />

        <ExchangeBadge
          name="Binance"
          connected={
            getExchangeVerification(
              health?.exchanges,
              "binance",
            )
          }
        />
      </div>
    </footer>
  );
}

interface StatusItemProps {
  className?: string;

  icon:
    React.ReactNode;

  label: string;

  value: string;

  dotClassName: string;

  valueClassName: string;
}

function StatusItem({
  className = "",
  icon,
  label,
  value,
  dotClassName,
  valueClassName,
}: StatusItemProps) {
  return (
    <div className={`shrink-0 items-center gap-1.5 ${className || "flex"}`}>
      <span className="text-text-muted">
        {icon}
      </span>

      <span>
        {label}
      </span>

      <span
        className={`h-1.5 w-1.5 rounded-full ${dotClassName}`}
      />

      <span
        className={`font-medium ${valueClassName}`}
      >
        {value}
      </span>
    </div>
  );
}

interface TextMetricProps {
  className?: string;

  icon:
    React.ReactNode;

  label: string;

  value: string;

  valueClassName?: string;
}

function TextMetric({
  className = "",
  icon,
  label,
  value,
  valueClassName =
    "text-text-primary",
}: TextMetricProps) {
  return (
    <div className={`shrink-0 items-center gap-1.5 ${className || "flex"}`}>
      <span className="text-text-muted">
        {icon}
      </span>

      <span>
        {label}
      </span>

      <span
        className={`font-mono font-semibold ${valueClassName}`}
      >
        {value}
      </span>
    </div>
  );
}

interface ExchangeBadgeProps {
  name: string;

  connected: boolean;
}

function ExchangeBadge({
  name,
  connected,
}: ExchangeBadgeProps) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-border-default bg-panel-light px-2 py-1">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          connected
            ? "bg-success"
            : "bg-danger"
        }`}
      />

      <span
        className={
          connected
            ? "text-text-primary"
            : "text-text-muted"
        }
      >
        {name}
      </span>
    </span>
  );
}

function getExchangeVerification(
  exchanges:
    | Array<{
        exchange: string;

        authenticationVerified:
          boolean;

        exchangeApiReachable:
          boolean;

        readOnlyVerificationFresh:
          boolean;
      }>
    | undefined,
  exchangeName: string,
): boolean {
  const status =
    exchanges?.find(
      (exchange) =>
        exchange.exchange
          .trim()
          .toLowerCase() ===
        exchangeName,
    );

  return Boolean(
    status
      ?.authenticationVerified &&
    status
      .exchangeApiReachable &&
    status
      .readOnlyVerificationFresh,
  );
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
