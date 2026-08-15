import {
  useState,
} from "react";

import {
  AlertCircle,
  ArrowRight,
  LoaderCircle,
  RefreshCw,
  TrendingUp,
} from "lucide-react";

import {
  useOpportunities,
} from "@/modules/arbitrage/hooks/useOpportunities";

import type {
  Opportunity,
} from "@/modules/arbitrage/types/Opportunity";

import DecisionBadge from "@/shared/components/DecisionBadge";

import {
  formatPrice,
} from "@/shared/utils/formatPrice";

import {
  OpportunityDetailsPanel,
} from "./OpportunityDetailsPanel";

const MAXIMUM_VISIBLE_OPPORTUNITIES =
  6;

export function LiveOpportunityFeed() {
  const [
    selectedOpportunity,
    setSelectedOpportunity,
  ] =
    useState<Opportunity | null>(
      null,
    );

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } =
    useOpportunities();

  const opportunities =
    data?.data
      .filter(
        (opportunity) =>
          opportunity.decision !==
          "SKIP",
      )
      .sort(
        (
          first,
          second,
        ) =>
          second.netProfitPercent -
          first.netProfitPercent,
      )
      .slice(
        0,
        MAXIMUM_VISIBLE_OPPORTUNITIES,
      ) ??
    [];

  return (
    <>
      <section className="overflow-hidden rounded-xl border border-border bg-panel">
        <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp
                size={18}
                className="text-primary"
              />

              <h2 className="text-lg font-semibold text-text-primary">
                Live Opportunities
              </h2>
            </div>

            <p className="mt-1 text-sm text-text-muted">
              Highest-ranked executable and review opportunities.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
              {opportunities.length} LIVE
            </span>

            <button
              type="button"
              onClick={() => {
                void refetch();
              }}
              disabled={
                isFetching
              }
              className="flex items-center gap-2 rounded-md border border-border bg-panel-light px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                size={14}
                className={
                  isFetching
                    ? "animate-spin"
                    : undefined
                }
              />

              Refresh
            </button>
          </div>
        </header>

        {isLoading ? (
          <div className="flex min-h-56 items-center justify-center gap-3 text-sm text-text-muted">
            <LoaderCircle
              size={18}
              className="animate-spin"
            />

            Loading live opportunities...
          </div>
        ) : error ? (
          <div className="flex min-h-56 items-center justify-center gap-3 px-6 text-sm text-red-400">
            <AlertCircle
              size={18}
            />

            {error instanceof Error
              ? error.message
              : "Unable to load opportunities."}
          </div>
        ) : opportunities.length ===
          0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-2 text-center">
            <TrendingUp
              size={24}
              className="text-text-muted"
            />

            <p className="text-sm font-medium text-text-primary">
              No executable opportunities
            </p>

            <p className="text-xs text-text-muted">
              Fresh profitable opportunities will appear automatically.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {opportunities.map(
              (
                opportunity,
                index,
              ) => (
                <OpportunityRow
                  key={
                    opportunity.id
                  }
                  opportunity={
                    opportunity
                  }
                  rank={
                    index + 1
                  }
                  onSelect={() => {
                    setSelectedOpportunity(
                      opportunity,
                    );
                  }}
                />
              ),
            )}
          </div>
        )}
      </section>

      <OpportunityDetailsPanel
        opportunity={
          selectedOpportunity
        }
        onClose={() => {
          setSelectedOpportunity(
            null,
          );
        }}
      />
    </>
  );
}

interface OpportunityRowProps {
  opportunity:
    Opportunity;

  rank: number;

  onSelect: () => void;
}

