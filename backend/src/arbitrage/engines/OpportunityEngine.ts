import {
  randomUUID,
} from "node:crypto";

import {
  environment,
} from "../../config/Environment";

import {
  executionAnalysis,
} from "../../trading/analysis/ExecutionAnalysis";

import {
  executionCalculator,
} from "../../trading/calculators/ExecutionCalculator";

import {
  exchangeCapabilityService,
} from "../../execution/capabilities/services/ExchangeCapabilityService";

import {
  centralPaperCapitalValuationService,
} from "../../strategies/services/CentralPaperCapitalValuationService";

import {
  opportunityRejectionStore,
  type OpportunityRejectionCode,
  type OpportunityRejectionStage,
} from "../services/OpportunityRejectionStore";

import {
  defaultArbitragePolicy,
} from "../config/policy";

import type {
  ArbitrageOpportunity,
} from "../models/ArbitrageOpportunity";

import type {
  ArbitragePolicy,
} from "../models/ArbitragePolicy";

import type {
  ExchangePair,
} from "../models/ExchangePair";

import {
  opportunityEvaluator,
} from "./OpportunityEvaluator";

interface OpportunityEngineDiagnostics {
  evaluated:
    number;

  evaluatorRejected:
    number;

  invalidMarketData:
    number;

  spreadRejected:
    number;

  netProfitRejected:
    number;

  quantityRejected:
    number;

  liquidityRejected:
    number;

  freshnessRejected:
    number;

  feeRejected:
    number;

  spreadAnalysisRejected:
    number;

  quoteIntegrityRejected:
    number;

  accepted:
    number;
}

export interface OpportunityDiagnostics {
  engine:
    OpportunityEngineDiagnostics;

  evaluator:
    ReturnType<
      typeof opportunityEvaluator.getDiagnostics
    >;
}

const diagnostics:
  OpportunityEngineDiagnostics = {
  evaluated:
    0,

  evaluatorRejected:
    0,

  invalidMarketData:
    0,

  spreadRejected:
    0,

  netProfitRejected:
    0,

  quantityRejected:
    0,

  liquidityRejected:
    0,

  freshnessRejected:
    0,

  feeRejected:
    0,

  spreadAnalysisRejected:
    0,

  quoteIntegrityRejected:
    0,

  accepted:
    0,
};

export class OpportunityEngine {
  private readonly referenceCapitalCache =
    new Map<string, {
      quoteAsset: string;
      quoteCapital: number;
      generatedAt: number;
      expiresAt: number;
    }>();

  constructor(
    private readonly rejectionDebugLoggingEnabled =
      environment
        .logLevel
        .trim()
        .toLowerCase() ===
      "debug",
  ) {}

  recordPreFilteredNonPositiveSpreads(
    count:
      number,
  ): void {
    if (
      !Number.isSafeInteger(
        count,
      ) ||
      count <=
        0
    ) {
      return;
    }

    diagnostics.evaluated +=
      count;

    diagnostics.spreadRejected +=
      count;
  }

