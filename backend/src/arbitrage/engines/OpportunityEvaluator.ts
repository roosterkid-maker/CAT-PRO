import { exchangeFees } from "../config/fees";

import type { ArbitragePolicy } from "../models/ArbitragePolicy";
import type { ExchangePair } from "../models/ExchangePair";
import type { OpportunityEvaluation } from "../models/OpportunityEvaluation";

import { quoteFreshnessValidator } from "./QuoteFreshnessValidator";
import { quotePriceResolver } from "./QuotePriceResolver";

export class OpportunityEvaluator {
  evaluate(
    pair: ExchangePair,
    policy: ArbitragePolicy,
    now = Date.now(),
  ): OpportunityEvaluation | null {
    const buyQuoteIsFresh = quoteFreshnessValidator.isFresh(
      pair.buy,
      policy.maximumQuoteAgeMs,
      now,
    );

    const sellQuoteIsFresh = quoteFreshnessValidator.isFresh(
      pair.sell,
      policy.maximumQuoteAgeMs,
      now,
    );

    const quotesAreFresh =
      buyQuoteIsFresh && sellQuoteIsFresh;

    if (!quotesAreFresh) {
      return null;
    }

    const resolvedPrices =
  quotePriceResolver.resolve(
    pair.buy,
    pair.sell,
  );

    if (!resolvedPrices) {
      return null;
    }

    const buyFeeConfig = exchangeFees[pair.buy.exchange];
    const sellFeeConfig = exchangeFees[pair.sell.exchange];

    if (!buyFeeConfig || !sellFeeConfig) {
      return null;
    }

    const rawSpread =
      resolvedPrices.sellPrice - resolvedPrices.buyPrice;

    const rawSpreadPercent =
      (rawSpread / resolvedPrices.buyPrice) * 100;

    const buyFeeAmount =
      resolvedPrices.buyPrice *
      (buyFeeConfig.takerPercent / 100);

    const sellFeeAmount =
      resolvedPrices.sellPrice *
      (sellFeeConfig.takerPercent / 100);

    const estimatedFees =
      buyFeeAmount + sellFeeAmount;

    const netProfit =
      rawSpread - estimatedFees;

    const netProfitPercent =
      (netProfit / resolvedPrices.buyPrice) * 100;

    return {
      rawSpread,
      rawSpreadPercent,
      estimatedFees,
      netProfit,
      netProfitPercent,
      usedLastPriceFallback:
        resolvedPrices.usedLastPriceFallback,
      quotesAreFresh,
    };
  }
}

export const opportunityEvaluator =
  new OpportunityEvaluator();