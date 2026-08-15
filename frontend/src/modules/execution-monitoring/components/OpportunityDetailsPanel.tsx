import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Gauge,
  ShieldCheck,
  X,
} from "lucide-react";

import type {
  Opportunity,
} from "@/modules/arbitrage/types/Opportunity";

import DecisionBadge from "@/shared/components/DecisionBadge";

import {
  formatPrice,
} from "@/shared/utils/formatPrice";

interface OpportunityDetailsPanelProps {
  opportunity:
    | Opportunity
    | null;

  onClose: () => void;
}

export function OpportunityDetailsPanel({
  opportunity,
  onClose,
}: OpportunityDetailsPanelProps) {
  if (!opportunity) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Opportunity details"
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-background shadow-2xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-background/95 px-6 py-5 backdrop-blur">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-mono text-xl font-semibold text-text-primary">
                {opportunity.market}
              </h2>

              <DecisionBadge
                decision={
                  opportunity.decision
                }
              />
            </div>

            <p className="mt-2 text-sm text-text-muted">
              Opportunity execution analysis and exchange routing details.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-panel text-text-muted transition-colors hover:text-text-primary"
            aria-label="Close opportunity details"
          >
            <X size={17} />
          </button>
        </header>

        <div className="space-y-6 p-6">
          <section className="grid gap-3 sm:grid-cols-2">
            <ExchangeLegCard
              label="Buy Leg"
              exchange={
                opportunity.buyExchange
              }
              price={
                opportunity.buyPrice
              }
              quantity={
                opportunity.buyAvailableQty
              }
              type="buy"
            />

            <ExchangeLegCard
              label="Sell Leg"
              exchange={
                opportunity.sellExchange
              }
              price={
                opportunity.sellPrice
              }
              quantity={
                opportunity.sellAvailableQty
              }
              type="sell"
            />
          </section>

          <section className="rounded-xl border border-border bg-panel p-5">
            <div className="flex items-center gap-2">
              <ArrowRight
                size={18}
                className="text-primary"
              />

              <h3 className="font-semibold text-text-primary">
                Profit Analysis
              </h3>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <DetailItem
                label="Raw Spread"
                value={`${opportunity.rawSpreadPercent.toFixed(
                  4,
                )}%`}
              />

              <DetailItem
                label="Net Profit"
                value={`${opportunity.netProfitPercent.toFixed(
                  4,
                )}%`}
                valueClassName={
                  opportunity.netProfitPercent >
                  0
                    ? "text-emerald-400"
                    : "text-red-400"
                }
              />

              <DetailItem
                label="Raw Spread Value"
                value={
                  formatPrice(
                    opportunity.rawSpread,
                  )
                }
              />

              <DetailItem
                label="Estimated Fees"
                value={
                  formatPrice(
                    opportunity.estimatedFees,
                  )
                }
              />

              <DetailItem
                label="Estimated Net Profit"
                value={
                  formatPrice(
                    opportunity.netProfit,
                  )
                }
                valueClassName="text-emerald-400"
              />

              <DetailItem
                label="Executable Quantity"
                value={
                  formatPrice(
                    opportunity.executableQty,
                  )
                }
              />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-panel p-5">
            <div className="flex items-center gap-2">
              <Gauge
                size={18}
                className="text-primary"
              />

              <h3 className="font-semibold text-text-primary">
                Execution Scores
              </h3>
            </div>

            <div className="mt-5 space-y-4">
              <ScoreBar
                label="Overall"
                value={
                  opportunity.overallScore
                }
              />

              <ScoreBar
                label="Liquidity"
                value={
                  opportunity.liquidityScore
                }
              />

              <ScoreBar
                label="Freshness"
                value={
                  opportunity.freshnessScore
                }
              />

              <ScoreBar
                label="Fees"
                value={
                  opportunity.feeScore
                }
              />

              <ScoreBar
                label="Spread"
                value={
                  opportunity.spreadScore
                }
              />
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <BooleanStatus
              label="Quotes Fresh"
              value={
                opportunity.quotesAreFresh
              }
            />

            <BooleanStatus
              label="Enough Liquidity"
              value={
                opportunity.enoughLiquidity
              }
            />

            <BooleanStatus
              label="Last Price Fallback"
              value={
                opportunity.usedLastPriceFallback
              }
              invert
            />

            <div className="rounded-xl border border-border bg-panel p-4">
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <Clock3 size={16} />

                Snapshot Age
              </div>

              <p className="mt-2 font-medium text-text-primary">
                {formatSnapshotAge(
                  opportunity.timestamp,
                )}
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-panel p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck
                size={18}
                className="text-primary"
              />

              <h3 className="font-semibold text-text-primary">
                Analysis Summary
              </h3>
            </div>

            {opportunity.analysisSummary.length >
            0 ? (
              <ul className="mt-4 space-y-3">
                {opportunity.analysisSummary.map(
                  (
                    reason,
                    index,
                  ) => (
                    <li
                      key={`${reason}-${index}`}
                      className="flex items-start gap-3 text-sm text-text-muted"
                    >
                      <Activity
                        size={15}
                        className="mt-0.5 shrink-0 text-primary"
                      />

                      <span>
                        {reason}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-text-muted">
                No analysis summary is available.
              </p>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

interface ExchangeLegCardProps {
  label: string;

  exchange: string;

  price: number;

  quantity: number;

  type:
    | "buy"
    | "sell";
}

function ExchangeLegCard({
  label,
  exchange,
  price,
  quantity,
  type,
}: ExchangeLegCardProps) {
  return (
    <section className="rounded-xl border border-border bg-panel p-5">
      <p className="text-xs uppercase tracking-wide text-text-muted">
        {label}
      </p>

      <p
        className={`mt-2 text-lg font-semibold ${
          type === "buy"
            ? "text-emerald-400"
            : "text-red-400"
        }`}
      >
        {formatExchange(
          exchange,
        )}
      </p>

      <div className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-text-muted">
            Price
          </span>

          <span className="font-mono text-text-primary">
            {formatPrice(
              price,
            )}
          </span>
        </div>

        <div className="flex justify-between gap-4">
          <span className="text-text-muted">
            Available Qty
          </span>

          <span className="font-mono text-text-primary">
            {formatPrice(
              quantity,
            )}
          </span>
        </div>
      </div>
    </section>
  );
}

interface DetailItemProps {
  label: string;

  value: string;

  valueClassName?: string;
}

function DetailItem({
  label,
  value,
  valueClassName =
    "text-text-primary",
}: DetailItemProps) {
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

interface ScoreBarProps {
  label: string;

  value: number;
}

function ScoreBar({
  label,
  value,
}: ScoreBarProps) {
  const normalizedValue =
    Math.max(
      0,
      Math.min(
        value,
        100,
      ),
    );

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-text-muted">
          {label}
        </span>

        <span className="font-medium text-text-primary">
          {value.toFixed(
            0,
          )}
        </span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
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

interface BooleanStatusProps {
  label: string;

  value: boolean;

  invert?: boolean;
}

function BooleanStatus({
  label,
  value,
  invert = false,
}: BooleanStatusProps) {
  const positive =
    invert
      ? !value
      : value;

  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="flex items-center gap-2 text-sm text-text-muted">
        {positive ? (
          <CheckCircle2
            size={16}
            className="text-emerald-400"
          />
        ) : (
          <CircleAlert
            size={16}
            className="text-amber-400"
          />
        )}

        {label}
      </div>

      <p
        className={`mt-2 font-medium ${
          positive
            ? "text-emerald-400"
            : "text-amber-400"
        }`}
      >
        {value
          ? "Yes"
          : "No"}
      </p>
    </div>
  );
}

function formatSnapshotAge(
  timestamp: number,
): string {
  if (
    !Number.isFinite(
      timestamp,
    ) ||
    timestamp <= 0
  ) {
    return "Unknown";
  }

  const ageMs =
    Math.max(
      0,
      Date.now() -
        timestamp,
    );

  if (ageMs < 1_000) {
    return "Just now";
  }

  if (ageMs < 60_000) {
    return `${Math.floor(
      ageMs /
        1_000,
    )} seconds ago`;
  }

  return `${Math.floor(
    ageMs /
      60_000,
  )} minutes ago`;
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