import {
  defaultArbitragePolicy,
} from "../config/policy";

import {
  classifyProfitTier,
  PROFIT_TIER_POLICY,
} from "../config/profitTiers";

import {
  comparisonEngine,
} from "../ComparisonEngine";

import {
  exchangePairGenerator,
} from "../engines/ExchangePairGenerator";

import {
  opportunityEngine,
  type OpportunityDiagnostics,
} from "../engines/OpportunityEngine";

import type {
  ArbitrageOpportunity,
} from "../models/ArbitrageOpportunity";

import {
  marketCache,
} from "../../services/cache.service";

import {
  bybitExecutionUniverseService,
} from "../../execution-quality/services/BybitExecutionUniverseService";

import {
  environment,
} from "../../config/Environment";

export interface OpportunityServiceConfig {
  diagnosticsLogLevel:
    string;

  diagnosticsLogIntervalMs:
    number;

  acceptedDiagnosticsLogIntervalMs:
    number;
}

const DEFAULT_OPPORTUNITY_SERVICE_CONFIG:
  OpportunityServiceConfig = {
  diagnosticsLogLevel:
    environment.logLevel,

  diagnosticsLogIntervalMs:
    60_000,

  acceptedDiagnosticsLogIntervalMs:
    5_000,
};

export interface OpportunityPipelineDiagnostics {
  scanStartedAt:
    number;

  generatedAt:
    number;

  scanDurationMs?:
    number;

  cachedQuotes:
    number;

  executionQualityEligibleQuotes:
    number;

  executionQualityFilteredQuotes:
    number;

  bybitObservedMarkets:
    number;

  bybitExecutionEligibleMarkets:
    number;

  marketSnapshots:
    number;

  exchangePairs:
    number;

  acceptedOpportunities:
    number;

  profitPolicy: {
    discoveryMinimumNetProfitPercent:
      number;

    qualificationMinimumNetProfitPercent:
      number;

    liveMinimumNetProfitPercent:
      number;
  };

  profitTiers: {
    discovered:
      number;

    qualified:
      number;

    liveEligible:
      number;
  };

  diagnostics:
    OpportunityDiagnostics;
}

export interface OpportunitySnapshot {
  generatedAt:
    number;

  opportunities:
    ArbitrageOpportunity[];
}

export type OpportunitySnapshotListener = (
  snapshot:
    OpportunitySnapshot,
) => void;

/*
 * Version 17.4 Build 4
 *
 * Lightweight read-only snapshot history.
 *
 * This allows us to compare:
 *
 * engine snapshot produced
 *        ↓
 * automation monitor consumed?
 *
 * without changing engine cadence or
 * opportunity qualification rules.
 */
export interface OpportunitySnapshotHistoryItem {
  generatedAt: number;

  opportunityCount: number;

  opportunities: Array<{
    id: string;

    key: string;

    market: string;

    buyExchange: string;

    sellExchange: string;

    netProfitPercent: number;

    timestamp: number;
  }>;
}

export class OpportunityService {
  private static readonly MAXIMUM_SNAPSHOT_HISTORY =
    250;

  private readonly opportunitySnapshots =
    new Map<
      string,
      ArbitrageOpportunity
    >();

  /*
   * The engine emits a new immutable ID for every accepted evaluation. Keep
   * only the newest ID for an exact route so a hot market cannot accumulate
   * thousands of superseded snapshots during the short freshness window.
   * A route that disappears remains TTL-bound in opportunitySnapshots; this
   * index only removes an older record when authoritative replacement
   * evidence for the same route exists.
   */
  private readonly latestOpportunityIdByRoute =
    new Map<
      string,
      string
    >();

  private readonly recentSnapshotHistory:
    OpportunitySnapshotHistoryItem[] =
    [];

  private lastDiagnostics:
    OpportunityPipelineDiagnostics | null =
    null;

