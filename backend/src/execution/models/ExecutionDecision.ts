export type ExecutionRecommendation =
  | "EXECUTE"
  | "REVIEW"
  | "SKIP";

export interface ExecutionDecision {
  recommendation: ExecutionRecommendation;

  confidence: number;

  reasons: string[];
}