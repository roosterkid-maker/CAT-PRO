import type {
  SystemHealthResponse,
} from "@/modules/system-health/types/SystemHealth";

interface SystemHealthWidgetProps {
  health:
    | SystemHealthResponse["data"]
    | undefined;

  loading: boolean;

  unavailable: boolean;
}

export default function SystemHealthWidget({
  health,
  loading,
  unavailable,
}: SystemHealthWidgetProps) {
  if (!health) {
    return (
      <div className="rounded-xl border border-border-default bg-panel p-5">
        <Header
          status={
            loading
              ? "LOADING"
              : "UNAVAILABLE"
          }
          healthy={false}
        />

        <div className="rounded-lg border border-border-default bg-panel-light p-4 text-sm text-text-muted">
          {loading
            ? "Loading backend health evidence..."
            : unavailable
              ? "Backend health evidence is unavailable. No readiness is inferred."
              : "Backend returned no health evidence. No readiness is inferred."}
        </div>
      </div>
    );
  }

  const exchanges =
    health.exchanges;

  const connectedCount =
    exchanges.filter(
      (
        exchange,
      ) =>
        exchange.connected,
    ).length;

  const totalCount =
    exchanges.length;

  const allConnected =
    totalCount > 0 &&
    connectedCount === totalCount;

  const heapUsed =
    health.process.memory.heapUsed;

  const heapTotal =
    health.process.memory.heapTotal;

  const memoryPercent =
    heapTotal > 0
      ? Math.min(
          100,
          (heapUsed / heapTotal) * 100,
        )
      : 0;

  return (
    <div className="rounded-xl border border-border-default bg-panel p-5">
      <Header
        status={
          allConnected
            ? "ALL FEEDS CONNECTED"
            : "FEED ISSUES"
        }
        healthy={
          allConnected
        }
      />

      <div className="space-y-3">
        {exchanges.length === 0 ? (
          <div className="rounded-lg border border-border-default bg-panel-light p-4 text-sm text-text-muted">
            The backend reported no exchange health records.
          </div>
        ) : (
          exchanges.map(
            (
              exchange,
            ) => (
              <div
                key={
                  exchange.name
                }
                className="flex items-center justify-between rounded-lg border border-border-default bg-panel-light px-4 py-3"
              >
                <p className="font-semibold">
                  {exchange.name}
                </p>

                <p
                  className={
                    exchange.connected
                      ? "font-semibold text-success"
                      : "font-semibold text-danger"
                  }
                >
                  {exchange.connected
                    ? "ONLINE"
                    : "OFFLINE"}
                </p>
              </div>
            ),
          )
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <HealthMetric
          label="Connected"
          value={`${connectedCount}/${totalCount}`}
        />

        <HealthMetric
          label="Cached Quotes"
          value={health.cache.cachedQuotes.toLocaleString()}
        />

        <HealthMetric
          label="Opportunities"
          value={health.engine.opportunities.toLocaleString()}
        />

        <HealthMetric
          label="Uptime"
          value={formatUptime(
            health.process.uptimeSeconds,
          )}
        />
      </div>

      <div className="mt-4 rounded-lg border border-border-default bg-panel-light p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">
            Heap Memory
          </span>

          <span className="font-mono">
            {memoryPercent.toFixed(1)}%
          </span>
        </div>

        <div className="mt-2 h-2 overflow-hidden rounded bg-panel">
          <div
            className="h-full rounded bg-success transition-all"
            style={{
              width: `${memoryPercent}%`,
            }}
          />
        </div>

        <p className="mt-2 text-xs text-text-muted">
          {formatBytes(heapUsed)} /{" "}
          {formatBytes(heapTotal)}
        </p>
      </div>
    </div>
  );
}

function Header({
  status,
  healthy,
}: {
  status: string;

  healthy: boolean;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
          Connectivity
        </p>

        <h2 className="mt-1 text-2xl font-bold">
          Market Data Health
        </h2>
      </div>

      <span
        className={`rounded-full border px-3 py-1 text-xs font-semibold ${
          healthy
            ? "border-success/30 bg-success/10 text-success"
            : "border-warning/30 bg-warning/10 text-warning"
        }`}
      >
        {status}
      </span>
    </div>
  );
}

interface HealthMetricProps {
  label: string;
  value: string;
}

function HealthMetric({
  label,
  value,
}: HealthMetricProps) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-3">
      <p className="text-xs text-text-muted">
        {label}
      </p>

      <p className="mt-1 text-lg font-bold tabular-nums">
        {value}
      </p>
    </div>
  );
}

function formatUptime(
  seconds: number,
): string {
  if (
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    return "0m";
  }

  const hours = Math.floor(
    seconds / 3600,
  );

  const minutes = Math.floor(
    (seconds % 3600) / 60,
  );

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function formatBytes(
  bytes: number,
): string {
  if (
    !Number.isFinite(bytes) ||
    bytes <= 0
  ) {
    return "0 MB";
  }

  return `${(
    bytes /
    1024 /
    1024
  ).toFixed(1)} MB`;
}
