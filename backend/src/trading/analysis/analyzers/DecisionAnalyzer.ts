export type ExecutionDecision =
  | "EXECUTE"
  | "REVIEW"
  | "SKIP";

export interface DecisionAnalysis {
  decision: ExecutionDecision;

  score: number;

  reason: string;
}

export class DecisionAnalyzer {
  analyze(
    overallScore: number,
    executable: boolean,
  ): DecisionAnalysis {
    if (!executable) {
      return {
        decision: "SKIP",
        score: overallScore,
        reason:
          "Trade rejected because one or more execution requirements failed.",
      };
    }

    if (overallScore >= 90) {
      return {
        decision: "EXECUTE",
        score: overallScore,
        reason:
          "Excellent execution quality.",
      };
    }

    if (overallScore >= 80) {
      return {
        decision: "EXECUTE",
        score: overallScore,
        reason:
          "Good execution quality.",
      };
    }

    if (overallScore >= 65) {
      return {
        decision: "REVIEW",
        score: overallScore,
        reason:
          "Execution quality is acceptable but should be reviewed.",
      };
    }

    return {
      decision: "SKIP",
      score: overallScore,
      reason:
        "Overall execution score is below the acceptable threshold.",
    };
  }
}

export const decisionAnalyzer =
  new DecisionAnalyzer();