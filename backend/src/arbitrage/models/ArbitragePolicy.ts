export interface ArbitragePolicy {
  /**
   * Minimum raw spread before further analysis.
   */
  minimumSpreadPercent: number;

  /**
   * Minimum net profit after trading fees.
   */
  minimumNetProfitPercent: number;

  /**
   * Maximum quote age.
   */
  maximumQuoteAgeMs: number;

  /**
   * Minimum exchanges required.
   */
  minimumExchangeCount: number;

  /**
   * Reference capital used for executable quantity calculations.
   */
  referenceCapital: number;

  /**
   * Minimum executable liquidity.
   */
  minimumLiquidityPercent: number;

  /**
   * Legacy compatibility.
   */
  allowLastPriceFallback: boolean;

  /**
   * Maximum acceptable deviation between exchanges.
   *
   * Example:
   * CoinDCX = 100
   * Binance = 101
   *
   * Deviation = 1%
   */
  maximumPriceDeviationPercent: number;

  /**
   * Maximum expected slippage before trade rejection.
   */
  maximumSlippagePercent: number;

  /**
   * Minimum execution confidence required.
   */
  minimumConfidenceScore: number;
}