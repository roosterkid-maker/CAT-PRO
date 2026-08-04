import type { OptimizationCandidate } from "./OptimizationCandidate";
import type { OptimizationSummary } from "./OptimizationSummary";

export interface OptimizationResult {
  best:
    | OptimizationCandidate
    | null;

  candidates:
    OptimizationCandidate[];

  summary:
    OptimizationSummary;
}