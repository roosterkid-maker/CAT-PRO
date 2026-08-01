import { useEffect, useState } from "react";

import BestOpportunityCard from "@/modules/arbitrage/components/BestOpportunityCard";
import TradePlanner from "@/modules/arbitrage/components/TradePlanner";
import { useOpportunities } from "@/modules/arbitrage/hooks/useOpportunities";
import type { Opportunity } from "@/modules/arbitrage/types/Opportunity";
import DecisionBadge from "@/shared/components/DecisionBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { formatPrice } from "@/shared/utils/formatPrice";

export default function Arbitrage() {
  const {
    data,
    isLoading,
    isError,
    error,
  } = useOpportunities();

  const [selectedOpportunity, setSelectedOpportunity] =
    useState<Opportunity | null>(null);

  const opportunities = data?.data ?? [];
  const bestOpportunity = opportunities[0];

  useEffect(() => {
    if (opportunities.length === 0) {
      setSelectedOpportunity(null);
      return;
    }

    setSelectedOpportunity((current) => {
      if (!current) {
        return opportunities[0];
      }

      const refreshedOpportunity =
        opportunities.find(
          (opportunity) =>
            opportunity.market === current.market &&
            opportunity.buyExchange ===
              current.buyExchange &&
            opportunity.sellExchange ===
              current.sellExchange,
        );

      return (
        refreshedOpportunity ??
        opportunities[0]
      );
    });
  }, [opportunities]);

  if (isLoading) {
    return (
      <div className="text-text-muted">
        Loading arbitrage opportunities...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-danger">
        Failed to load opportunities:{" "}
        {error instanceof Error
          ? error.message
          : "Unknown error"}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">
          Arbitrage Opportunities
        </h1>

        <p className="mt-1 text-sm text-text-muted">
          Execution-quality cross-exchange opportunities
          ranked by liquidity, freshness, fees, spread,
          and overall score.
        </p>
      </div>

      <BestOpportunityCard
        opportunity={bestOpportunity}
      />

      {selectedOpportunity && (
        <div className="mb-6">
          <TradePlanner
            opportunity={selectedOpportunity}
          />
        </div>
      )}

      <div className="mb-4 flex items-center justify-between gap-4">
        <span className="text-sm text-text-muted">
          Opportunities: {opportunities.length}
        </span>

        <span className="text-sm text-success">
          ● Auto-refreshing
        </span>
      </div>

      <div className="max-h-[65vh] overflow-auto rounded-lg border border-border-default bg-panel">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-panel-light">
            <TableRow className="border-border-default hover:bg-panel-light">
              <TableHead>Market</TableHead>
              <TableHead>Decision</TableHead>
              <TableHead>Buy</TableHead>
              <TableHead>Sell</TableHead>

              <TableHead className="text-right">
                Buy Price
              </TableHead>

              <TableHead className="text-right">
                Sell Price
              </TableHead>

              <TableHead className="text-right">
                Profit %
              </TableHead>

              <TableHead className="text-right">
                Score
              </TableHead>

              <TableHead className="text-right">
                Executable Qty
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {opportunities.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="h-32 text-center text-text-muted"
                >
                  No executable opportunities currently
                  match the policy.
                </TableCell>
              </TableRow>
            ) : (
              opportunities.map(
                (opportunity) => {
                  const isSelected =
                    selectedOpportunity?.market ===
                      opportunity.market &&
                    selectedOpportunity?.buyExchange ===
                      opportunity.buyExchange &&
                    selectedOpportunity?.sellExchange ===
                      opportunity.sellExchange;

                  return (
                    <TableRow
                      key={`${opportunity.market}-${opportunity.buyExchange}-${opportunity.sellExchange}`}
                      onClick={() =>
                        setSelectedOpportunity(
                          opportunity,
                        )
                      }
                      className={`cursor-pointer border-border-default transition-colors ${
                        isSelected
                          ? "bg-panel-light"
                          : "hover:bg-panel-light"
                      }`}
                    >
                      <TableCell className="font-medium">
                        {opportunity.market}
                      </TableCell>

                      <TableCell>
                        <DecisionBadge
                          decision={
                            opportunity.decision
                          }
                        />
                      </TableCell>

                      <TableCell className="uppercase text-success">
                        {opportunity.buyExchange}
                      </TableCell>

                      <TableCell className="uppercase text-danger">
                        {opportunity.sellExchange}
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

                      <TableCell className="text-right font-semibold text-success">
                        {opportunity.netProfitPercent.toFixed(
                          2,
                        )}
                        %
                      </TableCell>

                      <TableCell className="text-right font-semibold">
                        {opportunity.overallScore}
                      </TableCell>

                      <TableCell className="text-right font-mono tabular-nums">
                        {formatPrice(
                          opportunity.executableQty,
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

      <p className="mt-3 text-xs text-text-muted">
        Opportunities are filtered using executable
        bid/ask prices, top-of-book liquidity, quote
        freshness, estimated fees, and configured policy
        limits.
      </p>
    </div>
  );
}