export interface ArbitragePolicy {
  /**
   * Opportunity ke liye minimum raw spread percentage.
   */
  minimumSpreadPercent:
    number;

  /**
   * Buy aur sell fees ke baad minimum acceptable
   * profit percentage.
   */
  minimumNetProfitPercent:
    number;

  /**
   * Is age se purani quote reject hogi.
   */
  maximumQuoteAgeMs:
    number;

  /**
   * Comparison ke liye minimum exchanges.
   */
  minimumExchangeCount:
    number;

  /**
   * Account-side INR budget used for liquidity qualification. The engine
   * converts it to the market quote asset before calculating quantity.
   *
   * Example:
   * ₹10,000 capital / buy price =
   * required quantity.
   */
  referenceCapital:
    number;

  /**
   * Required quantity ka minimum percentage
   * jo top-of-book liquidity me available
   * hona chahiye.
   *
   * 100 = complete quantity available
   * honi chahiye.
   */
  minimumLiquidityPercent:
    number;

  /**
   * Cross-exchange quote-integrity safety limit.
   *
   * This is NOT an arbitrage spread limit.
   *
   * It protects the engine from obviously
   * corrupted, mismatched or incorrectly
   * normalized prices.
   *
   * Example:
   *
   * maximumCrossExchangePriceRatio = 1.05
   *
   * Buy 100 / Sell 104
   * ratio = 1.04x
   * => quote integrity valid.
   *
   * Buy 100 / Sell 1000
   * ratio = 10x
   * => quote integrity rejected.
   *
   * Actual profitability remains owned by
   * SpreadAnalyzer and profit calculations.
   */
  maximumCrossExchangePriceRatio:
    number;

  /**
   * Legacy compatibility field.
   * Executable-only mode me false rehna chahiye.
   */
  allowLastPriceFallback:
    boolean;
}
