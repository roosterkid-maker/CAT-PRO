import DashboardStatCard from "@/components/dashboard/DashboardStatCard";
import TradingOverviewHero from "@/components/dashboard/TradingOverviewHero";
import MarketTable from "@/modules/market/components/MarketTable";
import { useSystemHealth } from "@/modules/system-health/hooks/useSystemHealth";
import { useMarketStore } from "@/store/market.store";

export default function Dashboard() {
  const marketCount = useMarketStore(
    (state) => Object.keys(state.markets).length,
  );

  const { data: healthResponse } = useSystemHealth();

  const health = healthResponse?.data;

  const exchangesOnline =
    health?.exchanges.filter(
      (exchange) => exchange.connected,
    ).length ?? 0;

  const totalExchanges =
    health?.exchanges.length ?? 0;

  const opportunities =
    health?.engine.opportunities ?? 0;

  const healthy =
    totalExchanges > 0 &&
    exchangesOnline === totalExchanges;

  const cachedQuotes =
    health?.cache.cachedQuotes ?? marketCount;

  return (
    <section className="p-8">
      <TradingOverviewHero
        exchangesOnline={exchangesOnline}
        cachedMarkets={cachedQuotes}
        opportunities={opportunities}
        healthy={healthy}
      />

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardStatCard
          title="Cached Quotes"
          value={cachedQuotes.toLocaleString()}
          subtitle="Live quotes received"
        />

        <DashboardStatCard
          title="Exchanges Online"
          value={`${exchangesOnline}/${totalExchanges}`}
          subtitle="Connected exchanges"
        />

        <DashboardStatCard
          title="Opportunities"
          value={opportunities}
          subtitle="Current profitable matches"
        />

        <DashboardStatCard
          title="System Health"
          value={healthy ? "Healthy" : "Degraded"}
          subtitle="Live backend status"
        />
      </div>

      <MarketTable />
    </section>
  );
}