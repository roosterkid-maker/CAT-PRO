import type { ExecutionDecision } from "./ExecutionDecision";
import type { ExecutionValidationResult } from "./ExecutionValidationResult";

export interface ExecutionResult {
  success: boolean;

  validation: ExecutionValidationResult;

  decision: ExecutionDecision | null;

  executionTimeMs: number;
}