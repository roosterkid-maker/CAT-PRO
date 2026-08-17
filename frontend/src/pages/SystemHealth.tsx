import { useSystemHealth } from "@/modules/system-health/hooks/useSystemHealth";

function formatBytesAsMb(value: number): string {
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatUptime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
}

export default function SystemHealth() {
  const {
    data,
    isLoading,
    isError,
    error,
  } = useSystemHealth();

  if (isLoading) {
    return (
      <div className="text-text-muted">
        Loading system health...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="text-danger">
        Failed to load system health:{" "}
        {error instanceof Error
          ? error.message
          : "Unknown error"}
      </div>
    );
  }

  const health = data.data;
  const allConnected = health.exchanges.every(
    (exchange) => exchange.connected,
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">
          System Health
        </h1>

        <p className="mt-1 text-sm text-text-muted">
          Live operational status of exchanges, cache, engine, and backend process.
        </p>
      </div>

      <div className="mb-6 flex items-center justify-between rounded-lg border border-border-default bg-panel p-4">
        <div>
          <p className="text-sm text-text-muted">
            Overall Status
          </p>

          <p
            className={
              allConnected
                ? "mt-1 font-semibold text-success"
                : "mt-1 font-semibold text-danger"
            }
          >
            ● {allConnected ? "Healthy" : "Degraded"}
          </p>
        </div>

        <p className="text-sm text-text-muted">
          Auto-refreshing every 2 seconds
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {health.exchanges.map((exchange) => (
          <div
            key={exchange.name}
            className="rounded-lg border border-border-default bg-panel p-5"
          >
            <p className="text-sm text-text-muted">
              Exchange
            </p>

            <h2 className="mt-1 text-xl font-semibold">
              {exchange.name}
            </h2>

            <p
              className={
                exchange.connected
                  ? "mt-4 text-sm font-medium text-success"
                  : "mt-4 text-sm font-medium text-danger"
              }
            >
              ● {exchange.connected ? "Connected" : "Disconnected"}
            </p>
          </div>
        ))}

        <div className="rounded-lg border border-border-default bg-panel p-5">
          <p className="text-sm text-text-muted">
            Cached Quotes
          </p>

          <p className="mt-2 text-3xl font-semibold">
            {health.cache.cachedQuotes.toLocaleString()}
          </p>
        </div>

        <div className="rounded-lg border border-border-default bg-panel p-5">
          <p className="text-sm text-text-muted">
            Opportunities
          </p>

          <p className="mt-2 text-3xl font-semibold text-success">
            {health.engine.opportunities.toLocaleString()}
          </p>
        </div>

        <div className="rounded-lg border border-border-default bg-panel p-5">
          <p className="text-sm text-text-muted">
            Uptime
          </p>

          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
            {formatUptime(health.process.uptimeSeconds)}
          </p>
        </div>

        <div className="rounded-lg border border-border-default bg-panel p-5">
          <p className="text-sm text-text-muted">
            Heap Used
          </p>

          <p className="mt-2 text-2xl font-semibold">
            {formatBytesAsMb(health.process.memory.heapUsed)}
          </p>

          <p className="mt-1 text-xs text-text-muted">
            Total heap: {formatBytesAsMb(health.process.memory.heapTotal)}
          </p>
        </div>

        <div className="rounded-lg border border-border-default bg-panel p-5">
          <p className="text-sm text-text-muted">
            Process Memory
          </p>

          <p className="mt-2 text-2xl font-semibold">
            {formatBytesAsMb(health.process.memory.rss)}
          </p>

          <p className="mt-1 text-xs text-text-muted">
            Resident set size
          </p>
        </div>
      </div>
    </div>
  );
}