import type { ArbitragePolicy } from "../models/ArbitragePolicy";

export const defaultArbitragePolicy: ArbitragePolicy = {
  minimumSpreadPercent: 0.05,

  minimumNetProfitPercent: 0.01,

  maximumQuoteAgeMs: 10_000,

  minimumExchangeCount: 2,

  referenceCapital: 500,

  /**
   * Development-only threshold.
   * Allows partial-liquidity opportunities to reach
   * the Capital Optimizer, which should later determine
   * the actually executable capital.
   */
  minimumLiquidityPercent: 5,

  allowLastPriceFallback: false,
};