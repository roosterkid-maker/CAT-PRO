import {
  executionDecisionEngine,
} from "../../services/ExecutionDecisionEngine";

import type { ExecutionContext } from "../../models/ExecutionContext";

import type { ExecutionStage } from "../ExecutionStage";
import type { ExecutionStageResult } from "../ExecutionStageResult";

export class DecisionStage
  implements ExecutionStage
{
  readonly name = "Decision";

  execute(
    context: ExecutionContext,
  ): ExecutionStageResult {
    if (!context.confidence) {
      return {
        success: false,
        context,
        reason:
          "Confidence calculation missing.",
      };
    }

    context.decision =
      executionDecisionEngine.decide(
        context.confidence,
      );

    return {
      success: true,
      context,
    };
  }
}

export const decisionStage =
  new DecisionStage();