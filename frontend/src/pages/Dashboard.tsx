import ExecutionTerminalSummary from "@/components/dashboard/ExecutionTerminalSummary";
import PortfolioWidget from "@/components/dashboard/PortfolioWidget";
import SystemHealthWidget from "@/components/dashboard/SystemHealthWidget";
import TopOpportunitiesPanel from "@/components/dashboard/TopOpportunitiesPanel";
import TradingOverviewHero from "@/components/dashboard/TradingOverviewHero";
import PortfolioSummaryCards from "@/modules/portfolio/components/PortfolioSummaryCards";
import OpenPositionsPanel from "@/modules/portfolio/components/OpenPositionsPanel";
import { useOpportunities } from "@/modules/arbitrage/hooks/useOpportunities";
import MarketTable from "@/modules/market/components/MarketTable";
import TradeHistoryPanel from "@/modules/portfolio/components/TradeHistoryPanel";
import { usePaperTrades } from "@/modules/paper-trading/hooks/usePaperTrades";
import { usePortfolioSummary } from "@/modules/portfolio/hooks/usePortfolioSummary";
import { useSystemHealth } from "@/modules/system-health/hooks/useSystemHealth";

import { useMarketStore } from "@/store/market.store";

export default function Dashboard() {
  const marketCount = useMarketStore(
    (state) =>
      Object.keys(
        state.markets,
      ).length,
  );

  const {
    data: healthResponse,
  } = useSystemHealth();

  const {
    data: opportunitiesResponse,
  } = useOpportunities();

  const {
    data: paperTradesResponse,
  } = usePaperTrades();

  const {
    data: portfolioResponse,
  } = usePortfolioSummary();

  const health =
    healthResponse?.data;

  const portfolio =
    portfolioResponse?.data;

  const liveOpportunities =
    opportunitiesResponse?.data ?? [];

  const paperTrades =
    paperTradesResponse?.data ?? [];

  const exchangesOnline =
    health?.exchanges.filter(
      (exchange) =>
        exchange.connected,
    ).length ?? 0;

  const totalExchanges =
    health?.exchanges.length ?? 0;

  const healthy =
    totalExchanges > 0 &&
    exchangesOnline ===
      totalExchanges;

  const cachedQuotes =
    health?.cache.cachedQuotes ??
    marketCount;

  const executableOpportunities =
    liveOpportunities.filter(
      (opportunity) =>
        opportunity.decision ===
          "EXECUTE" &&
        opportunity.enoughLiquidity &&
        opportunity.quotesAreFresh,
    ).length;

  const activePaperTrades =
    paperTrades.filter(
      (trade) =>
        trade.status === "detected" ||
        trade.status === "validated" ||
        trade.status === "open" ||
        trade.status ===
          "monitoring",
    );

  const completedPaperTrades =
    paperTrades.filter(
      (trade) =>
        trade.status === "closed" ||
        trade.status ===
          "target-hit",
    );

  const expectedProfit =
    activePaperTrades.reduce(
      (total, trade) =>
        total +
        trade.expectedProfit,
      0,
    );

  const fallbackActualProfit =
    completedPaperTrades.reduce(
      (total, trade) =>
        total +
        (trade.actualProfit ?? 0),
      0,
    );

  const fallbackWinningTrades =
    completedPaperTrades.filter(
      (trade) =>
        (trade.actualProfit ?? 0) >
        0,
    );

  const fallbackWinRate =
    completedPaperTrades.length > 0
      ? (
          fallbackWinningTrades.length /
          completedPaperTrades.length
        ) * 100
      : 0;

  const portfolioCapital =
    portfolio?.currentCapital ??
    100_000;

  const portfolioOpenTrades =
    portfolio?.openTrades ??
    activePaperTrades.length;

  const portfolioActualProfit =
    portfolio?.totalRealizedProfit ??
    fallbackActualProfit;

  const portfolioWinRate =
    portfolio?.winRatePercent ??
    fallbackWinRate;

  return (
    <section className="space-y-6 p-6 xl:p-8">
      <TradingOverviewHero
        exchangesOnline={
          exchangesOnline
        }
        cachedMarkets={
          cachedQuotes
        }
        opportunities={
          liveOpportunities.length
        }
        healthy={healthy}
      />

      {portfolio ? (
  <PortfolioSummaryCards
    portfolio={portfolio}
  />
) : (
  <div className="rounded-xl border border-border-default bg-panel p-6 text-sm text-text-muted">
    Loading portfolio metrics...
  </div>
)}

      <ExecutionTerminalSummary
        referenceCapital={
          portfolio?.availableCapital ??
          10_000
        }
        liveOpportunities={
          liveOpportunities.length
        }
        executableOpportunities={
          executableOpportunities
        }
        openPaperTrades={
          portfolioOpenTrades
        }
        expectedProfit={
          expectedProfit
        }
        systemHealthy={
          healthy
        }
      />

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <PortfolioWidget
          capital={
            portfolioCapital
          }
          openTrades={
            portfolioOpenTrades
          }
          expectedProfit={
            expectedProfit
          }
          actualProfit={
            portfolioActualProfit
          }
          winRate={
            portfolioWinRate
          }
        />

        <TopOpportunitiesPanel
          opportunities={
            liveOpportunities
          }
        />

        <SystemHealthWidget
          health={health}
        />
      </div>

      <div className="rounded-xl border border-border-default bg-panel p-5">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
            Live Market
          </p>

          <h2 className="mt-1 text-2xl font-bold text-text-primary">
            Market Terminal
          </h2>
        </div>
        <OpenPositionsPanel
  trades={activePaperTrades}
/>

        <MarketTable />
        <TradeHistoryPanel
  trades={completedPaperTrades}
/>
      </div>
    </section>
  );
}