  private lastOpportunitySnapshot:
    OpportunitySnapshot | null =
    null;

  private readonly snapshotListeners =
    new Set<
      OpportunitySnapshotListener
    >();

  private readonly config:
    OpportunityServiceConfig;

  private lastDiagnosticsLogAt:
    number | null =
    null;

  private lastAcceptedDiagnosticsLogAt:
    number | null =
    null;

  constructor(
    config:
      Partial<OpportunityServiceConfig> = {},
  ) {
    this.config = {
      ...DEFAULT_OPPORTUNITY_SERVICE_CONFIG,
      ...config,

      diagnosticsLogLevel:
        (
          config
            .diagnosticsLogLevel ??
          DEFAULT_OPPORTUNITY_SERVICE_CONFIG
            .diagnosticsLogLevel
        )
          .trim()
          .toLowerCase(),
    };

    this.validateConfig();
  }

  getOpportunities():
    ArbitrageOpportunity[] {
    return structuredClone(
      this.scanOpportunities(),
    );
  }

  /**
   * Hot-path refresh for the event runner. The authoritative snapshot is
   * retained internally and only its count crosses this boundary, avoiding a
   * full deep copy that the runner immediately discarded.
   */
  refreshOpportunities(): number {
    return this
      .scanOpportunities()
      .length;
  }

