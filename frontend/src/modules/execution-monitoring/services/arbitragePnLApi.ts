import {
  API_BASE_URL,
} from "../../../config/runtimeUrls";

export interface ArbitragePnLRecord {
  opportunityId: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  status: string;

  matchedQuantity: number;

  buyAveragePrice: number;

  sellAveragePrice: number;

  grossProfit: number;

  totalFees: number;

  netProfit: number;

  netProfitPercent: number;

  recoveryRequired: boolean;

  completedAt: number;
}

export interface ArbitragePnLReport {
  timestamp: number;

  totalCycles: number;

  completedCycles: number;

  profitableCycles: number;

  lossCycles: number;

  recoveryRequiredCycles: number;

  totalMatchedQuantity: number;

  grossProfit: number;

  totalFees: number;

  netProfit: number;

  averageNetProfit: number;

  winRatePercent: number;

  latest:
    ArbitragePnLRecord[];
}

export async function fetchArbitragePnL(
  limit = 20,
  signal?: AbortSignal,
): Promise<ArbitragePnLReport> {
  const response =
    await fetch(
      `${API_BASE_URL}/api/arbitrage/pnl?limit=${limit}`,
      {
        signal,
      },
    );

  if (!response.ok) {
    throw new Error(
      `PnL API returned HTTP ${response.status}.`,
    );
  }

  return response.json();
}
