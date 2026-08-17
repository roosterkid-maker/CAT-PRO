import {
  getExchangeTakerFeePercent,
} from "../config/fees";

import type {
  ArbitragePolicy,
} from "../models/ArbitragePolicy";

import type {
  ExchangePair,
} from "../models/ExchangePair";

import type {
  OpportunityEvaluation,
} from "../models/OpportunityEvaluation";

import {
  opportunityRejectionStore,
} from "../services/OpportunityRejectionStore";

import {
  freshnessIntegrityService,
} from "../../freshness/services/FreshnessIntegrityService";

import {
  quotePriceResolver,
} from "./QuotePriceResolver";

export interface OpportunityEvaluatorDiagnostics {
  evaluated:
    number;

  staleBuyQuote:
    number;

  staleSellQuote:
    number;

  staleBothQuotes:
    number;

  pairSynchronizationRejected:
    number;

  priceResolutionFailed:
    number;

  buyFeeMissing:
    number;

  sellFeeMissing:
    number;

  invalidBuyPrice:
    number;

  invalidSellPrice:
    number;

  accepted:
    number;
}

const diagnostics:
  OpportunityEvaluatorDiagnostics = {
  evaluated:
    0,

  staleBuyQuote:
    0,

  staleSellQuote:
    0,

  staleBothQuotes:
    0,

  pairSynchronizationRejected:
    0,

  priceResolutionFailed:
    0,

  buyFeeMissing:
    0,

  sellFeeMissing:
    0,

  invalidBuyPrice:
    0,

  invalidSellPrice:
    0,

  accepted:
    0,
};

