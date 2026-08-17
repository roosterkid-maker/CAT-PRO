import {
  opportunityRejectionAnalyticsService,
} from "./OpportunityRejectionAnalyticsService";

import type {
  FreshnessForensics,
  OpportunityForensicsFunnel,
  OpportunityForensicsRejectionSample,
  OpportunityMarketEconomicsSummary,
  OpportunityPositiveRouteDiagnostic,
  OpportunityRouteEconomicsSummary,
  OpportunitySynchronizationForensics,
  PairabilityForensics,
} from "./OpportunityRejectionAnalyticsService";

import {
  marketCoverageAnalyticsService,
} from "../../diagnostics/services/MarketCoverageAnalyticsService";

import type {
  ExchangeMarketCoverage,
  MarketCoverageSummary,
} from "../../diagnostics/services/MarketCoverageAnalyticsService";

import {
  exchangeFreshnessDiagnosticsService,
} from "../../freshness/services/ExchangeFreshnessDiagnosticsService";

import type {
  ExchangeFreshnessDiagnostics,
  FreshnessDiagnosticsSummary,
} from "../../freshness/services/ExchangeFreshnessDiagnosticsService";

import {
  executionHealthService,
} from "../../execution/live/health/ExecutionHealthService";

import {
  CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID,
} from "../../strategies/models/StrategyMetadata";

/*
 * ============================================================
 * CAT PRO V20.9 BUILD 5
 * STRATEGY #1 OPPORTUNITY-FORENSICS BASELINE
 * ============================================================
 *
 * Read-only composition of the authoritative Build 1-4 diagnostic
 * evidence. This service does not recalculate prices, widen policy,
 * mutate market data, arm PAPER, enable LIVE, reserve capital or
 * submit an exchange order.
 *
 * Historical runtime counts are deliberately not hardcoded. They
 * remain observations. Each invocation freezes one coherent current
 * snapshot that can be compared with archived Build 1-4 evidence and
 * future captures.
 */

const MAXIMUM_EVIDENCE_WINDOW_MS =
  5_000;

export type StrategyOneBaselineStatus =
  | "NO_MARKET_DATA"
  | "NO_EXECUTABLE_QUOTES"
  | "NO_PAIRABLE_MARKETS"
  | "NO_RAW_POSITIVE_SPREADS"
  | "RAW_EDGE_LOST_TO_FRESHNESS_OR_SYNCHRONIZATION"
  | "RAW_EDGE_CONSUMED_BY_FEES"
  | "ECONOMICS_THRESHOLDS_BLOCKING"
  | "OPPORTUNITY_ENGINE_BLOCKING"
  | "ACCEPTED_OPPORTUNITIES_OBSERVED";

export type StrategyOneBaselineEvidenceQuality =
  | "COMPLETE"
  | "PARTIAL"
  | "INSUFFICIENT_RUNTIME_DATA";

export type StrategyOneBaselineBlockerSeverity =
  | "BLOCKING"
  | "DEGRADED"
  | "INFORMATIONAL";

export interface StrategyOneBaselineBlocker {
  code:
    string;

  stage:
    | "EVIDENCE"
    | "MARKET_DATA"
    | "EXECUTABLE_COVERAGE"
    | "PAIRABILITY"
    | "FRESHNESS"
    | "SYNCHRONIZATION"
    | "FEE_ECONOMICS"
    | "AUTHENTICATED_READINESS"
    | "OPPORTUNITY_ENGINE";

  severity:
    StrategyOneBaselineBlockerSeverity;

  exchange:
    string | null;

  message:
    string;
}

export interface StrategyOneOpportunityBaselineEvidence {
  generatedAt:
    number;

  funnel:
    OpportunityForensicsFunnel;

  currentScanRejections:
    OpportunityForensicsRejectionSample;

  pairability:
    PairabilityForensics;

  freshness:
    FreshnessForensics;

  synchronization:
    OpportunitySynchronizationForensics;

  positiveRoutes:
    OpportunityPositiveRouteDiagnostic[];

