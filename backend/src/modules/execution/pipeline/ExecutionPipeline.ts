import type { ExecutionContext } from "../models/ExecutionContext";

import type { ExecutionStage } from "./ExecutionStage";

export class ExecutionPipeline {
  constructor(
    private readonly stages: readonly ExecutionStage[],
  ) {}

  async execute(
    context: ExecutionContext,
  ): Promise<ExecutionContext> {
    let current = context;

    for (const stage of this.stages) {
      current =
        await stage.execute(current);
    }

    return current;
  }
}