  evaluate(
    pair:
      ExchangePair,

    policy:
      ArbitragePolicy =
        defaultArbitragePolicy,
  ): ArbitrageOpportunity | null {
    diagnostics.evaluated +=
      1;

    const preliminaryBuyPrice =
      pair.buy
        .bestAskPrice;

    const preliminarySellPrice =
      pair.sell
        .bestBidPrice;

    /*
     * A route whose executable sell bid cannot clear its executable buy ask
     * (or cannot reach the configured raw-spread floor) is mathematically
     * incapable of becoming an arbitrage after fees. Reject it before the
     * more expensive freshness, synchronization and fee evidence pipeline.
     * Positive routes still pass every existing safety gate below.
     */
    if (
      preliminaryBuyPrice !==
        null &&
      preliminarySellPrice !==
        null &&
      Number.isFinite(
        preliminaryBuyPrice,
      ) &&
      Number.isFinite(
        preliminarySellPrice,
      ) &&
      preliminaryBuyPrice >
        0 &&
      preliminarySellPrice >
        0
    ) {
      const preliminaryRawSpread =
        preliminarySellPrice -
        preliminaryBuyPrice;

      const preliminaryRawSpreadPercent =
        preliminaryRawSpread /
        preliminaryBuyPrice *
        100;

      if (
        preliminaryRawSpreadPercent <
        policy.minimumSpreadPercent
      ) {
        diagnostics.spreadRejected +=
          1;

        /*
         * Retain genuine positive near-miss evidence. Zero/negative routes
         * are not opportunities and previously generated most hot-path
         * allocations while immediately evicting useful rejection records.
         */
        if (
          preliminaryRawSpreadPercent >
          0
        ) {
          opportunityRejectionStore
            .recordHotPath({
              stage:
                "SPREAD",
              code:
                "SPREAD_BELOW_MINIMUM",
              reason:
                `Raw spread ${preliminaryRawSpreadPercent.toFixed(6)}% is below minimum required ${policy.minimumSpreadPercent.toFixed(6)}%.`,
              market:
                pair.market,
              buyExchange:
                pair.buy.exchange,
              sellExchange:
                pair.sell.exchange,
              buyPrice:
                preliminaryBuyPrice,
              sellPrice:
                preliminarySellPrice,
              rawSpread:
                preliminaryRawSpread,
              rawSpreadPercent:
                preliminaryRawSpreadPercent,
              minimumSpreadPercent:
                policy.minimumSpreadPercent,
              minimumNetProfitPercent:
                policy.minimumNetProfitPercent,
            });
        }

        if (
          this.rejectionDebugLoggingEnabled
        ) {
          this.logRejection(
            "[Spread Rejected]",
            {
              market:
                pair.market,
              buyExchange:
                pair.buy.exchange,
              sellExchange:
                pair.sell.exchange,
              rawSpreadPercent:
                preliminaryRawSpreadPercent,
              minimumSpreadPercent:
                policy.minimumSpreadPercent,
            },
          );
        }

        return null;
      }
    }

    const evaluation =
      opportunityEvaluator
        .evaluate(
          pair,
          policy,
        );

    if (!evaluation) {
      /*
       * Evaluator owns exact evaluator-level
       * rejection reasons and records them in
       * OpportunityRejectionStore.
       *
       * OpportunityEngine only tracks the
       * aggregate rejection count here.
       */
      diagnostics.evaluatorRejected +=
        1;

      return null;
    }

    const buyPrice =
      pair.buy
        .bestAskPrice;

    const sellPrice =
      pair.sell
        .bestBidPrice;

    const buyAvailableQty =
      pair.buy
        .bestAskQty;

    const sellAvailableQty =
      pair.sell
        .bestBidQty;

    if (
      buyPrice === null ||
      sellPrice === null ||
      buyAvailableQty ===
        null ||
      sellAvailableQty ===
        null ||
      !Number.isFinite(
        buyPrice,
      ) ||
      !Number.isFinite(
        sellPrice,
      ) ||
      !Number.isFinite(
        buyAvailableQty,
      ) ||
      !Number.isFinite(
        sellAvailableQty,
      ) ||
      buyPrice <= 0 ||
      sellPrice <= 0 ||
      buyAvailableQty <= 0 ||
      sellAvailableQty <=
        0
    ) {
      diagnostics.invalidMarketData +=
        1;

      opportunityRejectionStore
        .recordHotPath({
          stage:
            "MARKET_DATA",

          code:
            "INVALID_MARKET_DATA",

          reason:
            "Executable top-of-book market data is invalid or unavailable.",

          market:
            pair.market,

          buyExchange:
            pair.buy.exchange,

          sellExchange:
            pair.sell.exchange,

          buyPrice,

          sellPrice,

          rawSpread:
            evaluation.rawSpread,

          rawSpreadPercent:
            evaluation
              .rawSpreadPercent,

          estimatedFees:
            evaluation
              .estimatedFees,

          netProfit:
            evaluation.netProfit,

          netProfitPercent:
            evaluation
              .netProfitPercent,

          metadata: {
            buyAvailableQty,
            sellAvailableQty,
          },
        });

      this.logRejection(
        "[Opportunity Rejected: Invalid Market Data]",
        {
          market:
            pair.market,

          buyExchange:
            pair.buy.exchange,

          sellExchange:
            pair.sell.exchange,

          buyPrice,

          sellPrice,

          buyAvailableQty,

          sellAvailableQty,
        },
      );

      return null;
    }

    if (
      evaluation
        .rawSpreadPercent <
      policy
        .minimumSpreadPercent
    ) {
      diagnostics.spreadRejected +=
        1;

      opportunityRejectionStore
        .recordHotPath({
          stage:
            "SPREAD",

          code:
            "SPREAD_BELOW_MINIMUM",

          reason:
            `Raw spread ${evaluation.rawSpreadPercent.toFixed(
              6,
            )}% is below minimum required ${policy.minimumSpreadPercent.toFixed(
              6,
            )}%.`,

          market:
            pair.market,

          buyExchange:
            pair.buy.exchange,

          sellExchange:
            pair.sell.exchange,

          buyPrice,

          sellPrice,

          rawSpread:
            evaluation.rawSpread,

          rawSpreadPercent:
            evaluation
              .rawSpreadPercent,

          estimatedFees:
            evaluation
              .estimatedFees,

          netProfit:
            evaluation.netProfit,

          netProfitPercent:
            evaluation
              .netProfitPercent,

          minimumSpreadPercent:
            policy
              .minimumSpreadPercent,

          minimumNetProfitPercent:
            policy
              .minimumNetProfitPercent,
        });

      this.logRejection(
        "[Spread Rejected]",
        {
          market:
            pair.market,

          buyExchange:
            pair.buy.exchange,

          sellExchange:
            pair.sell.exchange,

          buyPrice,

          sellPrice,

          rawSpread:
            evaluation.rawSpread,

          rawSpreadPercent:
            evaluation
              .rawSpreadPercent,

          minimumSpreadPercent:
            policy
              .minimumSpreadPercent,

          estimatedFees:
            evaluation
              .estimatedFees,

          netProfit:
            evaluation.netProfit,

          netProfitPercent:
            evaluation
              .netProfitPercent,
        },
      );

      return null;
    }

    if (
      evaluation
        .netProfitPercent <
      policy
        .minimumNetProfitPercent
    ) {
      diagnostics.netProfitRejected +=
        1;

      opportunityRejectionStore
        .recordHotPath({
          stage:
            "NET_PROFIT",

          code:
            "NET_PROFIT_BELOW_MINIMUM",

          reason:
            `Net profit ${evaluation.netProfitPercent.toFixed(
              6,
            )}% is below minimum required ${policy.minimumNetProfitPercent.toFixed(
              6,
            )}%.`,

          market:
            pair.market,

          buyExchange:
            pair.buy.exchange,

          sellExchange:
            pair.sell.exchange,

          buyPrice,

          sellPrice,

          rawSpread:
            evaluation.rawSpread,

          rawSpreadPercent:
            evaluation
              .rawSpreadPercent,

          estimatedFees:
            evaluation
              .estimatedFees,

          netProfit:
            evaluation.netProfit,

          netProfitPercent:
            evaluation
              .netProfitPercent,

          minimumSpreadPercent:
            policy
              .minimumSpreadPercent,

          minimumNetProfitPercent:
            policy
              .minimumNetProfitPercent,
        });

      this.logRejection(
        "[Net Profit Rejected]",
        {
          market:
            pair.market,

          buyExchange:
            pair.buy.exchange,

          sellExchange:
            pair.sell.exchange,

          buyPrice,

          sellPrice,

          rawSpreadPercent:
            evaluation
              .rawSpreadPercent,

          estimatedFees:
            evaluation
              .estimatedFees,

          netProfit:
            evaluation.netProfit,

          netProfitPercent:
            evaluation
              .netProfitPercent,

          minimumNetProfitPercent:
            policy
              .minimumNetProfitPercent,
        },
      );

      return null;
    }

    const capitalSizing =
      this.resolveReferenceCapital(
        pair,
        policy.referenceCapital,
      );

    if (!capitalSizing) {
      diagnostics.quantityRejected +=
        1;

      opportunityRejectionStore
        .recordHotPath({
          stage:
            "QUANTITY",

          code:
            "ACCOUNT_CAPITAL_CONVERSION_UNAVAILABLE",

          reason:
            "Fresh executable INR-to-market-quote conversion evidence is unavailable.",

          market:
            pair.market,

          buyExchange:
            pair.buy.exchange,

          sellExchange:
            pair.sell.exchange,

          buyPrice,

          sellPrice,

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

          metadata: {
            requestedCapitalInr:
              policy.referenceCapital,
          },
        });

      return null;
    }

    const requiredQty =
      capitalSizing.quoteCapital /
      buyPrice;

    if (
      !Number.isFinite(
        requiredQty,
      ) ||
      requiredQty <= 0
    ) {
      diagnostics.quantityRejected +=
        1;

      opportunityRejectionStore
        .recordHotPath({
          stage:
            "QUANTITY",

          code:
            "INVALID_REQUIRED_QUANTITY",

          reason:
            "Required execution quantity calculated from reference capital is invalid.",

          market:
            pair.market,

          buyExchange:
            pair.buy.exchange,

          sellExchange:
            pair.sell.exchange,

          buyPrice,

          sellPrice,

          rawSpread:
            evaluation.rawSpread,

          rawSpreadPercent:
            evaluation
              .rawSpreadPercent,

          estimatedFees:
            evaluation
              .estimatedFees,

          netProfit:
            evaluation.netProfit,

          netProfitPercent:
            evaluation
              .netProfitPercent,

          requestedQuantity:
            requiredQty,

          minimumSpreadPercent:
            policy
              .minimumSpreadPercent,

          minimumNetProfitPercent:
            policy
              .minimumNetProfitPercent,

          metadata: {
            requestedCapitalInr:
              policy.referenceCapital,

            quoteAsset:
              capitalSizing.quoteAsset,

            requestedQuoteCapital:
              capitalSizing.quoteCapital,
          },
        });

      this.logRejection(
        "[Opportunity Rejected: Invalid Required Quantity]",
        {
          market:
            pair.market,

          buyPrice,

          referenceCapital:
            policy
              .referenceCapital,

          requiredQty,
        },
      );

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
      availableExecutableQty <=
        0
    ) {
      diagnostics.quantityRejected +=
        1;

      opportunityRejectionStore
        .recordHotPath({
          stage:
            "QUANTITY",

          code:
            "INVALID_EXECUTABLE_QUANTITY",

          reason:
            "Available executable quantity is invalid or unavailable.",

          market:
            pair.market,

          buyExchange:
            pair.buy.exchange,

          sellExchange:
            pair.sell.exchange,

          buyPrice,

          sellPrice,

          rawSpread:
            evaluation.rawSpread,

          rawSpreadPercent:
            evaluation
              .rawSpreadPercent,

          estimatedFees:
            evaluation
              .estimatedFees,

          netProfit:
            evaluation.netProfit,

          netProfitPercent:
            evaluation
              .netProfitPercent,

          requestedQuantity:
            requiredQty,

          availableQuantity:
            availableExecutableQty,

          executableQuantity:
            0,

          metadata: {
            buyAvailableQty,
            sellAvailableQty,
          },
        });

      this.logRejection(
        "[Opportunity Rejected: Invalid Executable Quantity]",
        {
          market:
            pair.market,

          buyAvailableQty,

          sellAvailableQty,

          availableExecutableQty,
        },
      );

      return null;
    }

    const preliminaryExecutableQty =
      Math.min(
        requiredQty,
        availableExecutableQty,
      );

    const executableQuoteCapital =
      preliminaryExecutableQty *
      buyPrice;

    const executableCapitalInr =
      policy.referenceCapital *
      (
        executableQuoteCapital /
        capitalSizing.quoteCapital
      );

    const preliminaryOpportunity:
      ArbitrageOpportunity = {
      id:
        randomUUID(),

      pair,

      buyPrice,

      sellPrice,

      buyAvailableQty,

      sellAvailableQty,

      requestedCapitalInr:
        policy.referenceCapital,

      quoteAsset:
        capitalSizing.quoteAsset,

      requestedQuoteCapital:
        capitalSizing.quoteCapital,

      executableQuoteCapital,

      executableCapitalInr,

      requiredQty,

      availableExecutableQty,

      executableQty:
        preliminaryExecutableQty,

      liquidityScore:
        0,

      enoughLiquidity:
        false,

      freshnessScore:
        0,

      feeScore:
        0,

      spreadScore:
        0,

      decision:
        "SKIP",

      analysisSummary:
        [],

      rawSpread:
        evaluation.rawSpread,

      rawSpreadPercent:
        evaluation
          .rawSpreadPercent,

      estimatedFees:
        evaluation
          .estimatedFees,

      netProfit:
        evaluation.netProfit,

      netProfitPercent:
        evaluation
          .netProfitPercent,

      usedLastPriceFallback:
        evaluation
          .usedLastPriceFallback,

      quotesAreFresh:
        evaluation
          .quotesAreFresh,

      score:
        0,

      timestamp:
        Math.max(
          pair.buy.timestamp,
          pair.sell.timestamp,
        ),
    };

    const analysisContext =
      executionCalculator
        .calculate(
          buyPrice,
          buyAvailableQty,
          sellAvailableQty,
          capitalSizing.quoteCapital,
        );

    const analysis =
      executionAnalysis
        .analyze(
          preliminaryOpportunity,
          policy,
          analysisContext,
        );

    if (
      !analysis
        .liquidity
        .enoughLiquidity
    ) {
      diagnostics.liquidityRejected +=
        1;
    }

    if (
      !analysis
        .freshness
        .fresh
    ) {
      diagnostics.freshnessRejected +=
        1;
    }

    if (
      !analysis
        .fees
        .acceptable
    ) {
      diagnostics.feeRejected +=
        1;
    }

    if (
      !analysis
        .spread
        .acceptable
    ) {
      diagnostics.spreadAnalysisRejected +=
        1;
    }

    if (
      !analysis
        .quoteIntegrity
        .acceptable
    ) {
      diagnostics.quoteIntegrityRejected +=
        1;
    }

    if (!analysis.executable) {
      const primaryRejection =
        this.resolveExecutionAnalysisRejection(
          analysis,
        );

      const now =
        Date.now();

      const buyQuoteAgeMs =
        Math.max(
          0,
          now -
            pair.buy.timestamp,
        );

      const sellQuoteAgeMs =
        Math.max(
          0,
          now -
            pair.sell.timestamp,
        );

      opportunityRejectionStore
        .recordHotPath({
          stage:
            primaryRejection.stage,

          code:
            primaryRejection.code,

          reason:
            primaryRejection.reason,

          market:
            pair.market,

          buyExchange:
            pair.buy.exchange,

          sellExchange:
            pair.sell.exchange,

          buyPrice,

          sellPrice,

          rawSpread:
            evaluation.rawSpread,

          rawSpreadPercent:
            evaluation
              .rawSpreadPercent,

          estimatedFees:
            evaluation
              .estimatedFees,

          netProfit:
            evaluation.netProfit,

          netProfitPercent:
            evaluation
              .netProfitPercent,

          minimumSpreadPercent:
            policy
              .minimumSpreadPercent,

          minimumNetProfitPercent:
            policy
              .minimumNetProfitPercent,

          requestedQuantity:
            analysis
              .context
              .requestedQty,

          availableQuantity:
            analysis
              .context
              .availableQty,

          executableQuantity:
            analysis
              .context
              .executableQty,

          liquidityPercent:
            analysis
              .context
              .liquidityPercent,

          buyQuoteAgeMs,

          sellQuoteAgeMs,

          maximumQuoteAgeMs:
            policy
              .maximumQuoteAgeMs,

          overallScore:
            analysis
              .overallScore,

          metadata: {
            capital: {
              requestedCapitalInr:
                policy.referenceCapital,

              quoteAsset:
                capitalSizing.quoteAsset,

              requestedQuoteCapital:
                capitalSizing.quoteCapital,

              executableQuoteCapital,

              executableCapitalInr,
            },

            liquidity: {
              enough:
                analysis
                  .liquidity
                  .enoughLiquidity,

              score:
                analysis
                  .liquidity
                  .score,

              reason:
                analysis
                  .liquidity
                  .reason,
            },

            freshness: {
              fresh:
                analysis
                  .freshness
                  .fresh,

              score:
                analysis
                  .freshness
                  .score,

              reason:
                analysis
                  .freshness
                  .reason,
            },

            fees: {
              acceptable:
                analysis
                  .fees
                  .acceptable,

              score:
                analysis
                  .fees
                  .score,

              reason:
                analysis
                  .fees
                  .reason,
            },

            spread: {
              acceptable:
                analysis
                  .spread
                  .acceptable,

              score:
                analysis
                  .spread
                  .score,

              reason:
                analysis
                  .spread
                  .reason,
            },

            quoteIntegrity: {
              acceptable:
                analysis
                  .quoteIntegrity
                  .acceptable,

              score:
                analysis
                  .quoteIntegrity
                  .score,

              priceRatio:
                analysis
                  .quoteIntegrity
                  .priceRatio,

              failureCode:
                analysis
                  .quoteIntegrity
                  .failureCode,

              reason:
                analysis
                  .quoteIntegrity
                  .reason,
            },

            decision: {
              decision:
                analysis
                  .decision
                  .decision,

              reason:
                analysis
                  .decision
                  .reason,
            },

            summary:
              analysis.summary,
          },
        });

      this.logRejection(
        "[ExecutionAnalysis Rejected]",
        {
          market:
            pair.market,

          buyExchange:
            pair.buy.exchange,

          sellExchange:
            pair.sell.exchange,

          rawSpreadPercent:
            evaluation
              .rawSpreadPercent,

          netProfitPercent:
            evaluation
              .netProfitPercent,

          liquidity: {
            enough:
              analysis
                .liquidity
                .enoughLiquidity,

            score:
              analysis
                .liquidity
                .score,

            reason:
              analysis
                .liquidity
                .reason,
          },

          freshness: {
            fresh:
              analysis
                .freshness
                .fresh,

            score:
              analysis
                .freshness
                .score,

            reason:
              analysis
                .freshness
                .reason,
          },

          fees: {
            acceptable:
              analysis
                .fees
                .acceptable,

            score:
              analysis
                .fees
                .score,

            reason:
              analysis
                .fees
                .reason,
          },

          spread: {
            acceptable:
              analysis
                .spread
                .acceptable,

            score:
              analysis
                .spread
                .score,

            reason:
              analysis
                .spread
                .reason,
          },

          quoteIntegrity: {
            acceptable:
              analysis
                .quoteIntegrity
                .acceptable,

            score:
              analysis
                .quoteIntegrity
                .score,

            priceRatio:
              analysis
                .quoteIntegrity
                .priceRatio,

            failureCode:
              analysis
                .quoteIntegrity
                .failureCode,

            reason:
              analysis
                .quoteIntegrity
                .reason,
          },

          decision: {
            decision:
              analysis
                .decision
                .decision,

            reason:
              analysis
                .decision
                .reason,
          },

          overallScore:
            analysis
              .overallScore,
        },
      );

      return null;
    }

    diagnostics.accepted +=
      1;

    return {
      ...preliminaryOpportunity,

      executableQty:
        analysis
          .liquidity
          .executableQty,

      liquidityScore:
        analysis
          .liquidity
          .score,

      enoughLiquidity:
        analysis
          .liquidity
          .enoughLiquidity,

      freshnessScore:
        analysis
          .freshness
          .score,

      feeScore:
        analysis
          .fees
          .score,

      spreadScore:
        analysis
          .spread
          .score,

      decision:
        analysis
          .decision
          .decision,

      analysisSummary:
        analysis.summary,

      quotesAreFresh:
        analysis
          .freshness
          .fresh,

      score:
        analysis
          .overallScore,
    };
  }

