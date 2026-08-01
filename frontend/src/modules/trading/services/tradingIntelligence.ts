import type { Opportunity } from "@/modules/arbitrage/types/Opportunity";
import type { TradingIntelligence } from "../types/TradingIntelligence";

export function evaluateTradingIntelligence(
  opportunity: Opportunity,
): TradingIntelligence {
  const roi = opportunity.netProfitPercent;

  if (roi >= 0.5) {
    return {
      decision: {
        decision: "EXECUTE",
        reason: "ROI meets minimum target.",
        confidence: 95,
      },

      risk: {
        risk: "LOW",
        score: 15,
        reason: "Strong spread.",
      },

      confidence: {
        confidence: 95,
        reason: "Very high confidence.",
      },

      summary: [
        "ROI above target",
        "Fresh quotes",
        "Healthy exchanges",
      ],
    };
  }

  if (roi >= 0.3) {
    return {
      decision: {
        decision: "REVIEW",
        reason: "ROI close to minimum.",
        confidence: 70,
      },

      risk: {
        risk: "MEDIUM",
        score: 45,
        reason: "Average spread.",
      },

      confidence: {
        confidence: 70,
        reason: "Good confidence.",
      },

      summary: [
        "ROI close to target",
        "Review before trading",
      ],
    };
  }

  return {
    decision: {
      decision: "SKIP",
      reason: "ROI below minimum requirement.",
      confidence: 100,
    },

    risk: {
      risk: "HIGH",
      score: 85,
      reason: "Spread too small.",
    },

    confidence: {
      confidence: 100,
      reason: "High certainty that trade should be skipped.",
    },

    summary: [
      "ROI below target",
      "Trade not recommended",
    ],
  };
}