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
   * Bid/ask unavailable hone par last price use karna allowed hai ya nahi.
   * Production mode me ideally false rahega.
   */
  allowLastPriceFallback: boolean;
}