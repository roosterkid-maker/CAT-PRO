import {
  Activity,
  AlertTriangle,
  Clock3,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import {
  useFreshnessDiagnostics,
} from "../hooks/useFreshnessDiagnostics";

import type {
  FreshnessRootCauseClassification,
} from "../types/FreshnessDiagnostics";

export default function FreshnessDiagnosticsPanel() {
  const {
    data:
      response,

    isPending,

    isError,

    isFetching,

    refetch,
  } =
    useFreshnessDiagnostics();

  const report =
    response?.data;

  if (
    isPending &&
    !report
  ) {
    return (
      <PanelState
        text="Loading backend freshness diagnostics…"
      />
    );
  }

  if (
    isError ||
    !report
  ) {
    return (
      <PanelState
        text="Freshness diagnostics unavailable"
        actionLabel="Retry"
        onAction={() =>
          void refetch()
        }
      />
    );
  }

  const classificationStyle =
    getClassificationStyle(
      report.classification,
    );

  return (
    <section className="rounded-xl border border-border-default bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-brand">
            <Activity className="size-4" />

            <p className="text-xs font-semibold uppercase tracking-[0.18em]">
              Backend Freshness Diagnostics
            </p>
          </div>

          <h2 className="mt-2 text-xl font-bold text-text-primary">
            Live-Feed Root Cause
          </h2>

          <p className="mt-2 max-w-4xl text-sm leading-6 text-text-muted">
            {
              report.primaryFinding
            }
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${classificationStyle}`}
          >
            {
              report.classification
            }
          </span>

          <button
            type="button"
            onClick={() =>
              void refetch()
            }
            disabled={
              isFetching
            }
            className="inline-flex items-center gap-2 rounded-md border border-border-default bg-panel-light px-3 py-2 text-xs font-semibold text-text-primary disabled:opacity-60"
          >
            <RefreshCw
              className={`size-4 ${
                isFetching
                  ? "animate-spin"
                  : ""
              }`}
            />

            Refresh
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          label="Fresh Coverage"
          value={`${report.cache.executableFreshnessPercent}%`}
        />

        <Metric
          label="Executable"
          value={String(
            report.cache.executableQuotes,
          )}
        />

        <Metric
          label="Fresh"
          value={String(
            report.cache.freshExecutableQuotes,
          )}
        />

        <Metric
          label="Stale"
          value={String(
            report.cache.staleExecutableQuotes,
          )}
        />

        <Metric
          label="Evicted Total"
          value={String(
            report.eviction.totalEvicted,
          )}
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <StatusCard
          icon={
            report.eviction.running
              ? (
                  <ShieldCheck className="size-4 text-success" />
                )
              : (
                  <AlertTriangle className="size-4 text-danger" />
                )
          }
          label="Stale Eviction"
          value={
            report.eviction.running
              ? "RUNNING"
              : "NOT RUNNING"
          }
          detail={`Every ${formatMs(
            report.eviction.intervalMs,
          )} · runs ${report.eviction.totalRuns}`}
        />

        <StatusCard
          icon={
            <Clock3 className="size-4 text-brand" />
          }
          label="Last Eviction Run"
          value={
            report.eviction.lastRunAt
              ? formatAge(
                  report.eviction.lastRunAt,
                )
              : "NO DATA"
          }
          detail={`Scanned ${report.eviction.totalScanned} · stale detected ${report.eviction.totalStale}`}
        />

        <StatusCard
          icon={
            <Activity className="size-4 text-brand" />
          }
          label="Diagnostic Mode"
          value={
            report.mode
          }
          detail="No policy mutation · no LIVE execution"
        />
      </div>

      <div className="mt-5 overflow-x-auto rounded-lg border border-border-default">
        <table className="min-w-full text-sm">
          <thead className="bg-panel-light text-left text-xs uppercase tracking-wide text-text-muted">
            <tr>
              <th className="px-4 py-3">
                Exchange
              </th>

              <th className="px-4 py-3">
                Cause
              </th>

              <th className="px-4 py-3 text-right">
                Freshness
              </th>

              <th className="px-4 py-3 text-right">
                Fresh / Exec
              </th>

              <th className="px-4 py-3 text-right">
                Fresh Books
              </th>

              <th className="px-4 py-3 text-right">
                P95 Quote Age
              </th>

              <th className="px-4 py-3 text-right">
                Limit
              </th>
            </tr>
          </thead>

          <tbody>
            {
              report.exchanges.map(
                (
                  exchange,
                ) => (
                  <tr
                    key={
                      exchange.exchange
                    }
                    className="border-t border-border-default"
                  >
                    <td className="px-4 py-3 font-semibold uppercase text-text-primary">
                      {
                        exchange.exchange
                      }
                    </td>

                    <td className="px-4 py-3 text-text-muted">
                      {
                        exchange.likelyCause
                      }
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-text-primary">
                      {
                        exchange.freshnessCoveragePercent
                      }
                      %
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-text-primary">
                      {
                        exchange.freshExecutableQuotes
                      }
                      /
                      {
                        exchange.executableQuotes
                      }
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-text-primary">
                      {
                        exchange.freshOrderBooks
                      }
                      /
                      {
                        exchange.orderBooks
                      }
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-text-primary">
                      {
                        formatNullableMs(
                          exchange.executableAge.p95Ms,
                        )
                      }
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-text-primary">
                      {
                        formatMs(
                          exchange.maximumQuoteAgeMs,
                        )
                      }
                    </td>
                  </tr>
                ),
              )
            }
          </tbody>
        </table>
      </div>

      {
        report.observations.length >
          0 &&
        (
          <div className="mt-5 grid gap-2 lg:grid-cols-2">
            {
              report.observations.map(
                (
                  observation,
                ) => (
                  <div
                    key={
                      observation
                    }
                    className="rounded-lg border border-border-default bg-panel-light px-4 py-3 text-sm leading-6 text-text-muted"
                  >
                    {
                      observation
                    }
                  </div>
                ),
              )
            }
          </div>
        )
      }

      <p className="mt-4 text-xs text-text-muted">
        Generated{" "}
        {
          new Date(
            report.generatedAt,
          ).toLocaleString()
        }
        {" "}· backend analyzer v
        {
          report.version
        }
        {" "}build{" "}
        {
          report.build
        }
      </p>
    </section>
  );
}

function Metric({
  label,
  value,
}: {
  label:
    string;

  value:
    string;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
        {label}
      </p>

      <p className="mt-2 text-2xl font-bold tabular-nums text-text-primary">
        {value}
      </p>
    </div>
  );
}

function StatusCard({
  icon,
  label,
  value,
  detail,
}: {
  icon:
    React.ReactNode;

  label:
    string;

  value:
    string;

  detail:
    string;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-4">
      <div className="flex items-center gap-2">
        {icon}

        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          {label}
        </p>
      </div>

      <p className="mt-2 font-semibold text-text-primary">
        {value}
      </p>

      <p className="mt-1 text-xs text-text-muted">
        {detail}
      </p>
    </div>
  );
}

function PanelState({
  text,
  actionLabel,
  onAction,
}: {
  text:
    string;

  actionLabel?:
    string;

  onAction?:
    () => void;
}) {
  return (
    <section className="rounded-xl border border-border-default bg-panel p-6 text-center">
      <p className="text-sm font-semibold text-text-primary">
        {text}
      </p>

      {
        actionLabel &&
        onAction
          ? (
              <button
                type="button"
                onClick={
                  onAction
                }
                className="mt-3 rounded-md border border-border-default bg-panel-light px-3 py-2 text-xs font-semibold text-text-primary"
              >
                {
                  actionLabel
                }
              </button>
            )
          : null
      }
    </section>
  );
}

function getClassificationStyle(
  classification:
    FreshnessRootCauseClassification,
): string {
  if (
    classification ===
    "HEALTHY"
  ) {
    return "border-success/30 bg-success/10 text-success";
  }

  if (
    classification ===
    "INSUFFICIENT_DATA"
  ) {
    return "border-border-default bg-panel-light text-text-muted";
  }

  return "border-warning/30 bg-warning/10 text-warning";
}

function formatMs(
  value:
    number,
): string {
  return value >=
    1_000
    ? `${Number(
        (
          value /
          1_000
        ).toFixed(
          2,
        ),
      )}s`
    : `${value}ms`;
}

function formatNullableMs(
  value:
    number |
    null,
): string {
  return value ===
    null
    ? "NO DATA"
    : formatMs(
        value,
      );
}

function formatAge(
  timestamp:
    number,
): string {
  const ageMs =
    Math.max(
      0,
      Date.now() -
        timestamp,
    );

  return `${formatMs(
    ageMs,
  )} ago`;
}