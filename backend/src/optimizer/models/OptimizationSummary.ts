export interface OptimizationSummary {
  evaluatedCandidates: number;

  successfulCandidates: number;

  failedCandidates: number;

  executionSuccessRate: number;

  optimizationTimeMs: number;
}