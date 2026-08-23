import type {
  ExchangeHealth,
} from "@/modules/system-health/types/SystemHealth";
import HeroCard from "@/shared/ui/HeroCard";
import StatusBadge from "@/shared/ui/StatusBadge";

interface TradingOverviewHeroProps {
  exchanges:
    | ExchangeHealth[]
    | undefined;

  cachedMarkets:
    | number
    | null;

  opportunities:
    | number
    | null;

  healthLoading: boolean;

  healthUnavailable: boolean;
}

export default function TradingOverviewHero({
  exchanges,
  cachedMarkets,
  opportunities,
  healthLoading,
  healthUnavailable,
}: TradingOverviewHeroProps) {
  const connectedCount =
    exchanges?.filter(
      (
        exchange,
      ) =>
        exchange.connected,
    ).length ??
    null;

  const totalExchanges =
    exchanges?.length ??
    null;

  const allFeedsConnected =
    totalExchanges !== null &&
    totalExchanges > 0 &&
    connectedCount ===
      totalExchanges;

  const feedStatus =
    healthLoading &&
    !exchanges
      ? "LOADING"
      : healthUnavailable ||
          !exchanges
        ? "UNAVAILABLE"
        : allFeedsConnected
          ? "CONNECTED"
          : "ISSUES";

  const badgeStatus =
    feedStatus ===
    "CONNECTED"
      ? "success"
      : feedStatus ===
          "LOADING"
        ? "info"
        : feedStatus ===
            "ISSUES"
          ? "warning"
          : "danger";

  return (
    <div className="mb-8">
      <HeroCard
        title="CAT PRO"
        subtitle="Execution Intelligence Platform"
        status={
          <StatusBadge
            status={
              badgeStatus
            }
          >
            MARKET DATA {feedStatus}
          </StatusBadge>
        }
      >
        <div className="grid gap-6 lg:grid-cols-4">
          <TerminalMetric
            label="EXCHANGES"
            value={
              connectedCount ===
                null ||
              totalExchanges ===
                null
                ? "Unavailable"
                : `${connectedCount}/${totalExchanges}`
            }
            color={
              allFeedsConnected
                ? "text-success"
                : "text-text-primary"
            }
          />

          <TerminalMetric
            label="CACHED QUOTES"
            value={formatCount(
              cachedMarkets,
            )}
          />

          <TerminalMetric
            label="OPPORTUNITIES"
            value={formatCount(
              opportunities,
            )}
          />

          <TerminalMetric
            label="FEED STATUS"
            value={feedStatus}
            color={
              feedStatus ===
              "CONNECTED"
                ? "text-success"
                : feedStatus ===
                    "ISSUES"
                  ? "text-warning"
                  : "text-text-muted"
            }
          />
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          {exchanges &&
          exchanges.length > 0 ? (
            exchanges.map(
              (
                exchange,
              ) => (
                <ExchangeBadge
                  key={
                    exchange.name
                  }
                  name={
                    exchange.name
                  }
                  online={
                    exchange.connected
                  }
                />
              ),
            )
          ) : (
            <p className="text-sm text-text-muted">
              {healthLoading
                ? "Loading exchange connectivity evidence..."
                : "Exchange connectivity evidence is unavailable."}
            </p>
          )}
        </div>
      </HeroCard>
    </div>
  );
}

interface TerminalMetricProps {
  label: string;

  value: string;

  color?: string;
}

function TerminalMetric({
  label,
  value,
  color = "text-text-primary",
}: TerminalMetricProps) {
  return (
    <div className="dashboard-hero-metric">
      <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
        {label}
      </p>

      <p
        className={`mt-2 text-4xl font-bold tracking-tight tabular-nums ${color}`}
      >
        {value}
      </p>
    </div>
  );
}

interface ExchangeBadgeProps {
  name: string;

  online: boolean;
}

function ExchangeBadge({
  name,
  online,
}: ExchangeBadgeProps) {
  return (
    <div
      className={`dashboard-exchange-badge rounded-full border px-4 py-2 text-sm font-medium ${
        online
          ? "border-success/30 bg-success/10 text-success"
          : "border-danger/30 bg-danger/10 text-danger"
      }`}
    >
      {online ? "ONLINE" : "OFFLINE"} {name}
    </div>
  );
}

function formatCount(
  value:
    | number
    | null,
): string {
  return value === null
    ? "Unavailable"
    : value.toLocaleString();
}
