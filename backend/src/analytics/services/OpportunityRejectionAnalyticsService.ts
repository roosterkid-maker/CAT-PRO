import {
  comparisonEngine,
} from "../../arbitrage/ComparisonEngine";

import {
  getExchangeFeeEvidence,
} from "../../arbitrage/config/fees";

import {
  defaultArbitragePolicy,
} from "../../arbitrage/config/policy";

import {
  exchangePairGenerator,
} from "../../arbitrage/engines/ExchangePairGenerator";

import {
  opportunityEngine,
} from "../../arbitrage/engines/OpportunityEngine";

import {
  quotePriceResolver,
} from "../../arbitrage/engines/QuotePriceResolver";

import type {
  ExchangePair,
} from "../../arbitrage/models/ExchangePair";

import type {
  ExchangeQuote,
} from "../../arbitrage/models/ExchangeQuote";

import type {
  MarketSnapshot,
} from "../../arbitrage/models/MarketSnapshot";

import type {
  OpportunityRejectionRecord,
} from "../../arbitrage/services/OpportunityRejectionStore";

import {
  opportunityRejectionStore,
} from "../../arbitrage/services/OpportunityRejectionStore";

import {
  opportunityService,
} from "../../arbitrage/services/OpportunityService";

import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";

import {
  bybitExecutionUniverseService,
} from "../../execution-quality/services/BybitExecutionUniverseService";

import {
  freshnessIntegrityService,
} from "../../freshness/services/FreshnessIntegrityService";

import {
  marketCache,
} from "../../services/cache.service";

/*
 * ============================================================
 * CAT PRO V20.9 BUILD 3
 * MARKET PAIRABILITY & FRESHNESS FORENSICS
 * ============================================================
 *
 * DIAGNOSTIC ONLY.
 *
 * This service does NOT:
 *
 * - change arbitrage thresholds
 * - change fee configuration
 * - change freshness limits
 * - mark rejected quotes executable
 * - bypass ExchangePairGenerator
 * - bypass OpportunityEngine
 * - arm PAPER
 * - enable LIVE
 * - reserve capital
 * - create an order
 * - submit an exchange request
 *
 * Its job is to explain:
 *
 * 1. why shared markets fail to become pairable,
 * 2. which executable-side fields are missing/invalid,
 * 3. which exchanges produce stale quotes,
 * 4. quote-age distribution by exchange/source,
 * 5. synchronization quality between generated routes.
 */

export interface OpportunityForensicsFunnel {
  allCachedQuotes:
    number;

  executionQualityEligibleQuotes:
    number;

  executionQualityFilteredQuotes:
    number;

  marketSnapshots:
    number;

  sharedMarkets:
    number;

  pairableMarkets:
    number;

  directionalExchangePairs:
    number;

  rawPositiveSpreads:
    number;

  freshPositiveSpreads:
    number;

  feePositiveSpreads:
    number;

  priceEconomicsThresholdPass:
    number;

  evaluatedPairs:
    number;

  evaluatorPassed:
    number;

  acceptedOpportunities:
    number;
}

export interface OpportunityForensicsRejectionBreakdownItem {
  key:
    string;

  count:
    number;

  percent:
    number;
}

export interface OpportunityForensicsRejectionSample {
  expectedRejectedPairs:
    number;

  capturedCurrentScanRecords:
    number;

  complete:
    boolean;

  storeCapacity:
    number;

  byStage:
    OpportunityForensicsRejectionBreakdownItem[];

  byCode:
    OpportunityForensicsRejectionBreakdownItem[];
}

export interface OpportunityPositiveRouteDiagnostic {
  market:
    string;

  buyExchange:
    string;

  sellExchange:
    string;

  buyPrice:
    number;

  sellPrice:
    number;

  rawSpread:
    number;

  rawSpreadPercent:
    number;

  buyFresh:
    boolean;

  sellFresh:
    boolean;

  synchronized:
    boolean;

  timestampSkewMs:
    number | null;

  maximumPairSkewMs:
    number;

  buyQuoteAgeMs:
    number | null;

  sellQuoteAgeMs:
    number | null;

  buyTakerFeePercent:
    number | null;

  sellTakerFeePercent:
    number | null;

  buyFeeSource:
    string | null;

  sellFeeSource:
    string | null;

  feeEvidenceAvailable:
    boolean;

  estimatedFees:
    number | null;

  feeDragPercent:
    number | null;

  netProfit:
    number | null;

  netProfitPercent:
    number | null;

  feePositive:
    boolean;

  spreadThresholdPass:
    boolean;

  netProfitThresholdPass:
    boolean;

  economicsThresholdPass:
    boolean;
}

export interface OpportunityRouteEconomicsSummary {
  route:
    string;

  buyExchange:
    string;

  sellExchange:
    string;

  evaluatedPairs:
    number;

  rawPositiveSpreads:
    number;

  freshPositiveSpreads:
    number;

  feePositiveSpreads:
    number;

  economicsThresholdPass:
    number;

  synchronizationRejected:
    number;

  maximumRawSpreadPercent:
    number | null;

  averageRawPositiveSpreadPercent:
    number | null;

  maximumFeePositiveNetProfitPercent:
    number | null;

  averageTimestampSkewMs:
    number | null;

  maximumTimestampSkewMs:
    number | null;
}

export interface OpportunityMarketEconomicsSummary {
  market:
    string;

  evaluatedPairs:
    number;

  rawPositiveSpreads:
    number;

  freshPositiveSpreads:
    number;

  feePositiveSpreads:
    number;

  economicsThresholdPass:
    number;

  maximumRawSpreadPercent:
    number | null;

  maximumNetProfitPercent:
    number | null;
}

export interface OpportunitySynchronizationForensics {
  pairsWithValidTimestamps:
    number;

  synchronizedPairs:
    number;

  unsynchronizedPairs:
    number;

  synchronizedPercent:
    number;

  unsynchronizedPercent:
    number;

  skewMs: {
    minimum:
      number | null;

    p50:
      number | null;

    p90:
      number | null;

    p95:
      number | null;

    p99:
      number | null;

    maximum:
      number | null;

    average:
      number | null;
  };

  unsynchronizedByRoute:
    OpportunityForensicsRejectionBreakdownItem[];

  unsynchronizedByMarket:
    OpportunityForensicsRejectionBreakdownItem[];
}

export interface OpportunityRouteEconomicsForensics {
  analyzedDirectionalPairs:
    number;

  positiveRouteSampleLimit:
    number;

  positiveRouteSampleCount:
    number;

  positiveRoutes:
    OpportunityPositiveRouteDiagnostic[];

  byExchangeRoute:
    OpportunityRouteEconomicsSummary[];

  topRawSpreadMarkets:
    OpportunityMarketEconomicsSummary[];

  synchronization:
    OpportunitySynchronizationForensics;
}

/*
 * ============================================================
 * BUILD 3 TYPES
 * ============================================================
 */

export type PairabilityQuoteIssue =
  | "NOT_EXECUTABLE"
  | "INVALID_BID_PRICE"
  | "INVALID_BID_QUANTITY"
  | "INVALID_ASK_PRICE"
  | "INVALID_ASK_QUANTITY";

export interface PairabilityQuoteDiagnostic {
  exchange:
    string;

  market:
    string;

  source:
    string;

  executable:
    boolean;

  buySideEligible:
    boolean;

  sellSideEligible:
    boolean;

  issues:
    PairabilityQuoteIssue[];

  bestBidPrice:
    number | null;

  bestBidQty:
    number | null;

  bestAskPrice:
    number | null;

  bestAskQty:
    number | null;

  timestamp:
    number;

  ageMs:
    number | null;

  maximumQuoteAgeMs:
    number;

  fresh:
    boolean;

  freshnessReason:
    string;
}

export interface NonPairableMarketDiagnostic {
  market:
    string;

  exchangeCount:
    number;

  exchanges:
    string[];

  validBuyExchanges:
    string[];

  validSellExchanges:
    string[];

  executableQuotes:
    number;

