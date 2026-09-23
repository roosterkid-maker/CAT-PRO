import { useEffect, useMemo, useState } from "react";

import { Activity, Moon, Sun } from "lucide-react";

import type { AppPage } from "@/app/AppRouter";
import { preloadAppPage } from "@/app/routes";
import { useSystemHealth } from "@/modules/system-health/hooks/useSystemHealth";

import ExchangeFleetMenu from "./ExchangeFleetMenu";

interface HeaderProps {
  currentPage: AppPage;
  onPageChange: (page: AppPage) => void;
}

const NAV_TABS: ReadonlyArray<{ label: string; page: AppPage }> = [
  { label: "Bot", page: "bot" },
  { label: "Trade Intel", page: "trade-intelligence" },
  { label: "Markets", page: "markets" },
  { label: "Exchanges", page: "exchange-health" },
  { label: "Arbitrage", page: "arbitrage" },
  { label: "Execution", page: "execution-monitoring" },
  { label: "Alerts", page: "alerts" },
  { label: "System", page: "system-health" },
  { label: "Recovery", page: "recovery" },
];

type ThemeMode = "dark" | "light";

const THEME_STORAGE_KEY = "cat-pro-theme";

function readStoredTheme(): ThemeMode {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "light"
      ? "light"
      : "dark";
  } catch {
    return "dark";
  }
}

function useThemeMode(): [ThemeMode, () => void] {
  const [theme, setTheme] = useState<ThemeMode>(readStoredTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage can be unavailable (private mode); the theme still applies.
    }
  }, [theme]);

  return [
    theme,
    () => setTheme((current) => (current === "dark" ? "light" : "dark")),
  ];
}

export default function Header({ currentPage, onPageChange }: HeaderProps) {
  const {
    data: healthResponse,
    isLoading,
    isError,
    dataUpdatedAt,
  } = useSystemHealth();
  const [theme, toggleTheme] = useThemeMode();

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
    <header className="term-header">
      <div className="term-topbar">
        <div className="term-brand">
          <span aria-hidden="true" className="term-brand-mark">
            <Activity size={16} strokeWidth={2.4} />
          </span>
          <span className="term-brand-name">CAT PRO</span>
          <span className="term-brand-sub">/ Terminal</span>
        </div>

        <div className="term-exchange-slot">
          <ExchangeFleetMenu
            onOpenExchangeHealth={() => onPageChange("exchange-health")}
            connectedMarketDataCount={connectedCount}
            totalExchangeCount={totalExchanges}
            marketDataLoading={isLoading}
            marketDataUnavailable={isError}
          />
        </div>

        <div className="term-topbar-actions">
          <LiveClock />
          <button
            type="button"
            className="term-icon-button"
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            onClick={toggleTheme}
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>

      <nav aria-label="Primary navigation" className="term-tabs">
        {NAV_TABS.map((tab) => (
          <button
            key={tab.page}
            type="button"
            className="term-tab"
            aria-current={tab.page === currentPage ? "page" : undefined}
            data-active={tab.page === currentPage}
            onClick={() => onPageChange(tab.page)}
            onFocus={() => preloadAppPage(tab.page)}
            onPointerEnter={() => preloadAppPage(tab.page)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="term-strip">
        <span className="term-strip-item" data-state={terminalState}>
          <span aria-hidden="true" className="term-strip-dot" />
          {terminalState === "live"
            ? "Printing"
            : terminalState === "loading"
              ? "Connecting"
              : terminalState === "degraded"
                ? "Degraded"
                : "Offline"}
        </span>
        <span className="term-strip-item">
          <span className="term-strip-key">Feeds</span>
          {connectedCount}/{totalExchanges || "—"}
        </span>
        <SessionUptime />
        <span className="term-strip-item">
          <span className="term-strip-key">Tick</span>
          <TickAge updatedAt={dataUpdatedAt} />
        </span>
        <span className="term-strip-tag">v20.9 · live-only</span>
      </div>
    </header>
  );
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}

const SESSION_STARTED_AT = Date.now();

function SessionUptime() {
  const now = useNow(1_000);
  const totalSeconds = Math.floor((now - SESSION_STARTED_AT) / 1_000);
  const pad = (value: number) => String(value).padStart(2, "0");

  return (
    <span className="term-strip-item">
      <span className="term-strip-key">Up</span>
      {pad(Math.floor(totalSeconds / 3_600))}:{pad(Math.floor((totalSeconds % 3_600) / 60))}:
      {pad(totalSeconds % 60)}
    </span>
  );
}

function TickAge({ updatedAt }: { updatedAt: number }) {
  const now = useNow(1_000);

  if (!updatedAt) {
    return <>— ago</>;
  }

  return <>{Math.max(0, Math.round((now - updatedAt) / 1_000))}s ago</>;
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
    <span className="term-clock">
      <span className="term-strip-key">Local</span>
      {formattedTime}
    </span>
  );
}