  byExchangeRoute:
    OpportunityRouteEconomicsSummary[];

  topRawSpreadMarkets:
    OpportunityMarketEconomicsSummary[];

  evaluatedPairs:
    number;

  acceptedOpportunities:
    number;

  rejectedOpportunities:
    number;

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

export interface StrategyOneCoverageBaselineEvidence {
  generatedAt:
    number;

  summary:
    MarketCoverageSummary;

  exchanges:
    ExchangeMarketCoverage[];

  observations:
    string[];
}

export interface StrategyOneFreshnessBaselineEvidence {
  generatedAt:
    number;

  summary:
    FreshnessDiagnosticsSummary;

  exchanges:
    ExchangeFreshnessDiagnostics[];
}

export interface StrategyOneExternalReadinessEvidence {
  generatedAt:
    number;

  status:
    string;

  exchanges: {
    exchange:
      string;

    adapterRegistered:
      boolean;

    credentialsConfigured:
      boolean;

    authenticationVerified:
      boolean;

    exchangeApiReachable:
      boolean;

    readOnlyVerificationFresh:
      boolean;

    lastVerificationError:
      string | null;

    reasons:
      string[];
  }[];
}

export interface StrategyOneForensicsBaselineSources {
  getOpportunityEvidence():
    StrategyOneOpportunityBaselineEvidence;

  getCoverageEvidence():
    StrategyOneCoverageBaselineEvidence;

  getFreshnessEvidence(
    now:
      number,
  ):
    StrategyOneFreshnessBaselineEvidence;

  getExternalReadinessEvidence():
    StrategyOneExternalReadinessEvidence;
}

export interface StrategyOneForensicsBaselineReport {
  generatedAt:
    number;

  snapshotId:
    string;

  version:
    "20.9";

  build:
    "5";

  mode:
    "DIAGNOSTIC_ONLY";

  strategy: {
    id:
      "cross-exchange-arbitrage";

    strategyNumber:
      1;

    displayName:
      "Cross-Exchange Arbitrage";

    evidenceOnly:
      true;
  };

  status:
    StrategyOneBaselineStatus;

  primaryFinding:
    string;

  evidenceQuality:
    StrategyOneBaselineEvidenceQuality;

  evidenceWindow: {
    maximumAllowedSkewMs:
      number;

    observedSkewMs:
      number | null;

    coherent:
      boolean;

    sourceGeneratedAt: {
      opportunityForensics:
        number;

      marketCoverage:
        number;

      freshnessDiagnostics:
        number;

      externalReadiness:
        number;
    };
  };

  comparison: {
    currentSnapshotFrozen:
      true;

    historicalRuntimeValuesEmbedded:
      false;

    comparableBuildEvidence: readonly {
      build:
        "1" | "2" | "3" | "4A-4E";

      currentSection:
        string;
    }[];

    note:
      string;
  };

  funnel:
    OpportunityForensicsFunnel;

  exchangeCoverage: {
    summary:
      MarketCoverageSummary;

    exchanges:
      ExchangeMarketCoverage[];
  };

  pairability:
    PairabilityForensics;

  freshness: {
    executableCoverage:
      FreshnessDiagnosticsSummary;

    byExchange:
      ExchangeFreshnessDiagnostics[];

    executionQualityUniverse:
      FreshnessForensics;
  };

  synchronization:
    OpportunitySynchronizationForensics;

  economics: {
    positiveRoutes:
      OpportunityPositiveRouteDiagnostic[];

    byExchangeRoute:
      OpportunityRouteEconomicsSummary[];

    topRawSpreadMarkets:
      OpportunityMarketEconomicsSummary[];

    positiveRoutesWithoutFeeEvidence:
      number;
  };

  externalReadiness:
    StrategyOneExternalReadinessEvidence;

  engine: {
    evaluatedPairs:
      number;

    acceptedOpportunities:
      number;

    rejectedOpportunities:
      number;

    currentScanRejections:
      OpportunityForensicsRejectionSample;
  };