function OpportunityRow({
  opportunity,
  rank,
  onSelect,
}: OpportunityRowProps) {
  const isExecutable =
    opportunity.decision ===
    "EXECUTE";

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (
          event.key ===
            "Enter" ||
          event.key ===
            " "
        ) {
          event.preventDefault();

          onSelect();
        }
      }}
      className="cursor-pointer px-5 py-4 transition-colors hover:bg-panel-light/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-panel-light text-sm font-semibold text-text-muted">
            {rank}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-mono text-base font-semibold text-text-primary">
                {opportunity.market}
              </h3>

              <DecisionBadge
                decision={
                  opportunity.decision
                }
              />

              {opportunity.quotesAreFresh ? (
                <span className="text-xs text-emerald-400">
                  Fresh
                </span>
              ) : (
                <span className="text-xs text-amber-400">
                  Stale
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <ExchangeLabel
                label="BUY"
                exchange={
                  opportunity.buyExchange
                }
                type="buy"
              />

              <ArrowRight
                size={14}
                className="text-text-muted"
              />

              <ExchangeLabel
                label="SELL"
                exchange={
                  opportunity.sellExchange
                }
                type="sell"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:min-w-135">
          <OpportunityMetric
            label="Net Profit"
            value={`${opportunity.netProfitPercent.toFixed(
              3,
            )}%`}
            valueClassName={
              isExecutable
                ? "text-emerald-400"
                : "text-amber-400"
            }
          />

          <OpportunityMetric
            label="Buy Price"
            value={
              formatPrice(
                opportunity.buyPrice,
              )
            }
          />

          <OpportunityMetric
            label="Sell Price"
            value={
              formatPrice(
                opportunity.sellPrice,
              )
            }
          />

          <OpportunityMetric
            label="Executable Qty"
            value={
              formatPrice(
                opportunity.executableQty,
              )
            }
          />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <ScoreItem
          label="Overall"
          value={
            opportunity.overallScore
          }
        />

        <ScoreItem
          label="Liquidity"
          value={
            opportunity.liquidityScore
          }
        />

        <ScoreItem
          label="Freshness"
          value={
            opportunity.freshnessScore
          }
        />

        <ScoreItem
          label="Spread"
          value={
            opportunity.spreadScore
          }
        />
      </div>
    </article>
  );
}

interface ExchangeLabelProps {
  label: string;

  exchange: string;

  type:
    | "buy"
    | "sell";
}

function ExchangeLabel({
  label,
  exchange,
  type,
}: ExchangeLabelProps) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-xs text-text-muted">
        {label}
      </span>

      <span
        className={
          type === "buy"
            ? "font-semibold uppercase text-emerald-400"
            : "font-semibold uppercase text-red-400"
        }
      >
        {formatExchange(
          exchange,
        )}
      </span>
    </span>
  );
}

interface OpportunityMetricProps {
  label: string;

  value:
    | string
    | number;

  valueClassName?: string;
}

function OpportunityMetric({
  label,
  value,
  valueClassName =
    "text-text-primary",
}: OpportunityMetricProps) {
  return (
    <div>
      <p className="text-xs text-text-muted">
        {label}
      </p>

      <p
        className={`mt-1 font-mono text-sm font-semibold ${valueClassName}`}
      >
        {value}
      </p>
    </div>
  );
}

interface ScoreItemProps {
  label: string;

  value: number;
}

function ScoreItem({
  label,
  value,
}: ScoreItemProps) {
  const safeValue =
    Number.isFinite(value)
      ? value
      : 0;

  const normalizedValue =
    Math.max(
      0,
      Math.min(
        safeValue,
        100,
      ),
    );

  return (
    <div className="rounded-lg border border-border bg-panel-light/40 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-text-muted">
          {label}
        </span>

        <span className="font-medium text-text-primary">
          {safeValue.toFixed(
            0,
          )}
        </span>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{
            width:
              `${normalizedValue}%`,
          }}
        />
      </div>
    </div>
  );
}

function formatExchange(
  exchange: string,
): string {
  const normalized =
    exchange
      .trim()
      .toLowerCase();

  if (
    normalized ===
    "coindcx"
  ) {
    return "CoinDCX";
  }

  if (
    normalized ===
    "binance"
  ) {
    return "Binance";
  }

  return exchange;
}