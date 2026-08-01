import { executionAnalysis } from "../../trading/analysis/ExecutionAnalysis";
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
    const evaluation =
      opportunityEvaluator.evaluate(
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
      !Number.isFinite(
        buyAvailableQty,
      ) ||
      !Number.isFinite(
        sellAvailableQty,
      ) ||
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

    const requiredQty =
      policy.referenceCapital /
      buyPrice;

    if (
      !Number.isFinite(requiredQty) ||
      requiredQty <= 0
    ) {
      return null;
    }

    const availableExecutableQty =
      Math.min(
        buyAvailableQty,
        sellAvailableQty,
      );

    if (
      !Number.isFinite(
        availableExecutableQty,
      ) ||
      availableExecutableQty <= 0
    ) {
      return null;
    }

    const preliminaryOpportunity:
      ArbitrageOpportunity = {
      pair,

      buyPrice,
      sellPrice,

      buyAvailableQty,
      sellAvailableQty,

      requiredQty,
      availableExecutableQty,

      executableQty: Math.min(
        requiredQty,
        availableExecutableQty,
      ),

      liquidityScore: 0,
      enoughLiquidity: false,

      freshnessScore: 0,
      feeScore: 0,
      spreadScore: 0,

      decision: "SKIP",

      analysisSummary: [],

      rawSpread:
        evaluation.rawSpread,

      rawSpreadPercent:
        evaluation.rawSpreadPercent,

      estimatedFees:
        evaluation.estimatedFees,

      netProfit:
        evaluation.netProfit,

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

    const analysis =
      executionAnalysis.analyze(
        preliminaryOpportunity,
        policy,
      );

    if (!analysis.executable) {
      return null;
    }

    return {
      ...preliminaryOpportunity,

      executableQty:
        analysis.liquidity
          .executableQty,

      liquidityScore:
        analysis.liquidity.score,

      enoughLiquidity:
        analysis.liquidity
          .enoughLiquidity,

      freshnessScore:
        analysis.freshness.score,

      feeScore:
        analysis.fees.score,

      spreadScore:
        analysis.spread.score,

      decision:
        analysis.decision.decision,

      analysisSummary:
        analysis.summary,

      quotesAreFresh:
        analysis.freshness.fresh,

      score:
        analysis.overallScore,
    };
  }
}

export const opportunityEngine =
  new OpportunityEngine();