  generatedDirectionalPairs:
    number;

  quoteDiagnostics:
    PairabilityQuoteDiagnostic[];
}

export interface ExchangePairabilitySummary {
  exchange:
    string;

  sharedMarketQuotes:
    number;

  executableQuotes:
    number;

  buySideEligibleQuotes:
    number;

  sellSideEligibleQuotes:
    number;

  nonExecutableQuotes:
    number;

  invalidBidPrice:
    number;

  invalidBidQuantity:
    number;

  invalidAskPrice:
    number;

  invalidAskQuantity:
    number;

  freshQuotes:
    number;

  staleQuotes:
    number;
}

export interface PairabilityForensics {
  sharedMarkets:
    number;

  pairableMarkets:
    number;

  nonPairableMarkets:
    number;

  pairabilityPercent:
    number;

  nonPairablePercent:
    number;

  sharedMarketQuotes:
    number;

  issueBreakdown:
    OpportunityForensicsRejectionBreakdownItem[];

  byExchange:
    ExchangePairabilitySummary[];

  sampleLimit:
    number;

  sampledNonPairableMarkets:
    number;

  nonPairableMarketSample:
    NonPairableMarketDiagnostic[];
}

export interface QuoteAgeBucket {
  key:
    | "LT_500_MS"
    | "500_TO_999_MS"
    | "1000_TO_1999_MS"
    | "2000_TO_4999_MS"
    | "5000_TO_9999_MS"
    | "GE_10000_MS"
    | "INVALID";

  count:
    number;

  percent:
    number;
}

export interface ExchangeFreshnessSummary {
  exchange:
    string;

  quoteCount:
    number;

  freshQuotes:
    number;

  staleQuotes:
    number;

  invalidTimestampQuotes:
    number;

  futureTimestampQuotes:
    number;

  freshPercent:
    number;

  stalePercent:
    number;

  maximumQuoteAgeMs:
    number;

  ageMs: {
    minimum:
      number | null;

    p50:
      number | null;

    p90:
      number | null;

    p95:
      number | null;

    p99:
      number | null;

    maximum:
      number | null;

    average:
      number | null;
  };

  ageBuckets:
    QuoteAgeBucket[];

  bySource:
    OpportunityForensicsRejectionBreakdownItem[];
}

export interface FreshnessForensics {
  analyzedQuotes:
    number;

  freshQuotes:
    number;

  staleQuotes:
    number;

  invalidTimestampQuotes:
    number;

  futureTimestampQuotes:
    number;

  freshPercent:
    number;

  stalePercent:
    number;

  byExchange:
    ExchangeFreshnessSummary[];
}

export interface OpportunityRejectionAnalytics {
  generatedAt:
    number;

  version:
    "20.9";

  build:
    "3";

  mode:
    "DIAGNOSTIC_ONLY";

  tradingPolicyMutationAllowed:
    false;

  liveExecutionAllowed:
    false;

  cachedQuotes:
    number;

  marketSnapshots:
    number;

  exchangePairs:
    number;

  evaluatedPairs:
    number;

  acceptedOpportunities:
    number;

  rejectedOpportunities:
    number;

  rejections: {
    evaluator:
      number;

    invalidMarketData:
      number;

    spread:
      number;

    netProfit:
      number;

    quantity:
      number;

    liquidity:
      number;

    freshness:
      number;

    fees:
      number;

    spreadAnalysis:
      number;

    quoteIntegrity:
      number;
  };

  evaluatorRejections: {
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
  };

  funnel:
    OpportunityForensicsFunnel;

  currentScanRejections:
    OpportunityForensicsRejectionSample;

  routeEconomics:
    OpportunityRouteEconomicsForensics;

  pairability:
    PairabilityForensics;

  freshness:
    FreshnessForensics;

  policy: {
    minimumSpreadPercent:
      number;

    minimumNetProfitPercent:
      number;

    minimumLiquidityPercent:
      number;

    maximumQuoteAgeMs:
      number;

    maximumCrossExchangePriceRatio:
      number;
  };

  observations:
    string[];
}

interface PriceEconomicsDiagnostics {
  rawPositiveSpreads:
    number;

  freshPositiveSpreads:
    number;

  feePositiveSpreads:
    number;

  priceEconomicsThresholdPass:
    number;
}

interface RouteAccumulator {
  buyExchange:
    string;

  sellExchange:
    string;

  evaluatedPairs:
    number;

  rawPositiveSpreads:
    number;

  freshPositiveSpreads:
    number;

  feePositiveSpreads:
    number;

  economicsThresholdPass:
    number;

  synchronizationRejected:
    number;

  rawPositiveSpreadPercents:
    number[];

  feePositiveNetProfitPercents:
    number[];

  timestampSkews:
    number[];
}

interface MarketAccumulator {
  market:
    string;

  evaluatedPairs:
    number;

  rawPositiveSpreads:
    number;

  freshPositiveSpreads:
    number;

  feePositiveSpreads:
    number;

  economicsThresholdPass:
    number;

  rawPositiveSpreadPercents:
    number[];

  netProfitPercents:
    number[];
}

interface DetailedPairAnalysis {
  diagnostic:
    OpportunityPositiveRouteDiagnostic | null;

  rawPositive:
    boolean;

  freshPositive:
    boolean;

  feePositive:
    boolean;

  economicsThresholdPass:
    boolean;

  synchronized:
    boolean;

  timestampSkewMs:
    number | null;
}

interface ExchangePairabilityAccumulator {
  exchange:
    string;

  sharedMarketQuotes:
    number;

  executableQuotes:
    number;

  buySideEligibleQuotes:
    number;

  sellSideEligibleQuotes:
    number;

  nonExecutableQuotes:
    number;

  invalidBidPrice:
    number;

  invalidBidQuantity:
    number;

  invalidAskPrice:
    number;

  invalidAskQuantity:
    number;

  freshQuotes:
    number;

  staleQuotes:
    number;
}

interface ExchangeFreshnessAccumulator {
  exchange:
    string;

  quoteCount:
    number;

  freshQuotes:
    number;

  staleQuotes:
    number;

  invalidTimestampQuotes:
    number;

  futureTimestampQuotes:
    number;

  ages:
    number[];

  sources:
    string[];
}

const POSITIVE_ROUTE_SAMPLE_LIMIT =
  50;

const ROUTE_SUMMARY_LIMIT =
  25;

const MARKET_SUMMARY_LIMIT =
  25;

const NON_PAIRABLE_MARKET_SAMPLE_LIMIT =
  50;