  private scanOpportunities():
    ArbitrageOpportunity[] {
    const scanStartedHighResolution =
      performance.now();

    this.removeExpiredSnapshots();

    opportunityEngine
      .resetDiagnostics();

    const scanStartedAt =
      Date.now();

    const cachedQuoteCount =
      marketCache
        .size();

    /*
     * V19.18
     * Dynamic execution-quality universe.
     *
     * MarketCache remains untouched so all observed
     * markets remain available to UI/diagnostics.
     *
     * Only the authoritative opportunity pipeline is
     * filtered here.
     */
    const qualityGeneratedAt =
      Date.now();

    /*
     * Ticker-only rows cannot form an executable buy/sell pair and were
     * previously carried through normalization and grouping on every scan.
     * Keep the broad catalog for diagnostics, but run the hot path only over
     * genuine quantity-bearing quotes.
     */
    const executableQuotes =
      marketCache
        .getExecutable();

    const executionUniverse =
      bybitExecutionUniverseService
        .filterQuotesWithReport(
          executableQuotes,
          qualityGeneratedAt,
        );

    const cachedQuotes =
      executionUniverse
        .quotes;

    const executionQualityReport =
      executionUniverse
        .report;

    const snapshots =
      comparisonEngine
        .groupNormalizedExecutableByMarket(
          cachedQuotes,
        );

    let exchangePairCount =
      0;

    const opportunities:
      ArbitrageOpportunity[] =
      [];

    for (
      const snapshot
      of snapshots
    ) {
      const pairBatch =
        exchangePairGenerator
          .generatePositiveSpreadCandidates(
            snapshot,
          );

      exchangePairCount +=
        pairBatch
          .totalExecutablePairs;

      opportunityEngine
        .recordPreFilteredNonPositiveSpreads(
          pairBatch
            .nonPositiveSpreadPairs,
        );

      for (
        const pair
        of pairBatch.pairs
      ) {
        const opportunity =
          opportunityEngine
            .evaluate(
              pair,
            );

        if (
          opportunity !==
          null
        ) {
          opportunities.push(
            opportunity,
          );
        }
      }
    }

    opportunities.sort(
      (
        first,
        second,
      ) =>
        second
          .netProfitPercent -
        first
          .netProfitPercent,
    );

    const generatedAt =
      Math.max(
        Date.now(),

        (
          this
            .lastOpportunitySnapshot
            ?.generatedAt ??
          0
        ) +
          1,
      );

    const diagnostics =
      opportunityEngine
        .getDiagnostics();

    let discoveredProfitTiers =
      0;

    let qualifiedProfitTiers =
      0;

    let liveEligibleProfitTiers =
      0;

    for (
      const opportunity
      of opportunities
    ) {
      const tier =
        classifyProfitTier(
          opportunity.netProfitPercent,
        );

      if (
        tier ===
        "DISCOVERED"
      ) {
        discoveredProfitTiers +=
          1;
      } else {
        qualifiedProfitTiers +=
          1;

        if (
          tier ===
          "LIVE_ELIGIBLE"
        ) {
          liveEligibleProfitTiers +=
            1;
        }
      }
    }

    const diagnosticsSnapshot:
      OpportunityPipelineDiagnostics = {
      scanStartedAt,

      generatedAt,

      scanDurationMs:
        Number(
          (
            performance.now() -
            scanStartedHighResolution
          ).toFixed(
            3,
          ),
        ),

      cachedQuotes:
        cachedQuoteCount,

      executionQualityEligibleQuotes:
        cachedQuotes.length,

      executionQualityFilteredQuotes:
        cachedQuoteCount -
        cachedQuotes.length,

      bybitObservedMarkets:
        executionQualityReport
          .observedMarkets,

      bybitExecutionEligibleMarkets:
        executionQualityReport
          .executionEligibleMarkets,

      marketSnapshots:
        snapshots.length,

      exchangePairs:
        exchangePairCount,

      acceptedOpportunities:
        opportunities.length,

      profitPolicy: {
        discoveryMinimumNetProfitPercent:
          PROFIT_TIER_POLICY
            .discoveryMinimumNetProfitPercent,

        qualificationMinimumNetProfitPercent:
          PROFIT_TIER_POLICY
            .qualificationMinimumNetProfitPercent,

        liveMinimumNetProfitPercent:
          PROFIT_TIER_POLICY
            .liveMinimumNetProfitPercent,
      },

      profitTiers: {
        discovered:
          discoveredProfitTiers,

        qualified:
          qualifiedProfitTiers,

        liveEligible:
          liveEligibleProfitTiers,
      },

      diagnostics,
    };

    this.lastDiagnostics =
      structuredClone(
        diagnosticsSnapshot,
      );

    this.lastOpportunitySnapshot = {
      generatedAt,

      opportunities:
        opportunities,
    };

    /*
     * VERSION 17.4 BUILD 4
     *
     * Record every authoritative engine snapshot,
     * including empty snapshots.
     *
     * Empty snapshots are important because they
     * tell us when a previously accepted route was
     * overwritten/disappeared.
     */
    this.recordSnapshotHistory(
      generatedAt,
      opportunities,
    );

    this.logDiagnostics(
      diagnosticsSnapshot,
    );

    for (
      const opportunity
      of opportunities
    ) {
      const routeKey =
        this.createRouteKey(
          opportunity,
        );

      const supersededOpportunityId =
        this.latestOpportunityIdByRoute
          .get(
            routeKey,
          );

      if (
        supersededOpportunityId !==
          undefined &&
        supersededOpportunityId !==
          opportunity.id
      ) {
        this.opportunitySnapshots
          .delete(
            supersededOpportunityId,
          );
      }

      this.opportunitySnapshots
        .set(
          opportunity.id,
          opportunity,
        );

      this.latestOpportunityIdByRoute
        .set(
          routeKey,
          opportunity.id,
        );
    }

    /*
     * V19.38
     *
     * Publish only after exact opportunity snapshots have
     * been stored. Automation consumers may immediately
     * resolve an accepted opportunity by ID, so publishing
     * before this point would create a handoff race.
     */
    this.publishSnapshot(
      this.lastOpportunitySnapshot,
    );

    return opportunities;
  }

