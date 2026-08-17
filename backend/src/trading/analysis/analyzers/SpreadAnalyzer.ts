import type { ArbitrageOpportunity } from "../../../arbitrage/models/ArbitrageOpportunity";

export interface SpreadAnalysis {
  spread: number;

  spreadPercent: number;

  score: number;

  acceptable: boolean;

  reason: string;
}

export class SpreadAnalyzer {
  analyze(
    opportunity: ArbitrageOpportunity,
  ): SpreadAnalysis {
    const spread =
      opportunity.rawSpread;

    const spreadPercent =
      opportunity.rawSpreadPercent;

    const acceptable =
      Number.isFinite(spread) &&
      Number.isFinite(
        spreadPercent,
      ) &&
      spread > 0 &&
      spreadPercent > 0;

    let score = 0;

    if (acceptable) {
      score = Math.min(
        100,
        Math.round(
          spreadPercent * 50,
        ),
      );
    }

    const reason = acceptable
      ? `Spread ${spreadPercent.toFixed(
          3,
        )}% is executable.`
      : "Spread is not executable.";

    return {
      spread,

      spreadPercent,

      score,

      acceptable,

      reason,
    };
  }
}

export const spreadAnalyzer =
  new SpreadAnalyzer();