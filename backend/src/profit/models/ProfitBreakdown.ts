export interface ProfitBreakdown {
  grossSpreadProfit: number;

  buyFees: number;

  sellFees: number;

  networkFees: number;

  transferCost: number;

  slippageCost: number;

  taxes: number;

  netProfit: number;
}