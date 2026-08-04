import type { ExecutionContext } from "../models/ExecutionContext";

import type { ExecutionStage } from "./ExecutionStage";
import type { ExecutionStageResult } from "./ExecutionStageResult";

export class ExecutionPipeline {
  constructor(
    private readonly stages: ExecutionStage[],
  ) {}

  execute(
    context: ExecutionContext,
  ): ExecutionStageResult {
    let current = context;

    for (const stage of this.stages) {
      const result =
        stage.execute(current);

      if (!result.success) {
        return result;
      }

      current = result.context;
    }

    return {
      success: true,
      context: current,
    };
  }
}