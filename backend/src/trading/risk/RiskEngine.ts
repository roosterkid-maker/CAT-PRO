import type { ArbitrageOpportunity } from "../../arbitrage/models/ArbitrageOpportunity";

export interface RiskLimits {
  maximumCapitalPerTrade: number;

  maximumDailyLoss: number;

  minimumExecutionScore: number;

  maximumSpreadPercent: number;

  minimumLiquidityScore: number;
}

export interface RiskEvaluation {
  approved: boolean;

  score: number;

  reasons: string[];
}

export const defaultRiskLimits: RiskLimits = {
  maximumCapitalPerTrade: 100_000,

  maximumDailyLoss: 10_000,

  minimumExecutionScore: 70,

  maximumSpreadPercent: 5,

  minimumLiquidityScore: 70,
};

export class RiskEngine {
  evaluate(
    opportunity: ArbitrageOpportunity,
    limits: RiskLimits = defaultRiskLimits,
  ): RiskEvaluation {
    const reasons: string[] = [];

    let score = 100;

    if (
      opportunity.score <
      limits.minimumExecutionScore
    ) {
      score -= 40;

      reasons.push(
        "Execution score below minimum threshold.",
      );
    }

    if (
      opportunity.liquidityScore <
      limits.minimumLiquidityScore
    ) {
      score -= 20;

      reasons.push(
        "Liquidity score is too low.",
      );
    }

    if (
      opportunity.rawSpreadPercent >
      limits.maximumSpreadPercent
    ) {
      score -= 20;

      reasons.push(
        "Spread is unusually large.",
      );
    }

    if (
      !opportunity.quotesAreFresh
    ) {
      score -= 20;

      reasons.push(
        "Quotes are stale.",
      );
    }

    return {
      approved:
        score >= 70,

      score,

      reasons,
    };
  }
}

export const riskEngine =
  new RiskEngine();