import {
  Activity,
  AlertTriangle,
  Clock3,
  Gauge,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

import {
  useExecutionAnalytics,
} from "../hooks/useExecutionMonitoring";

import type {
  ExecutionMetricsSnapshot,
} from "../services/executionAnalyticsApi";

const CHART_WIDTH =
  640;

const CHART_HEIGHT =
  180;

const CHART_PADDING_X =
  24;

const CHART_PADDING_Y =
  20;

export function ExecutionAnalyticsCharts() {
  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } =
    useExecutionAnalytics(
      60,
    );

  const snapshots =
    data?.snapshots ??
    [];

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-panel">
      <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <Activity
              size={18}
              className="text-primary"
            />

            <h2 className="text-lg font-semibold text-text-primary">
              Execution Analytics
            </h2>
          </div>

          <p className="mt-1 text-sm text-text-muted">
            Rolling latency and execution reliability snapshots.
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
        <div className="flex min-h-72 items-center justify-center text-sm text-text-muted">
          Loading execution analytics...
        </div>
      ) : error ? (
        <div className="flex min-h-72 items-center justify-center px-6 text-center text-sm text-red-400">
          {error instanceof Error
            ? error.message
            : "Unable to load execution analytics."}
        </div>
      ) : snapshots.length ===
        0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center">
          <Activity
            size={24}
            className="text-text-muted"
          />

          <div>
            <p className="text-sm font-medium text-text-primary">
              No analytics snapshots
            </p>

            <p className="mt-1 text-xs text-text-muted">
              Snapshot history will appear after the backend scheduler runs.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 p-5 xl:grid-cols-2">
          <ChartCard
            title="Average Execution Latency"
            description="Rolling average execution time"
            icon={
              <Clock3 size={17} />
            }
            unit="ms"
            snapshots={
              snapshots
            }
            valueSelector={(
              snapshot,
            ) =>
              snapshot.averageExecutionTimeMs
            }
          />

          <ChartCard
            title="Fill Rate"
            description="Completed fills across all exchanges"
            icon={
              <Gauge size={17} />
            }
            unit="%"
            snapshots={
              snapshots
            }
            valueSelector={(
              snapshot,
            ) =>
              snapshot.fillRatePercent
            }
            fixedMaximum={
              100
            }
          />

          <ChartCard
            title="Timeout Rate"
            description="Timed-out executions"
            icon={
              <AlertTriangle
                size={17}
              />
            }
            unit="%"
            snapshots={
              snapshots
            }
            valueSelector={(
              snapshot,
            ) =>
              snapshot.timeoutRatePercent
            }
            fixedMaximum={
              100
            }
          />

          <ChartCard
            title="Failure Rate"
            description="Failed and rejected executions"
            icon={
              <ShieldAlert
                size={17}
              />
            }
            unit="%"
            snapshots={
              snapshots
            }
            valueSelector={(
              snapshot,
            ) =>
              snapshot.failureRatePercent
            }
            fixedMaximum={
              100
            }
          />
        </div>
      )}
    </section>
  );
}

interface ChartCardProps {
  title: string;

  description: string;

  icon:
    React.ReactNode;

  unit: string;

  snapshots:
    ExecutionMetricsSnapshot[];

  valueSelector:
    (
      snapshot:
        ExecutionMetricsSnapshot,
    ) => number;

  fixedMaximum?: number;
}

