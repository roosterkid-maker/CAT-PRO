import type { ArbitrageOpportunity } from "../../arbitrage/models/ArbitrageOpportunity";
import type { ArbitragePolicy } from "../../arbitrage/models/ArbitragePolicy";

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
  spreadAnalyzer,
  type SpreadAnalysis,
} from "./analyzers/SpreadAnalyzer";

import { scoreCalculator } from "./ScoreCalculator";

export interface ExecutionAnalysisResult {
  liquidity: LiquidityAnalysis;
  freshness: FreshnessAnalysis;
  fees: FeeAnalysis;
  spread: SpreadAnalysis;

  overallScore: number;
  executable: boolean;

  decision: DecisionAnalysis;

  summary: string[];
}

export class ExecutionAnalysis {
  analyze(
    opportunity: ArbitrageOpportunity,
    policy: ArbitragePolicy,
  ): ExecutionAnalysisResult {
    const liquidity =
      liquidityAnalyzer.analyze(
        opportunity,
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

    const overallScore =
      scoreCalculator.calculate([
        {
          name: "Liquidity",
          score: liquidity.score,
          weight: 35,
        },
        {
          name: "Freshness",
          score: freshness.score,
          weight: 20,
        },
        {
          name: "Fees",
          score: fees.score,
          weight: 25,
        },
        {
          name: "Spread",
          score: spread.score,
          weight: 20,
        },
      ]);

    const executable =
      liquidity.enoughLiquidity &&
      freshness.fresh &&
      fees.acceptable &&
      spread.acceptable;

    const decision =
      decisionAnalyzer.analyze(
        overallScore,
        executable,
      );

    return {
      liquidity,
      freshness,
      fees,
      spread,

      overallScore,
      executable,

      decision,

      summary: [
        liquidity.reason,
        freshness.reason,
        fees.reason,
        spread.reason,
        decision.reason,
      ],
    };
  }
}

export const executionAnalysis =
  new ExecutionAnalysis();