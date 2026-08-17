import {
  Activity,
  Clock3,
  Gauge,
  RefreshCw,
  ShieldAlert,
  TimerOff,
} from "lucide-react";

import {
  useExecutionMetrics,
} from "../hooks/useExecutionMonitoring";

export function ExecutionPerformancePanel() {
  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } =
    useExecutionMetrics();

  const exchanges =
    data?.exchanges ??
    [];

  const aggregate =
    calculateAggregate(
      exchanges,
    );

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-panel">
      <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <Gauge
              size={18}
              className="text-primary"
            />

            <h2 className="text-lg font-semibold text-text-primary">
              Execution Performance
            </h2>
          </div>

          <p className="mt-1 text-sm text-text-muted">
            Aggregated reliability and latency across live exchanges.
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
        <div className="flex min-h-64 items-center justify-center text-sm text-text-muted">
          Loading execution performance...
        </div>
      ) : error ? (
        <div className="flex min-h-64 items-center justify-center px-6 text-center text-sm text-red-400">
          {error instanceof Error
            ? error.message
            : "Unable to load execution performance."}
        </div>
      ) : exchanges.length ===
        0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
          <Activity
            size={24}
            className="text-text-muted"
          />

          <div>
            <p className="text-sm font-medium text-text-primary">
              No execution performance data
            </p>

            <p className="mt-1 text-xs text-text-muted">
              Metrics will appear after the first live execution attempt.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryMetric
              label="Executions"
              value={String(
                aggregate.totalExecutions,
              )}
              icon={
                <Activity size={16} />
              }
            />

            <SummaryMetric
              label="Fill Rate"
              value={`${aggregate.fillRatePercent.toFixed(
                2,
              )}%`}
              icon={
                <Gauge size={16} />
              }
              tone={
                getPositiveTone(
                  aggregate.fillRatePercent,
                  90,
                  60,
                )
              }
            />

            <SummaryMetric
              label="Timeout Rate"
              value={`${aggregate.timeoutRatePercent.toFixed(
                2,
              )}%`}
              icon={
                <TimerOff size={16} />
              }
              tone={
                getInverseTone(
                  aggregate.timeoutRatePercent,
                  5,
                  15,
                )
              }
            />

            <SummaryMetric
              label="Failure Rate"
              value={`${aggregate.failureRatePercent.toFixed(
                2,
              )}%`}
              icon={
                <ShieldAlert size={16} />
              }
              tone={
                getInverseTone(
                  aggregate.failureRatePercent,
                  5,
                  15,
                )
              }
            />

            <SummaryMetric
              label="Average Latency"
              value={`${aggregate.averageExecutionTimeMs.toFixed(
                0,
              )} ms`}
              icon={
                <Clock3 size={16} />
              }
              tone={
                getInverseTone(
                  aggregate.averageExecutionTimeMs,
                  2_000,
                  10_000,
                )
              }
            />
          </div>

          <div className="mt-6 space-y-4">
            {exchanges.map(
              (exchange) => (
                <ExchangePerformanceRow
                  key={
                    exchange.exchange
                  }
                  exchange={
                    exchange.exchange
                  }
                  executions={
                    exchange.totalExecutions
                  }
                  fillRate={
                    exchange.fillRatePercent
                  }
                  timeoutRate={
                    exchange.timeoutRatePercent
                  }
                  failureRate={
                    exchange.failureRatePercent
                  }
                  averageMs={
                    exchange.averageExecutionTimeMs
                  }
                />
              ),
            )}
          </div>
        </div>
      )}
    </section>
  );
}

interface SummaryMetricProps {
  label: string;

  value: string;

  icon:
    React.ReactNode;

  tone?:
    | "positive"
    | "warning"
    | "negative"
    | "neutral";
}

function SummaryMetric({
  label,
  value,
  icon,
  tone = "neutral",
}: SummaryMetricProps) {
  return (
    <div className="rounded-lg border border-border bg-panel-light/40 p-3">
      <div className="flex items-center gap-2 text-xs text-text-muted">
        {icon}

        {label}
      </div>

      <p
        className={`mt-2 font-mono text-base font-semibold ${getToneClassName(
          tone,
        )}`}
      >
        {value}
      </p>
    </div>
  );
}

interface ExchangePerformanceRowProps {
  exchange: string;

  executions: number;

  fillRate: number;

  timeoutRate: number;

  failureRate: number;

  averageMs: number;
}