export class OpportunityRejectionAnalyticsService {
  generate(): OpportunityRejectionAnalytics {
    const rejectionIdsBeforeScan =
      new Set(
        opportunityRejectionStore
          .getAll()
          .map(
            (record) =>
              record.id,
          ),
      );

    /*
     * One authoritative OpportunityService scan.
     */
    const opportunities =
      opportunityService
        .getOpportunities();

    const pipeline =
      opportunityService
        .getLastDiagnostics();

    if (!pipeline) {
      throw new Error(
        "Opportunity pipeline diagnostics are unavailable after the authoritative scan.",
      );
    }

    const diagnostics =
      opportunityEngine
        .getDiagnostics();

    const engine =
      diagnostics.engine;

    const evaluator =
      diagnostics.evaluator;

    const currentScanRejectionRecords =
      opportunityRejectionStore
        .getAll()
        .filter(
          (record) =>
            !rejectionIdsBeforeScan.has(
              record.id,
            ),
        );

    const rejectedOpportunities =
      Math.max(
        0,
        engine.evaluated -
          engine.accepted,
      );

    const rawCachedQuotes =
      marketCache
        .getAll();

    const analysisGeneratedAt =
      Date.now();

    /*
     * Reproduce the authoritative execution-quality universe.
     *
     * The cache itself remains untouched.
     */
    const eligibleQuotes =
      bybitExecutionUniverseService
        .filterQuotes(
          rawCachedQuotes,
          analysisGeneratedAt,
        );

    const snapshots =
      comparisonEngine
        .groupByMarket(
          eligibleQuotes,
        );

    const pairs =
      snapshots.flatMap(
        (snapshot) =>
          exchangePairGenerator
            .generate(
              snapshot,
            ),
      );

    const sharedSnapshots =
      snapshots.filter(
        (snapshot) =>
          this.countDistinctExchanges(
            snapshot,
          ) >=
          2,
      );

    const pairableMarkets =
      new Set(
        pairs.map(
          (pair) =>
            pair.market
              .trim()
              .toUpperCase(),
        ),
      ).size;

    const priceEconomics =
      this.analyzePriceEconomics(
        pairs,
        analysisGeneratedAt,
      );

    const routeEconomics =
      this.buildRouteEconomicsForensics(
        pairs,
        analysisGeneratedAt,
      );

    const pairability =
      this.buildPairabilityForensics(
        sharedSnapshots,
        analysisGeneratedAt,
      );

    /*
     * Analyze the exact execution-quality filtered quote universe
     * before market grouping.
     */
    const freshness =
      this.buildFreshnessForensics(
        eligibleQuotes,
        analysisGeneratedAt,
      );

    const evaluatorPassed =
      Math.max(
        0,
        engine.evaluated -
          engine.evaluatorRejected,
      );

    const currentScanRejections =
      this.buildCurrentScanRejectionSample(
        currentScanRejectionRecords,
        rejectedOpportunities,
      );

    const funnel:
      OpportunityForensicsFunnel = {
      allCachedQuotes:
        pipeline.cachedQuotes,

      executionQualityEligibleQuotes:
        pipeline
          .executionQualityEligibleQuotes,

      executionQualityFilteredQuotes:
        pipeline
          .executionQualityFilteredQuotes,

      marketSnapshots:
        pipeline.marketSnapshots,

      sharedMarkets:
        sharedSnapshots.length,

      pairableMarkets,

      directionalExchangePairs:
        pipeline.exchangePairs,

      rawPositiveSpreads:
        priceEconomics
          .rawPositiveSpreads,

      freshPositiveSpreads:
        priceEconomics
          .freshPositiveSpreads,

      feePositiveSpreads:
        priceEconomics
          .feePositiveSpreads,

      priceEconomicsThresholdPass:
        priceEconomics
          .priceEconomicsThresholdPass,

      evaluatedPairs:
        engine.evaluated,

      evaluatorPassed,

      acceptedOpportunities:
        opportunities.length,
    };

    return {
      generatedAt:
        Date.now(),

      version:
        "20.9",

      build:
        "3",

      mode:
        "DIAGNOSTIC_ONLY",

      tradingPolicyMutationAllowed:
        false,

      liveExecutionAllowed:
        false,

      cachedQuotes:
        pipeline.cachedQuotes,

      marketSnapshots:
        pipeline.marketSnapshots,

      exchangePairs:
        pipeline.exchangePairs,

      evaluatedPairs:
        engine.evaluated,

      acceptedOpportunities:
        opportunities.length,

      rejectedOpportunities,

      rejections: {
        evaluator:
          engine.evaluatorRejected,

        invalidMarketData:
          engine.invalidMarketData,

        spread:
          engine.spreadRejected,

        netProfit:
          engine.netProfitRejected,

        quantity:
          engine.quantityRejected,

        liquidity:
          engine.liquidityRejected,

        freshness:
          engine.freshnessRejected,

        fees:
          engine.feeRejected,

        spreadAnalysis:
          engine.spreadAnalysisRejected,

        quoteIntegrity:
          engine.quoteIntegrityRejected,
      },

      evaluatorRejections: {
        staleBuyQuote:
          evaluator.staleBuyQuote,

        staleSellQuote:
          evaluator.staleSellQuote,

        staleBothQuotes:
          evaluator.staleBothQuotes,

        pairSynchronizationRejected:
          evaluator
            .pairSynchronizationRejected,

        priceResolutionFailed:
          evaluator.priceResolutionFailed,

        buyFeeMissing:
          evaluator.buyFeeMissing,

        sellFeeMissing:
          evaluator.sellFeeMissing,

        invalidBuyPrice:
          evaluator.invalidBuyPrice,

        invalidSellPrice:
          evaluator.invalidSellPrice,
      },

      funnel,

      currentScanRejections,

      routeEconomics,

      pairability,

      freshness,

      policy: {
        minimumSpreadPercent:
          defaultArbitragePolicy
            .minimumSpreadPercent,

        minimumNetProfitPercent:
          defaultArbitragePolicy
            .minimumNetProfitPercent,

        minimumLiquidityPercent:
          defaultArbitragePolicy
            .minimumLiquidityPercent,

        maximumQuoteAgeMs:
          defaultArbitragePolicy
            .maximumQuoteAgeMs,

        maximumCrossExchangePriceRatio:
          defaultArbitragePolicy
            .maximumCrossExchangePriceRatio,
      },

      observations:
        this.buildObservations(
          funnel,
          currentScanRejections,
          routeEconomics,
          pairability,
          freshness,
          rejectedOpportunities,
        ),
    };
  }

  /*
   * ============================================================
   * HIGH-LEVEL ECONOMICS FUNNEL
   * ============================================================
   */
  private analyzePriceEconomics(
    pairs:
      readonly ExchangePair[],

    now:
      number,
  ): PriceEconomicsDiagnostics {
    let rawPositiveSpreads =
      0;

    let freshPositiveSpreads =
      0;

    let feePositiveSpreads =
      0;

    let priceEconomicsThresholdPass =
      0;

    for (const pair of pairs) {
      const analysis =
        this.analyzePair(
          pair,
          now,
        );

      if (
        analysis.rawPositive
      ) {
        rawPositiveSpreads +=
          1;
      }

      if (
        analysis.freshPositive
      ) {
        freshPositiveSpreads +=
          1;
      }

      if (
        analysis.feePositive
      ) {
        feePositiveSpreads +=
          1;
      }

      if (
        analysis
          .economicsThresholdPass
      ) {
        priceEconomicsThresholdPass +=
          1;
      }
    }

    return {
      rawPositiveSpreads,

      freshPositiveSpreads,

      feePositiveSpreads,

      priceEconomicsThresholdPass,
    };
  }

