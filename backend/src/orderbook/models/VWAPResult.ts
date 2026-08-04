export interface VWAPResult {
  requestedQuantity: number;

  filledQuantity: number;

  averagePrice: number;

  totalCost: number;

  unfilledQuantity: number;

  fillPercent: number;

  partialFill: boolean;
}