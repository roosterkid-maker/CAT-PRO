import {
  resolve,
} from "node:path";

import type {
  ArbitrageOpportunity,
} from "../../../arbitrage/models/ArbitrageOpportunity";

import type {
  ArbitrageLiveExecutionResult,
} from "../../../arbitrage/execution/models/ArbitrageLiveExecutionResult";

import {
  arbitrageExecutionCoordinator,
} from "../../../arbitrage/execution/ArbitrageExecutionCoordinator";

import {
  isStrategyOneTinyLiveDynamicRoute,
} from "../../../arbitrage/execution/StrategyOneTinyLiveBasketPolicy";

import {
  opportunityService,
  type OpportunitySnapshot,
} from "../../../arbitrage/services/OpportunityService";

import {
  JsonlSnapshotStore,
} from "../../../core/persistence/JsonlSnapshotStore";

import {
  getLiveOnlyRuntimePolicy,
  isLiveOnlyRuntimeEnabled,
} from "../../../config/LiveOnlyRuntimePolicy";

import {
  strategyOneLiveOnlyAuthorityService,
} from "./StrategyOneLiveOnlyAuthorityService";

import {
  opportunityCapitalStudyService,
  type OpportunityCapitalStudyDecision,
} from "../../../rebalancing/services/OpportunityCapitalStudyService";

import {
  normalizedInventorySnapshotService,
} from "../../../rebalancing/services/NormalizedInventorySnapshotService";

import {
  strategyOneTwoLegRestartRecoveryService,
} from "../recovery/StrategyOneTwoLegRestartRecoveryService";

import {
  strategyOneActionTimeBookRefreshService,
  type StrategyOneActionTimeBookRefreshRoute,
  type StrategyOneActionTimeBookRefreshResult,
  type StrategyOneAuthorizedFinalBookRefreshResult,
} from "../tiny-live/StrategyOneActionTimeBookRefreshService";

export interface StrategyOneLiveOnlyRunnerDependencies {
  runtimeEnabled(): boolean;
  getPolicy(): ReturnType<typeof getLiveOnlyRuntimePolicy>;
  subscribe(
    listener: (snapshot: OpportunitySnapshot) => void,
  ): () => void;
  refreshActionCandidate(
    input: StrategyOneActionTimeBookRefreshRoute,
  ): Promise<StrategyOneActionTimeBookRefreshResult>;
  authorize(
    opportunityId: string,
    now: number,
  ): {
    readonly id: string;
  };
  refreshAuthorizedFinalBooks(input: {
    readonly market: string;
    readonly buyExchange: string;
    readonly sellExchange: string;
  }): Promise<StrategyOneAuthorizedFinalBookRefreshResult>;
  execute(
    opportunity: ArbitrageOpportunity,
    authorityId: string,
  ): Promise<ArbitrageLiveExecutionResult>;
  getCapitalStudyDecision(
    opportunity: ArbitrageOpportunity,
    now: number,
  ): OpportunityCapitalStudyDecision;
  isBaseAssetPreFundable(
    baseAsset: string,
    now: number,
  ): boolean;
  getRecoveryClearance(now: number): {
    readonly classification: "CLEAN" | "REVIEW_REQUIRED" | "POSSIBLE_EXPOSURE";
    readonly allowNewLivePreparation: boolean;
    readonly summary: {
      readonly unresolvedSessions: number;
      readonly possibleExposureSessions: number;
      readonly persistenceIntegrityProblems: number;
    };
  };
  now(): number;
}

export interface StrategyOneLiveOnlyAttempt {
  readonly opportunityId: string;
  readonly routeKey: string;
  readonly market: string;
  readonly buyExchange: string;
  readonly sellExchange: string;
  readonly netProfitPercent: number;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly authorityId: string | null;
  readonly status:
    ArbitrageLiveExecutionResult["status"] |
    "AUTHORIZATION_BLOCKED";
  readonly orderSubmissionMayHaveOccurred: boolean;
  readonly recoveryRequired: boolean;
  readonly possibleExposure: boolean;
  readonly reason: string;
}