function ExchangePerformanceRow({
  exchange,
  executions,
  fillRate,
  timeoutRate,
  failureRate,
  averageMs,
}: ExchangePerformanceRowProps) {
  return (
    <article className="rounded-xl border border-border bg-panel-light/25 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="font-semibold text-text-primary">
            {formatExchange(
              exchange,
            )}
          </h3>

          <p className="mt-1 text-xs text-text-muted">
            {executions} recorded executions
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:min-w-145">
          <CompactMetric
            label="Fill"
            value={`${fillRate.toFixed(
              2,
            )}%`}
          />

          <CompactMetric
            label="Timeout"
            value={`${timeoutRate.toFixed(
              2,
            )}%`}
          />

          <CompactMetric
            label="Failure"
            value={`${failureRate.toFixed(
              2,
            )}%`}
          />

          <CompactMetric
            label="Latency"
            value={`${averageMs.toFixed(
              0,
            )} ms`}
          />
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>
            Reliability score
          </span>

          <span className="font-medium text-text-primary">
            {calculateReliabilityScore(
              fillRate,
              timeoutRate,
              failureRate,
            ).toFixed(
              0,
            )}
            /100
          </span>
        </div>

        <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{
              width:
                `${calculateReliabilityScore(
                  fillRate,
                  timeoutRate,
                  failureRate,
                )}%`,
            }}
          />
        </div>
      </div>
    </article>
  );
}

interface CompactMetricProps {
  label: string;

  value: string;
}

function CompactMetric({
  label,
  value,
}: CompactMetricProps) {
  return (
    <div>
      <p className="text-xs text-text-muted">
        {label}
      </p>

      <p className="mt-1 font-mono text-sm font-semibold text-text-primary">
        {value}
      </p>
    </div>
  );
}

interface AggregateMetrics {
  totalExecutions: number;

  fillRatePercent: number;

  timeoutRatePercent: number;

  failureRatePercent: number;

  averageExecutionTimeMs: number;
}

function calculateAggregate(
  exchanges: Array<{
    totalExecutions: number;

    filledExecutions: number;

    timedOutExecutions: number;

    failedExecutions: number;

    rejectedExecutions: number;

    totalExecutionTimeMs: number;
  }>,
): AggregateMetrics {
  const totalExecutions =
    exchanges.reduce(
      (
        total,
        exchange,
      ) =>
        total +
        exchange.totalExecutions,
      0,
    );

  const filledExecutions =
    exchanges.reduce(
      (
        total,
        exchange,
      ) =>
        total +
        exchange.filledExecutions,
      0,
    );

  const timedOutExecutions =
    exchanges.reduce(
      (
        total,
        exchange,
      ) =>
        total +
        exchange.timedOutExecutions,
      0,
    );

  const failedExecutions =
    exchanges.reduce(
      (
        total,
        exchange,
      ) =>
        total +
        exchange.failedExecutions +
        exchange.rejectedExecutions,
      0,
    );

  const totalExecutionTimeMs =
    exchanges.reduce(
      (
        total,
        exchange,
      ) =>
        total +
        exchange.totalExecutionTimeMs,
      0,
    );

  return {
    totalExecutions,

    fillRatePercent:
      calculatePercent(
        filledExecutions,
        totalExecutions,
      ),

    timeoutRatePercent:
      calculatePercent(
        timedOutExecutions,
        totalExecutions,
      ),

    failureRatePercent:
      calculatePercent(
        failedExecutions,
        totalExecutions,
      ),

    averageExecutionTimeMs:
      totalExecutions > 0
        ? totalExecutionTimeMs /
          totalExecutions
        : 0,
  };
}

function calculatePercent(
  value: number,
  total: number,
): number {
  return total > 0
    ? value /
        total *
        100
    : 0;
}

function calculateReliabilityScore(
  fillRate: number,
  timeoutRate: number,
  failureRate: number,
): number {
  const score =
    fillRate -
    timeoutRate -
    failureRate;

  return Math.max(
    0,
    Math.min(
      score,
      100,
    ),
  );
}

function getPositiveTone(
  value: number,
  positiveThreshold: number,
  warningThreshold: number,
):
  | "positive"
  | "warning"
  | "negative" {
  if (
    value >=
    positiveThreshold
  ) {
    return "positive";
  }

  if (
    value >=
    warningThreshold
  ) {
    return "warning";
  }

  return "negative";
}

function getInverseTone(
  value: number,
  positiveThreshold: number,
  warningThreshold: number,
):
  | "positive"
  | "warning"
  | "negative" {
  if (
    value <=
    positiveThreshold
  ) {
    return "positive";
  }

  if (
    value <=
    warningThreshold
  ) {
    return "warning";
  }

  return "negative";
}

function getToneClassName(
  tone:
    | "positive"
    | "warning"
    | "negative"
    | "neutral",
): string {
  switch (tone) {
    case "positive":
      return "text-emerald-400";

    case "warning":
      return "text-amber-400";

    case "negative":
      return "text-red-400";

    default:
      return "text-text-primary";
  }
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