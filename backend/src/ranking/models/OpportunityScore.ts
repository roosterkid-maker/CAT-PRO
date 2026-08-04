export interface OpportunityScore {
  market: string;

  buyExchange: string;

  sellExchange: string;

  score: number;

  recommendedCapital: number;

  expectedNetProfit: number;

  confidence: number;

  fillPercent: number;

  liquidityScore: number;

  executionTimeMs: number;

  recommendation:
    | "EXECUTE"
    | "REVIEW"
    | "SKIP";
}