  policy:
    StrategyOneOpportunityBaselineEvidence["policy"];

  blockers:
    StrategyOneBaselineBlocker[];

  safety: {
    readOnly:
      true;

    tradingPolicyMutationAllowed:
      false;

    paperArmingAllowed:
      false;

    paperTradeAllowed:
      false;

    liveExecutionAllowed:
      false;

    capitalReservationAllowed:
      false;

    orderSubmissionAllowed:
      false;

    authenticatedOrderEndpointAllowed:
      false;
  };

  observations:
    string[];
}

const DEFAULT_SOURCES:
  StrategyOneForensicsBaselineSources = {
  getOpportunityEvidence: () => {
    const report =
      opportunityRejectionAnalyticsService
        .generate();

    return {
      generatedAt:
        report.generatedAt,

      funnel:
        report.funnel,

      currentScanRejections:
        report.currentScanRejections,

      pairability:
        report.pairability,

      freshness:
        report.freshness,

      synchronization:
        report.routeEconomics
          .synchronization,

      positiveRoutes:
        report.routeEconomics
          .positiveRoutes,

      byExchangeRoute:
        report.routeEconomics
          .byExchangeRoute,

      topRawSpreadMarkets:
        report.routeEconomics
          .topRawSpreadMarkets,

      evaluatedPairs:
        report.evaluatedPairs,

      acceptedOpportunities:
        report.acceptedOpportunities,

      rejectedOpportunities:
        report.rejectedOpportunities,

      policy:
        report.policy,

      observations:
        report.observations,
    };
  },

  getCoverageEvidence: () =>
    marketCoverageAnalyticsService
      .getReport(),

  getFreshnessEvidence: (
    now,
  ) =>
    exchangeFreshnessDiagnosticsService
      .getReport(
        now,
      ),

  getExternalReadinessEvidence: () => {
    const report =
      executionHealthService
        .getReport();

    return {
      generatedAt:
        report.timestamp,

      status:
        report.status,

      exchanges:
        report.exchanges
          .map(
            (exchange) => ({
              exchange:
                exchange.exchange,

              adapterRegistered:
                exchange.adapterRegistered,

              credentialsConfigured:
                exchange.credentialsConfigured,

              authenticationVerified:
                exchange.authenticationVerified,

              exchangeApiReachable:
                exchange.exchangeApiReachable,

              readOnlyVerificationFresh:
                exchange.readOnlyVerificationFresh,

              lastVerificationError:
                exchange.lastVerificationError,

              reasons:
                exchange.reasons,
            }),
          ),
    };
  },
};

export class StrategyOneForensicsBaselineService {
  constructor(
    private readonly sources:
      StrategyOneForensicsBaselineSources =
        DEFAULT_SOURCES,
  ) {}

