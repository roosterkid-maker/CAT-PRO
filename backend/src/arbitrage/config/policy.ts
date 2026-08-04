import type { ArbitragePolicy } from "../models/ArbitragePolicy";

export const defaultArbitragePolicy: ArbitragePolicy = {
  /**
   * Minimum raw spread before fees.
   */
  minimumSpreadPercent: 0.20,

  /**
   * Minimum net profit after fees.
   */
  minimumNetProfitPercent: 0.05,

  /**
   * Quotes older than this are rejected.
   */
  maximumQuoteAgeMs: 5_000,

  /**
   * Minimum exchanges required.
   */
  minimumExchangeCount: 2,

  /**
   * Liquidity evaluation reference capital.
   *
   * Initial value:
   * ₹10,000
   *
   * Later this will come from the user's UI selection.
   */
  referenceCapital: 500,

  /**
   * At least 100% of the required quantity
   * should be available at the top of the order book.
   */
  minimumLiquidityPercent: 100,

  /**
   * CAT PRO v0.9+
   *
   * Execution Engine now prefers executable quotes.
   * Keep this FALSE unless debugging legacy feeds.
   */
  allowLastPriceFallback: false,
};