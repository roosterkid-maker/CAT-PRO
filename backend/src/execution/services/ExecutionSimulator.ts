import { defaultExecutionPipeline } from "../pipeline/defaultPipeline";

import type { ExecutionContext } from "../models/ExecutionContext";
import type { ExecutionRequest } from "../models/ExecutionRequest";
import type { ExecutionResult } from "../models/ExecutionResult";

export class ExecutionSimulator {
  simulate(
    request: ExecutionRequest,
  ): ExecutionResult {
    const startedAt =
      performance.now();

    const context: ExecutionContext = {
      request,
      validation: null,
    };

    const pipelineResult =
      defaultExecutionPipeline.execute(
        context,
      );

    const validation =
      pipelineResult.context.validation;

    if (!validation) {
      throw new Error(
        "Execution pipeline did not produce a validation result.",
      );
    }

    return {
      success:
        pipelineResult.success,

      validation,

      decision:
        pipelineResult.context.decision ??
        null,

      executionTimeMs:
        performance.now() -
        startedAt,
    };
  }
}

export const executionSimulator =
  new ExecutionSimulator();