export interface ExchangeFreshnessRule {
  maximumQuoteAgeMs: number;
  maximumPairSkewMs: number;
}

export interface FreshnessIntegrityConfig {
  evictionIntervalMs: number;

  defaultRule:
    ExchangeFreshnessRule;

  exchanges:
    Readonly<
      Record<
        string,
        ExchangeFreshnessRule
      >
    >;
}

/*
 * Version 12
 * Freshness Integrity Policy
 *
 * Freshness is intentionally separated
 * from arbitrage profitability policy.
 *
 * Different exchanges have different
 * websocket behaviour, update frequency
 * and order-book characteristics.
 *
 * Therefore one global freshness timeout
 * should not control every exchange.
 */
export const freshnessIntegrityConfig:
  FreshnessIntegrityConfig = {
  /*
   * Stale executable quotes will later
   * be checked once every second.
   */
  evictionIntervalMs:
    1_000,

  /*
   * Fallback rule for future exchanges.
   *
   * This allows new adapters to remain
   * safe even before exchange-specific
   * calibration has been added.
   */
  defaultRule: {
    maximumQuoteAgeMs:
      5_000,

    maximumPairSkewMs:
      2_500,
  },

  /*
   * Initial Version 12 calibration.
   *
   * These values can later be tuned using
   * live diagnostics instead of changing
   * OpportunityEngine logic.
   */
  exchanges: {
    binance: {
      maximumQuoteAgeMs:
        4_000,

      maximumPairSkewMs:
        2_000,
    },

    bybit: {
      maximumQuoteAgeMs:
        6_000,

      maximumPairSkewMs:
        2_500,
    },

    coindcx: {
      maximumQuoteAgeMs:
        6_000,

      maximumPairSkewMs:
        3_000,
    },

    /*
     * UnoCoin order books are bounded REST polls, not websocket
     * deltas.  The 9 second window covers two missed 3 second polls
     * while the adapter's three-strike quarantine remains fail closed.
     */
    unocoin: {
      maximumQuoteAgeMs:
        9_000,

      maximumPairSkewMs:
        6_000,
    },

    coinswitch: {
      maximumQuoteAgeMs:
        6_000,

      maximumPairSkewMs:
        3_000,
    },
  },
};
