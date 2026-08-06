import type { ExecutionContext } from "../models/ExecutionContext";
import { ExecutionPipeline } from "../pipeline/ExecutionPipeline";
import { capitalStage } from "../pipeline/CapitalStage";
import { riskStage } from "../pipeline/RiskStage";

export class ExecutionCoordinator {
  private readonly pipeline =
    new ExecutionPipeline([
      capitalStage,
      riskStage,
    ]);

  async execute(
    context: ExecutionContext,
  ): Promise<ExecutionContext> {
    return this.pipeline.execute(
      context,
    );
  }
}

export const executionCoordinator =
  new ExecutionCoordinator();