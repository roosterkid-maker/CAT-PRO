import type { RiskAssessment } from "../models/RiskAssessment";
import type { RiskRequest } from "../models/RiskRequest";

export class RiskEngine {
  assess(
    request: RiskRequest,
  ): RiskAssessment {
    let score = 100;

    const reasons: string[] = [];

    if (
      request.netProfit <= 0
    ) {
      return {
        level: "HIGH",

        approved: false,

        score: 0,

        reasons: [
          "Expected net profit is not positive.",
        ],
      };
    }

    if (
      request.confidence < 70
    ) {
      score -= 30;

      reasons.push(
        "Execution confidence below 70%.",
      );
    }

    if (
      request.fillPercent < 90
    ) {
      score -= 25;

      reasons.push(
        "Expected fill percentage below 90%.",
      );
    }

    if (
      request.liquidityScore < 60
    ) {
      score -= 20;

      reasons.push(
        "Liquidity score below 60.",
      );
    }

    if (
      request.capital > 50_000
    ) {
      score -= 10;

      reasons.push(
        "High capital allocation.",
      );
    }

    if (
      request.executionTimeMs > 50
    ) {
      score -= 15;

      reasons.push(
        "Execution latency above 50 ms.",
      );
    }

    score = Math.max(
      0,
      Math.min(
        100,
        score,
      ),
    );

    let level:
      | "LOW"
      | "MEDIUM"
      | "HIGH";

    if (score >= 80) {
      level = "LOW";
    } else if (
      score >= 60
    ) {
      level = "MEDIUM";
    } else {
      level = "HIGH";
    }

    return {
      level,

      approved:
        level !== "HIGH",

      score,

      reasons,
    };
  }
}

export const riskEngine =
  new RiskEngine();