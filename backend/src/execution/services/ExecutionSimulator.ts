import { defaultExecutionPipeline } from "../pipeline/defaultPipeline";

import type { ExecutionContext } from "../models/ExecutionContext";
import type { ExecutionRequest } from "../models/ExecutionRequest";
import type { ExecutionResult } from "../models/ExecutionResult";
import type { ExecutionSimulation } from "../models/ExecutionSimulation";

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

    if (!pipelineResult.success) {
      return {
        success: false,

        validation,

        simulation: null,

        failureReason:
          pipelineResult.reason ??
          "Execution pipeline failed.",

        executionTimeMs:
          performance.now() -
          startedAt,
      };
    }

    const {
      buyVWAP,
      sellVWAP,
      depth,
      buySlippage,
      sellSlippage,
      profit,
      confidence,
      decision,
    } = pipelineResult.context;

    if (
      !buyVWAP ||
      !sellVWAP ||
      !depth ||
      !buySlippage ||
      !sellSlippage ||
      !profit ||
      !confidence ||
      !decision
    ) {
      return {
        success: false,

        validation,

        simulation: null,

        failureReason:
          "Execution pipeline completed without all required simulation outputs.",

        executionTimeMs:
          performance.now() -
          startedAt,
      };
    }

    const simulation: ExecutionSimulation = {
      buyVWAP,
      sellVWAP,

      buyDepth: depth,
      sellDepth: depth,

      buySlippage,
      sellSlippage,

      profit,
      confidence,
      decision,

      simulatedAt:
        Date.now(),
    };

    return {
      success: true,

      validation,

      simulation,

      failureReason: null,

      executionTimeMs:
        performance.now() -
        startedAt,
    };
  }
}

export const executionSimulator =
  new ExecutionSimulator();