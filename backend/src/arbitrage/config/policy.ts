import {
  PROFIT_TIER_POLICY,
} from "./profitTiers";

import type {
  ArbitragePolicy,
} from "../models/ArbitragePolicy";

export const defaultArbitragePolicy:
  ArbitragePolicy = {
  minimumSpreadPercent:
    0.05,

  minimumNetProfitPercent:
    PROFIT_TIER_POLICY
      .discoveryMinimumNetProfitPercent,

  maximumQuoteAgeMs:
    10_000,

  minimumExchangeCount:
    2,

  referenceCapital:
    500,

  /**
   * Development-stage liquidity threshold.
   *
   * Partial-liquidity opportunities are allowed
   * to reach the Capital Optimizer, which later
   * determines the actually executable capital.
   *
   * This must be reviewed again before live
   * capital is enabled.
   */
  minimumLiquidityPercent:
    5,

  /**
   * Quote-integrity guard.
   *
   * 1.05 means the higher cross-exchange price
   * may be at most 1.05x the lower price before
   * the quote pair is treated as suspicious.
   *
   * Larger apparent spreads are rejected because
   * observed production evidence showed that an
   * isolated venue-book mismatch can manufacture
   * unrealistic PAPER profit while remaining
   * internally executable and fresh.
   */
  maximumCrossExchangePriceRatio:
    1.05,

  allowLastPriceFallback:
    false,
};