  /*
   * ============================================================
   * ROUTE ECONOMICS
   * ============================================================
   */
  private buildRouteEconomicsForensics(
    pairs:
      readonly ExchangePair[],

    now:
      number,
  ): OpportunityRouteEconomicsForensics {
    const positiveRoutes:
      OpportunityPositiveRouteDiagnostic[] =
        [];

    const routeMap =
      new Map<
        string,
        RouteAccumulator
      >();

    const marketMap =
      new Map<
        string,
        MarketAccumulator
      >();

    const allTimestampSkews:
      number[] = [];

    const unsynchronizedRouteKeys:
      string[] = [];

    const unsynchronizedMarkets:
      string[] = [];

    let synchronizedPairs =
      0;

    let unsynchronizedPairs =
      0;

    for (const pair of pairs) {
      const buyExchange =
        this.normalizeExchange(
          pair.buy.exchange,
        );

      const sellExchange =
        this.normalizeExchange(
          pair.sell.exchange,
        );

      const market =
        this.normalizeMarket(
          pair.market,
        );

      const routeKey =
        `${buyExchange}->${sellExchange}`;

      const route =
        this.getOrCreateRouteAccumulator(
          routeMap,
          routeKey,
          buyExchange,
          sellExchange,
        );

      const marketSummary =
        this.getOrCreateMarketAccumulator(
          marketMap,
          market,
        );

      route.evaluatedPairs +=
        1;

      marketSummary.evaluatedPairs +=
        1;

      const analysis =
        this.analyzePair(
          pair,
          now,
        );

      if (
        analysis.timestampSkewMs !==
          null
      ) {
        allTimestampSkews.push(
          analysis.timestampSkewMs,
        );

        route.timestampSkews.push(
          analysis.timestampSkewMs,
        );
      }

      if (
        analysis.synchronized
      ) {
        synchronizedPairs +=
          1;
      } else if (
        analysis.timestampSkewMs !==
          null
      ) {
        unsynchronizedPairs +=
          1;

        route.synchronizationRejected +=
          1;

        unsynchronizedRouteKeys.push(
          routeKey,
        );

        unsynchronizedMarkets.push(
          market,
        );
      }

      if (
        analysis.rawPositive
      ) {
        route.rawPositiveSpreads +=
          1;

        marketSummary.rawPositiveSpreads +=
          1;

        if (
          analysis.diagnostic
        ) {
          route.rawPositiveSpreadPercents.push(
            analysis
              .diagnostic
              .rawSpreadPercent,
          );

          marketSummary
            .rawPositiveSpreadPercents
            .push(
              analysis
                .diagnostic
                .rawSpreadPercent,
            );

          positiveRoutes.push(
            analysis.diagnostic,
          );
        }
      }

      if (
        analysis.freshPositive
      ) {
        route.freshPositiveSpreads +=
          1;

        marketSummary.freshPositiveSpreads +=
          1;
      }

      if (
        analysis.feePositive
      ) {
        route.feePositiveSpreads +=
          1;

        marketSummary.feePositiveSpreads +=
          1;

        const netProfitPercent =
          analysis
            .diagnostic
            ?.netProfitPercent;

        if (
          netProfitPercent !==
            null &&
          netProfitPercent !==
            undefined
        ) {
          route
            .feePositiveNetProfitPercents
            .push(
              netProfitPercent,
            );

          marketSummary
            .netProfitPercents
            .push(
              netProfitPercent,
            );
        }
      }

      if (
        analysis
          .economicsThresholdPass
      ) {
        route.economicsThresholdPass +=
          1;

        marketSummary.economicsThresholdPass +=
          1;
      }
    }

    positiveRoutes.sort(
      (
        first,
        second,
      ) =>
        second.rawSpreadPercent -
        first.rawSpreadPercent,
    );

    const routeSummaries =
      Array.from(
        routeMap.values(),
      )
        .map(
          (
            route,
          ): OpportunityRouteEconomicsSummary => ({
            route:
              `${route.buyExchange}->${route.sellExchange}`,

            buyExchange:
              route.buyExchange,

            sellExchange:
              route.sellExchange,

            evaluatedPairs:
              route.evaluatedPairs,

            rawPositiveSpreads:
              route.rawPositiveSpreads,

            freshPositiveSpreads:
              route.freshPositiveSpreads,

            feePositiveSpreads:
              route.feePositiveSpreads,

            economicsThresholdPass:
              route.economicsThresholdPass,

            synchronizationRejected:
              route.synchronizationRejected,

            maximumRawSpreadPercent:
              this.maximumOrNull(
                route
                  .rawPositiveSpreadPercents,
              ),

            averageRawPositiveSpreadPercent:
              this.averageOrNull(
                route
                  .rawPositiveSpreadPercents,
              ),

            maximumFeePositiveNetProfitPercent:
              this.maximumOrNull(
                route
                  .feePositiveNetProfitPercents,
              ),

            averageTimestampSkewMs:
              this.averageOrNull(
                route.timestampSkews,
              ),

            maximumTimestampSkewMs:
              this.maximumOrNull(
                route.timestampSkews,
              ),
          }),
        )
        .sort(
          (
            first,
            second,
          ) => {
            if (
              second.rawPositiveSpreads !==
              first.rawPositiveSpreads
            ) {
              return (
                second.rawPositiveSpreads -
                first.rawPositiveSpreads
              );
            }

            if (
              second.synchronizationRejected !==
              first.synchronizationRejected
            ) {
              return (
                second.synchronizationRejected -
                first.synchronizationRejected
              );
            }

            return (
              second.evaluatedPairs -
              first.evaluatedPairs
            );
          },
        )
        .slice(
          0,
          ROUTE_SUMMARY_LIMIT,
        );

    const marketSummaries =
      Array.from(
        marketMap.values(),
      )
        .filter(
          (market) =>
            market.rawPositiveSpreads >
            0,
        )
        .map(
          (
            market,
          ): OpportunityMarketEconomicsSummary => ({
            market:
              market.market,

            evaluatedPairs:
              market.evaluatedPairs,

            rawPositiveSpreads:
              market.rawPositiveSpreads,

            freshPositiveSpreads:
              market.freshPositiveSpreads,

            feePositiveSpreads:
              market.feePositiveSpreads,

            economicsThresholdPass:
              market.economicsThresholdPass,

            maximumRawSpreadPercent:
              this.maximumOrNull(
                market
                  .rawPositiveSpreadPercents,
              ),

            maximumNetProfitPercent:
              this.maximumOrNull(
                market
                  .netProfitPercents,
              ),
          }),
        )
        .sort(
          (
            first,
            second,
          ) => {
            const firstSpread =
              first.maximumRawSpreadPercent ??
              Number.NEGATIVE_INFINITY;

            const secondSpread =
              second.maximumRawSpreadPercent ??
              Number.NEGATIVE_INFINITY;

            return (
              secondSpread -
              firstSpread
            );
          },
        )
        .slice(
          0,
          MARKET_SUMMARY_LIMIT,
        );

    const validTimestampPairCount =
      allTimestampSkews.length;

    return {
      analyzedDirectionalPairs:
        pairs.length,

      positiveRouteSampleLimit:
        POSITIVE_ROUTE_SAMPLE_LIMIT,

      positiveRouteSampleCount:
        Math.min(
          positiveRoutes.length,
          POSITIVE_ROUTE_SAMPLE_LIMIT,
        ),

      positiveRoutes:
        positiveRoutes.slice(
          0,
          POSITIVE_ROUTE_SAMPLE_LIMIT,
        ),

      byExchangeRoute:
        routeSummaries,

      topRawSpreadMarkets:
        marketSummaries,

      synchronization: {
        pairsWithValidTimestamps:
          validTimestampPairCount,

        synchronizedPairs,

        unsynchronizedPairs,

        synchronizedPercent:
          validTimestampPairCount >
            0
            ? this.round(
                (
                  synchronizedPairs /
                  validTimestampPairCount
                ) *
                  100,
                4,
              )
            : 0,

        unsynchronizedPercent:
          validTimestampPairCount >
            0
            ? this.round(
                (
                  unsynchronizedPairs /
                  validTimestampPairCount
                ) *
                  100,
                4,
              )
            : 0,

        skewMs: {
          minimum:
            this.minimumOrNull(
              allTimestampSkews,
            ),

          p50:
            this.percentileOrNull(
              allTimestampSkews,
              50,
            ),

          p90:
            this.percentileOrNull(
              allTimestampSkews,
              90,
            ),

          p95:
            this.percentileOrNull(
              allTimestampSkews,
              95,
            ),

          p99:
            this.percentileOrNull(
              allTimestampSkews,
              99,
            ),

          maximum:
            this.maximumOrNull(
              allTimestampSkews,
            ),

          average:
            this.averageOrNull(
              allTimestampSkews,
            ),
        },

        unsynchronizedByRoute:
          this.buildBreakdown(
            unsynchronizedRouteKeys,
          ),

        unsynchronizedByMarket:
          this.buildBreakdown(
            unsynchronizedMarkets,
          ).slice(
            0,
            25,
          ),
      },
    };
  }

