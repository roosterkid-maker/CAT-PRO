export interface RiskRequest {
  capital: number;

  confidence: number;

  fillPercent: number;

  netProfit: number;

  executionTimeMs: number;

  liquidityScore: number;
}