interface PersistedSnapshot {
  readonly schemaVersion: "1.0";
  readonly savedAt: number;
  readonly haltedReason: string | null;
  readonly attempts: readonly StrategyOneLiveOnlyAttempt[];
}

const DEFAULT_FILE =
  resolve(
    process.cwd(),
    "logs",
    "live",
    "strategy-one-live-only-runner.jsonl",
  );

const MAXIMUM_ATTEMPT_HISTORY =
  500;

/*
 * StrategyOneTinyLiveBasketPolicy's route pool deliberately leaves `markets`
 * unpinned - it is shared by PAPER analytics, timing calibration and many
 * other read-only observers, so bounding it there would also change what
 * those unrelated surfaces track. But StrategyOneFundedRouteService requires
 * the SELL exchange to already hold the traded base asset before a LIVE
 * attempt proceeds (Capital Manager auto-funding only tops up the BUY side's
 * USDT - it deliberately never auto-converts/auto-buys base inventory, see
 * OpportunityCapitalStudyService.recommend()). With the pool fully dynamic,
 * every attempt in practice targets a different rarely-held altcoin (LSK,
 * HEMI, KAVA, CSPR, REZ, ZIG, ...), so the SELL-side funding check was
 * failing on effectively every attempt: 500/500 observed, 0 completed.
 *
 * A hand-maintained coin list was tried first and reverted: it still let
 * unfunded listed coins waste attempts, and required a code change for
 * every coin the operator actually funds. Bound the runner - the actual
 * real-money execution gate - to whatever base assets the account
 * currently, verifiably holds on a pool venue instead, via the same
 * read-only inventory truth the Capital Manager itself uses. This does not
 * touch the shared pool policy, so PAPER/analytics/calibration coverage is
 * unaffected, and it self-updates the moment the operator's real holdings
 * change - no redeploy needed to add or remove a coin.
 */
const STRATEGY_ONE_LIVE_ONLY_POOL_VENUES = new Set([
  "binance",
  "coindcx",
  "bybit",
]);

/*
 * Filters out true dust (a leftover fraction of a coin worth a few cents)
 * without trying to predict the exact quantity a real attempt will need -
 * StrategyOneFundedRouteService still makes that precise, authoritative
 * check later in the pipeline. This only decides whether it's worth
 * attempting at all.
 */
const MINIMUM_HELD_VALUE_USDT =
  1;

function extractBaseAsset(
  market:
    string,
): string | null {
  const normalized =
    market
      .trim()
      .toUpperCase();

  if (
    !normalized.endsWith(
      "USDT",
    )
  ) {
    return null;
  }

  const baseAsset =
    normalized.slice(
      0,
      -"USDT".length,
    );

  return baseAsset || null;
}

function isBaseAssetHeldOnPoolVenue(
  baseAsset:
    string,
  now:
    number,
): boolean {
  const snapshot =
    normalizedInventorySnapshotService
      .getSnapshot(
        now,
      );

  return snapshot.exchanges.some(
    (
      exchange,
    ) =>
      STRATEGY_ONE_LIVE_ONLY_POOL_VENUES.has(
        exchange.exchange
          .trim()
          .toLowerCase(),
      ) &&
      exchange.balanceUsableForDecision &&
      exchange.assets.some(
        (
          asset,
        ) =>
          asset.asset ===
            baseAsset &&
          asset.availableAfterReservations >
            0 &&
          (
            asset.valuation
              .availableAfterReservationsValueUsdt ??
            0
          ) >=
            MINIMUM_HELD_VALUE_USDT,
      ),
  );
}