  getDiagnostics():
    OpportunityDiagnostics {
    return {
      engine: {
        ...diagnostics,
      },

      evaluator:
        opportunityEvaluator
          .getDiagnostics(),
    };
  }

  resetDiagnostics():
    void {
    diagnostics.evaluated =
      0;

    diagnostics.evaluatorRejected =
      0;

    diagnostics.invalidMarketData =
      0;

    diagnostics.spreadRejected =
      0;

    diagnostics.netProfitRejected =
      0;

    diagnostics.quantityRejected =
      0;

    diagnostics.liquidityRejected =
      0;

    diagnostics.freshnessRejected =
      0;

    diagnostics.feeRejected =
      0;

    diagnostics.spreadAnalysisRejected =
      0;

    diagnostics.quoteIntegrityRejected =
      0;

    diagnostics.accepted =
      0;

    opportunityEvaluator
      .resetDiagnostics();
  }

  private resolveReferenceCapital(
    pair:
      ExchangePair,

    requestedCapitalInr:
      number,
  ): {
    quoteAsset: string;
    quoteCapital: number;
  } | null {
    const now =
      Date.now();

    const buyCapability =
      exchangeCapabilityService
        .getCachedCapability(
          pair.buy.exchange,
          pair.market,
          "spot",
        );

    const sellCapability =
      exchangeCapabilityService
        .getCachedCapability(
          pair.sell.exchange,
          pair.market,
          "spot",
        );

    const buyQuoteAsset =
      buyCapability
        ?.quoteAsset
        .trim()
        .toUpperCase() ??
      this.inferQuoteAsset(
        pair.market,
      );

    const sellQuoteAsset =
      sellCapability
        ?.quoteAsset
        .trim()
        .toUpperCase() ??
      buyQuoteAsset;

    if (
      !buyQuoteAsset ||
      buyQuoteAsset !==
        sellQuoteAsset ||
      !Number.isFinite(
        requestedCapitalInr,
      ) ||
      requestedCapitalInr <=
        0
    ) {
      return null;
    }

    if (
      buyQuoteAsset ===
      "INR"
    ) {
      return {
        quoteAsset:
          "INR",

        quoteCapital:
          requestedCapitalInr,
      };
    }

    const cacheKey =
      `${buyQuoteAsset}:${requestedCapitalInr.toFixed(8)}`;

    const cached =
      this.referenceCapitalCache
        .get(
          cacheKey,
        );

    if (
      cached &&
      now -
        cached.generatedAt <=
        250 &&
      cached.expiresAt >
        now
    ) {
      return {
        quoteAsset:
          cached.quoteAsset,

        quoteCapital:
          cached.quoteCapital,
      };
    }

    const conversion =
      centralPaperCapitalValuationService
        .convertInrToAsset(
          buyQuoteAsset,
          requestedCapitalInr,
          `strategy-one-reference:${cacheKey}:${Math.floor(now / 250)}`,
          now,
        );

    if (
      !conversion ||
      !Number.isFinite(
        conversion.targetQuantity,
      ) ||
      conversion.targetQuantity <=
        0
    ) {
      return null;
    }

    const resolved = {
      quoteAsset:
        buyQuoteAsset,

      quoteCapital:
        conversion.targetQuantity,

      generatedAt:
        now,

      expiresAt:
        conversion.expiresAt,
    };

    this.referenceCapitalCache
      .set(
        cacheKey,
        resolved,
      );

    if (
      this.referenceCapitalCache
        .size >
      32
    ) {
      for (
        const [
          key,
          value,
        ] of this.referenceCapitalCache
      ) {
        if (
          value.expiresAt <=
          now
        ) {
          this.referenceCapitalCache
            .delete(
              key,
            );
        }
      }
    }

    return {
      quoteAsset:
        resolved.quoteAsset,

      quoteCapital:
        resolved.quoteCapital,
    };
  }

