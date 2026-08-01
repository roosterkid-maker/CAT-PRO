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
          "Opportunity is not executable.",
      };
    }

    if (overallScore >= 85) {
      return {
        decision: "EXECUTE",
        score: overallScore,
        reason:
          "Excellent execution quality.",
      };
    }

    if (overallScore >= 65) {
      return {
        decision: "REVIEW",
        score: overallScore,
        reason:
          "Opportunity requires manual review.",
      };
    }

    return {
      decision: "SKIP",
      score: overallScore,
      reason:
        "Execution quality is too low.",
    };
  }
}

export const decisionAnalyzer =
  new DecisionAnalyzer();