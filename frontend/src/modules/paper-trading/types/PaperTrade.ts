export type PaperTradeStatus =
  | "detected"
  | "validated"
  | "open"
  | "monitoring"
  | "target-hit"
  | "closed"
  | "completed"
  | "cancelled"
  | "failed";

export interface PaperTrade {
  id: string;

  market: string;

  buyExchange: string;
  sellExchange: string;

  capital: number;
  quantity: number;

  buyPrice: number;
  sellPrice: number;

  estimatedFees: number;

  expectedProfit: number;
  expectedProfitPercent: number;

  status: PaperTradeStatus;

  openedAt: number;
  closedAt: number | null;

  currentPrice: number;

  currentProfit: number;
  currentProfitPercent: number;

  highestProfit: number;
  lowestProfit: number;

  lastUpdatedAt: number;

  actualSellPrice: number | null;
  actualProfit: number | null;
  actualProfitPercent: number | null;

  failureReason: string | null;
}

export interface PaperTradesResponse {
  success: boolean;
  count: number;
  data: PaperTrade[];
}