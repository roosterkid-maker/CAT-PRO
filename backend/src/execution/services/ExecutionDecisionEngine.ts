import { EXECUTION_THRESHOLDS } from "../config/thresholds";

import type { ProfitConfidence } from "../../profit/models/ProfitConfidence";
import type { ExecutionDecision } from "../models/ExecutionDecision";

export class ExecutionDecisionEngine {
  decide(
    confidence: ProfitConfidence,
  ): ExecutionDecision {
    if (
      confidence.score >=
      EXECUTION_THRESHOLDS.confidence.execute
    ) {
      return {
        recommendation:
          "EXECUTE",
        confidence:
          confidence.score,
        reasons:
          confidence.reasons,
      };
    }

    if (
      confidence.score >=
      EXECUTION_THRESHOLDS.confidence.review
    ) {
      return {
        recommendation:
          "REVIEW",
        confidence:
          confidence.score,
        reasons:
          confidence.reasons,
      };
    }

    return {
      recommendation: "SKIP",
      confidence:
        confidence.score,
      reasons:
        confidence.reasons,
    };
  }
}

export const executionDecisionEngine =
  new ExecutionDecisionEngine();