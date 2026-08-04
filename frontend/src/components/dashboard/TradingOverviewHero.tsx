import HeroCard from "@/shared/ui/HeroCard";
import StatusBadge from "@/shared/ui/StatusBadge";

interface TradingOverviewHeroProps {
  exchangesOnline: number;
  cachedMarkets: number;
  opportunities: number;
  healthy: boolean;
}

export default function TradingOverviewHero({
  exchangesOnline,
  cachedMarkets,
  opportunities,
  healthy,
}: TradingOverviewHeroProps) {
  return (
    <div className="mb-8">
      <HeroCard
        title="CAT PRO"
        subtitle="Execution Intelligence Platform"
        status={
          <StatusBadge
            status={
              healthy
                ? "success"
                : "danger"
            }
          >
            {healthy
              ? "🟢 LIVE"
              : "🔴 DEGRADED"}
          </StatusBadge>
        }
      >
        <div className="grid gap-6 lg:grid-cols-4">
          <TerminalMetric
            label="EXCHANGES"
            value={`${exchangesOnline}`}
            color="text-success"
          />

          <TerminalMetric
            label="MARKETS"
            value={cachedMarkets.toLocaleString()}
          />

          <TerminalMetric
            label="EXECUTION"
            value={
              opportunities.toLocaleString()
            }
            color="text-success"
          />

          <TerminalMetric
            label="SYSTEM"
            value={
              healthy
                ? "READY"
                : "DEGRADED"
            }
            color={
              healthy
                ? "text-success"
                : "text-danger"
            }
          />
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <ExchangeBadge
            name="CoinDCX"
            online={healthy}
          />

          <ExchangeBadge
            name="Binance"
            online={healthy}
          />

          <ExchangeBadge
            name="Bybit"
            online={healthy}
          />
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
    <div>
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
      className={`rounded-full border px-4 py-2 text-sm font-medium ${
        online
          ? "border-success/30 bg-success/10 text-success"
          : "border-danger/30 bg-danger/10 text-danger"
      }`}
    >
      {online ? "●" : "○"} {name}
    </div>
  );
}