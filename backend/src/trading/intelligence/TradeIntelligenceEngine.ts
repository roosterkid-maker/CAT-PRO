import type { TradingDecision } from "../orchestrator/TradingOrchestrator";

export interface TradeExplanation {
  title: string;

  confidence: number;

  summary: string;

  strengths: string[];

  warnings: string[];

  recommendation: string;
}

export class TradeIntelligenceEngine {
  explain(
    decision: TradingDecision,
  ): TradeExplanation {
    const strengths: string[] = [];
    const warnings: string[] = [];

    if (decision.executionScore >= 90) {
      strengths.push(
        "Excellent execution quality.",
      );
    }

    if (decision.riskScore >= 80) {
      strengths.push(
        "Risk is within acceptable limits.",
      );
    }

    if (decision.allocatedCapital > 0) {
      strengths.push(
        `Allocated capital ₹${decision.allocatedCapital.toFixed(
          2,
        )}.`,
      );
    }

    if (!decision.approved) {
      warnings.push(
        ...decision.reasons,
      );
    }

    return {
      title: decision.decision,

      confidence: Math.round(
        (decision.executionScore +
          decision.riskScore) /
          2,
      ),

      summary:
        decision.approved
          ? "Trade approved by all decision engines."
          : "Trade rejected by one or more decision engines.",

      strengths,

      warnings,

      recommendation:
        decision.decision === "EXECUTE"
          ? "Proceed with execution."
          : decision.decision === "REVIEW"
            ? "Review manually before execution."
            : "Skip this opportunity.",
    };
  }
}

export const tradeIntelligenceEngine =
  new TradeIntelligenceEngine();