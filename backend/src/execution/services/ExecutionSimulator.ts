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

    const executionTimeMs =
      performance.now() -
      startedAt;

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

        executionTimeMs,
      };
    }

    const {
      depth,

      buyVWAP,
      sellVWAP,

      buySlippage,
      sellSlippage,

      profit,
      confidence,
      decision,
    } = pipelineResult.context;

    if (
      !depth ||
      !buyVWAP ||
      !sellVWAP ||
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

        executionTimeMs,
      };
    }

    const simulation:
      ExecutionSimulation = {
      depth,

      buyVWAP,
      sellVWAP,

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

      executionTimeMs,
    };
  }
}

export const executionSimulator =
  new ExecutionSimulator();