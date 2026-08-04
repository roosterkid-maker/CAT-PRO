import type { ExecutionContext } from "../../models/ExecutionContext";
import { executionValidator } from "../../services/ExecutionValidator";

import type { ExecutionStage } from "../ExecutionStage";
import type { ExecutionStageResult } from "../ExecutionStageResult";

export class ValidationStage
  implements ExecutionStage
{
  readonly name = "Validation";

  execute(
    context: ExecutionContext,
  ): ExecutionStageResult {
    const validation =
      executionValidator.validate(
        context.request,
      );

    context.validation =
      validation;

    if (!validation.valid) {
      return {
        success: false,
        context,
        reason:
          validation.reasons.join(", "),
      };
    }

    return {
      success: true,
      context,
    };
  }
}

export const validationStage =
  new ValidationStage();