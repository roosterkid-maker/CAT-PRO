import type { ExchangePair } from "./ExchangePair";

export interface ArbitrageOpportunity {
  pair: ExchangePair;

  /**
   * Actual executable prices:
   * Buy side uses best ask.
   * Sell side uses best bid.
   */
  buyPrice: number;
  sellPrice: number;

  /**
   * Top-of-book liquidity available
   * at the executable prices.
   */
  buyAvailableQty: number;
  sellAvailableQty: number;

  /**
   * Maximum quantity executable on both legs
   * without moving beyond the top order-book level.
   */
  executableQty: number;

  rawSpread: number;
  rawSpreadPercent: number;

  estimatedFees: number;

  netProfit: number;
  netProfitPercent: number;

  quotesAreFresh: boolean;

  /**
   * Temporary compatibility field.
   * Executable-only opportunities always keep this false.
   */
  usedLastPriceFallback: false;

  /**
   * Will later contain the opportunity-quality ranking.
   */
  score: number;

  timestamp: number;
}