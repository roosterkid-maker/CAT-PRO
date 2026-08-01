import { defaultArbitragePolicy } from "../config/policy";

import type { ArbitrageOpportunity } from "../models/ArbitrageOpportunity";
import type { ArbitragePolicy } from "../models/ArbitragePolicy";
import type { ExchangePair } from "../models/ExchangePair";

import { opportunityEvaluator } from "./OpportunityEvaluator";

export class OpportunityEngine {
  evaluate(
    pair: ExchangePair,
    policy: ArbitragePolicy = defaultArbitragePolicy,
  ): ArbitrageOpportunity | null {
    const evaluation = opportunityEvaluator.evaluate(
      pair,
      policy,
    );

    if (!evaluation) {
      return null;
    }

    const buyPrice =
      pair.buy.bestAskPrice;

    const sellPrice =
      pair.sell.bestBidPrice;

    const buyAvailableQty =
      pair.buy.bestAskQty;

    const sellAvailableQty =
      pair.sell.bestBidQty;

    if (
      buyPrice === null ||
      sellPrice === null ||
      buyAvailableQty === null ||
      sellAvailableQty === null ||
      !Number.isFinite(buyPrice) ||
      !Number.isFinite(sellPrice) ||
      !Number.isFinite(buyAvailableQty) ||
      !Number.isFinite(sellAvailableQty) ||
      buyPrice <= 0 ||
      sellPrice <= 0 ||
      buyAvailableQty <= 0 ||
      sellAvailableQty <= 0
    ) {
      return null;
    }

    if (
      evaluation.rawSpreadPercent <
      policy.minimumSpreadPercent
    ) {
      return null;
    }

    if (
      evaluation.netProfitPercent <
      policy.minimumNetProfitPercent
    ) {
      return null;
    }

    const executableQty = Math.min(
      buyAvailableQty,
      sellAvailableQty,
    );

    if (
      !Number.isFinite(executableQty) ||
      executableQty <= 0
    ) {
      return null;
    }

    return {
      pair,

      buyPrice,
      sellPrice,

      buyAvailableQty,
      sellAvailableQty,

      executableQty,

      rawSpread: evaluation.rawSpread,
      rawSpreadPercent:
        evaluation.rawSpreadPercent,

      estimatedFees:
        evaluation.estimatedFees,

      netProfit: evaluation.netProfit,
      netProfitPercent:
        evaluation.netProfitPercent,

      usedLastPriceFallback: false,

      quotesAreFresh:
        evaluation.quotesAreFresh,

      score: 0,

      timestamp: Math.max(
        pair.buy.timestamp,
        pair.sell.timestamp,
      ),
    };
  }
}

export const opportunityEngine =
  new OpportunityEngine();