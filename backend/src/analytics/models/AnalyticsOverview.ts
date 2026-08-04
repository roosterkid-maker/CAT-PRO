export interface AnalyticsOverview {
  totalTrades: number;

  openTrades: number;

  closedTrades: number;

  winningTrades: number;

  losingTrades: number;

  winRate: number;

  totalProfit: number;

  averageProfit: number;

  averageLoss: number;

  roi: number;

  capitalInUse: number;

  averageExecutionTimeMs: number;
}