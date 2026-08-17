import type { ProfitConfidence } from "../models/ProfitConfidence";

export interface ConfidenceInput {
  liquidityScore: number;
  spreadScore: number;
  feeScore: number;
  slippageScore: number;
  fillScore: number;
}

export class ProfitConfidenceCalculator {
  calculate(
    input: ConfidenceInput,
  ): ProfitConfidence {
    const score =
      input.liquidityScore * 0.30 +
      input.spreadScore * 0.25 +
      input.feeScore * 0.20 +
      input.slippageScore * 0.15 +
      input.fillScore * 0.10;

    const reasons: string[] = [];

    if (input.liquidityScore >= 80) {
      reasons.push(
        "Excellent executable liquidity.",
      );
    }

    if (input.spreadScore >= 80) {
      reasons.push(
        "Healthy spread quality.",
      );
    }

    if (input.feeScore >= 80) {
      reasons.push(
        "Trading fees are efficient.",
      );
    }

    if (input.slippageScore >= 80) {
      reasons.push(
        "Expected slippage is low.",
      );
    }

    if (input.fillScore >= 80) {
      reasons.push(
        "High fill probability.",
      );
    }

    let recommendation:
      | "EXECUTE"
      | "REVIEW"
      | "SKIP";

    if (score >= 85) {
      recommendation = "EXECUTE";
    } else if (score >= 60) {
      recommendation = "REVIEW";
    } else {
      recommendation = "SKIP";
    }

    return {
      score: Math.round(score),
      recommendation,
      reasons,
    };
  }
}

export const
  profitConfidenceCalculator =
    new ProfitConfidenceCalculator();