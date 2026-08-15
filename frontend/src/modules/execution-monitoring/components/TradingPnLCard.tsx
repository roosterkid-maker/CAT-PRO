import {
  CircleDollarSign,
  CircleMinus,
  RefreshCw,
  Trophy,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import {
  useArbitragePnL,
} from "../hooks/useExecutionMonitoring";

export function TradingPnLCard() {
  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } =
    useArbitragePnL(
      5,
    );

  const netProfit =
    data?.netProfit ??
    0;

  const profitTone =
    netProfit > 0
      ? "text-emerald-400"
      : netProfit < 0
        ? "text-red-400"
        : "text-text-primary";

   const ProfitIcon =
  netProfit > 0
    ? TrendingUp
    : netProfit < 0
      ? TrendingDown
      : CircleMinus;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-panel">
      <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <CircleDollarSign
              size={18}
              className="text-primary"
            />

            <h2 className="text-lg font-semibold text-text-primary">
              Trading P&amp;L
            </h2>
          </div>

          <p className="mt-1 text-sm text-text-muted">
            Realized performance from completed two-leg arbitrage cycles.
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
        <div className="flex min-h-56 items-center justify-center text-sm text-text-muted">
          Loading P&amp;L...
        </div>
      ) : error ? (
        <div className="flex min-h-56 items-center justify-center px-6 text-center text-sm text-red-400">
          {error instanceof Error
            ? error.message
            : "Unable to load P&L data."}
        </div>
      ) : (
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-text-muted">
                Net Profit
              </p>

              <p
                className={`mt-2 text-3xl font-semibold tracking-tight ${profitTone}`}
              >
                ₹{formatCurrency(
                  netProfit,
                )}
              </p>
            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-panel-light">
              <ProfitIcon
                size={23}
                className={
                  profitTone
                }
              />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric
              label="Completed"
              value={String(
                data?.completedCycles ??
                0,
              )}
            />

            <Metric
              label="Profitable"
              value={String(
                data?.profitableCycles ??
                0,
              )}
              valueClassName="text-emerald-400"
            />

            <Metric
              label="Losses"
              value={String(
                data?.lossCycles ??
                0,
              )}
              valueClassName="text-red-400"
            />

            <Metric
              label="Win Rate"
              value={`${(
                data?.winRatePercent ??
                0
              ).toFixed(1)}%`}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric
              label="Gross Profit"
              value={`₹${formatCurrency(
                data?.grossProfit ??
                0,
              )}`}
            />

            <Metric
              label="Fees"
              value={`₹${formatCurrency(
                data?.totalFees ??
                0,
              )}`}
            />

            <Metric
              label="Average Profit"
              value={`₹${formatCurrency(
                data?.averageNetProfit ??
                0,
              )}`}
            />

            <Metric
              label="Recovery Needed"
              value={String(
                data?.recoveryRequiredCycles ??
                0,
              )}
              valueClassName={
                (
                  data?.recoveryRequiredCycles ??
                  0
                ) > 0
                  ? "text-amber-400"
                  : "text-text-primary"
              }
            />
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <div className="flex items-center gap-2 text-sm">
              <Trophy
                size={16}
                className="text-amber-400"
              />

              <span className="text-text-muted">
                Total cycles:
              </span>

              <span className="font-semibold text-text-primary">
                {data?.totalCycles ?? 0}
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

interface MetricProps {
  label: string;

  value: string;

  valueClassName?: string;
}

function Metric({
  label,
  value,
  valueClassName =
    "text-text-primary",
}: MetricProps) {
  return (
    <div className="rounded-lg border border-border bg-panel-light/40 p-3">
      <p className="text-xs text-text-muted">
        {label}
      </p>

      <p
        className={`mt-2 font-mono text-sm font-semibold ${valueClassName}`}
      >
        {value}
      </p>
    </div>
  );
}

function formatCurrency(
  value: number,
): string {
  if (!Number.isFinite(value)) {
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