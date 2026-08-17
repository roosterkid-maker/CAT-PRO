import type { ArbitrageOpportunity } from "../../../arbitrage/models/ArbitrageOpportunity";

export interface FeeAnalysis {
  estimatedFeesPerUnit: number;
  estimatedFeesForTrade: number;

  grossProfitPerUnit: number;
  netProfitPerUnit: number;

  feeImpactPercent: number;

  score: number;
  acceptable: boolean;

  reason: string;
}

export class FeeAnalyzer {
  analyze(
    opportunity: ArbitrageOpportunity,
  ): FeeAnalysis {
    const estimatedFeesPerUnit =
      opportunity.estimatedFees;

    const grossProfitPerUnit =
      opportunity.rawSpread;

    const netProfitPerUnit =
      opportunity.netProfit;

    const estimatedFeesForTrade =
      estimatedFeesPerUnit *
      opportunity.executableQty;

    const feeImpactPercent =
      grossProfitPerUnit > 0
        ? Math.max(
            0,
            (estimatedFeesPerUnit /
              grossProfitPerUnit) *
              100,
          )
        : 100;

    const acceptable =
      Number.isFinite(
        estimatedFeesPerUnit,
      ) &&
      Number.isFinite(
        estimatedFeesForTrade,
      ) &&
      estimatedFeesPerUnit >= 0 &&
      netProfitPerUnit > 0 &&
      feeImpactPercent < 100;

    const score = acceptable
      ? Math.round(
          Math.max(
            0,
            Math.min(
              100,
              100 - feeImpactPercent,
            ),
          ),
        )
      : 0;

    let reason: string;

    if (
      !Number.isFinite(
        estimatedFeesPerUnit,
      ) ||
      estimatedFeesPerUnit < 0
    ) {
      reason =
        "Estimated fee amount is invalid.";
    } else if (
      grossProfitPerUnit <= 0
    ) {
      reason =
        "Gross spread is not positive.";
    } else if (
      netProfitPerUnit <= 0
    ) {
      reason =
        "Fees consume the complete gross spread.";
    } else {
      reason =
        `Fees consume ${feeImpactPercent.toFixed(
          1,
        )}% of the gross spread.`;
    }

    return {
      estimatedFeesPerUnit,
      estimatedFeesForTrade,

      grossProfitPerUnit,
      netProfitPerUnit,

      feeImpactPercent,

      score,
      acceptable,

      reason,
    };
  }
}

export const feeAnalyzer =
  new FeeAnalyzer();