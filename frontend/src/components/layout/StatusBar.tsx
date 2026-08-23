import {
  Activity,
  Database,
  Server,
  Wifi,
} from "lucide-react";

import {
  useSystemHealth,
} from "@/modules/system-health/hooks/useSystemHealth";

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

  SCANNING: {
    label:
      "Scanning",

    dotClassName:
      "bg-brand",

    textClassName:
      "text-brand",
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
    useSystemHealth();

  const health =
    healthQuery.data
      ?.data;

  const allMarketDataConnected =
    Boolean(
      health &&
      health.exchanges.length >
        0 &&
      health.exchanges.every(
        (exchange) =>
          exchange.connected,
      ),
    );

  const executableMarketDataAvailable =
    (
      health?.cache
        .executableQuotes ??
      0
    ) >
    0;

  const readinessStatus =
    healthQuery.isError
      ? "UNHEALTHY"
      : health ===
          undefined
        ? "NO_DATA"
        : health.trading.ready
          ? "HEALTHY"
          : allMarketDataConnected &&
              executableMarketDataAvailable
            ? "SCANNING"
            : "DEGRADED";

  const healthConfig =
    healthStatusConfig[
      readinessStatus
    ];

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
            <Database
              size={13}
            />
          }
          label="Executable quotes"
          value={String(
            health
              ?.cache
              .executableQuotes ??
            0,
          )}
          valueClassName={
            (health
              ?.cache
              .executableQuotes ??
            0) >
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
          label="Shared markets"
          value={String(
            health
              ?.engine
              .sharedMarkets ??
            0,
          )}
        />
      </div>

      <div className="ml-5 hidden shrink-0 items-center gap-2 xl:flex">
        <span className="text-text-muted">
          Read Verified
        </span>

        <ExchangeBadge
          name="CoinDCX"
          connected={
            getExchangeConnection(
              health?.exchanges,
              "coindcx",
            )
          }
        />

        <ExchangeBadge
          name="Binance"
          connected={
            getExchangeConnection(
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

function getExchangeConnection(
  exchanges:
    | Array<{
        name: string;
        connected: boolean;
      }>
    | undefined,
  exchangeName: string,
): boolean {
  const status =
    exchanges?.find(
      (exchange) =>
        exchange.name
          .trim()
          .toLowerCase() ===
        exchangeName,
    );

  return Boolean(
    status
      ?.connected,
  );
}
