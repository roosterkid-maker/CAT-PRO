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

export function ExchangeAnalyticsPanel() {
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
              Exchange Analytics
            </h2>
          </div>

          <p className="mt-1 text-sm text-text-muted">
            Per-exchange execution reliability, latency and fill performance.
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
          Loading exchange analytics...
        </div>
      ) : error ? (
        <div className="flex min-h-64 items-center justify-center px-6 text-center text-sm text-red-400">
          {error instanceof Error
            ? error.message
            : "Unable to load exchange analytics."}
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
              No exchange analytics data
            </p>

            <p className="mt-1 text-xs text-text-muted">
              Exchange performance will appear after the first live execution attempt.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 p-5 xl:grid-cols-2">
          {exchanges.map(
            (
              exchange,
            ) => (
              <ExchangeAnalyticsCard
                key={
                  exchange.exchange
                }
                exchange={
                  exchange.exchange
                }
                totalExecutions={
                  exchange.totalExecutions
                }
                filledExecutions={
                  exchange.filledExecutions
                }
                cancelledExecutions={
                  exchange.cancelledExecutions
                }
                timedOutExecutions={
                  exchange.timedOutExecutions
                }
                failedExecutions={
                  exchange.failedExecutions
                }
                rejectedExecutions={
                  exchange.rejectedExecutions
                }
                fillRatePercent={
                  exchange.fillRatePercent
                }
                cancellationRatePercent={
                  exchange.cancellationRatePercent
                }
                timeoutRatePercent={
                  exchange.timeoutRatePercent
                }
                failureRatePercent={
                  exchange.failureRatePercent
                }
                averageExecutionTimeMs={
                  exchange.averageExecutionTimeMs
                }
                fastestExecutionTimeMs={
                  exchange.fastestExecutionTimeMs
                }
                slowestExecutionTimeMs={
                  exchange.slowestExecutionTimeMs
                }
                lastExecutionAt={
                  exchange.lastExecutionAt
                }
              />
            ),
          )}
        </div>
      )}
    </section>
  );
}

interface ExchangeAnalyticsCardProps {
  exchange: string;

  totalExecutions: number;

  filledExecutions: number;

  cancelledExecutions: number;

  timedOutExecutions: number;

  failedExecutions: number;

  rejectedExecutions: number;

  fillRatePercent: number;

  cancellationRatePercent: number;

  timeoutRatePercent: number;

  failureRatePercent: number;

  averageExecutionTimeMs: number;

  fastestExecutionTimeMs:
    | number
    | null;

  slowestExecutionTimeMs:
    | number
    | null;

  lastExecutionAt:
    | number
    | null;
}

function ExchangeAnalyticsCard({
  exchange,
  totalExecutions,
  filledExecutions,
  cancelledExecutions,
  timedOutExecutions,
  failedExecutions,
  rejectedExecutions,
  fillRatePercent,
  cancellationRatePercent,
  timeoutRatePercent,
  failureRatePercent,
  averageExecutionTimeMs,
  fastestExecutionTimeMs,
  slowestExecutionTimeMs,
  lastExecutionAt,
}: ExchangeAnalyticsCardProps) {
  const reliabilityScore =
    calculateReliabilityScore(
      fillRatePercent,
      timeoutRatePercent,
      failureRatePercent,
    );

  const reliabilityTone =
    getReliabilityTone(
      reliabilityScore,
    );

  const totalFailures =
    failedExecutions +
    rejectedExecutions;

  return (
    <article className="rounded-xl border border-border bg-panel-light/30 p-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-panel text-primary">
              <Activity
                size={19}
              />
            </div>

            <div>
              <h3 className="text-lg font-semibold text-text-primary">
                {formatExchangeName(
                  exchange,
                )}
              </h3>

              <p className="mt-1 text-xs text-text-muted">
                {totalExecutions} recorded executions
              </p>
            </div>
          </div>
        </div>

        <span
          className={`rounded-full border px-3 py-1 text-xs font-medium ${getReliabilityBadgeClassName(
            reliabilityTone,
          )}`}
        >
          {reliabilityScore.toFixed(
            0,
          )}
          /100
        </span>
      </header>
        
         <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
  <MetricBox
    label="Filled"
    value={String(
      filledExecutions,
    )}
    icon={
      <Gauge size={15} />
    }
    tone="positive"
  />

  <MetricBox
    label="Cancelled"
    value={String(
      cancelledExecutions,
    )}
    icon={
      <TimerOff size={15} />
    }
    tone={
      cancelledExecutions > 0
        ? "warning"
        : "neutral"
    }
  />

  <MetricBox
    label="Timed Out"
    value={String(
      timedOutExecutions,
    )}
    icon={
      <TimerOff size={15} />
    }
    tone={
      timedOutExecutions > 0
        ? "warning"
        : "neutral"
    }
  />

  <MetricBox
    label="Failures"
    value={String(
      totalFailures,
    )}
    icon={
      <ShieldAlert size={15} />
    }
    tone={
      totalFailures > 0
        ? "negative"
        : "neutral"
    }
  />

  <MetricBox
    label="Fill Rate"
    value={`${fillRatePercent.toFixed(
      2,
    )}%`}
    icon={
      <Gauge size={15} />
    }
    tone={
      fillRatePercent >= 90
        ? "positive"
        : fillRatePercent >= 60
          ? "warning"
          : "negative"
    }
  />

  <MetricBox
    label="Timeout Rate"
    value={`${timeoutRatePercent.toFixed(
      2,
    )}%`}
    icon={
      <TimerOff size={15} />
    }
    tone={
      timeoutRatePercent <= 5
        ? "positive"
        : timeoutRatePercent <= 15
          ? "warning"
          : "negative"
    }
  />

  <MetricBox
    label="Failure Rate"
    value={`${failureRatePercent.toFixed(
      2,
    )}%`}
    icon={
      <ShieldAlert size={15} />
    }
    tone={
      failureRatePercent <= 5
        ? "positive"
        : failureRatePercent <= 15
          ? "warning"
          : "negative"
    }
  />

  <MetricBox
    label="Average Latency"
    value={`${averageExecutionTimeMs.toFixed(
      0,
    )} ms`}
    icon={
      <Clock3 size={15} />
    }
    tone={
      averageExecutionTimeMs <= 2_000
        ? "positive"
        : averageExecutionTimeMs <= 10_000
          ? "warning"
          : "negative"
    }
  />
</div>
      

      <div className="mt-5 rounded-xl border border-border bg-panel p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted">
              Reliability
            </p>

            <p
              className={`mt-2 text-lg font-semibold ${getReliabilityValueClassName(
                reliabilityTone,
              )}`}
            >
              {reliabilityScore.toFixed(
                0,
              )}
              %
            </p>
          </div>

          <div className="text-right">
            <p className="text-xs text-text-muted">
              Average latency
            </p>

            <p className="mt-1 font-mono text-sm font-semibold text-text-primary">
              {averageExecutionTimeMs.toFixed(
                0,
              )}{" "}
              ms
            </p>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-background">
          <div
            className={`h-full rounded-full transition-all ${getReliabilityBarClassName(
              reliabilityTone,
            )}`}
            style={{
              width:
                `${reliabilityScore}%`,
            }}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <LatencyItem
          label="Fastest"
          value={
            formatLatency(
              fastestExecutionTimeMs,
            )
          }
        />

        <LatencyItem
          label="Slowest"
          value={
            formatLatency(
              slowestExecutionTimeMs,
            )
          }
        />

        <LatencyItem
          label="Cancellation Rate"
          value={`${cancellationRatePercent.toFixed(
            2,
          )}%`}
        />

        <LatencyItem
          label="Last Execution"
          value={
            formatLastExecution(
              lastExecutionAt,
            )
          }
        />
      </div>
    </article>
  );
}