const DEFAULT_DEPENDENCIES:
  StrategyOneLiveOnlyRunnerDependencies = {
  runtimeEnabled:
    isLiveOnlyRuntimeEnabled,
  getPolicy:
    getLiveOnlyRuntimePolicy,
  subscribe: (
    listener,
  ) =>
    opportunityService
      .subscribeToOpportunitySnapshots(
        listener,
      ),
  refreshActionCandidate: (
    input,
  ) =>
    strategyOneActionTimeBookRefreshService
      .refresh(
        input,
      ),
  authorize: (
    opportunityId,
    now,
  ) =>
    strategyOneLiveOnlyAuthorityService
      .authorize(
        opportunityId,
        now,
      ),
  refreshAuthorizedFinalBooks: (
    input,
  ) =>
    strategyOneActionTimeBookRefreshService
      .refreshForAuthorizedAttempt(
        input,
      ),
  execute: (
    opportunity,
    authorityId,
  ) =>
    arbitrageExecutionCoordinator
      .execute(
        opportunity,
        {
          actionAuthorityId:
            authorityId,
          allowTinyLiveReviewCandidate:
            false,
          timeoutMs:
            3_000,
          pollingIntervalMs:
            100,
          cancelOnTimeout:
            true,
        },
       ),
  getCapitalStudyDecision: (
    opportunity,
    now,
  ) =>
    opportunityCapitalStudyService
      .getDecision(
        opportunity,
        now,
      ),
  isBaseAssetPreFundable:
    isBaseAssetHeldOnPoolVenue,
  getRecoveryClearance: (
    now,
  ) =>
    strategyOneTwoLegRestartRecoveryService
      .getReport(
        now,
      ),
  now:
    Date.now,
};

/**
 * Standing Strategy #1 LIVE-only runner. Process-level explicit confirmation
 * replaces PAPER readiness and per-route Tiny-LIVE arm/lease controls. Every
 * actual candidate still receives a fresh exact preflight and one durable
 * three-second authority before the existing journaled two-leg coordinator.
 */
export class StrategyOneLiveOnlyRunnerService {
  private readonly dependencies:
    StrategyOneLiveOnlyRunnerDependencies;

  private readonly store:
    JsonlSnapshotStore<PersistedSnapshot>;

  private attempts:
    StrategyOneLiveOnlyAttempt[] =
    [];

  private readonly attemptedOpportunityIds =
    new Set<string>();

  private readonly routeLastAttemptAt =
    new Map<string, number>();

  private unsubscribe:
    (() => void) |
    null =
    null;

  private inFlight =
    false;

  private haltedReason:
    string | null =
    null;

  private snapshotsObserved =
    0;

  private candidatesObserved =
    0;

  private preflightBlocks =
    0;

  constructor(
    filePath =
      DEFAULT_FILE,
    dependencies:
      Partial<StrategyOneLiveOnlyRunnerDependencies> = {},
  ) {
    this.dependencies = {
      ...DEFAULT_DEPENDENCIES,
      ...dependencies,
    };

    this.store =
      new JsonlSnapshotStore({
        filePath,
        isPayload:
          isSnapshot,
      });

    /*
     * Each record is a complete cumulative runner snapshot. Restoring the
     * whole append-only file needlessly materialized every historical copy
     * before keeping only the last one. In production that journal can grow
     * to hundreds of megabytes, creating a large startup/RSS spike. The
     * snapshot store's bounded tail reader preserves the same crash-tolerant
     * newest-valid-record semantics without loading the complete journal.
     */
    const restored =
      this.store
        .readLatest();

    if (restored) {
      this.haltedReason =
        restored.haltedReason;
      this.attempts =
        restored.attempts
          .map(
            clone,
          );

      for (
        const attempt
        of this.attempts
      ) {
        this.attemptedOpportunityIds.add(
          attempt.opportunityId,
        );
        this.routeLastAttemptAt.set(
          attempt.routeKey,
          Math.max(
            this.routeLastAttemptAt.get(
              attempt.routeKey,
            ) ??
              0,
            attempt.startedAt,
          ),
        );
      }
    }
  }

