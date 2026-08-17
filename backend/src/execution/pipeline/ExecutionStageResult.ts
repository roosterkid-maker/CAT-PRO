import type { ExecutionContext } from "../models/ExecutionContext";

export interface ExecutionStageResult {
  success: boolean;

  context: ExecutionContext;

  reason?: string;
}