  /*
   * ============================================================
   * BUILD 3 — PAIRABILITY FORENSICS
   * ============================================================
   */
  private buildPairabilityForensics(
    sharedSnapshots:
      readonly MarketSnapshot[],

    now:
      number,
  ): PairabilityForensics {
    const issueKeys:
      string[] = [];

    const exchangeMap =
      new Map<
        string,
        ExchangePairabilityAccumulator
      >();

    const nonPairableMarketSample:
      NonPairableMarketDiagnostic[] =
        [];

    let pairableMarkets =
      0;

    let sharedMarketQuotes =
      0;

    for (
      const snapshot
      of sharedSnapshots
    ) {
      const quotes =
        Object.values(
          snapshot.quotes,
        );

      const generatedPairs =
        exchangePairGenerator
          .generate(
            snapshot,
          );

      if (
        generatedPairs.length >
        0
      ) {
        pairableMarkets +=
          1;
      }

      const quoteDiagnostics =
        quotes.map(
          (quote) =>
            this.buildPairabilityQuoteDiagnostic(
              quote,
              now,
            ),
        );

      sharedMarketQuotes +=
        quoteDiagnostics.length;

      for (
        const diagnostic
        of quoteDiagnostics
      ) {
        const accumulator =
          this.getOrCreateExchangePairabilityAccumulator(
            exchangeMap,
            diagnostic.exchange,
          );

        accumulator.sharedMarketQuotes +=
          1;

        if (
          diagnostic.executable
        ) {
          accumulator.executableQuotes +=
            1;
        } else {
          accumulator.nonExecutableQuotes +=
            1;
        }

        if (
          diagnostic.buySideEligible
        ) {
          accumulator.buySideEligibleQuotes +=
            1;
        }

        if (
          diagnostic.sellSideEligible
        ) {
          accumulator.sellSideEligibleQuotes +=
            1;
        }

        if (
          diagnostic.fresh
        ) {
          accumulator.freshQuotes +=
            1;
        } else {
          accumulator.staleQuotes +=
            1;
        }

        for (
          const issue
          of diagnostic.issues
        ) {
          issueKeys.push(
            issue,
          );

          switch (
            issue
          ) {
            case "NOT_EXECUTABLE":
              break;

            case "INVALID_BID_PRICE":
              accumulator.invalidBidPrice +=
                1;
              break;

            case "INVALID_BID_QUANTITY":
              accumulator.invalidBidQuantity +=
                1;
              break;

            case "INVALID_ASK_PRICE":
              accumulator.invalidAskPrice +=
                1;
              break;

            case "INVALID_ASK_QUANTITY":
              accumulator.invalidAskQuantity +=
                1;
              break;
          }
        }
      }

      if (
        generatedPairs.length ===
          0 &&
        nonPairableMarketSample.length <
          NON_PAIRABLE_MARKET_SAMPLE_LIMIT
      ) {
        nonPairableMarketSample.push({
          market:
            this.normalizeMarket(
              snapshot.market,
            ),

          exchangeCount:
            this.countDistinctExchanges(
              snapshot,
            ),

          exchanges:
            Array.from(
              new Set(
                quoteDiagnostics.map(
                  (quote) =>
                    quote.exchange,
                ),
              ),
            ).sort(),

          validBuyExchanges:
            quoteDiagnostics
              .filter(
                (quote) =>
                  quote.buySideEligible,
              )
              .map(
                (quote) =>
                  quote.exchange,
              )
              .sort(),

          validSellExchanges:
            quoteDiagnostics
              .filter(
                (quote) =>
                  quote.sellSideEligible,
              )
              .map(
                (quote) =>
                  quote.exchange,
              )
              .sort(),

          executableQuotes:
            quoteDiagnostics
              .filter(
                (quote) =>
                  quote.executable,
              )
              .length,

          generatedDirectionalPairs:
            0,

          quoteDiagnostics,
        });
      }
    }

    const nonPairableMarkets =
      Math.max(
        0,
        sharedSnapshots.length -
          pairableMarkets,
      );

    return {
      sharedMarkets:
        sharedSnapshots.length,

      pairableMarkets,

      nonPairableMarkets,

      pairabilityPercent:
        sharedSnapshots.length >
          0
          ? this.round(
              (
                pairableMarkets /
                sharedSnapshots.length
              ) *
                100,
              4,
            )
          : 0,

      nonPairablePercent:
        sharedSnapshots.length >
          0
          ? this.round(
              (
                nonPairableMarkets /
                sharedSnapshots.length
              ) *
                100,
              4,
            )
          : 0,

      sharedMarketQuotes,

      issueBreakdown:
        this.buildBreakdown(
          issueKeys,
        ),

      byExchange:
        Array.from(
          exchangeMap.values(),
        )
          .map(
            (
              item,
            ): ExchangePairabilitySummary => ({
              exchange:
                item.exchange,

              sharedMarketQuotes:
                item.sharedMarketQuotes,

              executableQuotes:
                item.executableQuotes,

              buySideEligibleQuotes:
                item.buySideEligibleQuotes,

              sellSideEligibleQuotes:
                item.sellSideEligibleQuotes,

              nonExecutableQuotes:
                item.nonExecutableQuotes,

              invalidBidPrice:
                item.invalidBidPrice,

              invalidBidQuantity:
                item.invalidBidQuantity,

              invalidAskPrice:
                item.invalidAskPrice,

              invalidAskQuantity:
                item.invalidAskQuantity,

              freshQuotes:
                item.freshQuotes,

              staleQuotes:
                item.staleQuotes,
            }),
          )
          .sort(
            (
              first,
              second,
            ) =>
              second.sharedMarketQuotes -
              first.sharedMarketQuotes,
          ),

      sampleLimit:
        NON_PAIRABLE_MARKET_SAMPLE_LIMIT,

      sampledNonPairableMarkets:
        nonPairableMarketSample.length,

      nonPairableMarketSample,
    };
  }

  private buildPairabilityQuoteDiagnostic(
    quote:
      ExchangeQuote,

    now:
      number,
  ): PairabilityQuoteDiagnostic {
    const issues:
      PairabilityQuoteIssue[] =
        [];

    if (
      !quote.executable
    ) {
      issues.push(
        "NOT_EXECUTABLE",
      );
    }

    const validBidPrice =
      Number.isFinite(
        quote.bestBidPrice,
      ) &&
      quote.bestBidPrice !==
        null &&
      quote.bestBidPrice >
        0;

    const validBidQuantity =
      Number.isFinite(
        quote.bestBidQty,
      ) &&
      quote.bestBidQty !==
        null &&
      quote.bestBidQty >
        0;

    const validAskPrice =
      Number.isFinite(
        quote.bestAskPrice,
      ) &&
      quote.bestAskPrice !==
        null &&
      quote.bestAskPrice >
        0;

    const validAskQuantity =
      Number.isFinite(
        quote.bestAskQty,
      ) &&
      quote.bestAskQty !==
        null &&
      quote.bestAskQty >
        0;

    if (
      !validBidPrice
    ) {
      issues.push(
        "INVALID_BID_PRICE",
      );
    }

    if (
      !validBidQuantity
    ) {
      issues.push(
        "INVALID_BID_QUANTITY",
      );
    }

    if (
      !validAskPrice
    ) {
      issues.push(
        "INVALID_ASK_PRICE",
      );
    }

    if (
      !validAskQuantity
    ) {
      issues.push(
        "INVALID_ASK_QUANTITY",
      );
    }

    const freshness =
      freshnessIntegrityService
        .evaluateQuote(
          quote,
          now,
        );

    return {
      exchange:
        this.normalizeExchange(
          quote.exchange,
        ),

      market:
        this.normalizeMarket(
          quote.market,
        ),

      source:
        quote.source,

      executable:
        quote.executable,

      buySideEligible:
        quote.executable &&
        validAskPrice &&
        validAskQuantity,

      sellSideEligible:
        quote.executable &&
        validBidPrice &&
        validBidQuantity,

      issues,

      bestBidPrice:
        quote.bestBidPrice,

      bestBidQty:
        quote.bestBidQty,

      bestAskPrice:
        quote.bestAskPrice,

      bestAskQty:
        quote.bestAskQty,

      timestamp:
        quote.timestamp,

      ageMs:
        freshness.ageMs,

      maximumQuoteAgeMs:
        freshness.maximumQuoteAgeMs,

      fresh:
        freshness.fresh,

      freshnessReason:
        freshness.reason,
    };
  }

