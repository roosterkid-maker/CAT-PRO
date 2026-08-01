export type TradeRisk =
  | "LOW"
  | "MEDIUM"
  | "HIGH";

export interface RiskResult {
  risk: TradeRisk;

  score: number;

  reason: string;
}

interface RiskInput {
  roi: number;

  quoteFresh: boolean;

  exchangesConnected: boolean;
}

export function evaluateRisk(
  input: RiskInput,
): RiskResult {
  if (!input.exchangesConnected) {
    return {
      risk: "HIGH",
      score: 100,
      reason: "Exchange unavailable.",
    };
  }

  if (!input.quoteFresh) {
    return {
      risk: "HIGH",
      score: 90,
      reason: "Quotes are stale.",
    };
  }

  if (input.roi >= 1.0) {
    return {
      risk: "LOW",
      score: 15,
      reason: "Strong spread.",
    };
  }

  if (input.roi >= 0.5) {
    return {
      risk: "MEDIUM",
      score: 40,
      reason: "Acceptable spread.",
    };
  }

  return {
    risk: "HIGH",
    score: 80,
    reason: "Spread too small.",
  };
}