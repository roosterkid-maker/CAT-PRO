export interface OpportunityEvaluation {
  rawSpread: number;
  rawSpreadPercent: number;

  estimatedFees: number;

  netProfit: number;
  netProfitPercent: number;

  usedLastPriceFallback: boolean;
  quotesAreFresh: boolean;
}