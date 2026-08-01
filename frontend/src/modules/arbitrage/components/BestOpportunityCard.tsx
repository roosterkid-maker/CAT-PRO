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
    <div className="mb-6 rounded-lg border border-success/30 bg-panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-success">
            Best Opportunity
          </p>

          <h2 className="mt-1 text-2xl font-semibold">
            {opportunity.market}
          </h2>
        </div>

        <div className="text-right">
          <p className="text-xs text-text-muted">
            Net Profit
          </p>

          <p className="text-2xl font-bold text-success">
            {opportunity.netProfitPercent.toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div>
          <p className="text-xs text-text-muted">
            Buy Exchange
          </p>

          <p className="mt-1 font-semibold uppercase text-success">
            {opportunity.buyExchange}
          </p>
        </div>

        <div>
          <p className="text-xs text-text-muted">
            Buy Price
          </p>

          <p className="mt-1 font-mono">
            {formatPrice(opportunity.buyPrice)}
          </p>
        </div>

        <div>
          <p className="text-xs text-text-muted">
            Sell Exchange
          </p>

          <p className="mt-1 font-semibold uppercase text-danger">
            {opportunity.sellExchange}
          </p>
        </div>

        <div>
          <p className="text-xs text-text-muted">
            Sell Price
          </p>

          <p className="mt-1 font-mono">
            {formatPrice(opportunity.sellPrice)}
          </p>
        </div>
      </div>
    </div>
  );
}