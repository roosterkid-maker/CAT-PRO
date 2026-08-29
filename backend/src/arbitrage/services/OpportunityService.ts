import {
  defaultArbitragePolicy,
} from "../config/policy";

import {
  classifyProfitTier,
  PROFIT_TIER_POLICY,
} from "../config/profitTiers";

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

import type {
  ExchangeQuote,
} from "../models/ExchangeQuote";

import {
  opportunityRejectionStore,
  type OpportunityRejectionRecord,
} from "./OpportunityRejectionStore";

import {
  marketCache,
} from "../../services/cache.service";

import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";

import {
  bybitExecutionUniverseService,
} from "../../execution-quality/services/BybitExecutionUniverseService";

import {
  environment,
} from "../../config/Environment";

import {
  isStrategyOneTinyLiveDynamicRoute,
  type StrategyOneTinyLiveBasketBookObservation,
  type StrategyOneTinyLiveBasketRoute,
} from "../execution/StrategyOneTinyLiveBasketPolicy";

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

/*
 * The two timing-evidence owners each retain at most 128 dynamic routes.
 * Publishing every executable route on every 20 ms scan only made the
 * bounded consumers sort, clone and reject the overflow repeatedly. Actual
 * opportunities remain uncapped and are carried separately below, so an
 * accepted route outside this timing cohort still enters qualification and
 * exact-route evidence normally.
 */
const MAXIMUM_PILOT_ROUTE_BOOKS_PER_SNAPSHOT =
  128;

export interface OpportunityPipelineDiagnostics {
  scanStartedAt:
    number;

  generatedAt:
    number;

  scanDurationMs?:
    number;

  /**
   * Full scans reconcile the entire executable universe. Incremental scans
   * replace only markets named by genuine executable-cache mutations while
   * still publishing one complete authoritative opportunity snapshot.
   */
  scanScope?:
    | "FULL"
    | "INCREMENTAL";

  evaluatedMarkets?:
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

  /**
   * Exact executable books for the dynamic Strategy #1 USDT route pool. Timing observers
   * use these independently from opportunity economics, so a zero/negative
   * spread cannot leave an otherwise healthy route stuck at NO DATA.
   */
  pilotRouteBooks?:
    readonly StrategyOneTinyLiveBasketBookObservation[];
}

interface OpportunityMarketScanState {
  readonly market:
    string;

  readonly executionQualityEligibleQuotes:
    number;

  readonly marketSnapshots:
    number;

  readonly exchangePairs:
    number;

  readonly opportunities:
    readonly ArbitrageOpportunity[];

  readonly pilotRouteBooks:
    readonly StrategyOneTinyLiveBasketBookObservation[];

  readonly diagnostics:
    OpportunityDiagnostics;
}

export interface ExactRouteEvaluationInput {
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly minimumBuyTimestamp?: number;
  readonly minimumSellTimestamp?: number;
}

export interface ExactRouteEvaluationEvidence {
  readonly buyPrice: number | null;
  readonly sellPrice: number | null;
  readonly buyQuantity: number | null;
  readonly sellQuantity: number | null;
  readonly buyTimestamp: number | null;
  readonly sellTimestamp: number | null;
  readonly rawSpreadPercent: number | null;
}

export interface ExactRouteEvaluationResult {
  readonly evaluatedAt: number;
  readonly opportunity: ArbitrageOpportunity | null;
  readonly rejection: OpportunityRejectionRecord | null;
  readonly evidence: ExactRouteEvaluationEvidence;
  readonly reason: string;
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
    Array<
      OpportunitySnapshotHistoryItem |
      undefined
    > =
    new Array(
      OpportunityService
        .MAXIMUM_SNAPSHOT_HISTORY,
    );

  private recentSnapshotHistoryCount =
    0;

  private recentSnapshotHistoryWriteIndex =
    0;

  private lastDiagnostics:
    OpportunityPipelineDiagnostics | null =
    null;

  private lastOpportunitySnapshot:
    OpportunitySnapshot | null =
    null;