  getOpportunityById(
    opportunityId:
      string,
  ): ArbitrageOpportunity | null {
    this.removeExpiredSnapshots();

    const opportunity =
      this.opportunitySnapshots
        .get(
          opportunityId,
        );

    if (
      !opportunity
    ) {
      return null;
    }

    if (
      !this.isSnapshotFresh(
        opportunity,
      )
    ) {
      this.opportunitySnapshots
        .delete(
          opportunityId,
        );

      this.removeRouteIndex(
        opportunityId,
        opportunity,
      );

      return null;
    }

    return structuredClone(
      opportunity,
    );
  }

  getLastDiagnostics():
    OpportunityPipelineDiagnostics | null {
    if (
      this.lastDiagnostics ===
      null
    ) {
      return null;
    }

    return structuredClone(
      this.lastDiagnostics,
    );
  }

  getLastOpportunitySnapshot():
    OpportunitySnapshot | null {
    if (
      this.lastOpportunitySnapshot ===
      null
    ) {
      return null;
    }

    return structuredClone(
      this.lastOpportunitySnapshot,
    );
  }

  subscribeToOpportunitySnapshots(
    listener:
      OpportunitySnapshotListener,
  ): () => void {
    this.snapshotListeners.add(
      listener,
    );

    return () => {
      this.snapshotListeners.delete(
        listener,
      );
    };
  }

  getLastOpportunities():
    ArbitrageOpportunity[] {
    const snapshot =
      this.lastOpportunitySnapshot;

    if (
      !snapshot
    ) {
      return [];
    }

    return structuredClone(
      snapshot.opportunities,
    );
  }

  /*
   * VERSION 17.4 BUILD 4
   *
   * Read-only access to recent engine snapshots.
   *
   * Does NOT trigger a new opportunity scan.
   */
  getRecentOpportunitySnapshotHistory(
    limit =
      100,
  ): OpportunitySnapshotHistoryItem[] {
    const normalizedLimit =
      Math.max(
        1,

        Math.min(
          OpportunityService
            .MAXIMUM_SNAPSHOT_HISTORY,

          Math.floor(
            limit,
          ),
        ),
      );

    return structuredClone(
      this.recentSnapshotHistory
        .slice(
          -normalizedLimit,
        ),
    );
  }

  getSnapshotCount():
    number {
    this.removeExpiredSnapshots();

    return this
      .opportunitySnapshots
      .size;
  }

  private recordSnapshotHistory(
    generatedAt:
      number,

    opportunities:
      readonly ArbitrageOpportunity[],
  ): void {
    this.recentSnapshotHistory
      .push({
        generatedAt,

        opportunityCount:
          opportunities.length,

        opportunities:
          opportunities.map(
            (
              opportunity,
            ) => ({
              id:
                opportunity.id,

              key:
                this.createRouteKey(
                  opportunity,
                ),

              market:
                opportunity
                  .pair
                  .market
                  .trim()
                  .toUpperCase(),

              buyExchange:
                opportunity
                  .pair
                  .buy
                  .exchange
                  .trim()
                  .toLowerCase(),

              sellExchange:
                opportunity
                  .pair
                  .sell
                  .exchange
                  .trim()
                  .toLowerCase(),

              netProfitPercent:
                opportunity
                  .netProfitPercent,

              timestamp:
                opportunity.timestamp,
            }),
          ),
      });

    while (
      this.recentSnapshotHistory
        .length >
      OpportunityService
        .MAXIMUM_SNAPSHOT_HISTORY
    ) {
      this.recentSnapshotHistory
        .shift();
    }
  }

  private publishSnapshot(
    snapshot:
      OpportunitySnapshot,
  ): void {
    for (
      const listener
      of this.snapshotListeners
    ) {
      try {
        listener(
          structuredClone(
            snapshot,
          ),
        );
      } catch (
        error:
          unknown
      ) {
        console.error(
          "[OpportunityService] Snapshot listener failed:",

          error instanceof Error
            ? error.message
            : "Unknown snapshot listener error.",
        );
      }
    }
  }

