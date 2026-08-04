export interface ProfitConfidence {
  score: number;

  recommendation:
    | "EXECUTE"
    | "REVIEW"
    | "SKIP";

  reasons: string[];
}