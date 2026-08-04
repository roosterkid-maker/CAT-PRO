import { useEffect, useMemo, useState } from "react";

import { useSystemHealth } from "@/modules/system-health/hooks/useSystemHealth";

export default function Header() {
  const [time, setTime] = useState(
    new Date(),
  );

  const {
    data: healthResponse,
    isLoading,
    isError,
  } = useSystemHealth();

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const exchanges =
    healthResponse?.data.exchanges ?? [];

  const exchangeStatus = useMemo(() => {
    return new Map(
      exchanges.map((exchange) => [
        exchange.name
          .trim()
          .toLowerCase(),
        exchange.connected,
      ]),
    );
  }, [exchanges]);

  const connectedCount =
    exchanges.filter(
      (exchange) => exchange.connected,
    ).length;

  const totalExchanges =
    exchanges.length;

  const allConnected =
    totalExchanges > 0 &&
    connectedCount === totalExchanges;

  const terminalState:
    | "live"
    | "degraded"
    | "loading"
    | "offline" = isLoading
    ? "loading"
    : isError
      ? "offline"
      : allConnected
        ? "live"
        : "degraded";

  return (
    <header className="flex min-h-20 items-center justify-between gap-6 border-b border-border-default bg-panel px-8 py-3">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-wide text-text-primary">
          CAT PRO
        </h1>

        <p className="mt-1 text-sm text-text-muted">
          Execution Intelligence Platform
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <TerminalChip
          color={
            terminalState === "live"
              ? "green"
              : terminalState === "loading"
                ? "blue"
                : terminalState === "degraded"
                  ? "yellow"
                  : "red"
          }
          label={
            terminalState === "live"
              ? "LIVE"
              : terminalState === "loading"
                ? "CONNECTING"
                : terminalState === "degraded"
                  ? "DEGRADED"
                  : "OFFLINE"
          }
        />

        <ExchangeChip
          name="CoinDCX"
          connected={getExchangeStatus(
            exchangeStatus,
            "coindcx",
          )}
          loading={isLoading}
        />

        <ExchangeChip
          name="Binance"
          connected={getExchangeStatus(
            exchangeStatus,
            "binance",
          )}
          loading={isLoading}
        />

        <ExchangeChip
          name="Bybit"
          connected={getExchangeStatus(
            exchangeStatus,
            "bybit",
          )}
          loading={isLoading}
        />

        <TerminalChip
          color="blue"
          label="v1.1"
        />

        <div className="min-w-24 text-right">
          <p className="text-xs uppercase tracking-wide text-text-muted">
            Local Time
          </p>

          <p className="font-mono text-lg font-semibold tabular-nums text-text-primary">
            {time.toLocaleTimeString(
              "en-IN",
              {
                hour12: false,
              },
            )}
          </p>
        </div>
      </div>
    </header>
  );
}

interface ExchangeChipProps {
  name: string;
  connected: boolean | undefined;
  loading: boolean;
}

function ExchangeChip({
  name,
  connected,
  loading,
}: ExchangeChipProps) {
  if (loading) {
    return (
      <TerminalChip
        color="blue"
        label={`${name}...`}
      />
    );
  }

  return (
    <TerminalChip
      color={
        connected
          ? "green"
          : "red"
      }
      label={name}
    />
  );
}

interface TerminalChipProps {
  label: string;

  color:
    | "green"
    | "red"
    | "yellow"
    | "blue";
}

function TerminalChip({
  label,
  color,
}: TerminalChipProps) {
  const styles = {
    green:
      "border-success/30 bg-success/10 text-success",

    red:
      "border-danger/30 bg-danger/10 text-danger",

    yellow:
      "border-warning/30 bg-warning/10 text-warning",

    blue:
      "border-brand/30 bg-brand/10 text-brand",
  };

  return (
    <div
      className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${styles[color]}`}
    >
      ● {label}
    </div>
  );
}

function getExchangeStatus(
  exchangeStatus: Map<string, boolean>,
  exchangeName: string,
): boolean | undefined {
  return exchangeStatus.get(
    exchangeName
      .trim()
      .toLowerCase(),
  );
}