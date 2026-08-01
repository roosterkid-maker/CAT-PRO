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
        title="Welcome Back 👋"
        subtitle="Your arbitrage engine is monitoring the market in real time."
        status={
          <StatusBadge
            status={healthy ? "success" : "danger"}
          >
            {healthy
              ? "System Healthy"
              : "System Degraded"}
          </StatusBadge>
        }
      >
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted">
              Exchanges Online
            </p>

            <p className="mt-2 text-3xl font-bold tabular-nums">
              {exchangesOnline}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted">
              Cached Markets
            </p>

            <p className="mt-2 text-3xl font-bold tabular-nums">
              {cachedMarkets.toLocaleString()}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted">
              Live Opportunities
            </p>

            <p className="mt-2 text-3xl font-bold tabular-nums text-success">
              {opportunities}
            </p>
          </div>
        </div>
      </HeroCard>
    </div>
  );
}