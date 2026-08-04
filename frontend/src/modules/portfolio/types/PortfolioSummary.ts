export interface PortfolioSummary {
  accountId: string;
  accountName: string;
  mode: string;

  initialCapital: number;
  currentCapital: number;
  availableCapital: number;
  allocatedCapital: number;

  todayProfit: number;
  todayLoss: number;
  todayNetProfit: number;

  totalRealizedProfit: number;

  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  winningTrades: number;
  losingTrades: number;

  winRatePercent: number;
  roiPercent: number;
  profitFactor: number;

  bestTradeProfit: number;
  worstTradeProfit: number;

  generatedAt: number;
}

export interface PortfolioSummaryResponse {
  success: boolean;
  data: PortfolioSummary;
}