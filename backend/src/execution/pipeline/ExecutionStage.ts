import type { ExecutionContext } from "../models/ExecutionContext";

import type { ExecutionStageResult } from "./ExecutionStageResult";

export interface ExecutionStage {
  readonly name: string;

  execute(
    context: ExecutionContext,
  ): ExecutionStageResult;
}