  start(): void {
    if (
      this.unsubscribe ||
      !this.dependencies
        .runtimeEnabled()
    ) {
      return;
    }

    this.unsubscribe =
      this.dependencies
        .subscribe(
          (
            snapshot,
          ) => {
            void this
              .observeSnapshot(
                snapshot,
              )
              .catch(
                (
                  error:
                    unknown,
                ) => {
                  this.haltedReason =
                    `LIVE-only runner failure: ${message(error)}`;
                  this.persist(
                    Date.now(),
                  );
                  console.error(
                    "[LIVE-only Runner] Halted:",
                    this.haltedReason,
                  );
                },
              );
          },
        );
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe =
      null;
  }

  releaseAuthoritativelyResolvedRecoveryHalt(
    sessionIdValue: string,
    now = this.dependencies.now(),
  ): boolean {
    const sessionId = sessionIdValue.trim();

    if (!this.dependencies.runtimeEnabled()) {
      return false;
    }

    if (!sessionId) {
      throw new Error(
        "An exact resolved recovery session is required before releasing the LIVE-only halt.",
      );
    }

    if (this.haltedReason === null) {
      return true;
    }

    const recovery = this.dependencies.getRecoveryClearance(now);
    const safeToRelease =
      this.unsubscribe !== null &&
      !this.inFlight &&
      this.haltedReason.includes("RECOVERY_REQUIRED") &&
      recovery.classification === "CLEAN" &&
      recovery.allowNewLivePreparation &&
      recovery.summary.unresolvedSessions === 0 &&
      recovery.summary.possibleExposureSessions === 0 &&
      recovery.summary.persistenceIntegrityProblems === 0;

    if (!safeToRelease) {
      throw new Error(
        `LIVE-only recovery halt remains locked for ${sessionId}; the runner is not idle or authoritative recovery is not completely clean.`,
      );
    }

    this.haltedReason = null;
    this.persist(now);
    return true;
  }

  getDiagnostics(
    now =
      this.dependencies
        .now(),
  ) {
    const policy =
      this.dependencies
        .getPolicy();

    return freeze({
      schemaVersion:
        "1.0" as const,
      generatedAt:
        now,
      runtimeEnabled:
        this.dependencies
          .runtimeEnabled(),
      running:
        this.unsubscribe !==
        null,
      inFlight:
        this.inFlight,
      halted:
        this.haltedReason !==
        null,
      haltedReason:
        this.haltedReason,
      snapshotsObserved:
        this.snapshotsObserved,
      candidatesObserved:
        this.candidatesObserved,
      preflightBlocks:
        this.preflightBlocks,
      attempts:
        this.attempts.length,
      completed:
        this.attempts.filter(
          (
            attempt,
          ) =>
            attempt.status ===
              "COMPLETED",
        ).length,
      policy,
      recentAttempts:
        this.attempts
          .slice(
            -20,
          )
          .reverse()
          .map(
            clone,
          ),
      authority:
        strategyOneLiveOnlyAuthorityService
          .getDiagnostics(
            now,
          ),
      safety: {
        paperReadinessRequired:
          false,
        shadowReadinessRequired:
          false,
        tinyLiveArmRequired:
          false,
        accountModeLeaseRequired:
          false,
        freshExactPreflightRequired:
          true,
        finalOrderTimeLastLookRequired:
          true,
        oneConcurrentTrade:
          true,
        sameOpportunityRetryAllowed:
          false,
        haltOnPossibleExposure:
          true,
      },
    });
  }