function ChartCard({
  title,
  description,
  icon,
  unit,
  snapshots,
  valueSelector,
  fixedMaximum,
}: ChartCardProps) {
  const values =
    snapshots.map(
      valueSelector,
    );

  const latestValue =
    values.at(
      -1,
    ) ??
    0;

  const maximumValue =
    resolveMaximumValue(
      values,
      fixedMaximum,
    );

  const points =
    createPoints(
      values,
      maximumValue,
    );

  const areaPath =
    createAreaPath(
      points,
    );

  const latestTimestamp =
    snapshots.at(
      -1,
    )?.timestamp ??
    null;

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-panel-light/25">
      <header className="flex items-start justify-between gap-4 px-4 pt-4">
        <div>
          <div className="flex items-center gap-2 text-text-muted">
            {icon}

            <h3 className="text-sm font-medium text-text-primary">
              {title}
            </h3>
          </div>

          <p className="mt-1 text-xs text-text-muted">
            {description}
          </p>
        </div>

        <div className="text-right">
          <p className="font-mono text-lg font-semibold text-text-primary">
            {formatMetric(
              latestValue,
            )}
            {unit}
          </p>

          <p className="mt-1 text-[11px] text-text-muted">
            {formatTimestamp(
              latestTimestamp,
            )}
          </p>
        </div>
      </header>

      <div className="mt-4 overflow-hidden px-2 pb-2">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="h-48 w-full"
          role="img"
          aria-label={`${title} chart`}
        >
          <defs>
            <linearGradient
              id={`gradient-${sanitizeId(
                title,
              )}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor="currentColor"
                stopOpacity="0.28"
              />

              <stop
                offset="100%"
                stopColor="currentColor"
                stopOpacity="0"
              />
            </linearGradient>
          </defs>

          <ChartGrid
            maximumValue={
              maximumValue
            }
            unit={
              unit
            }
          />

          {points.length >
          1 ? (
            <>
              <path
                d={
                  areaPath
                }
                fill={`url(#gradient-${sanitizeId(
                  title,
                )})`}
                className="text-primary"
              />

              <polyline
                points={
                  points
                    .map(
                      (
                        point,
                      ) =>
                        `${point.x},${point.y}`,
                    )
                    .join(
                      " ",
                    )
                }
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-primary"
              />
            </>
          ) : (
            <line
              x1={
                CHART_PADDING_X
              }
              x2={
                CHART_WIDTH -
                CHART_PADDING_X
              }
              y1={
                points[0]
                  ?.y ??
                CHART_HEIGHT -
                  CHART_PADDING_Y
              }
              y2={
                points[0]
                  ?.y ??
                CHART_HEIGHT -
                  CHART_PADDING_Y
              }
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              className="text-primary"
            />
          )}

          {points.length >
          0 ? (
            <circle
              cx={
                points.at(
                  -1,
                )?.x
              }
              cy={
                points.at(
                  -1,
                )?.y
              }
              r="5"
              fill="currentColor"
              className="text-primary"
            />
          ) : null}
        </svg>
      </div>

      <footer className="flex items-center justify-between border-t border-border px-4 py-3 text-[11px] text-text-muted">
        <span>
          {snapshots.length} snapshots
        </span>

        <span>
          {formatTimestamp(
            snapshots[0]
              ?.timestamp ??
              null,
          )}
          {" → "}
          {formatTimestamp(
            snapshots.at(
              -1,
            )?.timestamp ??
              null,
          )}
        </span>
      </footer>
    </article>
  );
}

interface ChartPoint {
  x: number;

  y: number;
}

function createPoints(
  values: number[],
  maximumValue: number,
): ChartPoint[] {
  const chartWidth =
    CHART_WIDTH -
    CHART_PADDING_X *
      2;

  const chartHeight =
    CHART_HEIGHT -
    CHART_PADDING_Y *
      2;

  const denominator =
    Math.max(
      values.length -
        1,
      1,
    );

  return values.map(
    (
      value,
      index,
    ) => {
      const safeValue =
        Number.isFinite(
          value,
        )
          ? value
          : 0;

      const normalizedValue =
        maximumValue > 0
          ? Math.max(
              0,
              Math.min(
                safeValue /
                  maximumValue,
                1,
              ),
            )
          : 0;

      return {
        x:
          CHART_PADDING_X +
          index /
            denominator *
            chartWidth,

        y:
          CHART_PADDING_Y +
          (
            1 -
            normalizedValue
          ) *
            chartHeight,
      };
    },
  );
}

function createAreaPath(
  points:
    ChartPoint[],
): string {
  if (
    points.length ===
    0
  ) {
    return "";
  }

  const baseline =
    CHART_HEIGHT -
    CHART_PADDING_Y;

  const first =
    points[0];

  const last =
    points.at(
      -1,
    );

  if (
    !first ||
    !last
  ) {
    return "";
  }

  return [
    `M ${first.x} ${baseline}`,

    `L ${first.x} ${first.y}`,

    ...points
      .slice(
        1,
      )
      .map(
        (
          point,
        ) =>
          `L ${point.x} ${point.y}`,
      ),

    `L ${last.x} ${baseline}`,

    "Z",
  ].join(
    " ",
  );
}

interface ChartGridProps {
  maximumValue: number;

  unit: string;
}

function ChartGrid({
  maximumValue,
  unit,
}: ChartGridProps) {
  const levels = [
    0,
    0.5,
    1,
  ];

  return (
    <>
      {levels.map(
        (
          level,
        ) => {
          const y =
            CHART_PADDING_Y +
            (
              1 -
              level
            ) *
              (
                CHART_HEIGHT -
                CHART_PADDING_Y *
                  2
              );

          const label =
            maximumValue *
            level;

          return (
            <g
              key={
                level
              }
            >
              <line
                x1={
                  CHART_PADDING_X
                }
                x2={
                  CHART_WIDTH -
                  CHART_PADDING_X
                }
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeOpacity="0.12"
                strokeDasharray="5 5"
                className="text-text-muted"
              />

              <text
                x={
                  CHART_PADDING_X
                }
                y={
                  y -
                  5
                }
                fontSize="10"
                fill="currentColor"
                className="text-text-muted"
              >
                {formatMetric(
                  label,
                )}
                {unit}
              </text>
            </g>
          );
        },
      )}
    </>
  );
}

function resolveMaximumValue(
  values: number[],
  fixedMaximum:
    | number
    | undefined,
): number {
  if (
    fixedMaximum !==
      undefined &&
    Number.isFinite(
      fixedMaximum,
    ) &&
    fixedMaximum > 0
  ) {
    return fixedMaximum;
  }

  const maximum =
    Math.max(
      ...values.filter(
        Number.isFinite,
      ),
      0,
    );

  if (
    maximum <= 0
  ) {
    return 1;
  }

  return maximum *
    1.1;
}

function formatMetric(
  value: number,
): string {
  if (
    !Number.isFinite(value)
  ) {
    return "0";
  }

  if (
    Math.abs(value) >=
    100
  ) {
    return value.toFixed(
      0,
    );
  }

  return value.toFixed(
    2,
  );
}

function formatTimestamp(
  timestamp:
    | number
    | null,
): string {
  if (
    timestamp ===
      null ||
    !Number.isFinite(
      timestamp,
    ) ||
    timestamp <= 0
  ) {
    return "No data";
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

function sanitizeId(
  value: string,
): string {
  return value
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      "-",
    );
}