type MetricTone =
  | "positive"
  | "warning"
  | "negative"
  | "neutral";

interface MetricBoxProps {
  label: string;

  value: string;

  icon:
    React.ReactNode;

  tone:
    MetricTone;
}

function MetricBox({
  label,
  value,
  icon,
  tone,
}: MetricBoxProps) {
  return (
    <div className="rounded-lg border border-border bg-panel p-3">
      <div className="flex items-center gap-2 text-xs text-text-muted">
        {icon}

        {label}
      </div>

      <p
        className={`mt-2 font-mono text-sm font-semibold ${getMetricToneClassName(
          tone,
        )}`}
      >
        {value}
      </p>
    </div>
  );
}

interface LatencyItemProps {
  label: string;

  value: string;
}

function LatencyItem({
  label,
  value,
}: LatencyItemProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-panel p-3">
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <Clock3
          size={14}
        />

        {label}
      </div>

      <span className="font-mono text-xs font-semibold text-text-primary">
        {value}
      </span>
    </div>
  );
}

function calculateReliabilityScore(
  fillRatePercent: number,
  timeoutRatePercent: number,
  failureRatePercent: number,
): number {
  const score =
    fillRatePercent -
    timeoutRatePercent -
    failureRatePercent;

  return Math.max(
    0,
    Math.min(
      score,
      100,
    ),
  );
}

function getReliabilityTone(
  score: number,
):
  | "positive"
  | "warning"
  | "negative" {
  if (
    score >= 90
  ) {
    return "positive";
  }

  if (
    score >= 70
  ) {
    return "warning";
  }

  return "negative";
}

function getReliabilityBadgeClassName(
  tone:
    | "positive"
    | "warning"
    | "negative",
): string {
  switch (tone) {
    case "positive":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";

    case "warning":
      return "border-amber-500/30 bg-amber-500/10 text-amber-400";

    default:
      return "border-red-500/30 bg-red-500/10 text-red-400";
  }
}

function getReliabilityValueClassName(
  tone:
    | "positive"
    | "warning"
    | "negative",
): string {
  switch (tone) {
    case "positive":
      return "text-emerald-400";

    case "warning":
      return "text-amber-400";

    default:
      return "text-red-400";
  }
}

function getReliabilityBarClassName(
  tone:
    | "positive"
    | "warning"
    | "negative",
): string {
  switch (tone) {
    case "positive":
      return "bg-emerald-400";

    case "warning":
      return "bg-amber-400";

    default:
      return "bg-red-400";
  }
}

function getMetricToneClassName(
  tone:
    MetricTone,
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

function formatExchangeName(
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

  if (
    normalized ===
    "bybit"
  ) {
    return "Bybit";
  }

  return exchange;
}

function formatLatency(
  value:
    | number
    | null,
): string {
  if (
    value === null ||
    !Number.isFinite(
      value,
    )
  ) {
    return "No data";
  }

  return `${value.toFixed(
    0,
  )} ms`;
}

function formatLastExecution(
  timestamp:
    | number
    | null,
): string {
  if (
    timestamp === null ||
    !Number.isFinite(
      timestamp,
    ) ||
    timestamp <= 0
  ) {
    return "No data";
  }

  const differenceMs =
    Date.now() -
    timestamp;

  if (
    differenceMs >= 0 &&
    differenceMs < 60_000
  ) {
    return "Just now";
  }

  if (
    differenceMs >= 0 &&
    differenceMs < 3_600_000
  ) {
    return `${Math.floor(
      differenceMs /
      60_000,
    )}m ago`;
  }

  return new Date(
    timestamp,
  ).toLocaleString();
}