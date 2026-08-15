import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";

import {
  useRecentExecutions,
} from "../hooks/useExecutionMonitoring";

import type {
  ExecutionHistoryStatus,
} from "../services/executionHistoryApi";

interface StatusConfig {
  label: string;

  className: string;
}

const STATUS_CONFIG:
  Record<
    ExecutionHistoryStatus,
    StatusConfig
  > = {
  PENDING: {
    label:
      "Pending",

    className:
      "border-sky-500/30 bg-sky-500/10 text-sky-400",
  },

  OPEN: {
    label:
      "Open",

    className:
      "border-sky-500/30 bg-sky-500/10 text-sky-400",
  },

  PARTIALLY_FILLED: {
    label:
      "Partial",

    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-400",
  },

  FILLED: {
    label:
      "Filled",

    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  },

  CANCELLED: {
    label:
      "Cancelled",

    className:
      "border-slate-500/30 bg-slate-500/10 text-slate-300",
  },

  TIMED_OUT: {
    label:
      "Timed Out",

    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-400",
  },

  REJECTED: {
    label:
      "Rejected",

    className:
      "border-red-500/30 bg-red-500/10 text-red-400",
  },

  FAILED: {
    label:
      "Failed",

    className:
      "border-red-500/30 bg-red-500/10 text-red-400",
  },

  UNKNOWN: {
    label:
      "Unknown",

    className:
      "border-border bg-panel-light text-text-muted",
  },
};

export function RecentExecutionsTable() {
  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } =
    useRecentExecutions(
      20,
    );

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-panel">
      <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            Recent Executions
          </h2>

          <p className="mt-1 text-sm text-text-muted">
            Latest completed, failed and cancelled live execution attempts.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            void refetch();
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
      </header>

      {isLoading ? (
        <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-text-muted">
          <LoaderCircle
            size={18}
            className="animate-spin"
          />

          Loading recent executions...
        </div>
      ) : error ? (
        <div className="flex min-h-48 items-center justify-center gap-3 px-6 text-sm text-red-400">
          <AlertCircle
            size={18}
          />

          {error instanceof Error
            ? error.message
            : "Unable to load execution history."}
        </div>
      ) : !data ||
        data.executions.length ===
          0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
          <Clock3
            size={22}
            className="text-text-muted"
          />

          <p className="text-sm font-medium text-text-primary">
            No execution history
          </p>

          <p className="text-xs text-text-muted">
            Completed live executions will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-245 border-collapse text-left">
            <thead className="bg-panel-light/60">
              <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                <th className="px-5 py-3 font-medium">
                  Time
                </th>

                <th className="px-4 py-3 font-medium">
                  Exchange
                </th>

                <th className="px-4 py-3 font-medium">
                  Market
                </th>

                <th className="px-4 py-3 font-medium">
                  Side
                </th>

                <th className="px-4 py-3 font-medium">
                  Status
                </th>

                <th className="px-4 py-3 text-right font-medium">
                  Quantity
                </th>

                <th className="px-4 py-3 text-right font-medium">
                  Filled
                </th>

                <th className="px-4 py-3 text-right font-medium">
                  Price
                </th>

                <th className="px-4 py-3 text-right font-medium">
                  Latency
                </th>

                <th className="px-5 py-3 font-medium">
                  Details
                </th>
              </tr>
            </thead>

            <tbody>
              {data.executions.map(
                (
                  execution,
                ) => {
                  const status =
                    STATUS_CONFIG[
                      execution.status
                    ];

                  return (
                    <tr
                      key={
                        execution.id
                      }
                      className="border-b border-border/70 text-sm transition-colors last:border-b-0 hover:bg-panel-light/40"
                    >
                      <td className="whitespace-nowrap px-5 py-4 text-text-muted">
                        {formatTimestamp(
                          execution.timestamp,
                        )}
                      </td>

                      <td className="px-4 py-4 font-medium text-text-primary">
                        {formatExchange(
                          execution.exchange,
                        )}
                      </td>

                      <td className="px-4 py-4 font-mono text-text-primary">
                        {execution.market}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={
                            execution.side ===
                            "buy"
                              ? "font-medium text-emerald-400"
                              : execution.side ===
                                  "sell"
                                ? "font-medium text-red-400"
                                : "text-text-muted"
                          }
                        >
                          {execution.side.toUpperCase()}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${status.className}`}
                        >
                          {status.label}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-right font-mono text-text-primary">
                        {formatNumber(
                          execution.requestedQuantity,
                        )}
                      </td>

                      <td className="px-4 py-4 text-right font-mono text-text-primary">
                        {formatNumber(
                          execution.filledQuantity,
                        )}
                      </td>

                      <td className="px-4 py-4 text-right font-mono text-text-primary">
                        {execution.requestedPrice ===
                        null
                          ? "—"
                          : formatNumber(
                              execution.requestedPrice,
                            )}
                      </td>

                      <td className="px-4 py-4 text-right font-mono text-text-primary">
                        {execution.executionTimeMs.toFixed(
                          0,
                        )}
                        {" ms"}
                      </td>

                      <td className="max-w-80 px-5 py-4">
                        <div className="flex items-start gap-2">
                          {execution.success ? (
                            <CheckCircle2
                              size={15}
                              className="mt-0.5 shrink-0 text-emerald-400"
                            />
                          ) : (
                            <AlertCircle
                              size={15}
                              className="mt-0.5 shrink-0 text-amber-400"
                            />
                          )}

                          <span
                            className="truncate text-xs text-text-muted"
                            title={
                              execution.failureReason ??
                              execution.message ??
                              undefined
                            }
                          >
                            {execution.failureReason ??
                              execution.message ??
                              "Execution completed."}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                },
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatTimestamp(
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

  return new Date(
    timestamp,
  ).toLocaleString(
    undefined,
    {
      day:
        "2-digit",

      month:
        "short",

      hour:
        "2-digit",

      minute:
        "2-digit",

      second:
        "2-digit",
    },
  );
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

  return exchange;
}

function formatNumber(
  value: number,
): string {
  if (
    !Number.isFinite(value)
  ) {
    return "0";
  }

  return new Intl.NumberFormat(
    "en-IN",
    {
      maximumFractionDigits:
        8,
    },
  ).format(
    value,
  );
}