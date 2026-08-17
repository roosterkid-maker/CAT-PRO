import type { ExecutionValidationResult } from "./ExecutionValidationResult";
import type { ExecutionSimulation } from "./ExecutionSimulation";

export interface ExecutionResult {
  success: boolean;

  validation: ExecutionValidationResult;

  simulation: ExecutionSimulation | null;

  failureReason: string | null;

  executionTimeMs: number;
}