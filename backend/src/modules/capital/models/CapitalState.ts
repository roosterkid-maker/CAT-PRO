export interface CapitalState {
  totalCapital: number;

  availableCapital: number;

  reservedCapital: number;

  allocatedCapital: number;

  activeTrades: number;

  maxConcurrentTrades: number;

  maxCapitalPerTrade: number;

  minimumReserveCapital: number;

  dailyProfit: number;

  dailyLoss: number;

  updatedAt: number;
}