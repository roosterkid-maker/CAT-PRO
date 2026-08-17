import type {
  ArbitrageOpportunity,
} from "../../arbitrage/models/ArbitrageOpportunity";

import type {
  ArbitragePolicy,
} from "../../arbitrage/models/ArbitragePolicy";

import type {
  ExecutionContext,
} from "../models/ExecutionContext";

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
  quoteIntegrityAnalyzer,
  type QuoteIntegrityAnalysis,
} from "./analyzers/QuoteIntegrityAnalyzer";

import {
  spreadAnalyzer,
  type SpreadAnalysis,
} from "./analyzers/SpreadAnalyzer";

import {
  scoreCalculator,
} from "./ScoreCalculator";

export interface ExecutionAnalysisResult {
  context:
    ExecutionContext;

  liquidity:
    LiquidityAnalysis;

  freshness:
    FreshnessAnalysis;

  fees:
    FeeAnalysis;

  spread:
    SpreadAnalysis;

  quoteIntegrity:
    QuoteIntegrityAnalysis;

  overallScore:
    number;

  executable:
    boolean;

  decision:
    DecisionAnalysis;

  summary:
    string[];
}

export class ExecutionAnalysis {
  analyze(
    opportunity:
      ArbitrageOpportunity,

    policy:
      ArbitragePolicy,

    /** Context already sized in the market quote asset by the opportunity engine. */
    context:
      ExecutionContext,
  ): ExecutionAnalysisResult {
    const liquidity =
      liquidityAnalyzer
        .analyze(
          context,
          policy.minimumLiquidityPercent,
        );

    const freshness =
      freshnessAnalyzer
        .analyze(
          opportunity,
          policy.maximumQuoteAgeMs,
        );

    const fees =
      feeAnalyzer
        .analyze(
          opportunity,
        );

    /*
     * Spread is responsible for evaluating the
     * actual arbitrage price difference.
     */
    const spread =
      spreadAnalyzer
        .analyze(
          opportunity,
        );

    /*
     * Quote integrity is a separate safety gate.
     *
     * It prevents obviously corrupted or
     * incorrectly normalized cross-exchange
     * prices without treating normal arbitrage
     * divergence as an error.
     */
    const quoteIntegrity =
      quoteIntegrityAnalyzer
        .analyze({
          buyPrice:
            opportunity.buyPrice,

          sellPrice:
            opportunity.sellPrice,

          maximumPriceRatio:
            policy
              .maximumCrossExchangePriceRatio,
        });

    /*
     * Total weight = 100.
     */
    const overallScore =
      scoreCalculator
        .calculate([
          {
            name:
              "Liquidity",

            score:
              liquidity.score,

            weight:
              30,
          },

          {
            name:
              "Freshness",

            score:
              freshness.score,

            weight:
              20,
          },

          {
            name:
              "Fees",

            score:
              fees.score,

            weight:
              20,
          },

          {
            name:
              "Spread",

            score:
              spread.score,

            weight:
              15,
          },

          {
            name:
              "QuoteIntegrity",

            score:
              quoteIntegrity.score,

            weight:
              15,
          },
        ]);

    /*
     * All independent safety gates must pass.
     */
    const executable =
      liquidity
        .enoughLiquidity &&
      freshness
        .fresh &&
      fees
        .acceptable &&
      spread
        .acceptable &&
      quoteIntegrity
        .acceptable;

    const decision =
      decisionAnalyzer
        .analyze(
          overallScore,
          executable,
        );

    const summary = [
      liquidity.reason,
      freshness.reason,
      fees.reason,
      spread.reason,
      quoteIntegrity.reason,
      decision.reason,
    ].filter(
      (
        reason,
      ): reason is string =>
        typeof reason ===
          "string" &&
        reason
          .trim()
          .length >
          0,
    );

    return {
      context,

      liquidity,

      freshness,

      fees,

      spread,

      quoteIntegrity,

      overallScore,

      executable,

      decision,

      summary,
    };
  }
}

export const executionAnalysis =
  new ExecutionAnalysis();