  async observeSnapshot(
    snapshot:
      OpportunitySnapshot,
  ): Promise<void> {
    this.snapshotsObserved +=
      1;

    if (
      this.inFlight ||
      this.haltedReason ||
      !this.dependencies
        .runtimeEnabled()
    ) {
      return;
    }

    const now =
      this.dependencies
        .now();
    const policy =
      this.dependencies
        .getPolicy();
    const candidates =
      snapshot.opportunities
        .filter(
          (
            opportunity,
          ) =>
            this.isEligible(
              opportunity,
              now,
              policy,
            ),
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.netProfitPercent -
            first.netProfitPercent,
        );

    this.candidatesObserved +=
      candidates.length;

    const candidate =
      candidates[0];

    if (!candidate) {
      return;
    }

    const routeKey =
      this.routeKey(
        candidate,
      );
    this.inFlight =
      true;
    this.attemptedOpportunityIds.add(
      candidate.id,
    );
    this.routeLastAttemptAt.set(
      routeKey,
      now,
    );

    let authorityId:
      string | null =
      null;
    let actionCandidate =
      candidate;

    try {
      let refresh:
        StrategyOneActionTimeBookRefreshResult;

      try {
        refresh =
          await this.dependencies
            .refreshActionCandidate(
              actionTimeRefreshRequest(
                candidate,
              ),
            );
      } catch (
        error:
          unknown
      ) {
        this.preflightBlocks +=
          1;
        this.record({
          opportunity:
            candidate,
          routeKey,
          startedAt:
            now,
          completedAt:
            this.dependencies
              .now(),
          authorityId:
            null,
          status:
            "AUTHORIZATION_BLOCKED",
          orderSubmissionMayHaveOccurred:
            false,
          recoveryRequired:
            false,
          possibleExposure:
            false,
          reason:
            `ACTION_TIME_BOOK_REFRESH: ${message(error)}`,
        });

        return;
      }

      if (
        refresh.state !==
          "REFRESHED" ||
        !refresh.opportunity ||
        this.routeKey(
          refresh.opportunity,
        ) !==
          routeKey
      ) {
        this.preflightBlocks +=
          1;
        this.record({
          opportunity:
            candidate,
          routeKey,
          startedAt:
            now,
          completedAt:
            this.dependencies
              .now(),
          authorityId:
            null,
          status:
            "AUTHORIZATION_BLOCKED",
          orderSubmissionMayHaveOccurred:
            false,
          recoveryRequired:
            false,
          possibleExposure:
            false,
          reason:
            `ACTION_TIME_BOOK_REFRESH: ${refresh.blocker ?? "Fresh exact-route opportunity is unavailable."}`,
        });

        return;
      }

      actionCandidate =
        refresh.opportunity;
      this.attemptedOpportunityIds
        .add(
          actionCandidate.id,
        );

      try {
        const authorizationTime =
          this.dependencies
            .now();

        authorityId =
          this.dependencies
            .authorize(
              actionCandidate.id,
              authorizationTime,
            )
            .id;
      } catch (
        error:
          unknown
      ) {
        this.preflightBlocks +=
          1;
        this.record({
          opportunity:
            actionCandidate,
          routeKey,
          startedAt:
            now,
          completedAt:
            this.dependencies
              .now(),
          authorityId:
            null,
          status:
            "AUTHORIZATION_BLOCKED",
          orderSubmissionMayHaveOccurred:
            false,
          recoveryRequired:
            false,
          possibleExposure:
            false,
          reason:
            message(
              error,
            ),
        });

        return;
      }

      let finalBookRefresh:
        StrategyOneAuthorizedFinalBookRefreshResult;

      try {
        finalBookRefresh =
          await this.dependencies
            .refreshAuthorizedFinalBooks({
              market:
                actionCandidate.pair.market,
              buyExchange:
                actionCandidate.pair.buy.exchange,
              sellExchange:
                actionCandidate.pair.sell.exchange,
            });
      } catch (
        error:
          unknown
      ) {
        this.preflightBlocks +=
          1;
        this.record({
          opportunity:
            actionCandidate,
          routeKey,
          startedAt:
            now,
          completedAt:
            this.dependencies
              .now(),
          authorityId,
          status:
            "AUTHORIZATION_BLOCKED",
          orderSubmissionMayHaveOccurred:
            false,
          recoveryRequired:
            false,
          possibleExposure:
            false,
          reason:
            `AUTHORIZED_FINAL_BOOK_REFRESH: ${message(error)}`,
        });

        return;
      }

      if (
        finalBookRefresh.state !==
          "REFRESHED"
      ) {
        this.preflightBlocks +=
          1;
        this.record({
          opportunity:
            actionCandidate,
          routeKey,
          startedAt:
            now,
          completedAt:
            this.dependencies
              .now(),
          authorityId,
          status:
            "AUTHORIZATION_BLOCKED",
          orderSubmissionMayHaveOccurred:
            false,
          recoveryRequired:
            false,
          possibleExposure:
            false,
          reason:
            `AUTHORIZED_FINAL_BOOK_REFRESH: ${finalBookRefresh.blocker ?? "Fresh public depth is unavailable."}`,
        });

        return;
      }

      const result =
        await this.dependencies
          .execute(
            actionCandidate,
            authorityId,
          );
      const possibleExposure =
        result.possibleExposure ===
          true;

      this.record({
        opportunity:
          actionCandidate,
        routeKey,
        startedAt:
          now,
        completedAt:
          result.completedAt,
        authorityId,
        status:
          result.status,
        orderSubmissionMayHaveOccurred:
          result.buyResult !==
            null ||
          result.sellResult !==
            null,
        recoveryRequired:
          result.recoveryRequired,
        possibleExposure,
        reason:
          result.reasons[0] ??
          result.status,
      });

      if (
        result.recoveryRequired ||
        possibleExposure ||
        result.status ===
          "PARTIALLY_COMPLETED" ||
        result.status ===
          "FAILED"
      ) {
        this.haltedReason =
          `LIVE-only execution halted after ${result.status}: ${result.reasons.join(" | ")}`;
        this.persist(
          this.dependencies
            .now(),
        );
      }
    } finally {
      this.inFlight =
        false;
    }
  }

