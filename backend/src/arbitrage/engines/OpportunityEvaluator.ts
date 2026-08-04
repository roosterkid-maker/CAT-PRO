import { exchangeFees } from "../config/fees";

import type { ArbitragePolicy } from "../models/ArbitragePolicy";
import type { ExchangePair } from "../models/ExchangePair";
import type { OpportunityEvaluation } from "../models/OpportunityEvaluation";

import { quoteFreshnessValidator } from "./QuoteFreshnessValidator";
import { quotePriceResolver } from "./QuotePriceResolver";

export interface OpportunityEvaluatorDiagnostics {
  evaluated: number;

  staleBuyQuote: number;
  staleSellQuote: number;
  staleBothQuotes: number;

  priceResolutionFailed: number;

  buyFeeMissing: number;
  sellFeeMissing: number;

  invalidBuyPrice: number;
  invalidSellPrice: number;

  accepted: number;
}

const diagnostics: OpportunityEvaluatorDiagnostics = {
  evaluated: 0,

  staleBuyQuote: 0,
  staleSellQuote: 0,
  staleBothQuotes: 0,

  priceResolutionFailed: 0,

  buyFeeMissing: 0,
  sellFeeMissing: 0,

  invalidBuyPrice: 0,
  invalidSellPrice: 0,

  accepted: 0,
};

export class OpportunityEvaluator {
  evaluate(
    pair: ExchangePair,
    policy: ArbitragePolicy,
    now = Date.now(),
  ): OpportunityEvaluation | null {
    diagnostics.evaluated += 1;

    const buyQuoteIsFresh =
      quoteFreshnessValidator.isFresh(
        pair.buy,
        policy.maximumQuoteAgeMs,
        now,
      );

    const sellQuoteIsFresh =
      quoteFreshnessValidator.isFresh(
        pair.sell,
        policy.maximumQuoteAgeMs,
        now,
      );

    if (
      !buyQuoteIsFresh &&
      !sellQuoteIsFresh
    ) {
      diagnostics.staleBothQuotes += 1;

      return null;
    }

    if (!buyQuoteIsFresh) {
      diagnostics.staleBuyQuote += 1;

      return null;
    }

    if (!sellQuoteIsFresh) {
      diagnostics.staleSellQuote += 1;

      return null;
    }

    const resolvedPrices =
      quotePriceResolver.resolve(
        pair.buy,
        pair.sell,
      );

    if (!resolvedPrices) {
      diagnostics.priceResolutionFailed += 1;

      return null;
    }

    if (
      !Number.isFinite(
        resolvedPrices.buyPrice,
      ) ||
      resolvedPrices.buyPrice <= 0
    ) {
      diagnostics.invalidBuyPrice += 1;

      return null;
    }

    if (
      !Number.isFinite(
        resolvedPrices.sellPrice,
      ) ||
      resolvedPrices.sellPrice <= 0
    ) {
      diagnostics.invalidSellPrice += 1;

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

    const buyFeeConfig =
      exchangeFees[buyExchange];

    const sellFeeConfig =
      exchangeFees[sellExchange];

    if (!buyFeeConfig) {
      diagnostics.buyFeeMissing += 1;

      return null;
    }

    if (!sellFeeConfig) {
      diagnostics.sellFeeMissing += 1;

      return null;
    }

    const rawSpread =
      resolvedPrices.sellPrice -
      resolvedPrices.buyPrice;

    const rawSpreadPercent =
      (
        rawSpread /
        resolvedPrices.buyPrice
      ) * 100;

    const buyFeeAmount =
      resolvedPrices.buyPrice *
      (
        buyFeeConfig.takerPercent /
        100
      );

    const sellFeeAmount =
      resolvedPrices.sellPrice *
      (
        sellFeeConfig.takerPercent /
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
        resolvedPrices.buyPrice
      ) * 100;

    diagnostics.accepted += 1;

    return {
      rawSpread,
      rawSpreadPercent,

      estimatedFees,

      netProfit,
      netProfitPercent,

      usedLastPriceFallback:
        resolvedPrices
          .usedLastPriceFallback,

      quotesAreFresh: true,
    };
  }

  getDiagnostics():
  OpportunityEvaluatorDiagnostics {
    return {
      ...diagnostics,
    };
  }

  resetDiagnostics(): void {
    diagnostics.evaluated = 0;

    diagnostics.staleBuyQuote = 0;
    diagnostics.staleSellQuote = 0;
    diagnostics.staleBothQuotes = 0;

    diagnostics.priceResolutionFailed = 0;

    diagnostics.buyFeeMissing = 0;
    diagnostics.sellFeeMissing = 0;

    diagnostics.invalidBuyPrice = 0;
    diagnostics.invalidSellPrice = 0;

    diagnostics.accepted = 0;
  }
}

export const opportunityEvaluator =
  new OpportunityEvaluator();