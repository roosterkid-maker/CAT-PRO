export interface OpportunityDto {
  market: string;

  buyExchange: string;
  buyPrice: number;
  buyAvailableQty: number;

  sellExchange: string;
  sellPrice: number;
  sellAvailableQty: number;

  executableQty: number;

  rawSpread: number;
  rawSpreadPercent: number;

  estimatedFees: number;

  netProfit: number;
  netProfitPercent: number;

  usedLastPriceFallback: false;
  quotesAreFresh: boolean;

  score: number;
  timestamp: number;
}