import DecisionBadge from "@/shared/components/DecisionBadge";
import MetricBar from "@/shared/components/MetricBar";
import ScoreBadge from "@/shared/components/ScoreBadge";
import SummaryList from "@/shared/components/SummaryList";
import { formatPrice } from "@/shared/utils/formatPrice";

import type { Opportunity } from "../types/Opportunity";

interface BestOpportunityCardProps {
  opportunity: Opportunity | undefined;
}

export default function BestOpportunityCard({
  opportunity,
}: BestOpportunityCardProps) {
  if (!opportunity) {
    return null;
  }

  return (
    <section className="mb-6 rounded-xl border border-border-default bg-panel p-5 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
            Execution Intelligence
          </p>

          <h2 className="mt-2 text-3xl font-bold text-text-primary">
            {opportunity.market}
          </h2>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <DecisionBadge decision={opportunity.decision} />

            <div className="rounded-lg border border-border-default bg-panel-light px-3 py-2">
              <p className="text-xs text-text-muted">
                Net Profit
              </p>

              <p className="mt-1 text-lg font-bold text-success">
                {opportunity.netProfitPercent.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>

        <ScoreBadge score={opportunity.overallScore} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border-default bg-panel-light p-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">
            Buy Exchange
          </p>

          <p className="mt-2 font-semibold uppercase text-success">
            {opportunity.buyExchange}
          </p>

          <p className="mt-1 font-mono text-sm text-text-primary">
            {formatPrice(opportunity.buyPrice)}
          </p>

          <p className="mt-2 text-xs text-text-muted">
            Available Qty
          </p>

          <p className="mt-1 font-mono text-sm">
            {formatPrice(opportunity.buyAvailableQty)}
          </p>
        </div>

        <div className="rounded-lg border border-border-default bg-panel-light p-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">
            Sell Exchange
          </p>

          <p className="mt-2 font-semibold uppercase text-danger">
            {opportunity.sellExchange}
          </p>

          <p className="mt-1 font-mono text-sm text-text-primary">
            {formatPrice(opportunity.sellPrice)}
          </p>

          <p className="mt-2 text-xs text-text-muted">
            Available Qty
          </p>

          <p className="mt-1 font-mono text-sm">
            {formatPrice(opportunity.sellAvailableQty)}
          </p>
        </div>

        <div className="rounded-lg border border-border-default bg-panel-light p-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">
            Executable Quantity
          </p>

          <p className="mt-2 font-mono text-lg font-semibold">
            {formatPrice(opportunity.executableQty)}
          </p>

          <p className="mt-3 text-xs text-text-muted">
            Required Quantity
          </p>

          <p className="mt-1 font-mono text-sm">
            {formatPrice(opportunity.requiredQty)}
          </p>
        </div>

        <div className="rounded-lg border border-border-default bg-panel-light p-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">
            Spread
          </p>

          <p className="mt-2 text-lg font-semibold text-success">
            {opportunity.rawSpreadPercent.toFixed(3)}%
          </p>

          <p className="mt-3 text-xs text-text-muted">
            Estimated Fees
          </p>

          <p className="mt-1 font-mono text-sm">
            {formatPrice(opportunity.estimatedFees)}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-lg border border-border-default bg-panel-light p-4">
          <MetricBar
            title="Liquidity"
            score={opportunity.liquidityScore}
          />

          <MetricBar
            title="Freshness"
            score={opportunity.freshnessScore}
          />

          <MetricBar
            title="Fees"
            score={opportunity.feeScore}
          />

          <MetricBar
            title="Spread"
            score={opportunity.spreadScore}
          />
        </div>

        <div className="rounded-lg border border-border-default bg-panel-light p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Analysis Summary
          </p>

          <SummaryList items={opportunity.analysisSummary} />
        </div>
      </div>
    </section>
  );
}