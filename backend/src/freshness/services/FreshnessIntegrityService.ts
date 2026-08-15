import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";

import {
  freshnessIntegrityConfig,
  type ExchangeFreshnessRule,
} from "../config/freshness";

export interface QuoteFreshnessResult {
  exchange:
    string;

  market:
    string;

  timestamp:
    number;

  now:
    number;

  ageMs:
    number | null;

  maximumQuoteAgeMs:
    number;

  fresh:
    boolean;

  reason:
    | "FRESH"
    | "INVALID_TIMESTAMP"
    | "FUTURE_TIMESTAMP"
    | "STALE_TIMESTAMP";
}

export interface PairFreshnessResult {
  buy:
    QuoteFreshnessResult;

  sell:
    QuoteFreshnessResult;

  timestampSkewMs:
    number | null;

  maximumPairSkewMs:
    number;

  synchronized:
    boolean;

  freshAndSynchronized:
    boolean;
}

export class FreshnessIntegrityService {
  getRule(
    exchange:
      string,
  ): ExchangeFreshnessRule {
    const normalizedExchange =
      this.normalizeExchange(
        exchange,
      );

    return (
      freshnessIntegrityConfig
        .exchanges[
          normalizedExchange
        ] ??
      freshnessIntegrityConfig
        .defaultRule
    );
  }

  getMaximumQuoteAgeMs(
    exchange:
      string,
  ): number {
    return this
      .getRule(
        exchange,
      )
      .maximumQuoteAgeMs;
  }

  getMaximumPairSkewMs(
    firstExchange:
      string,

    secondExchange:
      string,
  ): number {
    /*
     * Pair synchronization uses the stricter
     * limit of the two participating exchanges.
     *
     * Example:
     *
     * Binance = 2000ms
     * CoinDCX = 3000ms
     *
     * Pair limit becomes 2000ms.
     */
    return Math.min(
      this
        .getRule(
          firstExchange,
        )
        .maximumPairSkewMs,

      this
        .getRule(
          secondExchange,
        )
        .maximumPairSkewMs,
    );
  }

  evaluateQuote(
    quote:
      Pick<
        ExecutableQuote,
        | "exchange"
        | "market"
        | "timestamp"
      >,

    now =
      Date.now(),
  ): QuoteFreshnessResult {
    const maximumQuoteAgeMs =
      this
        .getMaximumQuoteAgeMs(
          quote.exchange,
        );

    /*
     * Invalid timestamp.
     */
    if (
      !Number.isFinite(
        quote.timestamp,
      ) ||
      quote.timestamp <= 0
    ) {
      return {
        exchange:
          this.normalizeExchange(
            quote.exchange,
          ),

        market:
          quote.market,

        timestamp:
          quote.timestamp,

        now,

        ageMs:
          null,

        maximumQuoteAgeMs,

        fresh:
          false,

        reason:
          "INVALID_TIMESTAMP",
      };
    }

    const ageMs =
      now -
      quote.timestamp;

    /*
     * Exchange timestamp cannot logically
     * be ahead of our evaluation time.
     *
     * A future timestamp can indicate:
     *
     * - clock mismatch
     * - malformed event timestamp
     * - incorrect normalization
     *
     * Therefore it is treated as unsafe.
     */
    if (
      ageMs < 0
    ) {
      return {
        exchange:
          this.normalizeExchange(
            quote.exchange,
          ),

        market:
          quote.market,

        timestamp:
          quote.timestamp,

        now,

        ageMs,

        maximumQuoteAgeMs,

        fresh:
          false,

        reason:
          "FUTURE_TIMESTAMP",
      };
    }

    /*
     * Exchange-specific stale threshold.
     */
    if (
      ageMs >
      maximumQuoteAgeMs
    ) {
      return {
        exchange:
          this.normalizeExchange(
            quote.exchange,
          ),

        market:
          quote.market,

        timestamp:
          quote.timestamp,

        now,

        ageMs,

        maximumQuoteAgeMs,

        fresh:
          false,

        reason:
          "STALE_TIMESTAMP",
      };
    }

    return {
      exchange:
        this.normalizeExchange(
          quote.exchange,
        ),

      market:
        quote.market,

      timestamp:
        quote.timestamp,

      now,

      ageMs,

      maximumQuoteAgeMs,

      fresh:
        true,

      reason:
        "FRESH",
    };
  }

  evaluatePair(
    buy:
      Pick<
        ExecutableQuote,
        | "exchange"
        | "market"
        | "timestamp"
      >,

    sell:
      Pick<
        ExecutableQuote,
        | "exchange"
        | "market"
        | "timestamp"
      >,

    now =
      Date.now(),
  ): PairFreshnessResult {
    const buyResult =
      this.evaluateQuote(
        buy,
        now,
      );

    const sellResult =
      this.evaluateQuote(
        sell,
        now,
      );

    const maximumPairSkewMs =
      this
        .getMaximumPairSkewMs(
          buy.exchange,
          sell.exchange,
        );

    /*
     * Apart from individual freshness,
     * arbitrage requires both books to
     * represent approximately the same
     * market moment.
     *
     * Example:
     *
     * Binance:
     * timestamp = T
     *
     * CoinDCX:
     * timestamp = T - 8 seconds
     *
     * Even if some very relaxed timeout
     * considered both quotes "fresh",
     * comparing them would be unsafe.
     */
    const timestampSkewMs =
      Number.isFinite(
        buy.timestamp,
      ) &&
      Number.isFinite(
        sell.timestamp,
      ) &&
      buy.timestamp > 0 &&
      sell.timestamp > 0
        ? Math.abs(
            buy.timestamp -
              sell.timestamp,
          )
        : null;

    const synchronized =
      timestampSkewMs !==
        null &&
      timestampSkewMs <=
        maximumPairSkewMs;

    return {
      buy:
        buyResult,

      sell:
        sellResult,

      timestampSkewMs,

      maximumPairSkewMs,

      synchronized,

      freshAndSynchronized:
        buyResult.fresh &&
        sellResult.fresh &&
        synchronized,
    };
  }

  private normalizeExchange(
    exchange:
      string,
  ): string {
    return exchange
      .trim()
      .toLowerCase();
  }
}

export const freshnessIntegrityService =
  new FreshnessIntegrityService();