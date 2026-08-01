export type TradeDecision =
  | "EXECUTE"
  | "REVIEW"
  | "SKIP";

export interface DecisionResult {
  decision: TradeDecision;

  reason: string;

  confidence: number;
}

export function evaluateDecision(
  roi: number,
): DecisionResult {
  if (!Number.isFinite(roi)) {
    return {
      decision: "SKIP",
      reason: "ROI is invalid.",
      confidence: 100,
    };
  }

  if (roi >= 0.5) {
    return {
      decision: "EXECUTE",
      reason: "ROI meets the minimum execution target.",
      confidence: 95,
    };
  }

  if (roi >= 0.3) {
    return {
      decision: "REVIEW",
      reason: "ROI is close to the minimum execution target.",
      confidence: 70,
    };
  }

  return {
    decision: "SKIP",
    reason: "ROI is below the minimum execution target.",
    confidence: 100,
  };
}