  private inferQuoteAsset(
    market:
      string,
  ): string | null {
    const canonical =
      market
        .trim()
        .toUpperCase()
        .replace(
          /[\s_\-/]+/g,
          "",
        );

    return [
      "USDT",
      "USDC",
      "INR",
      "BTC",
      "ETH",
    ].find(
      (asset) =>
        canonical.endsWith(
          asset,
        ) &&
        canonical.length >
          asset.length,
    ) ??
      null;
  }

  private resolveExecutionAnalysisRejection(
    analysis:
      ReturnType<
        typeof executionAnalysis.analyze
      >,
  ): {
    stage:
      OpportunityRejectionStage;

    code:
      OpportunityRejectionCode;

    reason:
      string;
  } {
    if (
      !analysis
        .quoteIntegrity
        .acceptable
    ) {
      return {
        stage:
          "QUOTE_INTEGRITY",

        code:
          "QUOTE_INTEGRITY_FAILED",

        reason:
          analysis
            .quoteIntegrity
            .reason,
      };
    }

    if (
      !analysis
        .freshness
        .fresh
    ) {
      return {
        stage:
          "FRESHNESS",

        code:
          "STALE_EXECUTION_QUOTES",

        reason:
          analysis
            .freshness
            .reason,
      };
    }

    if (
      !analysis
        .fees
        .acceptable
    ) {
      return {
        stage:
          "FEES",

        code:
          "UNACCEPTABLE_FEES",

        reason:
          analysis
            .fees
            .reason,
      };
    }

    if (
      !analysis
        .spread
        .acceptable
    ) {
      return {
        stage:
          "SPREAD_ANALYSIS",

        code:
          "UNACCEPTABLE_SPREAD",

        reason:
          analysis
            .spread
            .reason,
      };
    }

    if (
      !analysis
        .liquidity
        .enoughLiquidity
    ) {
      return {
        stage:
          "LIQUIDITY",

        code:
          "INSUFFICIENT_LIQUIDITY",

        reason:
          analysis
            .liquidity
            .reason,
      };
    }

    return {
      stage:
        "EXECUTION_ANALYSIS",

      code:
        "EXECUTION_NOT_ALLOWED",

      reason:
        analysis
          .decision
          .reason ||
        "Execution analysis rejected the opportunity.",
    };
  }

  private logRejection(
    label:
      string,

    details:
      Readonly<
        Record<
          string,
          unknown
        >
      >,
  ): void {
    if (
      !this
        .rejectionDebugLoggingEnabled
    ) {
      return;
    }

    console.debug(
      label,
      details,
    );
  }
}

export const opportunityEngine =
  new OpportunityEngine();
