import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";

import {
  marketCache,
} from "../../services/cache.service";

import type {
  PortfolioValuationSource,
} from "../models/PortfolioSnapshot";

export interface PortfolioAssetValuation {
  priceUsdt: number | null;

  market: string | null;

  source: PortfolioValuationSource;

  timestamp: number | null;

  ageMs: number | null;
}

const STABLE_ASSETS =
  new Set<string>([
    "USDT",
    "USDC",
    "FDUSD",
    "TUSD",
  ]);

export class PortfolioValuationService {
  valueAsset(
    exchange: string,
    asset: string,
    now = Date.now(),
  ): PortfolioAssetValuation {
    const normalizedExchange =
      exchange
        .trim()
        .toLowerCase();

    const normalizedAsset =
      asset
        .trim()
        .toUpperCase();

    if (!normalizedAsset) {
      return this.unavailable();
    }

    /*
     * Version 13.1
     *
     * Supported USD stable assets are valued
     * directly at 1 USDT for portfolio-level
     * accounting.
     *
     * Execution engines must still use actual
     * market prices when conversion is required.
     */
    if (
      STABLE_ASSETS.has(
        normalizedAsset,
      )
    ) {
      return {
        priceUsdt: 1,

        market: null,

        source:
          "STABLE_ASSET",

        timestamp:
          now,

        ageMs:
          0,
      };
    }

    const quote =
      this.findUsdtQuote(
        normalizedExchange,
        normalizedAsset,
      );

    if (!quote) {
      return this.unavailable();
    }

    /*
     * Conservative portfolio valuation:
     *
     * Prefer the current bid because this is
     * closer to what could actually be realized
     * by selling the asset immediately.
     *
     * lastPrice remains an informational fallback
     * only. Live execution must still require
     * executable order-book data.
     */
    const bestBid =
      this.positiveNumber(
        quote.bestBidPrice,
      );

    const lastPrice =
      this.positiveNumber(
        quote.lastPrice,
      );

    const priceUsdt =
      bestBid ??
      lastPrice;

    if (
      priceUsdt ===
      null
    ) {
      return this.unavailable();
    }

    return {
      priceUsdt,

      market:
        quote.market,

      source:
        bestBid !==
        null
          ? "BEST_BID"
          : "LAST_PRICE",

      timestamp:
        quote.timestamp,

      ageMs:
        Math.max(
          0,

          now -
            quote.timestamp,
        ),
    };
  }

  private findUsdtQuote(
    exchange: string,
    asset: string,
  ): ExecutableQuote | null {
    const quotes =
      marketCache
        .getByExchange(
          exchange,
        );

    /*
     * Supports current normalized symbols and
     * defensive exchange-specific variants.
     */
    const candidates =
      new Set<string>([
        `${asset}USDT`,

        `${asset}_USDT`,

        `B-${asset}_USDT`,
      ]);

    const exact =
      quotes.find(
        (quote) =>
          candidates.has(
            quote.market
              .trim()
              .toUpperCase(),
          ),
      );

    if (exact) {
      return exact;
    }

    /*
     * Defensive fallback:
     *
     * BTC_USDT
     * BTC-USDT
     * B-BTC_USDT
     *
     * all normalize to a compact representation.
     */
    return (
      quotes.find(
        (quote) => {
          const market =
            quote.market
              .trim()
              .toUpperCase()
              .replace(
                /[^A-Z0-9]/g,
                "",
              );

          return (
            market ===
            `${asset}USDT`
          );
        },
      ) ??
      null
    );
  }

  private positiveNumber(
    value: number | null,
  ): number | null {
    return (
      value !==
        null &&
      Number.isFinite(
        value,
      ) &&
      value >
        0
    )
      ? value
      : null;
  }

  private unavailable():
    PortfolioAssetValuation {
    return {
      priceUsdt:
        null,

      market:
        null,

      source:
        "UNAVAILABLE",

      timestamp:
        null,

      ageMs:
        null,
    };
  }
}

export const portfolioValuationService =
  new PortfolioValuationService();