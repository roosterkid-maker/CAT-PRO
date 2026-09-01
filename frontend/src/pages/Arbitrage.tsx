import {
  Search,
  ShieldCheck,
  TimerReset,
} from "lucide-react";

import {
  useMemo,
  useState,
} from "react";

import OpportunityLastLookPanel from "@/modules/arbitrage/components/OpportunityLastLookPanel";

import ObservedOpportunityRoutesPanel from "@/modules/arbitrage/components/ObservedOpportunityRoutesPanel";

import TradePlanner from "@/modules/arbitrage/components/TradePlanner";

import {
  useOpportunities,
} from "@/modules/arbitrage/hooks/useOpportunities";

import type {
  Opportunity,
  OpportunityDecision,
} from "@/modules/arbitrage/types/Opportunity";

import {
  useOpportunityNearMissAnalytics,
} from "@/modules/opportunity-diagnostics/hooks/useOpportunityEconomicsDiagnostics";

import DecisionBadge from "@/shared/components/DecisionBadge";

import MetricBar from "@/shared/components/MetricBar";

import ScoreBadge from "@/shared/components/ScoreBadge";

import SummaryList from "@/shared/components/SummaryList";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";

import {
  formatPrice,
} from "@/shared/utils/formatPrice";

type DecisionFilter =
  | "ALL"
  | OpportunityDecision;

