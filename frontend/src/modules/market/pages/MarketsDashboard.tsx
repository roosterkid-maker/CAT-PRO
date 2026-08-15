import {
  Activity,
  BarChart3,
  Database,
  Radio,
  RefreshCw,
} from "lucide-react";

import {
  useEffect,
  useState,
} from "react";

import FreshnessDiagnosticsPanel
  from "@/modules/market-freshness/components/FreshnessDiagnosticsPanel";

import {
  useMarketStore,
} from "@/store/market.store";

import {
  useSocketStore,
} from "@/store/socket.store";

import {
  refreshMarketSnapshot,
} from "@/socket/socketManager";

import MarketTable
  from "../components/MarketTable";

export default function MarketsDashboard() {
  const marketMap =
    useMarketStore(
      (state) =>
        state.markets,
    );

  const socketStatus =
    useSocketStore(
      (state) =>
        state.status,
    );

  const snapshotStatus =
    useMarketStore(
      (state) =>
        state.snapshotStatus,
    );

  const snapshotCount =
    useMarketStore(
      (state) =>
        state.snapshotCount,
    );

  const snapshotReceivedAt =
    useMarketStore(
      (state) =>
        state.snapshotReceivedAt,
    );

  const markets =
    Object.values(
      marketMap,
    );

  const [
    now,
    setNow,
  ] = useState(
    () =>
      Date.now(),
  );

  useEffect(
    () => {
      const intervalId =
        window.setInterval(
          () => {
            setNow(
              Date.now(),
            );
          },
          1_000,
        );

      return () => {
        window.clearInterval(
          intervalId,
        );
      };
    },
    [],
  );

  const executableCount =
    markets.filter(
      (market) =>
        market.executable,
    ).length;

  const freshCount =
    markets.filter(
      (
        market,
      ) => {
        const age =
          now -
          market.timestamp;

        return (
          age >= 0 &&
          age <= 10_000
        );
      },
    ).length;

  const exchangeCount =
    new Set(
      markets.map(
        (market) =>
          market.exchange
            .trim()
            .toLowerCase(),
      ),
    ).size;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border-default bg-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-brand">
              <Radio className="size-4" />

              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                Market Operations
              </p>
            </div>

            <h1 className="mt-2 text-3xl font-bold text-text-primary">
              Multi-Exchange Market Evidence
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              Real-time normalized market quotes from the existing CAT PRO
              market-data pipeline. Executable bid/ask evidence is displayed
              separately from indicative last-price data.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <StatusBadge
              label="SOCKET"
              status={
                socketStatus
              }
            />

            <SnapshotStatusBadge
              status={
                snapshotStatus
              }
            />

            <button
              type="button"
              disabled={
                snapshotStatus ===
                "loading"
              }
              onClick={() =>
                void refreshMarketSnapshot()
              }
              className="inline-flex items-center gap-2 rounded-md border border-border-default bg-panel-light px-3 py-2 text-xs font-semibold text-text-primary hover:border-brand/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                className={`size-4 ${
                  snapshotStatus ===
                  "loading"
                    ? "animate-spin"
                    : ""
                }`}
              />

              Refresh Snapshot
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            icon={
              <Database className="size-4 text-brand" />
            }
            label="Merged Rows"
            value={String(
              markets.length,
            )}
          />

          <MetricCard
            icon={
              <Activity className="size-4 text-success" />
            }
            label="Backend Executable"
            value={String(
              executableCount,
            )}
          />

          <MetricCard
            icon={
              <BarChart3 className="size-4 text-brand" />
            }
            label="UI Age ≤ 10s"
            value={String(
              freshCount,
            )}
          />

          <MetricCard
            icon={
              <Radio className="size-4 text-brand" />
            }
            label="Reporting Exchanges"
            value={String(
              exchangeCount,
            )}
          />

          <MetricCard
            icon={
              <Database className="size-4 text-brand" />
            }
            label="Snapshot Rows"
            value={
              snapshotCount ===
              null
                ? "Unavailable"
                : String(
                    snapshotCount,
                  )
            }
          />
        </div>

        <p className="mt-3 text-xs text-text-muted">
          UI Age is a browser-side display metric only.
          Backend execution freshness is governed by
          exchange-specific freshness rules shown below. The REST snapshot
          is merged by backend timestamp and never overwrites a newer socket
          update.
        </p>

        <p className="mt-1 text-xs text-text-muted">
          Snapshot received: {formatSnapshotTime(
            snapshotReceivedAt,
          )}
        </p>
      </section>

      <FreshnessDiagnosticsPanel />

      {
        markets.length ===
        0
          ? (
              <section className="rounded-xl border border-border-default bg-panel p-8 text-center">
                <p className="font-semibold text-text-primary">
                  {snapshotStatus ===
                  "loading"
                    ? "Loading backend market snapshot"
                    : snapshotStatus ===
                          "error" &&
                        socketStatus !==
                          "connected"
                      ? "Market evidence unavailable"
                      : "Waiting for backend market evidence"}
                </p>

                <p className="mt-2 text-sm text-text-muted">
                  No fake market rows are injected.
                  Quotes appear only from the existing
                  REST cache snapshot or Socket.IO ticker feed.
                </p>
              </section>
            )
          : (
              <MarketTable />
            )
      }
    </div>
  );
}

function StatusBadge({
  label,
  status,
}: {
  label: string;

  status:
    | "connecting"
    | "connected"
    | "disconnected";
}) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
        status ===
        "connected"
          ? "border-success/30 bg-success/10 text-success"
          : status ===
              "connecting"
            ? "border-warning/30 bg-warning/10 text-warning"
            : "border-danger/30 bg-danger/10 text-danger"
      }`}
    >
      {label} {status.toUpperCase()}
    </span>
  );
}

function SnapshotStatusBadge({
  status,
}: {
  status:
    | "idle"
    | "loading"
    | "ready"
    | "error";
}) {
  const className =
    status ===
    "ready"
      ? "border-success/30 bg-success/10 text-success"
      : status ===
            "loading"
        ? "border-warning/30 bg-warning/10 text-warning"
        : status ===
              "error"
          ? "border-danger/30 bg-danger/10 text-danger"
          : "border-border-default bg-panel-light text-text-muted";

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${className}`}
    >
      SNAPSHOT {status.toUpperCase()}
    </span>
  );
}

function formatSnapshotTime(
  value:
    | number
    | null,
): string {
  if (
    value === null ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return "Unavailable";
  }

  return new Date(
    value,
  ).toLocaleTimeString();
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon:
    React.ReactNode;

  label:
    string;

  value:
    string;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-4">
      <div className="flex items-center gap-2">
        {icon}

        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
          {label}
        </p>
      </div>

      <p className="mt-2 text-2xl font-bold tabular-nums text-text-primary">
        {value}
      </p>
    </div>
  );
}
