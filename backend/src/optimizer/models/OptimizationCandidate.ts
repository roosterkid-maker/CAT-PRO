import type { ExecutionResult } from "../../execution/models/ExecutionResult";

export interface OptimizationCandidate {
  capital: number;

  executionCapital: number;

  executionCapitalCurrency: string;

  score: number;

  execution: ExecutionResult;
}
