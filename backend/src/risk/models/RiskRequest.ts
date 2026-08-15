export interface RiskRequest {
  capital: number;

  confidence: number;

  fillPercent: number;

  netProfit: number;

  executionTimeMs: number;

  liquidityScore: number;

  quoteAgeMs: number;

  exchangeConnected: boolean;

  balanceAvailable: boolean;

  dailyLoss: number;

  dailyTradeCount: number;

  /*
   * Version 13.5
   *
   * These fields allow the Risk Engine
   * to consume the Exposure Engine.
   */
  market?: string;

  buyExchange?: string;

  sellExchange?: string;

  /*
   * Version 12 integrity results.
   *
   * Risk Engine consumes the central
   * freshness decision instead of defining
   * another conflicting global timeout.
   */
  quotesFresh?: boolean;

  pairSynchronized?: boolean;

  timestampSkewMs?: number | null;

  maximumPairSkewMs?: number | null;
}