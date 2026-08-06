import type { ExecutionContext } from "../models/ExecutionContext";

export interface ExecutionStage {
  readonly name: string;

  execute(
    context: ExecutionContext,
  ): Promise<ExecutionContext>;
}