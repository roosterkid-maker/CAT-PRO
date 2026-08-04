import DecisionBadge from "@/shared/components/DecisionBadge";
import { formatPrice } from "@/shared/utils/formatPrice";

import type { Opportunity } from "@/modules/arbitrage/types/Opportunity";

interface TopOpportunitiesPanelProps {
  opportunities: Opportunity[];
}

export default function TopOpportunitiesPanel({
  opportunities,
}: TopOpportunitiesPanelProps) {
  const top =
    opportunities.slice(0, 5);

  return (
    <div className="mb-6 rounded-xl border border-border-default bg-panel p-5">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
            Live Execution
          </p>

          <h2 className="mt-1 text-2xl font-bold">
            Top Ranked Opportunities
          </h2>
        </div>

        <span className="text-sm text-success">
          {top.length} Live
        </span>
      </div>

      <div className="space-y-3">
        {top.length === 0 && (
          <div className="rounded-lg border border-border-default bg-panel-light p-6 text-center text-text-muted">
            No executable opportunities.
          </div>
        )}

        {top.map((opportunity) => (
          <div
            key={`${opportunity.market}-${opportunity.buyExchange}-${opportunity.sellExchange}`}
            className="rounded-lg border border-border-default bg-panel-light p-4 transition-all hover:border-brand/40"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold">
                  {opportunity.market}
                </h3>

                <p className="mt-1 text-sm text-text-muted">
                  BUY{" "}
                  <span className="font-semibold text-success uppercase">
                    {opportunity.buyExchange}
                  </span>

                  {"  →  "}

                  SELL{" "}
                  <span className="font-semibold text-danger uppercase">
                    {opportunity.sellExchange}
                  </span>
                </p>
              </div>

              <DecisionBadge
                decision={opportunity.decision}
              />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <Metric
                title="Profit"
                value={`${opportunity.netProfitPercent.toFixed(2)}%`}
              />

              <Metric
                title="Score"
                value={opportunity.overallScore}
              />

              <Metric
                title="Executable Qty"
                value={formatPrice(
                  opportunity.executableQty,
                )}
              />

              <Metric
                title="Liquidity"
                value={`${opportunity.liquidityScore}`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface MetricProps {
  title: string;

  value: string | number;
}

function Metric({
  title,
  value,
}: MetricProps) {
  return (
    <div>
      <p className="text-xs text-text-muted">
        {title}
      </p>

      <p className="mt-1 font-semibold">
        {value}
      </p>
    </div>
  );
}