  private logDiagnostics(
    diagnosticsSnapshot:
      OpportunityPipelineDiagnostics,
  ): void {
    if (
      !this.shouldLogDiagnostics(
        diagnosticsSnapshot,
      )
    ) {
      return;
    }

    console.log(
      "[Opportunity Debug]",
      JSON.stringify(
        diagnosticsSnapshot,
      ),
    );
  }

  private shouldLogDiagnostics(
    diagnosticsSnapshot:
      OpportunityPipelineDiagnostics,
  ): boolean {
    const level =
      this.config
        .diagnosticsLogLevel;

    if (
      level ===
      "debug"
    ) {
      return true;
    }

    if (
      level !==
      "info"
    ) {
      return false;
    }

    const accepted =
      diagnosticsSnapshot
        .acceptedOpportunities >
      0;

    const previousLogAt =
      accepted
        ? this
            .lastAcceptedDiagnosticsLogAt
        : this
            .lastDiagnosticsLogAt;

    const minimumIntervalMs =
      accepted
        ? this.config
            .acceptedDiagnosticsLogIntervalMs
        : this.config
            .diagnosticsLogIntervalMs;

    if (
      previousLogAt !==
        null &&
      diagnosticsSnapshot
        .generatedAt -
        previousLogAt <
        minimumIntervalMs
    ) {
      return false;
    }

    if (
      accepted
    ) {
      this.lastAcceptedDiagnosticsLogAt =
        diagnosticsSnapshot
          .generatedAt;
    } else {
      this.lastDiagnosticsLogAt =
        diagnosticsSnapshot
          .generatedAt;
    }

    return true;
  }

  private validateConfig():
    void {
    for (
      const [
        name,
        value,
      ]
      of [
        [
          "diagnosticsLogIntervalMs",
          this.config
            .diagnosticsLogIntervalMs,
        ],
        [
          "acceptedDiagnosticsLogIntervalMs",
          this.config
            .acceptedDiagnosticsLogIntervalMs,
        ],
      ] as const
    ) {
      if (
        !Number.isFinite(
          value,
        ) ||
        value <=
          0
      ) {
        throw new Error(
          `Opportunity service ${name} must be positive.`,
        );
      }
    }
  }

  private createRouteKey(
    opportunity:
      ArbitrageOpportunity,
  ): string {
    return [
      opportunity
        .pair
        .market
        .trim()
        .toUpperCase(),

      opportunity
        .pair
        .buy
        .exchange
        .trim()
        .toLowerCase(),

      opportunity
        .pair
        .sell
        .exchange
        .trim()
        .toLowerCase(),
    ].join(
      "|",
    );
  }

  private removeExpiredSnapshots():
    void {
    for (
      const [
        opportunityId,
        opportunity,
      ]
      of this.opportunitySnapshots
    ) {
      if (
        !this.isSnapshotFresh(
          opportunity,
        )
      ) {
        this.opportunitySnapshots
          .delete(
            opportunityId,
          );

        this.removeRouteIndex(
          opportunityId,
          opportunity,
        );
      }
    }
  }

  private removeRouteIndex(
    opportunityId:
      string,

    opportunity:
      ArbitrageOpportunity,
  ): void {
    const routeKey =
      this.createRouteKey(
        opportunity,
      );

    if (
      this.latestOpportunityIdByRoute
        .get(
          routeKey,
        ) ===
      opportunityId
    ) {
      this.latestOpportunityIdByRoute
        .delete(
          routeKey,
        );
    }
  }

  private isSnapshotFresh(
    opportunity:
      ArbitrageOpportunity,
  ): boolean {
    const ageMs =
      Math.max(
        0,

        Date.now() -
          opportunity.timestamp,
      );

    return (
      opportunity
        .quotesAreFresh &&
      ageMs <=
        defaultArbitragePolicy
          .maximumQuoteAgeMs
    );
  }
}

export const opportunityService =
  new OpportunityService();