  /*
   * ============================================================
   * BUILD 3 — FRESHNESS FORENSICS
   * ============================================================
   */
  private buildFreshnessForensics(
    quotes:
      readonly ExecutableQuote[],

    now:
      number,
  ): FreshnessForensics {
    const exchangeMap =
      new Map<
        string,
        ExchangeFreshnessAccumulator
      >();

    let freshQuotes =
      0;

    let staleQuotes =
      0;

    let invalidTimestampQuotes =
      0;

    let futureTimestampQuotes =
      0;

    for (const quote of quotes) {
      const exchange =
        this.normalizeExchange(
          quote.exchange,
        );

      const accumulator =
        this.getOrCreateExchangeFreshnessAccumulator(
          exchangeMap,
          exchange,
        );

      accumulator.quoteCount +=
        1;

      accumulator.sources.push(
        quote.source,
      );

      const result =
        freshnessIntegrityService
          .evaluateQuote(
            quote,
            now,
          );

      if (
        result.ageMs !==
          null &&
        result.ageMs >=
          0
      ) {
        accumulator.ages.push(
          result.ageMs,
        );
      }

      if (
        result.fresh
      ) {
        freshQuotes +=
          1;

        accumulator.freshQuotes +=
          1;
      } else {
        staleQuotes +=
          1;

        accumulator.staleQuotes +=
          1;
      }

      if (
        result.reason ===
        "INVALID_TIMESTAMP"
      ) {
        invalidTimestampQuotes +=
          1;

        accumulator.invalidTimestampQuotes +=
          1;
      }

      if (
        result.reason ===
        "FUTURE_TIMESTAMP"
      ) {
        futureTimestampQuotes +=
          1;

        accumulator.futureTimestampQuotes +=
          1;
      }
    }

    const byExchange =
      Array.from(
        exchangeMap.values(),
      )
        .map(
          (
            item,
          ): ExchangeFreshnessSummary => {
            const maximumQuoteAgeMs =
              freshnessIntegrityService
                .getMaximumQuoteAgeMs(
                  item.exchange,
                );

            return {
              exchange:
                item.exchange,

              quoteCount:
                item.quoteCount,

              freshQuotes:
                item.freshQuotes,

              staleQuotes:
                item.staleQuotes,

              invalidTimestampQuotes:
                item.invalidTimestampQuotes,

              futureTimestampQuotes:
                item.futureTimestampQuotes,

              freshPercent:
                item.quoteCount >
                  0
                  ? this.round(
                      (
                        item.freshQuotes /
                        item.quoteCount
                      ) *
                        100,
                      4,
                    )
                  : 0,

              stalePercent:
                item.quoteCount >
                  0
                  ? this.round(
                      (
                        item.staleQuotes /
                        item.quoteCount
                      ) *
                        100,
                      4,
                    )
                  : 0,

              maximumQuoteAgeMs,

              ageMs: {
                minimum:
                  this.minimumOrNull(
                    item.ages,
                  ),

                p50:
                  this.percentileOrNull(
                    item.ages,
                    50,
                  ),

                p90:
                  this.percentileOrNull(
                    item.ages,
                    90,
                  ),

                p95:
                  this.percentileOrNull(
                    item.ages,
                    95,
                  ),

                p99:
                  this.percentileOrNull(
                    item.ages,
                    99,
                  ),

                maximum:
                  this.maximumOrNull(
                    item.ages,
                  ),

                average:
                  this.averageOrNull(
                    item.ages,
                  ),
              },

              ageBuckets:
                this.buildAgeBuckets(
                  item.ages,
                  item.quoteCount -
                    item.ages.length,
                ),

              bySource:
                this.buildBreakdown(
                  item.sources,
                ),
            };
          },
        )
        .sort(
          (
            first,
            second,
          ) => {
            if (
              second.stalePercent !==
              first.stalePercent
            ) {
              return (
                second.stalePercent -
                first.stalePercent
              );
            }

            return (
              second.quoteCount -
              first.quoteCount
            );
          },
        );

    return {
      analyzedQuotes:
        quotes.length,

      freshQuotes,

      staleQuotes,

      invalidTimestampQuotes,

      futureTimestampQuotes,

      freshPercent:
        quotes.length >
          0
          ? this.round(
              (
                freshQuotes /
                quotes.length
              ) *
                100,
              4,
            )
          : 0,

      stalePercent:
        quotes.length >
          0
          ? this.round(
              (
                staleQuotes /
                quotes.length
              ) *
                100,
              4,
            )
          : 0,

      byExchange,
    };
  }

  private buildAgeBuckets(
    ages:
      readonly number[],

    invalidCount:
      number,
  ): QuoteAgeBucket[] {
    const counts:
      Record<
        QuoteAgeBucket["key"],
        number
      > = {
      LT_500_MS:
        0,

      "500_TO_999_MS":
        0,

      "1000_TO_1999_MS":
        0,

      "2000_TO_4999_MS":
        0,

      "5000_TO_9999_MS":
        0,

      GE_10000_MS:
        0,

      INVALID:
        Math.max(
          0,
          invalidCount,
        ),
    };

    for (const age of ages) {
      if (
        age <
        500
      ) {
        counts.LT_500_MS +=
          1;

        continue;
      }

      if (
        age <
        1_000
      ) {
        counts[
          "500_TO_999_MS"
        ] +=
          1;

        continue;
      }

      if (
        age <
        2_000
      ) {
        counts[
          "1000_TO_1999_MS"
        ] +=
          1;

        continue;
      }

      if (
        age <
        5_000
      ) {
        counts[
          "2000_TO_4999_MS"
        ] +=
          1;

        continue;
      }

      if (
        age <
        10_000
      ) {
        counts[
          "5000_TO_9999_MS"
        ] +=
          1;

        continue;
      }

      counts.GE_10000_MS +=
        1;
    }

    const total =
      ages.length +
      Math.max(
        0,
        invalidCount,
      );

    const order:
      QuoteAgeBucket["key"][] = [
      "LT_500_MS",
      "500_TO_999_MS",
      "1000_TO_1999_MS",
      "2000_TO_4999_MS",
      "5000_TO_9999_MS",
      "GE_10000_MS",
      "INVALID",
    ];

    return order.map(
      (
        key,
      ): QuoteAgeBucket => ({
        key,

        count:
          counts[key],

        percent:
          total >
            0
            ? this.round(
                (
                  counts[key] /
                  total
                ) *
                  100,
                4,
              )
            : 0,
      }),
    );
  }

