export interface ArbitragePolicy {
  /**
   * Opportunity ke liye minimum raw spread percentage.
   */
  minimumSpreadPercent: number;

  /**
   * Buy aur sell fees ke baad minimum acceptable profit percentage.
   */
  minimumNetProfitPercent: number;

  /**
   * Is age se purani quote reject hogi.
   */
  maximumQuoteAgeMs: number;

  /**
   * Comparison ke liye minimum exchanges.
   */
  minimumExchangeCount: number;

  /**
   * Liquidity calculate karne ke liye reference trading capital.
   *
   * Example:
   * ₹10,000 capital / buy price = required quantity.
   */
  referenceCapital: number;

  /**
   * Required quantity ka minimum percentage jo top-of-book
   * liquidity me available hona chahiye.
   *
   * 100 = complete quantity available honi chahiye.
   */
  minimumLiquidityPercent: number;

  /**
   * Legacy compatibility field.
   * Executable-only mode me false rehna chahiye.
   */
  allowLastPriceFallback: boolean;
}