  getReport(
    now =
      Date.now(),
  ): StrategyOneForensicsBaselineReport {
    const opportunity =
      this.sources
        .getOpportunityEvidence();

    const coverage =
      this.sources
        .getCoverageEvidence();

    const freshness =
      this.sources
        .getFreshnessEvidence(
          now,
        );

    const externalReadiness =
      this.sources
        .getExternalReadinessEvidence();

    const evidenceWindow =
      this.buildEvidenceWindow(
        opportunity.generatedAt,
        coverage.generatedAt,
        freshness.generatedAt,
        externalReadiness.generatedAt,
      );

    const status =
      this.resolveStatus(
        opportunity,
        coverage,
      );

    const evidenceQuality =
      this.resolveEvidenceQuality(
        opportunity,
        coverage,
        evidenceWindow.coherent,
      );

    const positiveRoutesWithoutFeeEvidence =
      opportunity
        .positiveRoutes
        .filter(
          (route) =>
            !route
              .feeEvidenceAvailable,
        )
        .length;

    const blockers =
      this.buildBlockers(
        opportunity,
        coverage,
        freshness,
        externalReadiness,
        evidenceWindow.coherent,
        positiveRoutesWithoutFeeEvidence,
      );

    const report:
      StrategyOneForensicsBaselineReport = {
      generatedAt:
        now,

      snapshotId:
        `v20.9-build5-strategy-1-${now}`,

      version:
        "20.9",

      build:
        "5",

      mode:
        "DIAGNOSTIC_ONLY",

      strategy: {
        id:
          CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID,

        strategyNumber:
          1,

        displayName:
          "Cross-Exchange Arbitrage",

        evidenceOnly:
          true,
      },

      status,

      primaryFinding:
        this.describeStatus(
          status,
          opportunity.funnel,
        ),

      evidenceQuality,

      evidenceWindow,

      comparison: {
        currentSnapshotFrozen:
          true,

        historicalRuntimeValuesEmbedded:
          false,

        comparableBuildEvidence: [
          {
            build:
              "1",

            currentSection:
              "funnel",
          },
          {
            build:
              "2",

            currentSection:
              "economics and synchronization",
          },
          {
            build:
              "3",

            currentSection:
              "pairability and freshness",
          },
          {
            build:
              "4A-4E",

            currentSection:
              "exchange coverage and executable freshness",
          },
        ],

        note:
          "Archived Build 1-4 runtime counts remain observations and are intentionally not hardcoded. Compare them with this timestamped current snapshot.",
      },

      funnel:
        opportunity.funnel,

      exchangeCoverage: {
        summary:
          coverage.summary,

        exchanges:
          coverage.exchanges,
      },

      pairability:
        opportunity.pairability,

      freshness: {
        executableCoverage:
          freshness.summary,

        byExchange:
          freshness.exchanges,

        executionQualityUniverse:
          opportunity.freshness,
      },

      synchronization:
        opportunity.synchronization,

      economics: {
        positiveRoutes:
          opportunity.positiveRoutes,

        byExchangeRoute:
          opportunity.byExchangeRoute,

        topRawSpreadMarkets:
          opportunity.topRawSpreadMarkets,

        positiveRoutesWithoutFeeEvidence,
      },

      externalReadiness,

      engine: {
        evaluatedPairs:
          opportunity.evaluatedPairs,

        acceptedOpportunities:
          opportunity.acceptedOpportunities,

        rejectedOpportunities:
          opportunity.rejectedOpportunities,

        currentScanRejections:
          opportunity.currentScanRejections,
      },

      policy:
        opportunity.policy,

      blockers,

      safety: {
        readOnly:
          true,

        tradingPolicyMutationAllowed:
          false,

        paperArmingAllowed:
          false,

        paperTradeAllowed:
          false,

        liveExecutionAllowed:
          false,

        capitalReservationAllowed:
          false,

        orderSubmissionAllowed:
          false,

        authenticatedOrderEndpointAllowed:
          false,
      },

      observations:
        Array.from(
          new Set([
            "V20.9 Build 5 freezes read-only Strategy #1 forensics; it is not execution readiness or authority.",
            "All prices, quantities, freshness decisions, fees and opportunity outcomes come from existing authoritative services.",
            "No historical runtime count is converted into a production constant.",
            ...opportunity.observations,
            ...coverage.observations,
          ]),
        ),
    };

    return immutableClone(
      report,
    );
  }

  private buildEvidenceWindow(
    opportunityGeneratedAt:
      number,

    coverageGeneratedAt:
      number,

    freshnessGeneratedAt:
      number,

    externalReadinessGeneratedAt:
      number,
  ):
    StrategyOneForensicsBaselineReport["evidenceWindow"] {
    const timestamps = [
      opportunityGeneratedAt,
      coverageGeneratedAt,
      freshnessGeneratedAt,
      externalReadinessGeneratedAt,
    ];

    const valid =
      timestamps.every(
        (timestamp) =>
          Number.isFinite(
            timestamp,
          ) &&
          timestamp >
            0,
      );

    const observedSkewMs =
      valid
        ? Math.max(
            ...timestamps,
          ) -
          Math.min(
            ...timestamps,
          )
        : null;

    return {
      maximumAllowedSkewMs:
        MAXIMUM_EVIDENCE_WINDOW_MS,

      observedSkewMs,

      coherent:
        observedSkewMs !==
          null &&
        observedSkewMs <=
          MAXIMUM_EVIDENCE_WINDOW_MS,

      sourceGeneratedAt: {
        opportunityForensics:
          opportunityGeneratedAt,

        marketCoverage:
          coverageGeneratedAt,

        freshnessDiagnostics:
          freshnessGeneratedAt,

        externalReadiness:
          externalReadinessGeneratedAt,
      },
    };
  }