  /*
   * Event-driven scans replace one changed market instead of recomputing the
   * complete exchange universe. The periodic full scan remains the bounded
   * reconciliation owner for time-based eligibility changes and cache drift.
   */
  private marketScanStates =
    new Map<
      string,
      OpportunityMarketScanState
    >();

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

  /**
   * Re-evaluate only executable markets changed since the previous event
   * batch. A missing baseline, an empty batch or the cache-wide `*` marker
   * deliberately falls back to a complete reconciliation scan.
   */
  refreshMarkets(
    markets:
      readonly string[],
  ): number {
    return this
      .scanOpportunities(
        markets,
      )
      .length;
  }

  /**
   * Evaluate one action-time route from the two authoritative executable
   * cache entries only. This deliberately avoids a full-universe rescan and
   * the shared last-snapshot race on the LIVE fallback path. An accepted
   * result is still registered in the same immutable opportunity store so
   * every downstream authority check resolves the exact evaluated ID.
   */
  evaluateExactRoute(
    input:
      ExactRouteEvaluationInput,
  ): ExactRouteEvaluationResult {
    this.removeExpiredSnapshots();

    const market =
      input.market
        .trim()
        .toUpperCase();
    const buyExchange =
      input.buyExchange
        .trim()
        .toLowerCase();
    const sellExchange =
      input.sellExchange
        .trim()
        .toLowerCase();
    const evaluatedAt =
      Date.now();

    const buy =
      marketCache.get(
        buyExchange,
        market,
      );
    const sell =
      marketCache.get(
        sellExchange,
        market,
      );

    const evidence =
      exactRouteEvidence(
        buy,
        sell,
      );

    const invalidReason =
      validateExactRouteQuotes({
        market,
        buyExchange,
        sellExchange,
        buy,
        sell,
        minimumBuyTimestamp:
          input.minimumBuyTimestamp,
        minimumSellTimestamp:
          input.minimumSellTimestamp,
      });

    if (invalidReason) {
      return {
        evaluatedAt,
        opportunity:
          null,
        rejection:
          null,
        evidence,
        reason:
          invalidReason,
      };
    }

    const opportunity =
      opportunityEngine.evaluate({
        market,
        buy:
          buy!,
        sell:
          sell!,
      });

    if (opportunity) {
      this.storeOpportunity(
        opportunity,
      );

      return {
        evaluatedAt,
        opportunity:
          structuredClone(
            opportunity,
          ),
        rejection:
          null,
        evidence,
        reason:
          opportunity.decision ===
            "EXECUTE"
            ? "The exact refreshed route passed the authoritative opportunity engine."
            : `The exact refreshed route produced decision ${opportunity.decision}, not EXECUTE.`,
      };
    }

    const rejection =
      opportunityRejectionStore
        .getRecent(
          50,
        )
        .find(
          (
            item,
          ) =>
            item.rejectedAt >=
              evaluatedAt &&
            item.market
              .trim()
              .toUpperCase() ===
              market &&
            item.buyExchange
              .trim()
              .toLowerCase() ===
              buyExchange &&
            item.sellExchange
              .trim()
              .toLowerCase() ===
              sellExchange,
        ) ??
      null;

    const reason =
      rejection?.reason ??
      (
        evidence.rawSpreadPercent !==
          null &&
        evidence.rawSpreadPercent <=
          0
          ? `The refreshed route has a non-positive raw spread (${evidence.rawSpreadPercent.toFixed(6)}%).`
          : "The exact refreshed route did not pass the authoritative opportunity engine."
      );

    return {
      evaluatedAt,
      opportunity:
        null,
      rejection,
      evidence,
      reason,
    };
  }

