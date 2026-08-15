import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  RefreshCw,
} from "lucide-react";

import {
  useArbitragePnL,
} from "../hooks/useExecutionMonitoring";

export function RecentArbitrageCycles() {
  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } =
    useArbitragePnL(
      10,
    );

  const cycles =
    data?.latest ??
    [];

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-panel">
      <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            Recent Arbitrage Cycles
          </h2>

          <p className="mt-1 text-sm text-text-muted">
            Realized results from completed and partially completed two-leg executions.
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
        <div className="flex min-h-48 items-center justify-center text-sm text-text-muted">
          Loading arbitrage cycles...
        </div>
      ) : error ? (
        <div className="flex min-h-48 items-center justify-center px-6 text-center text-sm text-red-400">
          {error instanceof Error
            ? error.message
            : "Unable to load arbitrage cycles."}
        </div>
      ) : cycles.length ===
        0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
          <Clock3
            size={22}
            className="text-text-muted"
          />

          <div>
            <p className="text-sm font-medium text-text-primary">
              No arbitrage cycles yet
            </p>

            <p className="mt-1 text-xs text-text-muted">
              Completed two-leg executions will appear here.
            </p>
          </div>
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
                  Market
                </th>

                <th className="px-4 py-3 font-medium">
                  Route
                </th>

                <th className="px-4 py-3 font-medium">
                  Status
                </th>

                <th className="px-4 py-3 text-right font-medium">
                  Quantity
                </th>

                <th className="px-4 py-3 text-right font-medium">
                  Gross
                </th>

                <th className="px-4 py-3 text-right font-medium">
                  Fees
                </th>

                <th className="px-4 py-3 text-right font-medium">
                  Net P&amp;L
                </th>

                <th className="px-5 py-3 text-right font-medium">
                  Return
                </th>
              </tr>
            </thead>

            <tbody>
              {cycles.map(
                (cycle) => {
                  const profitable =
                    cycle.netProfit >
                    0;

                  return (
                    <tr
                      key={`${cycle.opportunityId}-${cycle.completedAt}`}
                      className="border-b border-border/70 text-sm transition-colors last:border-b-0 hover:bg-panel-light/40"
                    >
                      <td className="whitespace-nowrap px-5 py-4 text-text-muted">
                        {formatTimestamp(
                          cycle.completedAt,
                        )}
                      </td>

                      <td className="px-4 py-4 font-mono font-semibold text-text-primary">
                        {cycle.market}
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-emerald-400">
                            {formatExchange(
                              cycle.buyExchange,
                            )}
                          </span>

                          <ArrowRight
                            size={13}
                            className="text-text-muted"
                          />

                          <span className="font-medium text-red-400">
                            {formatExchange(
                              cycle.sellExchange,
                            )}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <StatusBadge
                          status={
                            cycle.status
                          }
                          recoveryRequired={
                            cycle.recoveryRequired
                          }
                        />
                      </td>

                      <td className="px-4 py-4 text-right font-mono text-text-primary">
                        {formatNumber(
                          cycle.matchedQuantity,
                        )}
                      </td>

                      <td className="px-4 py-4 text-right font-mono text-text-primary">
                        ₹
                        {formatCurrency(
                          cycle.grossProfit,
                        )}
                      </td>

                      <td className="px-4 py-4 text-right font-mono text-text-muted">
                        ₹
                        {formatCurrency(
                          cycle.totalFees,
                        )}
                      </td>

                      <td
                        className={`px-4 py-4 text-right font-mono font-semibold ${
                          profitable
                            ? "text-emerald-400"
                            : cycle.netProfit < 0
                              ? "text-red-400"
                              : "text-text-primary"
                        }`}
                      >
                        ₹
                        {formatCurrency(
                          cycle.netProfit,
                        )}
                      </td>

                      <td
                        className={`px-5 py-4 text-right font-mono font-semibold ${
                          profitable
                            ? "text-emerald-400"
                            : cycle.netProfitPercent < 0
                              ? "text-red-400"
                              : "text-text-primary"
                        }`}
                      >
                        {cycle.netProfitPercent.toFixed(
                          3,
                        )}
                        %
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

interface StatusBadgeProps {
  status: string;

  recoveryRequired: boolean;
}

function StatusBadge({
  status,
  recoveryRequired,
}: StatusBadgeProps) {
  if (recoveryRequired) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400">
        <AlertTriangle
          size={13}
        />

        Recovery
      </span>
    );
  }

  const completed =
    status ===
    "COMPLETED";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
        completed
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-red-500/30 bg-red-500/10 text-red-400"
      }`}
    >
      {completed ? (
        <CheckCircle2
          size={13}
        />
      ) : (
        <AlertTriangle
          size={13}
        />
      )}

      {status.replaceAll(
        "_",
        " ",
      )}
    </span>
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
        4,
    },
  ).format(
    value,
  );
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