  /*
   * ============================================================
   * PAIR ECONOMICS ANALYSIS
   * ============================================================
   */
  private analyzePair(
    pair:
      ExchangePair,

    now:
      number,
  ): DetailedPairAnalysis {
    const freshness =
      freshnessIntegrityService
        .evaluatePair(
          pair.buy,
          pair.sell,
          now,
        );

    const timestampSkewMs =
      freshness.timestampSkewMs;

    const resolvedPrices =
      quotePriceResolver
        .resolve(
          pair.buy,
          pair.sell,
        );

    if (!resolvedPrices) {
      return {
        diagnostic:
          null,

        rawPositive:
          false,

        freshPositive:
          false,

        feePositive:
          false,

        economicsThresholdPass:
          false,

        synchronized:
          freshness.synchronized,

        timestampSkewMs,
      };
    }

    const buyPrice =
      resolvedPrices.buyPrice;

    const sellPrice =
      resolvedPrices.sellPrice;

    if (
      !Number.isFinite(
        buyPrice,
      ) ||
      buyPrice <=
        0 ||
      !Number.isFinite(
        sellPrice,
      ) ||
      sellPrice <=
        0
    ) {
      return {
        diagnostic:
          null,

        rawPositive:
          false,

        freshPositive:
          false,

        feePositive:
          false,

        economicsThresholdPass:
          false,

        synchronized:
          freshness.synchronized,

        timestampSkewMs,
      };
    }

    const rawSpread =
      sellPrice -
      buyPrice;

    const rawSpreadPercent =
      (
        rawSpread /
        buyPrice
      ) *
      100;

    if (
      rawSpread <=
        0 ||
      rawSpreadPercent <=
        0
    ) {
      return {
        diagnostic:
          null,

        rawPositive:
          false,

        freshPositive:
          false,

        feePositive:
          false,

        economicsThresholdPass:
          false,

        synchronized:
          freshness.synchronized,

        timestampSkewMs,
      };
    }

    const freshPositive =
      freshness.buy.fresh &&
      freshness.sell.fresh &&
      freshness.synchronized;

    const buyFee =
      getExchangeFeeEvidence(
        pair.buy.exchange,
        pair.market,
      );

    const sellFee =
      getExchangeFeeEvidence(
        pair.sell.exchange,
        pair.market,
      );

    const feeEvidenceAvailable =
      Boolean(
        buyFee &&
        sellFee,
      );

    let estimatedFees:
      number | null =
        null;

    let feeDragPercent:
      number | null =
        null;

    let netProfit:
      number | null =
        null;

    let netProfitPercent:
      number | null =
        null;

    let feePositive =
      false;

    let netProfitThresholdPass =
      false;

    if (
      buyFee &&
      sellFee
    ) {
      const buyFeeAmount =
        buyPrice *
        (
          buyFee.takerPercent /
          100
        );

      const sellFeeAmount =
        sellPrice *
        (
          sellFee.takerPercent /
          100
        );

      estimatedFees =
        buyFeeAmount +
        sellFeeAmount;

      feeDragPercent =
        (
          estimatedFees /
          buyPrice
        ) *
        100;

      netProfit =
        rawSpread -
        estimatedFees;

      netProfitPercent =
        (
          netProfit /
          buyPrice
        ) *
        100;

      feePositive =
        freshPositive &&
        Number.isFinite(
          netProfitPercent,
        ) &&
        netProfitPercent >
          0;

      netProfitThresholdPass =
        freshPositive &&
        Number.isFinite(
          netProfitPercent,
        ) &&
        netProfitPercent >=
          defaultArbitragePolicy
            .minimumNetProfitPercent;
    }

    const spreadThresholdPass =
      freshPositive &&
      rawSpreadPercent >=
        defaultArbitragePolicy
          .minimumSpreadPercent;

    const economicsThresholdPass =
      spreadThresholdPass &&
      netProfitThresholdPass;

    const diagnostic:
      OpportunityPositiveRouteDiagnostic = {
      market:
        this.normalizeMarket(
          pair.market,
        ),

      buyExchange:
        this.normalizeExchange(
          pair.buy.exchange,
        ),

      sellExchange:
        this.normalizeExchange(
          pair.sell.exchange,
        ),

      buyPrice:
        this.round(
          buyPrice,
          12,
        ),

      sellPrice:
        this.round(
          sellPrice,
          12,
        ),

      rawSpread:
        this.round(
          rawSpread,
          12,
        ),

      rawSpreadPercent:
        this.round(
          rawSpreadPercent,
          8,
        ),

      buyFresh:
        freshness.buy.fresh,

      sellFresh:
        freshness.sell.fresh,

      synchronized:
        freshness.synchronized,

      timestampSkewMs,

      maximumPairSkewMs:
        freshness.maximumPairSkewMs,

      buyQuoteAgeMs:
        freshness.buy.ageMs,

      sellQuoteAgeMs:
        freshness.sell.ageMs,

      buyTakerFeePercent:
        buyFee
          ?.takerPercent ??
        null,

      sellTakerFeePercent:
        sellFee
          ?.takerPercent ??
        null,

      buyFeeSource:
        buyFee
          ?.source ??
        null,

      sellFeeSource:
        sellFee
          ?.source ??
        null,

      feeEvidenceAvailable,

      estimatedFees:
        estimatedFees ===
          null
          ? null
          : this.round(
              estimatedFees,
              12,
            ),

      feeDragPercent:
        feeDragPercent ===
          null
          ? null
          : this.round(
              feeDragPercent,
              8,
            ),

      netProfit:
        netProfit ===
          null
          ? null
          : this.round(
              netProfit,
              12,
            ),

      netProfitPercent:
        netProfitPercent ===
          null
          ? null
          : this.round(
              netProfitPercent,
              8,
            ),

      feePositive,

      spreadThresholdPass,

      netProfitThresholdPass,

      economicsThresholdPass,
    };

    return {
      diagnostic,

      rawPositive:
        true,

      freshPositive,

      feePositive,

      economicsThresholdPass,

      synchronized:
        freshness.synchronized,

      timestampSkewMs,
    };
  }

  /*
   * ============================================================
   * CURRENT SCAN REJECTION EVIDENCE
   * ============================================================
   */
  private buildCurrentScanRejectionSample(
    records:
      readonly OpportunityRejectionRecord[],

    expectedRejectedPairs:
      number,
  ): OpportunityForensicsRejectionSample {
    const summary =
      opportunityRejectionStore
        .getSummary();

    return {
      expectedRejectedPairs,

      capturedCurrentScanRecords:
        records.length,

      complete:
        records.length ===
        expectedRejectedPairs,

      storeCapacity:
        summary.capacity,

      byStage:
        this.buildBreakdown(
          records.map(
            (record) =>
              record.stage,
          ),
        ),

      byCode:
        this.buildBreakdown(
          records.map(
            (record) =>
              record.code,
          ),
        ),
    };
  }

  private buildBreakdown(
    values:
      readonly string[],
  ): OpportunityForensicsRejectionBreakdownItem[] {
    const counts =
      new Map<
        string,
        number
      >();

    for (const value of values) {
      counts.set(
        value,
        (
          counts.get(
            value,
          ) ??
          0
        ) +
          1,
      );
    }

    const total =
      values.length;

    return Array.from(
      counts.entries(),
    )
      .map(
        (
          [
            key,
            count,
          ],
        ): OpportunityForensicsRejectionBreakdownItem => ({
          key,

          count,

          percent:
            total >
              0
              ? this.round(
                  (
                    count /
                    total
                  ) *
                    100,
                  4,
                )
              : 0,
        }),
      )
      .sort(
        (
          first,
          second,
        ) =>
          second.count -
          first.count,
      );
  }

  /*
   * ============================================================
   * ACCUMULATORS
   * ============================================================
   */
  private getOrCreateRouteAccumulator(
    map:
      Map<
        string,
        RouteAccumulator
      >,

    key:
      string,

    buyExchange:
      string,

    sellExchange:
      string,
  ): RouteAccumulator {
    const existing =
      map.get(
        key,
      );

    if (existing) {
      return existing;
    }

    const created:
      RouteAccumulator = {
      buyExchange,

      sellExchange,

      evaluatedPairs:
        0,

      rawPositiveSpreads:
        0,

      freshPositiveSpreads:
        0,

      feePositiveSpreads:
        0,

      economicsThresholdPass:
        0,

      synchronizationRejected:
        0,

      rawPositiveSpreadPercents:
        [],

      feePositiveNetProfitPercents:
        [],

      timestampSkews:
        [],
    };

    map.set(
      key,
      created,
    );

    return created;
  }

  private getOrCreateMarketAccumulator(
    map:
      Map<
        string,
        MarketAccumulator
      >,

    market:
      string,
  ): MarketAccumulator {
    const existing =
      map.get(
        market,
      );

    if (existing) {
      return existing;
    }

    const created:
      MarketAccumulator = {
      market,

      evaluatedPairs:
        0,

      rawPositiveSpreads:
        0,

      freshPositiveSpreads:
        0,

      feePositiveSpreads:
        0,

      economicsThresholdPass:
        0,

      rawPositiveSpreadPercents:
        [],

      netProfitPercents:
        [],
    };

    map.set(
      market,
      created,
    );

    return created;
  }

  private getOrCreateExchangePairabilityAccumulator(
    map:
      Map<
        string,
        ExchangePairabilityAccumulator
      >,

    exchange:
      string,
  ): ExchangePairabilityAccumulator {
    const existing =
      map.get(
        exchange,
      );

    if (existing) {
      return existing;
    }

    const created:
      ExchangePairabilityAccumulator = {
      exchange,

      sharedMarketQuotes:
        0,

      executableQuotes:
        0,

      buySideEligibleQuotes:
        0,

      sellSideEligibleQuotes:
        0,

      nonExecutableQuotes:
        0,

      invalidBidPrice:
        0,

      invalidBidQuantity:
        0,

      invalidAskPrice:
        0,

      invalidAskQuantity:
        0,

      freshQuotes:
        0,

      staleQuotes:
        0,
    };

    map.set(
      exchange,
      created,
    );

    return created;
  }

