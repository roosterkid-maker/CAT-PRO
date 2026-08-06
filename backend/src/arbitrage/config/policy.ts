import type { ArbitragePolicy } from "../models/ArbitragePolicy";

export const defaultArbitragePolicy: ArbitragePolicy = {
  /*
   * Minimum raw spread before deeper analysis.
   */
  minimumSpreadPercent: 0.05,

  /*
   * Minimum executable profit after trading fees.
   */
  minimumNetProfitPercent: 0.01,

  /*
   * Quotes older than this are rejected.
   */
  maximumQuoteAgeMs: 10_000,

  /*
   * Minimum exchanges required.
   */
  minimumExchangeCount: 2,

  /*
   * Reference capital used by execution analysis.
   */
  referenceCapital: 500,

  /*
   * Development value.
   * Production will likely become 100.
   */
  minimumLiquidityPercent: 5,

  /*
   * Never use last traded price.
   * Only executable bid/ask.
   */
  allowLastPriceFallback: false,

  /*
   * Protection against abnormal price differences.
   */
  maximumPriceDeviationPercent: 3.0,

  /*
   * Reject trades if expected slippage exceeds this.
   */
  maximumSlippagePercent: 0.30,

  /*
   * Minimum confidence required for execution.
   */
  minimumConfidenceScore: 80,
};