  private resolveEvidenceQuality(
    opportunity:
      StrategyOneOpportunityBaselineEvidence,

    coverage:
      StrategyOneCoverageBaselineEvidence,

    coherent:
      boolean,
  ): StrategyOneBaselineEvidenceQuality {
    if (
      opportunity
        .funnel
        .allCachedQuotes ===
        0 ||
      coverage
        .summary
        .cachedQuotes ===
        0
    ) {
      return "INSUFFICIENT_RUNTIME_DATA";
    }

    if (
      !coherent ||
      !opportunity
        .currentScanRejections
        .complete
    ) {
      return "PARTIAL";
    }

    return "COMPLETE";
  }

  private resolveStatus(
    opportunity:
      StrategyOneOpportunityBaselineEvidence,

    coverage:
      StrategyOneCoverageBaselineEvidence,
  ): StrategyOneBaselineStatus {
    const funnel =
      opportunity.funnel;

    if (
      funnel.allCachedQuotes ===
        0 ||
      coverage.summary.cachedQuotes ===
        0
    ) {
      return "NO_MARKET_DATA";
    }

    if (
      funnel
        .executionQualityEligibleQuotes ===
        0 ||
      coverage
        .summary
        .executableQuotes ===
        0
    ) {
      return "NO_EXECUTABLE_QUOTES";
    }

    if (
      funnel.pairableMarkets ===
        0 ||
      funnel.directionalExchangePairs ===
        0
    ) {
      return "NO_PAIRABLE_MARKETS";
    }

    if (
      opportunity
        .acceptedOpportunities >
        0
    ) {
      return "ACCEPTED_OPPORTUNITIES_OBSERVED";
    }

    if (
      funnel.rawPositiveSpreads ===
      0
    ) {
      return "NO_RAW_POSITIVE_SPREADS";
    }

    if (
      funnel.freshPositiveSpreads ===
      0
    ) {
      return "RAW_EDGE_LOST_TO_FRESHNESS_OR_SYNCHRONIZATION";
    }

    if (
      funnel.feePositiveSpreads ===
      0
    ) {
      return "RAW_EDGE_CONSUMED_BY_FEES";
    }

    if (
      funnel
        .priceEconomicsThresholdPass ===
      0
    ) {
      return "ECONOMICS_THRESHOLDS_BLOCKING";
    }

    return "OPPORTUNITY_ENGINE_BLOCKING";
  }

  private describeStatus(
    status:
      StrategyOneBaselineStatus,

    funnel:
      OpportunityForensicsFunnel,
  ): string {
    switch (
      status
    ) {
      case "NO_MARKET_DATA":
        return "No current normalized market data is available for a Strategy #1 baseline.";

      case "NO_EXECUTABLE_QUOTES":
        return "Market data exists, but no executable quote universe is currently available.";

      case "NO_PAIRABLE_MARKETS":
        return "Executable evidence exists, but no shared market forms a directional cross-exchange pair.";

      case "NO_RAW_POSITIVE_SPREADS":
        return `${funnel.directionalExchangePairs} directional pair(s) were available, but none had a positive raw spread.`;

      case "RAW_EDGE_LOST_TO_FRESHNESS_OR_SYNCHRONIZATION":
        return `${funnel.rawPositiveSpreads} raw-positive spread(s) were observed, but none remained valid after freshness and synchronization checks.`;

      case "RAW_EDGE_CONSUMED_BY_FEES":
        return `${funnel.freshPositiveSpreads} fresh synchronized positive spread(s) were observed, but none remained positive after configured taker fees.`;

      case "ECONOMICS_THRESHOLDS_BLOCKING":
        return `${funnel.feePositiveSpreads} fee-positive spread(s) were observed, but none passed configured economics thresholds.`;

      case "OPPORTUNITY_ENGINE_BLOCKING":
        return `${funnel.priceEconomicsThresholdPass} pair(s) passed price economics, but no authoritative opportunity was accepted.`;

      case "ACCEPTED_OPPORTUNITIES_OBSERVED":
        return `${funnel.acceptedOpportunities} authoritative Strategy #1 opportunity or opportunities were observed in this snapshot.`;
    }
  }

