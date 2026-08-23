import { Link } from "react-router-dom";

import { APP_PAGE_PATHS } from "@/app/routes";
import SystemHealthWidget from "@/components/dashboard/SystemHealthWidget";
import TopOpportunitiesPanel from "@/components/dashboard/TopOpportunitiesPanel";
import TradingOverviewHero from "@/components/dashboard/TradingOverviewHero";
import { useOpportunities } from "@/modules/arbitrage/hooks/useOpportunities";
import PortfolioSummaryCards from "@/modules/portfolio/components/PortfolioSummaryCards";
import { usePortfolioSummary } from "@/modules/portfolio/hooks/usePortfolioSummary";
import { useSystemHealth } from "@/modules/system-health/hooks/useSystemHealth";

const QUICK_LINKS = [
  {
    label: "Open BOT control",
    detail: "Choose OFF, PAPER or bounded LIVE from one place.",
    path: APP_PAGE_PATHS.bot,
  },
  {
    label: "Open Markets",
    detail: "Inspect current executable books and economics.",
    path: APP_PAGE_PATHS.markets,
  },
  {
    label: "Trade Intelligence",
    detail: "Review route, exchange and coin-flow evidence.",
    path: APP_PAGE_PATHS["trade-intelligence"],
  },
  {
    label: "Exchange Health",
    detail: "Check authenticated reads, clocks and venue status.",
    path: APP_PAGE_PATHS["exchange-health"],
  },
] as const;

export default function Dashboard() {
  const healthQuery = useSystemHealth();
  const opportunitiesQuery = useOpportunities();
  const portfolioQuery = usePortfolioSummary();

  const health = healthQuery.data?.data;
  const opportunities = opportunitiesQuery.data?.data;
  const portfolio = portfolioQuery.data?.data;

  return (
    <section className="dashboard-cyberdeck space-y-6 p-6 xl:p-8">
      <TradingOverviewHero
        exchanges={health?.exchanges}
        cachedMarkets={health?.cache.cachedQuotes ?? null}
        opportunities={opportunities?.length ?? null}
        healthLoading={healthQuery.isPending}
        healthUnavailable={healthQuery.isError || (!healthQuery.isPending && !health)}
      />

      <section className="rounded-xl border border-border-default bg-panel p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-primary">
          Daily control deck
        </p>
        <h1 className="mt-1 text-2xl font-bold text-text-primary">Only the controls you use every day</h1>
        <p className="mt-2 max-w-3xl text-sm text-text-muted">
          Trading mode lives in BOT. Detailed diagnostics remain under Advanced and stay unloaded until opened.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {QUICK_LINKS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className="rounded-xl border border-border-default bg-background-subtle p-4 transition hover:border-accent-primary/60 hover:bg-accent-primary/5"
            >
              <span className="font-semibold text-text-primary">{item.label}</span>
              <span className="mt-1 block text-xs leading-5 text-text-muted">{item.detail}</span>
            </Link>
          ))}
        </div>
      </section>

      {portfolio ? (
        <PortfolioSummaryCards portfolio={portfolio} />
      ) : (
        <EvidenceState
          title="Portfolio summary"
          loading={portfolioQuery.isPending}
          unavailable={portfolioQuery.isError}
        />
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        {opportunities ? (
          <TopOpportunitiesPanel opportunities={opportunities} />
        ) : (
          <EvidenceState
            title="Opportunity evidence"
            loading={opportunitiesQuery.isPending}
            unavailable={opportunitiesQuery.isError}
          />
        )}

        <SystemHealthWidget
          health={health}
          loading={healthQuery.isPending}
          unavailable={healthQuery.isError}
        />
      </div>
    </section>
  );
}

function EvidenceState({
  title,
  loading,
  unavailable,
}: {
  title: string;
  loading: boolean;
  unavailable: boolean;
}) {
  return (
    <section className="rounded-xl border border-border-default bg-panel p-5">
      <h2 className="font-semibold text-text-primary">{title}</h2>
      <p className="mt-2 text-sm text-text-muted">
        {loading
          ? "Loading current evidence..."
          : unavailable
            ? "Current evidence is unavailable."
            : "No current evidence."}
      </p>
    </section>
  );
}