  private isEligible(
    opportunity:
      ArbitrageOpportunity,
    now:
      number,
    policy:
      ReturnType<typeof getLiveOnlyRuntimePolicy>,
  ): boolean {
    const routeKey =
      this.routeKey(
        opportunity,
      );
    const lastAttemptAt =
      this.routeLastAttemptAt
        .get(
          routeKey,
        ) ??
      0;
    const ageMs =
      now -
      opportunity.timestamp;
    const capitalStudy =
      this.dependencies
        .getCapitalStudyDecision(
          opportunity,
          now,
        );

    const baseAsset =
      extractBaseAsset(
        opportunity.pair.market,
      );

    return opportunity.decision ===
        "EXECUTE" &&
      isStrategyOneTinyLiveDynamicRoute({
        market:
          opportunity.pair.market,
        buyExchange:
          opportunity.pair.buy.exchange,
        sellExchange:
          opportunity.pair.sell.exchange,
      }) &&
      baseAsset !==
        null &&
      this.dependencies
        .isBaseAssetPreFundable(
          baseAsset,
          now,
        ) &&
      opportunity.quotesAreFresh &&
      !opportunity.usedLastPriceFallback &&
      capitalStudy.executionQualified &&
      opportunity.netProfitPercent >=
        capitalStudy.effectiveMinimumCurrentNetProfitPercent &&
      ageMs >=
        0 &&
      ageMs <=
        policy.maximumOpportunityAgeMs &&
      !this.attemptedOpportunityIds.has(
        opportunity.id,
      ) &&
      now -
        lastAttemptAt >=
        policy.routeCooldownMs;
  }

  private routeKey(
    opportunity:
      ArbitrageOpportunity,
  ): string {
    return [
      opportunity.pair.market
        .trim()
        .toUpperCase(),
      opportunity.pair.buy.exchange
        .trim()
        .toLowerCase(),
      opportunity.pair.sell.exchange
        .trim()
        .toLowerCase(),
    ].join(
      "|",
    );
  }

