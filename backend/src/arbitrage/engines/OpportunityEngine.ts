import { randomUUID } from "node:crypto";

import { executionAnalysis } from "../../trading/analysis/ExecutionAnalysis";
import { defaultArbitragePolicy } from "../config/policy";

import type { ArbitrageOpportunity } from "../models/ArbitrageOpportunity";
import type { ArbitragePolicy } from "../models/ArbitragePolicy";
import type { ExchangePair } from "../models/ExchangePair";

import { opportunityEvaluator } from "./OpportunityEvaluator";

interface OpportunityDiagnostics {
  evaluated: number;
  evaluatorRejected: number;
  invalidMarketData: number;
  spreadRejected: number;
  netProfitRejected: number;
  quantityRejected: number;
  liquidityRejected: number;
  freshnessRejected: number;
  feeRejected: number;
  spreadAnalysisRejected: number;
  accepted: number;
}

const diagnostics: OpportunityDiagnostics = {
  evaluated: 0,
  evaluatorRejected: 0,
  invalidMarketData: 0,
  spreadRejected: 0,
  netProfitRejected: 0,
  quantityRejected: 0,
  liquidityRejected: 0,
  freshnessRejected: 0,
  feeRejected: 0,
  spreadAnalysisRejected: 0,
  accepted: 0,
};

export class OpportunityEngine {
  evaluate(
    
    pair: ExchangePair,
    policy: ArbitragePolicy = defaultArbitragePolicy,
  ): ArbitrageOpportunity | null {
    console.log(
  "[OpportunityEngine] evaluate() called",
);
    diagnostics.evaluated += 1;

    const evaluation =
      opportunityEvaluator.evaluate(
        pair,
        policy,
      );

    if (!evaluation) {
      diagnostics.evaluatorRejected += 1;
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
      diagnostics.invalidMarketData += 1;
      return null;
    }

    if (
      evaluation.rawSpreadPercent <
      policy.minimumSpreadPercent
    ) {
      diagnostics.spreadRejected += 1;
      return null;
    }

    if (
      evaluation.netProfitPercent <
      policy.minimumNetProfitPercent
    ) {
      diagnostics.netProfitRejected += 1;
      return null;
    }

    const requiredQty =
      policy.referenceCapital /
      buyPrice;

    if (
      !Number.isFinite(requiredQty) ||
      requiredQty <= 0
    ) {
      diagnostics.quantityRejected += 1;
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
      diagnostics.quantityRejected += 1;
      return null;
    }

    const preliminaryOpportunity: ArbitrageOpportunity = {
      id: randomUUID(),

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

    if (!analysis.liquidity.enoughLiquidity) {
      diagnostics.liquidityRejected += 1;
    }

    if (!analysis.freshness.fresh) {
      diagnostics.freshnessRejected += 1;
    }

    if (!analysis.fees.acceptable) {
      diagnostics.feeRejected += 1;
    }

    if (!analysis.spread.acceptable) {
      diagnostics.spreadAnalysisRejected += 1;
    }

 if (!analysis.executable) {
  console.log("========== REJECTED ==========");
  console.log("Market:", pair.market);
  console.log(
    "Raw Spread %:",
    evaluation.rawSpreadPercent.toFixed(4),
  );
  console.log(
    "Net Profit %:",
    evaluation.netProfitPercent.toFixed(4),
  );

  console.log(
    "Liquidity:",
    analysis.liquidity,
  );

  console.log(
    "Freshness:",
    analysis.freshness,
  );

  console.log(
    "Fees:",
    analysis.fees,
  );

  console.log(
    "Spread:",
    analysis.spread,
  );

  console.log(
    "Decision:",
    analysis.decision,
  );

  console.log(
    "Summary:",
    analysis.summary,
  );

  return null;
}

    diagnostics.accepted += 1;

    return {
      ...preliminaryOpportunity,

      executableQty:
        analysis.liquidity.executableQty,

      liquidityScore:
        analysis.liquidity.score,

      enoughLiquidity:
        analysis.liquidity.enoughLiquidity,

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

  getDiagnostics(): OpportunityDiagnostics {
    return {
      ...diagnostics,
    };
  }

  resetDiagnostics(): void {
    diagnostics.evaluated = 0;
    diagnostics.evaluatorRejected = 0;
    diagnostics.invalidMarketData = 0;
    diagnostics.spreadRejected = 0;
    diagnostics.netProfitRejected = 0;
    diagnostics.quantityRejected = 0;
    diagnostics.liquidityRejected = 0;
    diagnostics.freshnessRejected = 0;
    diagnostics.feeRejected = 0;
    diagnostics.spreadAnalysisRejected = 0;
    diagnostics.accepted = 0;
  }
}

export const opportunityEngine =
  new OpportunityEngine();