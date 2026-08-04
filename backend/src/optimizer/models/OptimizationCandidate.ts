import type { ExecutionResult } from "../../execution/models/ExecutionResult";

export interface OptimizationCandidate {
  capital: number;

  score: number;

  execution: ExecutionResult;
}