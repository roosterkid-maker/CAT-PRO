import {
  AlertTriangle,
  Clock3,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import {
  useRecentExecutions,
} from "../hooks/useExecutionMonitoring";

const MAXIMUM_VISIBLE_ERRORS =
  5;

export function RecentExecutionErrors() {
  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } =
    useRecentExecutions(
      50,
    );

  const failures =
    data?.executions
      .filter(
        (execution) =>
          execution.status ===
            "FAILED" ||
          execution.status ===
            "REJECTED" ||
          execution.status ===
            "TIMED_OUT" ||
          execution.failureReason !==
            null,
      )
      .slice(
        0,
        MAXIMUM_VISIBLE_ERRORS,
      ) ??
    [];

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-panel">
      <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle
              size={18}
              className="text-amber-400"
            />

            <h2 className="text-lg font-semibold text-text-primary">
              Recent Execution Errors
            </h2>
          </div>

          <p className="mt-1 text-sm text-text-muted">
            Latest failed, rejected and timed-out execution attempts.
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
        <div className="flex min-h-52 items-center justify-center text-sm text-text-muted">
          Loading execution errors...
        </div>
      ) : error ? (
        <div className="flex min-h-52 items-center justify-center px-6 text-center text-sm text-red-400">
          {error instanceof Error
            ? error.message
            : "Unable to load execution errors."}
        </div>
      ) : failures.length ===
        0 ? (
        <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
            <ShieldCheck
              size={21}
              className="text-emerald-400"
            />
          </div>

          <div>
            <p className="text-sm font-medium text-text-primary">
              No recent execution errors
            </p>

            <p className="mt-1 text-xs text-text-muted">
              Failed and timed-out executions will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {failures.map(
            (execution) => (
              <article
                key={
                  execution.id
                }
                className="px-5 py-4 transition-colors hover:bg-panel-light/40"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-text-primary">
                        {execution.market}
                      </span>

                      <span className="text-xs text-text-muted">
                        {formatExchange(
                          execution.exchange,
                        )}
                      </span>

                      <StatusBadge
                        status={
                          execution.status
                        }
                      />
                    </div>

                    <p
                      className="mt-2 line-clamp-2 text-sm text-text-muted"
                      title={
                        execution.failureReason ??
                        execution.message ??
                        undefined
                      }
                    >
                      {execution.failureReason ??
                        execution.message ??
                        "Execution failed without a detailed reason."}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="flex items-center justify-end gap-1.5 text-xs text-text-muted">
                      <Clock3
                        size={13}
                      />

                      {formatTimestamp(
                        execution.timestamp,
                      )}
                    </div>

                    <p className="mt-2 font-mono text-xs text-text-muted">
                      {
                        execution.executionTimeMs
                      }{" "}
                      ms
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
                  <InfoItem
                    label="Side"
                    value={
                      execution.side.toUpperCase()
                    }
                  />

                  <InfoItem
                    label="Requested"
                    value={formatNumber(
                      execution.requestedQuantity,
                    )}
                  />

                  <InfoItem
                    label="Filled"
                    value={formatNumber(
                      execution.filledQuantity,
                    )}
                  />

                  <InfoItem
                    label="Order ID"
                    value={
                      execution.orderId ??
                      "Not created"
                    }
                  />
                </div>
              </article>
            ),
          )}
        </div>
      )}
    </section>
  );
}

interface StatusBadgeProps {
  status: string;
}

function StatusBadge({
  status,
}: StatusBadgeProps) {
  const className =
    status === "TIMED_OUT"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
      : "border-red-500/30 bg-red-500/10 text-red-400";

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`}
    >
      {status.replaceAll(
        "_",
        " ",
      )}
    </span>
  );
}

interface InfoItemProps {
  label: string;

  value: string;
}

function InfoItem({
  label,
  value,
}: InfoItemProps) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="text-text-muted">
        {label}:
      </span>

      <span className="max-w-48 truncate font-mono text-text-primary">
        {value}
      </span>
    </span>
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
  ).toLocaleTimeString(
    undefined,
    {
      hour:
        "2-digit",

      minute:
        "2-digit",

      second:
        "2-digit",
    },
  );
}

function formatNumber(
  value: number,
): string {
  if (!Number.isFinite(value)) {
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