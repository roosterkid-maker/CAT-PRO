import type { ArbitrageOpportunity } from "../../arbitrage/models/ArbitrageOpportunity";
import type { ArbitragePolicy } from "../../arbitrage/models/ArbitragePolicy";

import { executionCalculator } from "../calculators/ExecutionCalculator";
import type { ExecutionContext } from "../models/ExecutionContext";

import {
  decisionAnalyzer,
  type DecisionAnalysis,
} from "./analyzers/DecisionAnalyzer";

import {
  feeAnalyzer,
  type FeeAnalysis,
} from "./analyzers/FeeAnalyzer";

import {
  freshnessAnalyzer,
  type FreshnessAnalysis,
} from "./analyzers/FreshnessAnalyzer";

import {
  liquidityAnalyzer,
  type LiquidityAnalysis,
} from "./analyzers/LiquidityAnalyzer";

import {
  priceDeviationAnalyzer,
  type PriceDeviationAnalysis,
} from "./analyzers/PriceDeviationAnalyzer";

import {
  spreadAnalyzer,
  type SpreadAnalysis,
} from "./analyzers/SpreadAnalyzer";

import { scoreCalculator } from "./ScoreCalculator";

export interface ExecutionAnalysisResult {
  context: ExecutionContext;

  liquidity: LiquidityAnalysis;
  freshness: FreshnessAnalysis;
  fees: FeeAnalysis;
  spread: SpreadAnalysis;
  priceDeviation: PriceDeviationAnalysis;

  overallScore: number;

  executable: boolean;

  decision: DecisionAnalysis;

  summary: string[];
}

export class ExecutionAnalysis {
  analyze(
    opportunity: ArbitrageOpportunity,
    policy: ArbitragePolicy,
    suppliedContext?: ExecutionContext,
  ): ExecutionAnalysisResult {
    const context =
      suppliedContext ??
      executionCalculator.calculate(
        opportunity.buyPrice,
        opportunity.buyAvailableQty,
        opportunity.sellAvailableQty,
        policy.referenceCapital,
      );

    const liquidity =
      liquidityAnalyzer.analyze(
        context,
        policy.minimumLiquidityPercent,
      );

    const freshness =
      freshnessAnalyzer.analyze(
        opportunity,
        policy.maximumQuoteAgeMs,
      );

    const fees =
      feeAnalyzer.analyze(
        opportunity,
      );

    const spread =
      spreadAnalyzer.analyze(
        opportunity,
      );

    const priceDeviation =
      priceDeviationAnalyzer.analyze({
        buyPrice:
          opportunity.buyPrice,

        sellPrice:
          opportunity.sellPrice,

        maximumDeviationPercent:
          policy.maximumPriceDeviationPercent,
      });

    const overallScore =
      scoreCalculator.calculate([
        {
          name: "Liquidity",
          score: liquidity.score,
          weight: 30,
        },
        {
          name: "Freshness",
          score: freshness.score,
          weight: 20,
        },
        {
          name: "Fees",
          score: fees.score,
          weight: 20,
        },
        {
          name: "Spread",
          score: spread.score,
          weight: 15,
        },
        {
          name: "PriceDeviation",
          score: priceDeviation.score,
          weight: 15,
        },
      ]);

    const executable =
      liquidity.enoughLiquidity &&
      freshness.fresh &&
      fees.acceptable &&
      spread.acceptable &&
      priceDeviation.acceptable;

    const decision =
      decisionAnalyzer.analyze(
        overallScore,
        executable,
      );

    const summary = [
      liquidity.reason,
      freshness.reason,
      fees.reason,
      spread.reason,
      priceDeviation.reason,
      decision.reason,
    ].filter(
      (reason): reason is string =>
        typeof reason === "string" &&
        reason.trim().length > 0,
    );

    return {
      context,

      liquidity,
      freshness,
      fees,
      spread,
      priceDeviation,

      overallScore,

      executable,

      decision,

      summary,
    };
  }
}

export const executionAnalysis =
  new ExecutionAnalysis();