  private buildBlockers(
    opportunity:
      StrategyOneOpportunityBaselineEvidence,

    coverage:
      StrategyOneCoverageBaselineEvidence,

    freshness:
      StrategyOneFreshnessBaselineEvidence,

    externalReadiness:
      StrategyOneExternalReadinessEvidence,

    evidenceCoherent:
      boolean,

    positiveRoutesWithoutFeeEvidence:
      number,
  ): StrategyOneBaselineBlocker[] {
    const blockers:
      StrategyOneBaselineBlocker[] =
      [];

    if (
      !evidenceCoherent
    ) {
      blockers.push({
        code:
          "INCOHERENT_EVIDENCE_WINDOW",

        stage:
          "EVIDENCE",

        severity:
          "BLOCKING",

        exchange:
          null,

        message:
          `Diagnostic sources were generated more than ${MAXIMUM_EVIDENCE_WINDOW_MS} ms apart.`,
      });
    }

    if (
      !opportunity
        .currentScanRejections
        .complete
    ) {
      blockers.push({
        code:
          "BOUNDED_REJECTION_SAMPLE",

        stage:
          "EVIDENCE",

        severity:
          "DEGRADED",

        exchange:
          null,

        message:
          `Current scan captured ${opportunity.currentScanRejections.capturedCurrentScanRecords} of ${opportunity.currentScanRejections.expectedRejectedPairs} rejection records; aggregate engine counters remain authoritative.`,
      });
    }

    for (
      const exchange
      of coverage.exchanges
    ) {
      if (
        exchange.totalQuotes ===
        0
      ) {
        blockers.push({
          code:
            "EXCHANGE_NO_QUOTES",

          stage:
            "MARKET_DATA",

          severity:
            "BLOCKING",

          exchange:
            exchange.exchange,

          message:
            `${exchange.exchange} has no current normalized quotes.`,
        });

        continue;
      }

      if (
        exchange.executableQuotes ===
        0
      ) {
        blockers.push({
          code:
            "EXCHANGE_NO_EXECUTABLE_QUOTES",

          stage:
            "EXECUTABLE_COVERAGE",

          severity:
            "BLOCKING",

          exchange:
            exchange.exchange,

          message:
            `${exchange.exchange} has ${exchange.totalQuotes} quote(s) but no executable quote.`,
        });
      } else if (
        exchange.executableQuotes <
        exchange.totalQuotes
      ) {
        blockers.push({
          code:
            "EXCHANGE_PARTIAL_EXECUTABLE_COVERAGE",

          stage:
            "EXECUTABLE_COVERAGE",

          severity:
            "DEGRADED",

          exchange:
            exchange.exchange,

          message:
            `${exchange.exchange} executable coverage is ${exchange.executableQuotes}/${exchange.totalQuotes} quote(s) (${exchange.executableCoveragePercent}%).`,
        });
      }
    }

    if (
      opportunity
        .pairability
        .nonPairableMarkets >
      0
    ) {
      blockers.push({
        code:
          "NON_PAIRABLE_SHARED_MARKETS",

        stage:
          "PAIRABILITY",

        severity:
          "DEGRADED",

        exchange:
          null,

        message:
          `${opportunity.pairability.nonPairableMarkets} shared market(s) cannot currently form a directional executable pair.`,
      });
    }

    for (
      const exchange
      of freshness.exchanges
    ) {
      if (
        exchange
          .staleExecutableQuotes >
        0
      ) {
        blockers.push({
          code:
            "STALE_EXECUTABLE_QUOTES",

          stage:
            "FRESHNESS",

          severity:
            "DEGRADED",

          exchange:
            exchange.exchange,

          message:
            `${exchange.exchange} has ${exchange.staleExecutableQuotes} stale executable quote(s) out of ${exchange.executableQuotes}.`,
        });
      }
    }

    if (
      opportunity
        .synchronization
        .unsynchronizedPairs >
      0
    ) {
      blockers.push({
        code:
          "PAIR_SYNCHRONIZATION_SKEW",

        stage:
          "SYNCHRONIZATION",

        severity:
          "DEGRADED",

        exchange:
          null,

        message:
          `${opportunity.synchronization.unsynchronizedPairs} of ${opportunity.synchronization.pairsWithValidTimestamps} timestamp-valid directional pair(s) exceed the configured synchronization window.`,
      });
    }

    if (
      positiveRoutesWithoutFeeEvidence >
      0
    ) {
      blockers.push({
        code:
          "POSITIVE_ROUTE_FEE_EVIDENCE_MISSING",

        stage:
          "FEE_ECONOMICS",

        severity:
          "BLOCKING",

        exchange:
          null,

        message:
          `${positiveRoutesWithoutFeeEvidence} sampled positive route(s) lack complete configured fee evidence.`,
      });
    }

    for (
      const exchange
      of externalReadiness.exchanges
    ) {
      if (
        exchange.credentialsConfigured &&
        !exchange.authenticationVerified
      ) {
        blockers.push({
          code:
            "AUTHENTICATED_READ_UNVERIFIED",

          stage:
            "AUTHENTICATED_READINESS",

          severity:
            "BLOCKING",

          exchange:
            exchange.exchange,

          message:
            exchange.lastVerificationError
              ? `${exchange.exchange} authenticated read verification is blocked: ${exchange.lastVerificationError}`
              : `${exchange.exchange} credentials are configured, but authenticated read verification is not current.`,
        });
      }
    }

    if (
      opportunity.funnel
        .freshPositiveSpreads >
        0 &&
      opportunity.funnel
        .feePositiveSpreads ===
        0
    ) {
      blockers.push({
        code:
          "RAW_EDGE_CONSUMED_BY_FEES",

        stage:
          "FEE_ECONOMICS",

        severity:
          "BLOCKING",

        exchange:
          null,

        message:
          "No fresh synchronized positive spread remained positive after configured taker fees.",
      });
    }

    if (
      opportunity.funnel
        .priceEconomicsThresholdPass >
        0 &&
      opportunity
        .acceptedOpportunities ===
        0
    ) {
      blockers.push({
        code:
          "AUTHORITATIVE_ENGINE_REJECTED_ECONOMIC_PAIRS",

        stage:
          "OPPORTUNITY_ENGINE",

        severity:
          "BLOCKING",

        exchange:
          null,

        message:
          `${opportunity.funnel.priceEconomicsThresholdPass} pair(s) passed price economics, but the authoritative engine accepted none.`,
      });
    }

    return blockers;
  }
}

function immutableClone<T>(
  value:
    T,
): T {
  return deepFreeze(
    structuredClone(
      value,
    ),
  );
}

function deepFreeze<T>(
  value:
    T,
): T {
  if (
    value ===
      null ||
    typeof value !==
      "object" ||
    Object.isFrozen(
      value,
    )
  ) {
    return value;
  }

  for (
    const nested
    of Object.values(
      value,
    )
  ) {
    deepFreeze(
      nested,
    );
  }

  return Object.freeze(
    value,
  );
}

export const strategyOneForensicsBaselineService =
  new StrategyOneForensicsBaselineService();