  private getOrCreateExchangeFreshnessAccumulator(
    map:
      Map<
        string,
        ExchangeFreshnessAccumulator
      >,

    exchange:
      string,
  ): ExchangeFreshnessAccumulator {
    const existing =
      map.get(
        exchange,
      );

    if (existing) {
      return existing;
    }

    const created:
      ExchangeFreshnessAccumulator = {
      exchange,

      quoteCount:
        0,

      freshQuotes:
        0,

      staleQuotes:
        0,

      invalidTimestampQuotes:
        0,

      futureTimestampQuotes:
        0,

      ages:
        [],

      sources:
        [],
    };

    map.set(
      exchange,
      created,
    );

    return created;
  }

  /*
   * ============================================================
   * OBSERVATIONS
   * ============================================================
   */
  private buildObservations(
    funnel:
      OpportunityForensicsFunnel,

    rejectionSample:
      OpportunityForensicsRejectionSample,

    routeEconomics:
      OpportunityRouteEconomicsForensics,

    pairability:
      PairabilityForensics,

    freshness:
      FreshnessForensics,

    rejectedOpportunities:
      number,
  ): string[] {
    const observations:
      string[] = [
      "V20.9 Build 3 is read-only market-pairability and freshness forensics; it does not modify opportunity, freshness, fee, PAPER, LIVE, capital, risk, or execution policy.",

      "ExchangePairGenerator remains authoritative for whether a shared market becomes a directional executable pair.",

      "Freshness statistics use the existing exchange-specific FreshnessIntegrityService rules; no freshness threshold is widened by this diagnostic endpoint.",

      "Accepted opportunities remain exclusively authoritative OpportunityEngine results.",
    ];

    if (
      pairability.sharedMarkets >
        0
    ) {
      observations.push(
        `${pairability.pairableMarkets} of ${pairability.sharedMarkets} shared markets generated at least one directional executable exchange pair (${pairability.pairabilityPercent}% pairable).`,
      );
    }

    if (
      pairability.nonPairableMarkets >
        0
    ) {
      const leadingIssue =
        pairability
          .issueBreakdown[0];

      if (leadingIssue) {
        observations.push(
          `${pairability.nonPairableMarkets} shared markets produced no directional pair. The most frequently observed quote-side issue was ${leadingIssue.key} (${leadingIssue.count} occurrences in shared-market quote evidence).`,
        );
      } else {
        observations.push(
          `${pairability.nonPairableMarkets} shared markets produced no directional pair; inspect pairability.nonPairableMarketSample for quote-side evidence.`,
        );
      }
    }

    if (
      freshness.analyzedQuotes >
        0
    ) {
      observations.push(
        `${freshness.staleQuotes} of ${freshness.analyzedQuotes} execution-quality-filtered quotes were not fresh at diagnostic time (${freshness.stalePercent}%).`,
      );
    }

    const worstFreshnessExchange =
      freshness
        .byExchange[0];

    if (
      worstFreshnessExchange &&
      worstFreshnessExchange
        .staleQuotes >
        0
    ) {
      observations.push(
        `${worstFreshnessExchange.exchange} had the highest observed stale percentage in this snapshot: ${worstFreshnessExchange.staleQuotes}/${worstFreshnessExchange.quoteCount} quotes (${worstFreshnessExchange.stalePercent}%).`,
      );
    }

    if (
      funnel.rawPositiveSpreads >
        0 &&
      funnel.feePositiveSpreads ===
        0
    ) {
      observations.push(
        "Positive raw spreads were detected, but no fresh synchronized route remained positive after configured taker-fee economics in this snapshot.",
      );
    }

    const synchronization =
      routeEconomics
        .synchronization;

    if (
      synchronization
        .pairsWithValidTimestamps >
        0
    ) {
      observations.push(
        `${synchronization.unsynchronizedPairs} of ${synchronization.pairsWithValidTimestamps} timestamp-valid directional pairs were outside the configured pair synchronization window (${synchronization.unsynchronizedPercent}%).`,
      );
    }

    const highestRawSpread =
      routeEconomics
        .positiveRoutes[0];

    if (highestRawSpread) {
      observations.push(
        `Highest observed positive raw spread in the diagnostic sample was ${highestRawSpread.rawSpreadPercent}% on ${highestRawSpread.market}, ${highestRawSpread.buyExchange}->${highestRawSpread.sellExchange}.`,
      );
    }

    if (
      rejectedOpportunities >
        0 &&
      !rejectionSample.complete
    ) {
      observations.push(
        `Current-scan rejection detail is bounded by the rejection store: captured ${rejectionSample.capturedCurrentScanRecords} of ${rejectionSample.expectedRejectedPairs} rejected pairs. Aggregate engine counters remain authoritative.`,
      );
    }

    return observations;
  }

  /*
   * ============================================================
   * GENERAL HELPERS
   * ============================================================
   */
  private countDistinctExchanges(
    snapshot:
      MarketSnapshot,
  ): number {
    return new Set(
      Object.values(
        snapshot.quotes,
      ).map(
        (quote) =>
          this.normalizeExchange(
            quote.exchange,
          ),
      ),
    ).size;
  }

  private normalizeExchange(
    exchange:
      string,
  ): string {
    return exchange
      .trim()
      .toLowerCase();
  }

  private normalizeMarket(
    market:
      string,
  ): string {
    return market
      .trim()
      .toUpperCase()
      .replace(
        /[\s_\-/]+/g,
        "",
      );
  }

  private minimumOrNull(
    values:
      readonly number[],
  ): number | null {
    if (
      values.length ===
      0
    ) {
      return null;
    }

    return this.round(
      Math.min(
        ...values,
      ),
      4,
    );
  }

  private maximumOrNull(
    values:
      readonly number[],
  ): number | null {
    if (
      values.length ===
      0
    ) {
      return null;
    }

    return this.round(
      Math.max(
        ...values,
      ),
      8,
    );
  }

  private averageOrNull(
    values:
      readonly number[],
  ): number | null {
    if (
      values.length ===
      0
    ) {
      return null;
    }

    const total =
      values.reduce(
        (
          sum,
          value,
        ) =>
          sum +
          value,
        0,
      );

    return this.round(
      total /
        values.length,
      4,
    );
  }

  private percentileOrNull(
    values:
      readonly number[],

    percentile:
      number,
  ): number | null {
    if (
      values.length ===
      0
    ) {
      return null;
    }

    const sorted =
      [
        ...values,
      ].sort(
        (
          first,
          second,
        ) =>
          first -
          second,
      );

    const normalizedPercentile =
      Math.min(
        100,
        Math.max(
          0,
          percentile,
        ),
      );

    const rank =
      (
        normalizedPercentile /
        100
      ) *
      (
        sorted.length -
        1
      );

    const lowerIndex =
      Math.floor(
        rank,
      );

    const upperIndex =
      Math.ceil(
        rank,
      );

    const lowerValue =
      sorted[
        lowerIndex
      ];

    const upperValue =
      sorted[
        upperIndex
      ];

    if (
      lowerValue ===
        undefined
    ) {
      return null;
    }

    if (
      upperValue ===
        undefined ||
      lowerIndex ===
        upperIndex
    ) {
      return this.round(
        lowerValue,
        4,
      );
    }

    const weight =
      rank -
      lowerIndex;

    return this.round(
      lowerValue +
        (
          upperValue -
          lowerValue
        ) *
          weight,
      4,
    );
  }

  private round(
    value:
      number,

    decimals:
      number,
  ): number {
    const factor =
      10 **
      decimals;

    return Math.round(
      value *
        factor,
    ) /
      factor;
  }
}

export const opportunityRejectionAnalyticsService =
  new OpportunityRejectionAnalyticsService();