export class OpportunityEvaluator {
  evaluate(
    pair:
      ExchangePair,

    _policy:
      ArbitragePolicy,

    now =
      Date.now(),
  ): OpportunityEvaluation | null {
    diagnostics.evaluated +=
      1;

    /*
     * Version 12.4
     *
     * Opportunity evaluation now uses the
     * centralized Freshness Integrity Engine.
     *
     * This provides:
     *
     * - exchange-specific freshness limits
     * - timestamp validation
     * - future timestamp protection
     * - pair synchronization validation
     *
     * Profitability evaluation must never
     * happen before these checks pass.
     */
    const pairFreshness =
      freshnessIntegrityService
        .evaluatePair(
          pair.buy,
          pair.sell,
          now,
        );

    const buyQuoteIsFresh =
      pairFreshness
        .buy
        .fresh;

    const sellQuoteIsFresh =
      pairFreshness
        .sell
        .fresh;

    const buyQuoteAgeMs =
      pairFreshness
        .buy
        .ageMs;

    const sellQuoteAgeMs =
      pairFreshness
        .sell
        .ageMs;

    /*
     * This compatibility field remains
     * available for existing diagnostics.
     *
     * The actual quote-specific thresholds
     * are also stored inside metadata.
     */
    const strictestMaximumQuoteAgeMs =
      Math.min(
        pairFreshness
          .buy
          .maximumQuoteAgeMs,

        pairFreshness
          .sell
          .maximumQuoteAgeMs,
      );

    /*
     * Both quotes stale.
     */
    if (
      !buyQuoteIsFresh &&
      !sellQuoteIsFresh
    ) {
      diagnostics.staleBothQuotes +=
        1;

      opportunityRejectionStore
        .recordHotPath({
          stage:
            "EVALUATOR",

          code:
            "STALE_BOTH_QUOTES",

          reason:
            "Both buy and sell exchange quotes are stale under their exchange-specific freshness policies.",

          market:
            pair.market,

          buyExchange:
            pair.buy.exchange,

          sellExchange:
            pair.sell.exchange,

          buyPrice:
            pair.buy
              .bestAskPrice,

          sellPrice:
            pair.sell
              .bestBidPrice,

          buyQuoteAgeMs,

          sellQuoteAgeMs,

          maximumQuoteAgeMs:
            strictestMaximumQuoteAgeMs,

          metadata: {
            buyTimestamp:
              pair.buy.timestamp,

            sellTimestamp:
              pair.sell.timestamp,

            buyFreshnessReason:
              pairFreshness
                .buy
                .reason,

            sellFreshnessReason:
              pairFreshness
                .sell
                .reason,

            buyMaximumQuoteAgeMs:
              pairFreshness
                .buy
                .maximumQuoteAgeMs,

            sellMaximumQuoteAgeMs:
              pairFreshness
                .sell
                .maximumQuoteAgeMs,
          },
        });

      return null;
    }

    /*
     * Buy quote stale.
     */
    if (
      !buyQuoteIsFresh
    ) {
      diagnostics.staleBuyQuote +=
        1;

      opportunityRejectionStore
        .recordHotPath({
          stage:
            "EVALUATOR",

          code:
            "STALE_BUY_QUOTE",

          reason:
            "Buy exchange quote is stale under its exchange-specific freshness policy.",

          market:
            pair.market,

          buyExchange:
            pair.buy.exchange,

          sellExchange:
            pair.sell.exchange,

          buyPrice:
            pair.buy
              .bestAskPrice,

          sellPrice:
            pair.sell
              .bestBidPrice,

          buyQuoteAgeMs,

          sellQuoteAgeMs,

          maximumQuoteAgeMs:
            pairFreshness
              .buy
              .maximumQuoteAgeMs,

          metadata: {
            buyTimestamp:
              pair.buy.timestamp,

            sellTimestamp:
              pair.sell.timestamp,

            buyFreshnessReason:
              pairFreshness
                .buy
                .reason,

            buyMaximumQuoteAgeMs:
              pairFreshness
                .buy
                .maximumQuoteAgeMs,

            sellMaximumQuoteAgeMs:
              pairFreshness
                .sell
                .maximumQuoteAgeMs,
          },
        });

      return null;
    }

    /*
     * Sell quote stale.
     */
    if (
      !sellQuoteIsFresh
    ) {
      diagnostics.staleSellQuote +=
        1;

      opportunityRejectionStore
        .recordHotPath({
          stage:
            "EVALUATOR",

          code:
            "STALE_SELL_QUOTE",

          reason:
            "Sell exchange quote is stale under its exchange-specific freshness policy.",

          market:
            pair.market,

          buyExchange:
            pair.buy.exchange,

          sellExchange:
            pair.sell.exchange,

          buyPrice:
            pair.buy
              .bestAskPrice,

          sellPrice:
            pair.sell
              .bestBidPrice,

          buyQuoteAgeMs,

          sellQuoteAgeMs,

          maximumQuoteAgeMs:
            pairFreshness
              .sell
              .maximumQuoteAgeMs,

          metadata: {
            buyTimestamp:
              pair.buy.timestamp,

            sellTimestamp:
              pair.sell.timestamp,

            sellFreshnessReason:
              pairFreshness
                .sell
                .reason,

            buyMaximumQuoteAgeMs:
              pairFreshness
                .buy
                .maximumQuoteAgeMs,

            sellMaximumQuoteAgeMs:
              pairFreshness
                .sell
                .maximumQuoteAgeMs,
          },
        });

      return null;
    }

    /*
     * Version 12.4:
     * Pair Synchronization Guard
     *
     * Both quotes may individually be fresh,
     * but they can still represent different
     * market moments.
     *
     * Example:
     *
     * Binance timestamp = T
     * CoinDCX timestamp = T - 4 seconds
     *
     * If allowed skew is 2 seconds, this pair
     * must never enter spread/profit analysis.
     */
    if (
      !pairFreshness
        .synchronized
    ) {
      diagnostics
        .pairSynchronizationRejected +=
        1;

      opportunityRejectionStore
        .recordHotPath({
          stage:
            "FRESHNESS",

          code:
            "PAIR_NOT_SYNCHRONIZED",

          reason:
            "Buy and sell quotes are individually fresh but their timestamp skew exceeds the allowed pair synchronization limit.",

          market:
            pair.market,

          buyExchange:
            pair.buy.exchange,

          sellExchange:
            pair.sell.exchange,

          buyPrice:
            pair.buy
              .bestAskPrice,

          sellPrice:
            pair.sell
              .bestBidPrice,

          buyQuoteAgeMs,

          sellQuoteAgeMs,

          maximumQuoteAgeMs:
            strictestMaximumQuoteAgeMs,

          metadata: {
            buyTimestamp:
              pair.buy.timestamp,

            sellTimestamp:
              pair.sell.timestamp,

            timestampSkewMs:
              pairFreshness
                .timestampSkewMs,

            maximumPairSkewMs:
              pairFreshness
                .maximumPairSkewMs,

            buyMaximumQuoteAgeMs:
              pairFreshness
                .buy
                .maximumQuoteAgeMs,

            sellMaximumQuoteAgeMs:
              pairFreshness
                .sell
                .maximumQuoteAgeMs,
          },
        });

      return null;
    }

    /*
     * Only synchronized fresh quotes are
     * allowed beyond this point.
     */
    const resolvedPrices =
      quotePriceResolver
        .resolve(
          pair.buy,
          pair.sell,
        );

    if (
      !resolvedPrices
    ) {
      diagnostics.priceResolutionFailed +=
        1;

      opportunityRejectionStore
        .recordHotPath({
          stage:
            "EVALUATOR",

          code:
            "PRICE_RESOLUTION_FAILED",

          reason:
            "Unable to resolve executable buy and sell prices.",

          market:
            pair.market,

          buyExchange:
            pair.buy.exchange,

          sellExchange:
            pair.sell.exchange,

          buyPrice:
            pair.buy
              .bestAskPrice,

          sellPrice:
            pair.sell
              .bestBidPrice,

          buyQuoteAgeMs,

          sellQuoteAgeMs,

          maximumQuoteAgeMs:
            strictestMaximumQuoteAgeMs,

          metadata: {
            timestampSkewMs:
              pairFreshness
                .timestampSkewMs,

            maximumPairSkewMs:
              pairFreshness
                .maximumPairSkewMs,
          },
        });

      return null;
    }

    if (
      !Number.isFinite(
        resolvedPrices.buyPrice,
      ) ||
      resolvedPrices.buyPrice <=
        0
    ) {
      diagnostics.invalidBuyPrice +=
        1;

      opportunityRejectionStore
        .recordHotPath({
          stage:
            "EVALUATOR",

          code:
            "INVALID_BUY_PRICE",

          reason:
            "Resolved buy price is invalid.",

          market:
            pair.market,

          buyExchange:
            pair.buy.exchange,

          sellExchange:
            pair.sell.exchange,

          buyPrice:
            resolvedPrices
              .buyPrice,

          sellPrice:
            resolvedPrices
              .sellPrice,

          buyQuoteAgeMs,

          sellQuoteAgeMs,

          maximumQuoteAgeMs:
            strictestMaximumQuoteAgeMs,
        });

      return null;
    }

    if (
      !Number.isFinite(
        resolvedPrices.sellPrice,
      ) ||
      resolvedPrices.sellPrice <=
        0
    ) {
      diagnostics.invalidSellPrice +=
        1;

      opportunityRejectionStore
        .recordHotPath({
          stage:
            "EVALUATOR",

          code:
            "INVALID_SELL_PRICE",

          reason:
            "Resolved sell price is invalid.",

          market:
            pair.market,

          buyExchange:
            pair.buy.exchange,

          sellExchange:
            pair.sell.exchange,

          buyPrice:
            resolvedPrices
              .buyPrice,

          sellPrice:
            resolvedPrices
              .sellPrice,

          buyQuoteAgeMs,

          sellQuoteAgeMs,

          maximumQuoteAgeMs:
            strictestMaximumQuoteAgeMs,
        });

      return null;
    }

    const buyExchange =
      pair.buy.exchange
        .trim()
        .toLowerCase();

    const sellExchange =
      pair.sell.exchange
        .trim()
        .toLowerCase();

    const feeLookupAt =
      Date.now();

    const buyTakerFeePercent =
      getExchangeTakerFeePercent(
        buyExchange,
        pair.market,
        feeLookupAt,
      );

    const sellTakerFeePercent =
      getExchangeTakerFeePercent(
        sellExchange,
        pair.market,
        feeLookupAt,
      );

    if (
      buyTakerFeePercent ===
      null
    ) {
      diagnostics.buyFeeMissing +=
        1;

      opportunityRejectionStore
        .recordHotPath({
          stage:
            "EVALUATOR",

          code:
            "BUY_FEE_MISSING",

          reason:
            `Trading fee configuration is missing for buy exchange ${buyExchange}.`,

          market:
            pair.market,

          buyExchange:
            pair.buy.exchange,

          sellExchange:
            pair.sell.exchange,

          buyPrice:
            resolvedPrices
              .buyPrice,

          sellPrice:
            resolvedPrices
              .sellPrice,

          buyQuoteAgeMs,

          sellQuoteAgeMs,

          maximumQuoteAgeMs:
            strictestMaximumQuoteAgeMs,
        });

      return null;
    }

    if (
      sellTakerFeePercent ===
      null
    ) {
      diagnostics.sellFeeMissing +=
        1;

      opportunityRejectionStore
        .recordHotPath({
          stage:
            "EVALUATOR",

          code:
            "SELL_FEE_MISSING",

          reason:
            `Trading fee configuration is missing for sell exchange ${sellExchange}.`,

          market:
            pair.market,

          buyExchange:
            pair.buy.exchange,

          sellExchange:
            pair.sell.exchange,

          buyPrice:
            resolvedPrices
              .buyPrice,

          sellPrice:
            resolvedPrices
              .sellPrice,

          buyQuoteAgeMs,

          sellQuoteAgeMs,

          maximumQuoteAgeMs:
            strictestMaximumQuoteAgeMs,
        });

      return null;
    }

    const rawSpread =
      resolvedPrices
        .sellPrice -
      resolvedPrices
        .buyPrice;

    const rawSpreadPercent =
      (
        rawSpread /
        resolvedPrices
          .buyPrice
      ) *
      100;

    const buyFeeAmount =
      resolvedPrices
        .buyPrice *
      (
        buyTakerFeePercent /
        100
      );

    const sellFeeAmount =
      resolvedPrices
        .sellPrice *
      (
        sellTakerFeePercent /
        100
      );

    const estimatedFees =
      buyFeeAmount +
      sellFeeAmount;

    const netProfit =
      rawSpread -
      estimatedFees;

    const netProfitPercent =
      (
        netProfit /
        resolvedPrices
          .buyPrice
      ) *
      100;

    diagnostics.accepted +=
      1;

    return {
      rawSpread,

      rawSpreadPercent,

      estimatedFees,

      netProfit,

      netProfitPercent,

      usedLastPriceFallback:
        resolvedPrices
          .usedLastPriceFallback,

      quotesAreFresh:
        true,
    };
  }

  getDiagnostics():
    OpportunityEvaluatorDiagnostics {
    return {
      ...diagnostics,
    };
  }

  resetDiagnostics():
    void {
    diagnostics.evaluated =
      0;

    diagnostics.staleBuyQuote =
      0;

    diagnostics.staleSellQuote =
      0;

    diagnostics.staleBothQuotes =
      0;

    diagnostics.pairSynchronizationRejected =
      0;

    diagnostics.priceResolutionFailed =
      0;

    diagnostics.buyFeeMissing =
      0;

    diagnostics.sellFeeMissing =
      0;

    diagnostics.invalidBuyPrice =
      0;

    diagnostics.invalidSellPrice =
      0;

    diagnostics.accepted =
      0;
  }
}

export const opportunityEvaluator =
  new OpportunityEvaluator();