  private scanOpportunities(
    requestedMarkets?:
      readonly string[],
  ):
    ArbitrageOpportunity[] {
    const scanStartedHighResolution =
      performance.now();

    this.removeExpiredSnapshots();

    const scanStartedAt =
      Date.now();

    const normalizedRequestedMarkets =
      new Set(
        (
          requestedMarkets ??
          []
        )
          .map(
            (market) =>
              market
                .trim()
                .toUpperCase(),
          )
          .filter(
            Boolean,
          ),
      );

    const incrementalScan =
      requestedMarkets !==
        undefined &&
      normalizedRequestedMarkets
        .size >
        0 &&
      !normalizedRequestedMarkets
        .has(
          "*",
        ) &&
      this.lastOpportunitySnapshot !==
        null;

    const cachedQuoteCount =
      marketCache
        .size();

    /*
     * V19.18
     * Dynamic execution-quality universe.
     *
     * MarketCache remains untouched so all observed markets remain available
     * to UI/diagnostics. Only the authoritative opportunity pipeline is
     * filtered here.
     */
    const executionQuality =
      bybitExecutionUniverseService
        .getOpportunityEligibilitySnapshot(
          Date.now(),
        );

    opportunityEngine
      .resetDiagnostics();

    const nextMarketScanStates =
      incrementalScan
        ? new Map(
            this.marketScanStates,
          )
        : new Map<
            string,
            OpportunityMarketScanState
          >();

    let previousBatchDiagnostics =
      emptyOpportunityDiagnostics();

    let evaluatedMarketCount =
      0;

    const scanMarket = (
      market:
        string,

      quotesByExchange:
        ReadonlyMap<
          string,
          ExecutableQuote
        >,
    ): void => {
      evaluatedMarketCount +=
        1;

      const marketStateWithoutDiagnostics =
        this.scanMarket(
          market,
          quotesByExchange,
          executionQuality
            .eligibleMarkets,
        );

      const currentBatchDiagnostics =
        opportunityEngine
          .getDiagnostics();

      nextMarketScanStates
        .set(
          market,
          {
            ...marketStateWithoutDiagnostics,
            diagnostics:
              subtractOpportunityDiagnostics(
                currentBatchDiagnostics,
                previousBatchDiagnostics,
              ),
          },
        );

      previousBatchDiagnostics =
        currentBatchDiagnostics;
    };

    if (incrementalScan) {
      for (
        const market
        of normalizedRequestedMarkets
      ) {
        const quotesByExchange =
          marketCache
            .getExecutableMarketQuotes(
              market,
            );

        if (!quotesByExchange) {
          nextMarketScanStates
            .delete(
              market,
            );

          evaluatedMarketCount +=
            1;

          continue;
        }

        scanMarket(
          market,
          quotesByExchange,
        );
      }
    } else {
      for (
        const [
          market,
          quotesByExchange,
        ]
        of marketCache
          .executableMarketEntries()
      ) {
        scanMarket(
          market,
          quotesByExchange,
        );
      }
    }

    this.marketScanStates =
      nextMarketScanStates;

    let exchangePairCount =
      0;

    let executionQualityEligibleQuoteCount =
      0;

    let marketSnapshotCount =
      0;

    let diagnostics =
      emptyOpportunityDiagnostics();

    const opportunities:
      ArbitrageOpportunity[] =
      [];

    const pilotRouteBooks:
      StrategyOneTinyLiveBasketBookObservation[] =
      [];

    for (
      const state
      of this.marketScanStates
        .values()
    ) {
      exchangePairCount +=
        state.exchangePairs;
      executionQualityEligibleQuoteCount +=
        state
          .executionQualityEligibleQuotes;
      marketSnapshotCount +=
        state.marketSnapshots;
      diagnostics =
        addOpportunityDiagnostics(
          diagnostics,
          state.diagnostics,
        );

      for (
        const opportunity
        of state.opportunities
      ) {
        if (
          this.isSnapshotFresh(
            opportunity,
          )
        ) {
          opportunities.push(
            opportunity,
          );
        }
      }

      for (
        const book
        of state.pilotRouteBooks
      ) {
        if (
          pilotRouteBooks.length >=
          MAXIMUM_PILOT_ROUTE_BOOKS_PER_SNAPSHOT
        ) {
          break;
        }

        pilotRouteBooks.push(
          book,
        );
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

      scanScope:
        incrementalScan
          ? "INCREMENTAL"
          : "FULL",

      evaluatedMarkets:
        evaluatedMarketCount,

      cachedQuotes:
        cachedQuoteCount,

      executionQualityEligibleQuotes:
        executionQualityEligibleQuoteCount,

      executionQualityFilteredQuotes:
        cachedQuoteCount -
        executionQualityEligibleQuoteCount,

      bybitObservedMarkets:
        executionQuality
          .observedMarkets,

      bybitExecutionEligibleMarkets:
        executionQuality
          .executionEligibleMarkets,

      marketSnapshots:
        marketSnapshotCount,

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
      diagnosticsSnapshot;

    this.lastOpportunitySnapshot = {
      generatedAt,

      opportunities:
        opportunities,

      pilotRouteBooks,
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
      this.storeOpportunity(
        opportunity,
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

  private scanMarket(
    market:
      string,

    quotesByExchange:
      ReadonlyMap<
        string,
        ExecutableQuote
      >,

    eligibleBybitMarkets:
      ReadonlySet<string>,
  ): Omit<
    OpportunityMarketScanState,
    "diagnostics"
  > {
    const quotes:
      ExchangeQuote[] =
      [];

    for (
      const quote
      of quotesByExchange.values()
    ) {
      if (
        quote.exchange ===
          "bybit" &&
        !eligibleBybitMarkets
          .has(
            quote.market,
          )
      ) {
        continue;
      }

      quotes.push(
        quote,
      );
    }

    const opportunities:
      ArbitrageOpportunity[] =
      [];

    const pilotRouteBooks:
      StrategyOneTinyLiveBasketBookObservation[] =
      [];

    if (
      quotes.length ===
        0
    ) {
      return {
        market,
        executionQualityEligibleQuotes:
          0,
        marketSnapshots:
          0,
        exchangePairs:
          0,
        opportunities,
        pilotRouteBooks,
      };
    }

    const pairBatch =
      exchangePairGenerator
        .generatePositiveSpreadCandidatesFromQuotes(
          market,
          quotes,
          (
            observedMarket,
            buy,
            sell,
          ) => {
            const route = {
              market:
                observedMarket,
              buyExchange:
                buy.exchange,
              sellExchange:
                sell.exchange,
            };

            if (
              !isStrategyOneTinyLiveDynamicRoute(
                route,
              )
            ) {
              return;
            }

            pilotRouteBooks.push({
              market:
                observedMarket,
              buyExchange:
                buy.exchange as StrategyOneTinyLiveBasketRoute["buyExchange"],
              sellExchange:
                sell.exchange as StrategyOneTinyLiveBasketRoute["sellExchange"],
              buyTimestamp:
                buy.timestamp,
              sellTimestamp:
                sell.timestamp,
            });
          },
        );

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

    return {
      market,
      executionQualityEligibleQuotes:
        quotes.length,
      marketSnapshots:
        1,
      exchangePairs:
        pairBatch
          .totalExecutablePairs,
      opportunities,
      pilotRouteBooks,
    };
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

    const count =
      Math.min(
        normalizedLimit,
        this.recentSnapshotHistoryCount,
      );

    const startIndex =
      (
        this.recentSnapshotHistoryWriteIndex -
        count +
        OpportunityService
          .MAXIMUM_SNAPSHOT_HISTORY
      ) %
      OpportunityService
        .MAXIMUM_SNAPSHOT_HISTORY;

    const items:
      OpportunitySnapshotHistoryItem[] =
      [];

    for (
      let offset = 0;
      offset < count;
      offset += 1
    ) {
      const item =
        this.recentSnapshotHistory[
          (
            startIndex +
            offset
          ) %
          OpportunityService
            .MAXIMUM_SNAPSHOT_HISTORY
        ];

      if (item) {
        items.push(
          item,
        );
      }
    }

    return structuredClone(
      items,
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
    const item:
      OpportunitySnapshotHistoryItem = {
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
      };

    this.recentSnapshotHistory[
      this.recentSnapshotHistoryWriteIndex
    ] =
      item;

    this.recentSnapshotHistoryWriteIndex =
      (
        this.recentSnapshotHistoryWriteIndex +
        1
      ) %
      OpportunityService
        .MAXIMUM_SNAPSHOT_HISTORY;

    this.recentSnapshotHistoryCount =
      Math.min(
        OpportunityService
          .MAXIMUM_SNAPSHOT_HISTORY,
        this.recentSnapshotHistoryCount +
          1,
      );
  }

  private publishSnapshot(
    snapshot:
      OpportunitySnapshot,
  ): void {
    if (
      this.snapshotListeners.size ===
        0
    ) {
      return;
    }

    /*
     * All subscribers are internal read-only pipeline consumers. Clone once
     * at the service boundary, freeze the collections against accidental
     * structural mutation, and share that isolated publication. Cloning the
     * complete opportunity graph once per listener added avoidable latency to
     * every event-driven market scan.
     */
    const publishedSnapshot =
      structuredClone(
        snapshot,
      );

    Object.freeze(
      publishedSnapshot
        .opportunities,
    );

    if (
      publishedSnapshot
        .pilotRouteBooks
    ) {
      Object.freeze(
        publishedSnapshot
          .pilotRouteBooks,
      );
    }

    Object.freeze(
      publishedSnapshot,
    );

    for (
      const listener
      of this.snapshotListeners
    ) {
      try {
        listener(
          publishedSnapshot,
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

  private storeOpportunity(
    opportunity:
      ArbitrageOpportunity,
  ): void {
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

function emptyOpportunityDiagnostics():
  OpportunityDiagnostics {
  return {
    engine: {
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
    },
    evaluator: {
      evaluated:
        0,
      staleBuyQuote:
        0,
      staleSellQuote:
        0,
      staleBothQuotes:
        0,
      pairSynchronizationRejected:
        0,
      priceResolutionFailed:
        0,
      buyFeeMissing:
        0,
      sellFeeMissing:
        0,
      invalidBuyPrice:
        0,
      invalidSellPrice:
        0,
      accepted:
        0,
    },
  };
}

function subtractOpportunityDiagnostics(
  current:
    OpportunityDiagnostics,

  previous:
    OpportunityDiagnostics,
): OpportunityDiagnostics {
  return combineOpportunityDiagnostics(
    current,
    previous,
    -1,
  );
}

function addOpportunityDiagnostics(
  first:
    OpportunityDiagnostics,

  second:
    OpportunityDiagnostics,
): OpportunityDiagnostics {
  return combineOpportunityDiagnostics(
    first,
    second,
    1,
  );
}

function combineOpportunityDiagnostics(
  first:
    OpportunityDiagnostics,

  second:
    OpportunityDiagnostics,

  multiplier:
    1 | -1,
): OpportunityDiagnostics {
  return {
    engine: {
      evaluated:
        first.engine.evaluated +
        second.engine.evaluated *
          multiplier,
      evaluatorRejected:
        first.engine.evaluatorRejected +
        second.engine.evaluatorRejected *
          multiplier,
      invalidMarketData:
        first.engine.invalidMarketData +
        second.engine.invalidMarketData *
          multiplier,
      spreadRejected:
        first.engine.spreadRejected +
        second.engine.spreadRejected *
          multiplier,
      netProfitRejected:
        first.engine.netProfitRejected +
        second.engine.netProfitRejected *
          multiplier,
      quantityRejected:
        first.engine.quantityRejected +
        second.engine.quantityRejected *
          multiplier,
      liquidityRejected:
        first.engine.liquidityRejected +
        second.engine.liquidityRejected *
          multiplier,
      freshnessRejected:
        first.engine.freshnessRejected +
        second.engine.freshnessRejected *
          multiplier,
      feeRejected:
        first.engine.feeRejected +
        second.engine.feeRejected *
          multiplier,
      spreadAnalysisRejected:
        first.engine.spreadAnalysisRejected +
        second.engine.spreadAnalysisRejected *
          multiplier,
      quoteIntegrityRejected:
        first.engine.quoteIntegrityRejected +
        second.engine.quoteIntegrityRejected *
          multiplier,
      accepted:
        first.engine.accepted +
        second.engine.accepted *
          multiplier,
    },
    evaluator: {
      evaluated:
        first.evaluator.evaluated +
        second.evaluator.evaluated *
          multiplier,
      staleBuyQuote:
        first.evaluator.staleBuyQuote +
        second.evaluator.staleBuyQuote *
          multiplier,
      staleSellQuote:
        first.evaluator.staleSellQuote +
        second.evaluator.staleSellQuote *
          multiplier,
      staleBothQuotes:
        first.evaluator.staleBothQuotes +
        second.evaluator.staleBothQuotes *
          multiplier,
      pairSynchronizationRejected:
        first.evaluator.pairSynchronizationRejected +
        second.evaluator.pairSynchronizationRejected *
          multiplier,
      priceResolutionFailed:
        first.evaluator.priceResolutionFailed +
        second.evaluator.priceResolutionFailed *
          multiplier,
      buyFeeMissing:
        first.evaluator.buyFeeMissing +
        second.evaluator.buyFeeMissing *
          multiplier,
      sellFeeMissing:
        first.evaluator.sellFeeMissing +
        second.evaluator.sellFeeMissing *
          multiplier,
      invalidBuyPrice:
        first.evaluator.invalidBuyPrice +
        second.evaluator.invalidBuyPrice *
          multiplier,
      invalidSellPrice:
        first.evaluator.invalidSellPrice +
        second.evaluator.invalidSellPrice *
          multiplier,
      accepted:
        first.evaluator.accepted +
        second.evaluator.accepted *
          multiplier,
    },
  };
}

function exactRouteEvidence(
  buy:
    ExecutableQuote | undefined,
  sell:
    ExecutableQuote | undefined,
): ExactRouteEvaluationEvidence {
  const buyPrice =
    buy?.bestAskPrice ??
    null;
  const sellPrice =
    sell?.bestBidPrice ??
    null;
  const rawSpreadPercent =
    buyPrice !== null &&
    sellPrice !== null &&
    Number.isFinite(
      buyPrice,
    ) &&
    Number.isFinite(
      sellPrice,
    ) &&
    buyPrice >
      0
      ? (
          sellPrice -
          buyPrice
        ) /
        buyPrice *
        100
      : null;

  return {
    buyPrice,
    sellPrice,
    buyQuantity:
      buy?.bestAskQty ??
      null,
    sellQuantity:
      sell?.bestBidQty ??
      null,
    buyTimestamp:
      buy?.timestamp ??
      null,
    sellTimestamp:
      sell?.timestamp ??
      null,
    rawSpreadPercent,
  };
}

function validateExactRouteQuotes(
  input: {
    readonly market: string;
    readonly buyExchange: string;
    readonly sellExchange: string;
    readonly buy: ExecutableQuote | undefined;
    readonly sell: ExecutableQuote | undefined;
    readonly minimumBuyTimestamp?: number;
    readonly minimumSellTimestamp?: number;
  },
): string | null {
  if (
    !input.buy ||
    !input.buy.executable
  ) {
    return `Fresh executable BUY book is unavailable for ${input.market} on ${input.buyExchange}.`;
  }

  if (
    !input.sell ||
    !input.sell.executable
  ) {
    return `Fresh executable SELL book is unavailable for ${input.market} on ${input.sellExchange}.`;
  }

  if (
    input.buy.timestamp <
      (
        input.minimumBuyTimestamp ??
        0
      )
  ) {
    return "The BUY cache entry does not contain the completed action-time refresh.";
  }

  if (
    input.sell.timestamp <
      (
        input.minimumSellTimestamp ??
        0
      )
  ) {
    return "The SELL cache entry does not contain the completed action-time refresh.";
  }

  return null;
}
