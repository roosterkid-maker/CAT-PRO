import { useEffect, useMemo, useState } from "react";

import type { AppPage } from "@/app/AppRouter";
import { useSystemHealth } from "@/modules/system-health/hooks/useSystemHealth";

import ExchangeFleetMenu from "./ExchangeFleetMenu";

interface HeaderProps {
  onPageChange: (page: AppPage) => void;
}

export default function Header({ onPageChange }: HeaderProps) {
  const {
    data: healthResponse,
    isLoading,
    isError,
  } = useSystemHealth();

  const exchanges = useMemo(
    () => healthResponse?.data.exchanges ?? [],
    [healthResponse?.data.exchanges],
  );

  const connectedCount = useMemo(
    () => exchanges.filter((exchange) => exchange.connected).length,
    [exchanges],
  );

  const totalExchanges = exchanges.length;
  const allConnected =
    totalExchanges > 0 && connectedCount === totalExchanges;

  const terminalState: "live" | "degraded" | "loading" | "offline" =
    isLoading
      ? "loading"
      : isError
        ? "offline"
        : allConnected
          ? "live"
          : "degraded";

  return (
    <header className="cat-pro-header min-h-20 border-b px-8 py-3">
      <div className="shrink-0">
        <h1 className="cat-pro-wordmark text-2xl font-bold">
          CAT PRO
        </h1>

        <p className="cat-pro-kicker mt-1 text-sm">
          Execution Intelligence Platform
        </p>
      </div>

      <FuturisticBotIdentity />

      <div className="flex flex-wrap items-center justify-end gap-3 justify-self-end">
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
              ? "MARKET DATA LIVE"
              : terminalState === "loading"
                ? "CONNECTING"
                : terminalState === "degraded"
                  ? "DEGRADED"
                  : "OFFLINE"
          }
        />

        <ExchangeFleetMenu
          onOpenExchangeHealth={() => onPageChange("exchange-health")}
        />

        <TerminalChip color="blue" label="V20.9" />
        <LiveClock />
      </div>
    </header>
  );
}

function FuturisticBotIdentity() {
  return (
    <div
      aria-label="HOPUN HFT BOT"
      className="hft-header-identity"
      role="img"
    >
      <span aria-hidden="true" className="hft-header-orbit hft-header-orbit-cyan" />
      <span aria-hidden="true" className="hft-header-orbit hft-header-orbit-magenta" />

      <span className="hft-header-title">
        <span>HOPUN</span>
        <span className="hft-header-title-accent">HFT</span>
        <span>BOT</span>
      </span>

      <span aria-hidden="true" className="hft-header-scanline" />
    </div>
  );
}

function LiveClock() {
  const [timestamp, setTimestamp] = useState<number>(() => Date.now());

  useEffect(() => {
    let timeoutId: number | undefined;

    const scheduleNextTick = () => {
      setTimestamp(Date.now());

      const delay = 1_000 - (Date.now() % 1_000);
      timeoutId = window.setTimeout(scheduleNextTick, delay);
    };

    scheduleNextTick();

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  const formattedTime = new Date(timestamp).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return (
    <div className="min-w-24 text-right">
      <p className="text-xs uppercase tracking-wide text-text-muted">
        Local Time
      </p>

      <p className="font-mono text-lg font-semibold tabular-nums text-text-primary">
        {formattedTime}
      </p>
    </div>
  );
}

interface TerminalChipProps {
  label: string;
  color: "green" | "red" | "yellow" | "blue";
}

function TerminalChip({ label, color }: TerminalChipProps) {
  const styles: Record<TerminalChipProps["color"], string> = {
    green: "border-success/30 bg-success/10 text-success",
    red: "border-danger/30 bg-danger/10 text-danger",
    yellow: "border-warning/30 bg-warning/10 text-warning",
    blue: "border-brand/30 bg-brand/10 text-brand",
  };

  return (
    <div
      className={`terminal-chip whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${styles[color]}`}
    >
      <span
        aria-hidden="true"
        className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle"
      />
      {label}
    </div>
  );
}
