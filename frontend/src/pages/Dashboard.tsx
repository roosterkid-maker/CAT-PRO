import ExecutionTerminalSummary from "@/components/dashboard/ExecutionTerminalSummary";
import PortfolioWidget from "@/components/dashboard/PortfolioWidget";
import SystemHealthWidget from "@/components/dashboard/SystemHealthWidget";
import TopOpportunitiesPanel from "@/components/dashboard/TopOpportunitiesPanel";
import TradingOverviewHero from "@/components/dashboard/TradingOverviewHero";
import {
  APP_PAGE_PATHS,
} from "@/app/routes";
import {
  useOpportunities,
} from "@/modules/arbitrage/hooks/useOpportunities";
import {
  usePaperTrades,
} from "@/modules/paper-trading/hooks/usePaperTrades";
import OpenPositionsPanel from "@/modules/portfolio/components/OpenPositionsPanel";
import PortfolioSummaryCards from "@/modules/portfolio/components/PortfolioSummaryCards";
import ExchangeBalancesPanel from "@/modules/portfolio/components/ExchangeBalancesPanel";
import TradeHistoryPanel from "@/modules/portfolio/components/TradeHistoryPanel";
import {
  usePortfolioSummary,
} from "@/modules/portfolio/hooks/usePortfolioSummary";
import ProductionReadinessOverview from "@/modules/production-safety/components/ProductionReadinessOverview";
import {
  useV18ProductionReadiness,
} from "@/modules/production-safety/hooks/useV18ProductionReadiness";
import {
  useSystemHealth,
} from "@/modules/system-health/hooks/useSystemHealth";
import {
  Link,
} from "react-router-dom";

export default function Dashboard() {
  const {
    data:
      healthResponse,

    isPending:
      healthPending,

    isError:
      healthError,
  } = useSystemHealth();

  const {
    data:
      opportunitiesResponse,

    isPending:
      opportunitiesPending,

    isError:
      opportunitiesError,
  } = useOpportunities();

  const {
    data:
      paperTradesResponse,

    isPending:
      paperTradesPending,

    isError:
      paperTradesError,
  } = usePaperTrades();

  const {
    data:
      portfolioResponse,

    isPending:
      portfolioPending,

    isError:
      portfolioError,
  } = usePortfolioSummary();

  const {
    data:
      readinessResponse,

    isPending:
      readinessPending,

    isError:
      readinessError,
  } =
    useV18ProductionReadiness();

  const health =
    healthResponse?.data;

  const portfolio =
    portfolioResponse?.data;

  const readiness =
    readinessResponse?.data;

  const liveOpportunities =
    opportunitiesResponse
      ?.data;

  const paperTrades =
    paperTradesResponse
      ?.data;

  const opportunityItems =
    liveOpportunities ?? [];

  const paperTradeItems =
    paperTrades ?? [];

  const executableOpportunities =
    liveOpportunities
      ? liveOpportunities.filter(
          (
            opportunity,
          ) =>
            opportunity.decision ===
              "EXECUTE" &&
            opportunity
              .enoughLiquidity &&
            opportunity
              .quotesAreFresh,
        ).length
      : null;

  const activePaperTrades =
    paperTradeItems.filter(
      (
        trade,
      ) =>
        trade.status ===
          "detected" ||
        trade.status ===
          "validated" ||
        trade.status ===
          "open" ||
        trade.status ===
          "monitoring",
    );

  const completedPaperTrades =
    paperTradeItems.filter(
      (
        trade,
      ) =>
        trade.status ===
          "closed" ||
        trade.status ===
          "target-hit",
    );

  const expectedProfit =
    paperTrades
      ? activePaperTrades.reduce(
          (
            total,
            trade,
          ) =>
            total +
            trade
              .expectedProfit,
          0,
        )
      : null;

  const portfolioCapital =
    portfolio
      ?.currentCapital ??
    null;

  const portfolioOpenTrades =
    portfolio?.openTrades ??
    (paperTrades
      ? activePaperTrades.length
      : null);

  const portfolioActualProfit =
    portfolio
      ?.totalRealizedProfit ??
    null;

  const portfolioWinRate =
    portfolio
      ?.winRatePercent ??
    null;

  return (
    <section className="space-y-6 p-6 xl:p-8">
      <TradingOverviewHero
        exchanges={
          health?.exchanges
        }
        cachedMarkets={
          health?.cache
            .cachedQuotes ??
          null
        }
        opportunities={
          liveOpportunities
            ?.length ??
          null
        }
        healthLoading={
          healthPending
        }
        healthUnavailable={
          healthError ||
          (!healthPending &&
            !health)
        }
      />

      <ProductionReadinessOverview
        report={
          readiness
        }
        loading={
          readinessPending
        }
        unavailable={
          readinessError
        }
      />

      {portfolio ? (
        <PortfolioSummaryCards
          portfolio={
            portfolio
          }
        />
      ) : (
        <EvidenceState
          title="Portfolio metrics"
          loading={
            portfolioPending
          }
          unavailable={
            portfolioError
          }
        />
      )}

      <ExchangeBalancesPanel />

      <ExecutionTerminalSummary
        referenceCapital={
          portfolio
            ?.availableCapital ??
          null
        }
        liveOpportunities={
          liveOpportunities
            ?.length ??
          null
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
        readiness={
          readiness
        }
        readinessLoading={
          readinessPending
        }
        readinessUnavailable={
          readinessError ||
          (!readinessPending &&
            !readiness)
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

        {liveOpportunities ? (
          <TopOpportunitiesPanel
            opportunities={
              opportunityItems
            }
          />
        ) : (
          <EvidenceState
            title="Opportunity evidence"
            loading={
              opportunitiesPending
            }
            unavailable={
              opportunitiesError
            }
          />
        )}

        <SystemHealthWidget
          health={
            health
          }
          loading={
            healthPending
          }
          unavailable={
            healthError
          }
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

        {paperTrades ? (
          <OpenPositionsPanel
            trades={
              activePaperTrades
            }
          />
        ) : (
          <EvidenceState
            title="Open paper trades"
            loading={
              paperTradesPending
            }
            unavailable={
              paperTradesError
            }
          />
        )}

        <div className="my-4 flex flex-col gap-3 rounded-lg border border-border-default bg-background-subtle p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-text-primary">
              Live market stream
            </p>

            <p className="mt-1 text-sm text-text-muted">
              {health?.cache
                .cachedQuotes ??
                "Current"} market quotes are available in the dedicated terminal.
            </p>
          </div>

          <Link
            to={
              APP_PAGE_PATHS.markets
            }
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-accent-primary/40 bg-accent-primary/10 px-4 py-2 text-sm font-semibold text-accent-primary transition hover:bg-accent-primary/20"
          >
            Open Markets terminal
          </Link>
        </div>

        {paperTrades ? (
          <TradeHistoryPanel
            trades={
              completedPaperTrades
            }
          />
        ) : (
          <EvidenceState
            title="Paper trade history"
            loading={
              paperTradesPending
            }
            unavailable={
              paperTradesError
            }
          />
        )}
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
    <div className="rounded-xl border border-border-default bg-panel p-6 text-sm text-text-muted">
      <p className="font-semibold text-text-primary">
        {title}
      </p>

      <p className="mt-1">
        {loading
          ? "Loading backend evidence..."
          : unavailable
            ? "Backend evidence is unavailable."
            : "Backend returned no evidence."}
      </p>
    </div>
  );
}