export default function Arbitrage() {
  const {
    data,
    isLoading,
    isError,
    isFetching,
    error,
  } =
    useOpportunities();

  const nearMissQuery =
    useOpportunityNearMissAnalytics();

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    decisionFilter,
    setDecisionFilter,
  ] =
    useState<DecisionFilter>(
      "ALL",
    );

  const [
    selectedOpportunityId,
    setSelectedOpportunityId,
  ] =
    useState<string | null>(
      null,
    );

  const opportunities =
    useMemo(
      () =>
        data?.data ?? [],
      [
        data?.data,
      ],
    );

  const nearMissReport =
    nearMissQuery.data?.data;

  const filteredOpportunities =
    useMemo(
      () => {
        const normalizedSearch =
          search
            .trim()
            .toLowerCase();

        return opportunities.filter(
          (
            opportunity,
          ) => {
            const matchesDecision =
              decisionFilter ===
                "ALL" ||
              opportunity.decision ===
                decisionFilter;

            const matchesSearch =
              normalizedSearch.length ===
                0 ||
              opportunity.market
                .toLowerCase()
                .includes(
                  normalizedSearch,
                ) ||
              opportunity.buyExchange
                .toLowerCase()
                .includes(
                  normalizedSearch,
                ) ||
              opportunity.sellExchange
                .toLowerCase()
                .includes(
                  normalizedSearch,
                );

            return (
              matchesDecision &&
              matchesSearch
            );
          },
        );
      },
      [
        decisionFilter,
        opportunities,
        search,
      ],
    );

  const selectedOpportunity =
    useMemo(
      () => {
        if (
          opportunities.length ===
          0
        ) {
          return null;
        }

        if (
          selectedOpportunityId ===
          null
        ) {
          return opportunities[0];
        }

        return (
          opportunities.find(
            (
              opportunity,
            ) =>
              opportunity.id ===
              selectedOpportunityId,
          ) ??
          opportunities[0]
        );
      },
      [
        opportunities,
        selectedOpportunityId,
      ],
    );

  if (isLoading) {
    return (
      <div className="text-text-muted">
        Loading arbitrage
        opportunities...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-danger/30 bg-panel p-6 text-danger">
        Failed to load
        opportunities:{" "}
        {error instanceof Error
          ? error.message
          : "Unknown error"}
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <section className="rounded-xl border border-border-default bg-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-success">
              <ShieldCheck className="size-4" />

              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                Arbitrage
                Intelligence
              </p>
            </div>

            <h1 className="mt-2 text-3xl font-bold text-text-primary">
              Professional
              Opportunity Board
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              Ranked
              cross-exchange
              opportunities using
              executable bid/ask,
              fees, liquidity,
              freshness, and the
              current
              opportunity-engine
              decision. This board
              is analytical and
              does not submit LIVE
              orders.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
            <span className="size-2 rounded-full bg-success" />

            {isFetching ||
            nearMissQuery.isFetching
              ? "REFRESHING"
              : "AUTO REFRESH"}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryMetric
            label="Accepted Opportunities"
            value={
              opportunities.length
            }
          />

          <SummaryMetric
            label="Raw-positive Routes"
            value={
              nearMissReport
                ?.pipeline
                .rawPositiveSpreads ??
              0
            }
          />

          <SummaryMetric
            label="Fee-positive Routes"
            value={
              nearMissReport
                ?.pipeline
                .feePositiveSpreads ??
              0
            }
          />

          <SummaryMetric
            label="Current Rejects"
            value={
              nearMissReport
                ?.rejectionSummary
                .totalCurrentScanRejections ??
              0
            }
          />
        </div>
      </section>

      <section className="rounded-xl border border-border-default bg-panel p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-xl">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />

            <input
              value={
                search
              }
              onChange={(
                event,
              ) =>
                setSearch(
                  event.target.value,
                )
              }
              placeholder="Search market or exchange..."
              className="w-full rounded-md border border-border-default bg-panel-light py-2 pl-9 pr-3 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-brand/60"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                "ALL",
                "EXECUTE",
                "REVIEW",
                "SKIP",
              ] as DecisionFilter[]
            ).map(
              (
                filter,
              ) => (
                <button
                  key={
                    filter
                  }
                  type="button"
                  onClick={() =>
                    setDecisionFilter(
                      filter,
                    )
                  }
                  className={`rounded-md border px-3 py-2 text-xs font-semibold transition ${
                    decisionFilter ===
                    filter
                      ? "border-brand/50 bg-brand/10 text-brand"
                      : "border-border-default bg-panel-light text-text-muted hover:text-text-primary"
                  }`}
                >
                  {filter}
                </button>
              ),
            )}
          </div>
        </div>

        <div className="mt-4 max-h-[55vh] overflow-auto rounded-lg border border-border-default">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-panel-light">
              <TableRow className="border-border-default hover:bg-panel-light">
                <TableHead>
                  Market
                </TableHead>

                <TableHead>
                  Route
                </TableHead>

                <TableHead>
                  Decision
                </TableHead>

                <TableHead className="text-right">
                  Buy
                </TableHead>

                <TableHead className="text-right">
                  Sell
                </TableHead>

                <TableHead className="text-right">
                  Gross %
                </TableHead>

                <TableHead className="text-right">
                  Fees
                </TableHead>

                <TableHead className="text-right">
                  Net %
                </TableHead>

                <TableHead className="text-right">
                  Exec Qty
                </TableHead>

                <TableHead className="text-right">
                  Quality
                </TableHead>

                <TableHead className="text-right">
                  Age
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredOpportunities.length ===
              0 ? (
                <TableRow>
                  <TableCell
                    colSpan={
                      11
                    }
                    className="h-32 text-center text-text-muted"
                  >
                    {opportunities.length ===
                      0 &&
                    search.trim().length ===
                      0 &&
                    decisionFilter ===
                      "ALL"
                      ? "No accepted opportunities in the current scan. Observed and rejected routes are shown below."
                      : "No accepted opportunities match the current filters."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredOpportunities.map(
                  (
                    opportunity,
                  ) => {
                    const selected =
                      selectedOpportunity?.id ===
                      opportunity.id;

                    return (
                      <TableRow
                        key={
                          opportunity.id
                        }
                        tabIndex={
                          0
                        }
                        aria-selected={
                          selected
                        }
                        onClick={() =>
                          setSelectedOpportunityId(
                            opportunity.id,
                          )
                        }
                        onKeyDown={(
                          event,
                        ) => {
                          if (
                            event.key ===
                              "Enter" ||
                            event.key ===
                              " "
                          ) {
                            event.preventDefault();

                            setSelectedOpportunityId(
                              opportunity.id,
                            );
                          }
                        }}
                        className={`cursor-pointer border-border-default transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${
                          selected
                            ? "bg-panel-light"
                            : "hover:bg-panel-light"
                        }`}
                      >
                        <TableCell className="font-semibold text-text-primary">
                          {
                            opportunity.market
                          }
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-semibold uppercase text-success">
                              {
                                opportunity.buyExchange
                              }
                            </span>

                            <span className="text-text-muted">
                              →
                            </span>

                            <span className="font-semibold uppercase text-danger">
                              {
                                opportunity.sellExchange
                              }
                            </span>
                          </div>
                        </TableCell>

                        <TableCell>
                          <DecisionBadge
                            decision={
                              opportunity.decision
                            }
                            scope="ANALYTICAL"
                          />
                        </TableCell>

                        <TableCell className="text-right font-mono tabular-nums">
                          {formatPrice(
                            opportunity.buyPrice,
                          )}
                        </TableCell>

                        <TableCell className="text-right font-mono tabular-nums">
                          {formatPrice(
                            opportunity.sellPrice,
                          )}
                        </TableCell>

                        <TableCell className="text-right font-mono tabular-nums">
                          {opportunity.rawSpreadPercent.toFixed(
                            3,
                          )}
                          %
                        </TableCell>

                        <TableCell className="text-right font-mono tabular-nums text-text-muted">
                          {formatPrice(
                            opportunity.estimatedFees,
                          )}
                        </TableCell>

                        <TableCell
                          className={`text-right font-semibold tabular-nums ${
                            opportunity.netProfitPercent >
                            0
                              ? "text-success"
                              : "text-danger"
                          }`}
                        >
                          {opportunity.netProfitPercent.toFixed(
                            3,
                          )}
                          %
                        </TableCell>

                        <TableCell className="text-right font-mono tabular-nums">
                          {formatPrice(
                            opportunity.executableQty,
                          )}
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-2">
                            <span
                              className={`size-2 rounded-full ${
                                opportunity.quotesAreFresh &&
                                opportunity.enoughLiquidity
                                  ? "bg-success"
                                  : "bg-warning"
                              }`}
                            />

                            <span className="font-mono text-xs font-semibold">
                              {
                                opportunity.overallScore
                              }
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="text-right font-mono text-xs text-text-muted">
                          {formatAge(
                            opportunity.timestamp,
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  },
                )
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-text-muted">
          <span>
            Showing{" "}
            {
              filteredOpportunities.length
            }{" "}
            of{" "}
            {
              opportunities.length
            }
          </span>

          <span>
            Exact backend
            snapshots are
            refreshed every 2
            seconds.
          </span>
        </div>
      </section>

      <ObservedOpportunityRoutesPanel
        report={nearMissReport}
        isLoading={
          nearMissQuery.isLoading
        }
        isError={
          nearMissQuery.isError
        }
        isFetching={
          nearMissQuery.isFetching
        }
      />

      {selectedOpportunity ? (
        <>
          <OpportunityInspector
            opportunity={
              selectedOpportunity
            }
          />

          <OpportunityLastLookPanel
            opportunity={
              selectedOpportunity
            }
          />

          <TradePlanner
            opportunity={
              selectedOpportunity
            }
          />
        </>
      ) : null}
    </section>
  );
}

function OpportunityInspector({
  opportunity,
}: {
  opportunity: Opportunity;
}) {
  return (
    <section className="rounded-xl border border-border-default bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
            Selected
            Opportunity
          </p>

          <h2 className="mt-1 text-2xl font-bold text-text-primary">
            {
              opportunity.market
            }
          </h2>

          <p className="mt-1 text-sm text-text-muted">
            <span className="uppercase text-success">
              {
                opportunity.buyExchange
              }
            </span>{" "}
            buy →{" "}
            <span className="uppercase text-danger">
              {
                opportunity.sellExchange
              }
            </span>{" "}
            sell
          </p>
        </div>

        <div className="flex items-center gap-3">
          <DecisionBadge
            decision={
              opportunity.decision
            }
            scope="ANALYTICAL"
          />

          <ScoreBadge
            score={
              opportunity.overallScore
            }
          />
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <DetailMetric
          label="Gross Spread"
          value={`${opportunity.rawSpreadPercent.toFixed(
            4,
          )}%`}
        />

        <DetailMetric
          label="Estimated Fees"
          value={formatPrice(
            opportunity.estimatedFees,
          )}
        />

        <DetailMetric
          label="Net Profit"
          value={`${opportunity.netProfitPercent.toFixed(
            4,
          )}%`}
        />

        <DetailMetric
          label="Executable Qty"
          value={formatPrice(
            opportunity.executableQty,
          )}
        />

        <DetailMetric
          label="Snapshot Age"
          value={formatAge(
            opportunity.timestamp,
          )}
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-4 sm:grid-cols-2">
          <RouteCard
            side="BUY"
            exchange={
              opportunity.buyExchange
            }
            price={
              opportunity.buyPrice
            }
            available={
              opportunity.buyAvailableQty
            }
          />

          <RouteCard
            side="SELL"
            exchange={
              opportunity.sellExchange
            }
            price={
              opportunity.sellPrice
            }
            available={
              opportunity.sellAvailableQty
            }
          />

          <div className="space-y-4 rounded-lg border border-border-default bg-panel-light p-4 sm:col-span-2">
            <MetricBar
              title="Liquidity"
              score={
                opportunity.liquidityScore
              }
            />

            <MetricBar
              title="Freshness"
              score={
                opportunity.freshnessScore
              }
            />

            <MetricBar
              title="Fees"
              score={
                opportunity.feeScore
              }
            />

            <MetricBar
              title="Spread"
              score={
                opportunity.spreadScore
              }
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border-default bg-panel-light p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
              Execution
              Integrity
            </p>

            <div className="mt-3 space-y-3">
              <IntegrityRow
                label="Quotes Fresh"
                value={
                  opportunity.quotesAreFresh
                }
              />

              <IntegrityRow
                label="Liquidity Pass"
                value={
                  opportunity.enoughLiquidity
                }
              />

              <IntegrityRow
                label="Last-price Fallback"
                value={
                  !opportunity.usedLastPriceFallback
                }
                positiveLabel="NOT USED"
                negativeLabel="USED"
              />
            </div>
          </div>

          <div className="rounded-lg border border-border-default bg-panel-light p-4">
            <div className="flex items-center gap-2">
              <TimerReset className="size-4 text-brand" />

              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                Engine Analysis
              </p>
            </div>

            <div className="mt-3">
              <SummaryList
                items={
                  opportunity.analysisSummary
                }
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SummaryMetric({
  label,
  value,
}: {
  label: string;

  value: number;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-text-muted">
        {label}
      </p>

      <p className="mt-2 text-2xl font-bold text-text-primary">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function DetailMetric({
  label,
  value,
}: {
  label: string;

  value: string;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-4">
      <p className="text-[10px] uppercase tracking-[0.14em] text-text-muted">
        {label}
      </p>

      <p className="mt-1 font-mono text-sm font-bold text-text-primary">
        {value}
      </p>
    </div>
  );
}

function RouteCard({
  side,
  exchange,
  price,
  available,
}: {
  side:
    | "BUY"
    | "SELL";

  exchange: string;

  price: number;

  available: number;
}) {
  const sideClass =
    side === "BUY"
      ? "text-success"
      : "text-danger";

  return (
    <div className="rounded-lg border border-border-default bg-panel-light p-4">
      <p
        className={`text-xs font-bold tracking-[0.16em] ${sideClass}`}
      >
        {side}
      </p>

      <p className="mt-2 text-lg font-bold uppercase text-text-primary">
        {exchange}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <DetailMetric
          label="Price"
          value={formatPrice(
            price,
          )}
        />

        <DetailMetric
          label="Available"
          value={formatPrice(
            available,
          )}
        />
      </div>
    </div>
  );
}

function IntegrityRow({
  label,
  value,
  positiveLabel =
    "PASS",
  negativeLabel =
    "BLOCKED",
}: {
  label: string;

  value: boolean;

  positiveLabel?: string;

  negativeLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-default pb-2 last:border-b-0 last:pb-0">
      <span className="text-sm text-text-muted">
        {label}
      </span>

      <span
        className={`font-mono text-xs font-bold ${
          value
            ? "text-success"
            : "text-danger"
        }`}
      >
        {value
          ? positiveLabel
          : negativeLabel}
      </span>
    </div>
  );
}

function formatAge(
  timestamp: number,
): string {
  const ageMs =
    Math.max(
      0,
      Date.now() -
        timestamp,
    );

  if (
    ageMs <
    1_000
  ) {
    return `${Math.round(
      ageMs,
    )} ms`;
  }

  if (
    ageMs <
    60_000
  ) {
    return `${(
      ageMs /
      1_000
    ).toFixed(
      1,
    )} s`;
  }

  return `${(
    ageMs /
    60_000
  ).toFixed(
    1,
  )} min`;
}