  private record(input: {
    readonly opportunity: ArbitrageOpportunity;
    readonly routeKey: string;
    readonly startedAt: number;
    readonly completedAt: number;
    readonly authorityId: string | null;
    readonly status: StrategyOneLiveOnlyAttempt["status"];
    readonly orderSubmissionMayHaveOccurred: boolean;
    readonly recoveryRequired: boolean;
    readonly possibleExposure: boolean;
    readonly reason: string;
  }): void {
    this.attempts.push(
      freeze({
        opportunityId:
          input.opportunity.id,
        routeKey:
          input.routeKey,
        market:
          input.opportunity.pair.market,
        buyExchange:
          input.opportunity.pair.buy.exchange,
        sellExchange:
          input.opportunity.pair.sell.exchange,
        netProfitPercent:
          input.opportunity.netProfitPercent,
        startedAt:
          input.startedAt,
        completedAt:
          input.completedAt,
        authorityId:
          input.authorityId,
        status:
          input.status,
        orderSubmissionMayHaveOccurred:
          input.orderSubmissionMayHaveOccurred,
        recoveryRequired:
          input.recoveryRequired,
        possibleExposure:
          input.possibleExposure,
        reason:
          input.reason,
      }),
    );

    this.attempts =
      this.attempts.slice(
        -MAXIMUM_ATTEMPT_HISTORY,
      );

    this.persist(
      input.completedAt,
    );
  }

  private persist(
    now:
      number,
  ): void {
    this.store.append({
      schemaVersion:
        "1.0",
      savedAt:
        now,
      haltedReason:
        this.haltedReason,
      attempts:
        this.attempts.map(
          clone,
        ),
    });
  }
}

/**
 * Rebuild the exact route from bounded public depth immediately before LIVE
 * authorization. The refresh service validates and republishes both books;
 * these timestamps are evidence floors only and are never fabricated.
 */
function actionTimeRefreshRequest(
  candidate:
    ArbitrageOpportunity,
): StrategyOneActionTimeBookRefreshRoute {
  const buyExchange =
    candidate.pair.buy.exchange
      .trim()
      .toLowerCase();
  const sellExchange =
    candidate.pair.sell.exchange
      .trim()
      .toLowerCase();

  return {
    market:
      candidate.pair.market
        .trim()
        .toUpperCase(),
    buyExchange,
    sellExchange,
    refreshExchanges: [
      buyExchange,
      sellExchange,
    ],
    minimumBuyTimestamp:
      candidate.pair.buy.timestamp,
    minimumSellTimestamp:
      candidate.pair.sell.timestamp,
    purpose:
      "live",
  };
}

function isSnapshot(
  value:
    unknown,
): value is PersistedSnapshot {
  if (
    typeof value !==
      "object" ||
    value ===
      null
  ) {
    return false;
  }

  const snapshot =
    value as Partial<PersistedSnapshot>;

  return snapshot.schemaVersion ===
      "1.0" &&
    Number.isSafeInteger(
      snapshot.savedAt,
    ) &&
    (
      snapshot.haltedReason ===
        null ||
      typeof snapshot.haltedReason ===
        "string"
    ) &&
    Array.isArray(
      snapshot.attempts,
    );
}

function message(
  error:
    unknown,
): string {
  return error instanceof Error
    ? error.message
    : "Unknown LIVE-only runner failure.";
}

function clone<T>(
  value:
    T,
): T {
  return structuredClone(
    value,
  );
}

function freeze<T>(
  value:
    T,
): T {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Object.isFrozen(
      value,
    )
  ) {
    return value;
  }

  for (
    const child
    of Object.values(
      value,
    )
  ) {
    freeze(
      child,
    );
  }

  return Object.freeze(
    value,
  );
}

export const strategyOneLiveOnlyRunnerService =
  new StrategyOneLiveOnlyRunnerService();
