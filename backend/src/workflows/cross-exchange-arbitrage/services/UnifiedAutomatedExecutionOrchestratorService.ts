import type {
  ExecutionCandidateQueueItem,
} from "../../../automation/models/ExecutionCandidateQueue";

import type {
  MultiOpportunityPaperBatchResult,
} from "../../../automation/models/MultiOpportunityPaperScheduler";

import type {
  ShadowDispatchBatchResult,
} from "../../../automation/models/ShadowExecutionDispatcher";

import type {
  UnifiedAutomatedExecutionCycleResult,
  UnifiedAutomatedExecutionDiagnostics,
  UnifiedAutomatedExecutionMode,
  UnifiedAutomatedExecutionRejection,
} from "../models/UnifiedAutomatedExecution";

import {
  tradingAccountService,
} from "../../../trading/account/TradingAccountService";

import {
  automatedPaperExecutionControllerService,
} from "../../../automation/services/AutomatedPaperExecutionControllerService";

import {
  executionCandidateQueueService,
} from "../../../automation/services/ExecutionCandidateQueueService";

import {
  multiOpportunityPaperSchedulerService,
} from "../../../automation/services/MultiOpportunityPaperSchedulerService";

import {
  shadowExecutionDispatcherService,
} from "../../../automation/services/ShadowExecutionDispatcherService";

import {
  strategyOnePaperRuntimeAcceptanceService,
} from "./StrategyOnePaperRuntimeAcceptanceService";

const STRATEGY_ID =
  "cross-exchange-arbitrage" as const;

const MAXIMUM_COMPLETED_GENERATION_CLAIMS =
  5_000;

export interface UnifiedAutomatedExecutionControlState {
  accountEnabled: boolean;
  emergencyStop: boolean;
  accountMode: string;
  paperExecutionAllowed: boolean;
}

/**
 * Keep collecting genuine SHADOW evidence until the complete PAPER admission
 * gate passes. Operator arming alone must not switch the single execution
 * owner to PAPER because the PAPER scheduler then rejects every candidate and
 * no further SHADOW outcomes can be produced.
 */
export function resolveUnifiedAutomatedExecutionMode(
  state:
    UnifiedAutomatedExecutionControlState,
): UnifiedAutomatedExecutionMode {
  if (
    !state.accountEnabled ||
    state.emergencyStop
  ) {
    return "DISABLED";
  }

  if (
    state.accountMode !==
    "PAPER"
  ) {
    return "LIVE_BLOCKED";
  }

  return state.paperExecutionAllowed
    ? "PAPER"
    : "SHADOW";
}

export interface UnifiedAutomatedExecutionQueue {
  getReadyItems(
    now?: number,
  ): ExecutionCandidateQueueItem[];

  cancel(
    id: string,
    reason?: string,
  ): ExecutionCandidateQueueItem;

  consume(
    id: string,
    reason?: string,
  ): ExecutionCandidateQueueItem;
}

export interface UnifiedAutomatedExecutionShadowDispatcher {
  dispatchAvailable(
    allowedCandidateKeys?: ReadonlySet<string>,
  ): ShadowDispatchBatchResult;
}

export interface UnifiedAutomatedExecutionPaperScheduler {
  run(
    now?: number,
    allowedCandidateKeys?: ReadonlySet<string>,
  ): Promise<MultiOpportunityPaperBatchResult>;
}

export interface UnifiedAutomatedExecutionAcceptanceRecorder {
  capture(
    cycle:
      UnifiedAutomatedExecutionCycleResult,
  ): unknown;
}

export interface UnifiedAutomatedExecutionDependencies {
  queue: UnifiedAutomatedExecutionQueue;
  shadowDispatcher: UnifiedAutomatedExecutionShadowDispatcher;
  paperScheduler: UnifiedAutomatedExecutionPaperScheduler;
  acceptanceRecorder:
    UnifiedAutomatedExecutionAcceptanceRecorder;
  resolveMode(): UnifiedAutomatedExecutionMode;
}

const DEFAULT_DEPENDENCIES:
  UnifiedAutomatedExecutionDependencies = {
  queue:
    executionCandidateQueueService,

  shadowDispatcher:
    shadowExecutionDispatcherService,

  paperScheduler:
    multiOpportunityPaperSchedulerService,

  acceptanceRecorder:
    strategyOnePaperRuntimeAcceptanceService,

  resolveMode:
    () => {
      const account =
        tradingAccountService
          .getAccount();

      const paperController =
        automatedPaperExecutionControllerService
          .getDiagnostics();

      return resolveUnifiedAutomatedExecutionMode({
        accountEnabled:
          account.enabled,
        emergencyStop:
          account.emergencyStop,
        accountMode:
          account.mode,
        paperExecutionAllowed:
          paperController
            .paperExecutionAllowed,
      });
    },
};

/**
 * The single automated execution owner for Strategy #1.
 *
 * Candidate discovery and qualification stay in their existing services.
 * This service owns the transition from a qualified, attributed candidate
 * into exactly one configured execution mode. Strategies never receive an
 * exchange-order method, and LIVE is deliberately not dispatched here.
 */
export class UnifiedAutomatedExecutionOrchestratorService {
  private readonly dependencies:
    UnifiedAutomatedExecutionDependencies;

  private readonly activeRouteLocks =
    new Set<string>();

  private readonly completedGenerationClaims =
    new Set<string>();

  private runningCycle =
    false;

  private totalCycles =
    0;

  private shadowCycles =
    0;

  private paperCycles =
    0;

  private disabledCycles =
    0;

  private liveBlockedCycles =
    0;

  private ownershipRejectionCount =
    0;

  private duplicateRejectionCount =
    0;

  private lastCycle:
    UnifiedAutomatedExecutionCycleResult | null =
    null;

  constructor(
    dependencies:
      Partial<UnifiedAutomatedExecutionDependencies> = {},
  ) {
    this.dependencies = {
      ...DEFAULT_DEPENDENCIES,
      ...dependencies,
    };
  }

  async run(
    now =
      Date.now(),
  ): Promise<UnifiedAutomatedExecutionCycleResult> {
    const mode =
      this.resolveSafeMode();

    if (
      this.runningCycle
    ) {
      return this.createResult({
        cycleId:
          this.totalCycles,
        startedAt:
          now,
        mode,
        status:
          "CYCLE_IN_PROGRESS",
        readyCandidates:
          0,
        ownedCandidates:
          0,
        routeLocksAcquired:
          0,
        ownershipRejections:
          [],
        duplicateRejections:
          [],
        shadow:
          null,
        paper:
          null,
        reasons: [
          "Another unified automated execution cycle is already running.",
        ],
      });
    }

    this.runningCycle =
      true;

    this.totalCycles +=
      1;

    const cycleId =
      this.totalCycles;

    const startedAt =
      now;

    const acquiredRoutes:
      string[] =
      [];

    try {
      if (
        mode ===
        "DISABLED"
      ) {
        this.disabledCycles +=
          1;

        return this.complete({
          cycleId,
          startedAt,
          mode,
          status:
            "DISABLED",
          readyCandidates:
            0,
          ownedCandidates:
            0,
          routeLocksAcquired:
            0,
          ownershipRejections:
            [],
          duplicateRejections:
            [],
          shadow:
            null,
          paper:
            null,
          reasons: [
            "Automated execution is disabled by the trading-account runtime safety state.",
          ],
        });
      }

      if (
        mode ===
          "LIVE_BLOCKED" ||
        mode ===
          "LIVE_ELIGIBLE" ||
        mode ===
          "LIVE"
      ) {
        this.liveBlockedCycles +=
          1;

        return this.complete({
          cycleId,
          startedAt,
          mode:
            "LIVE_BLOCKED",
          status:
            "LIVE_BLOCKED",
          readyCandidates:
            0,
          ownedCandidates:
            0,
          routeLocksAcquired:
            0,
          ownershipRejections:
            [],
          duplicateRejections:
            [],
          shadow:
            null,
          paper:
            null,
          reasons: [
            "The unified orchestrator has no LIVE submission branch; controlled LIVE remains fail-closed.",
          ],
        });
      }

      const readyItems =
        this.dependencies
          .queue
          .getReadyItems(
            now,
          );

      const ownershipRejections:
        UnifiedAutomatedExecutionRejection[] =
        [];

      const duplicateRejections:
        UnifiedAutomatedExecutionRejection[] =
        [];

      const ownedItems:
        ExecutionCandidateQueueItem[] =
        [];

      for (
        const item
        of readyItems
      ) {
        if (
          !this.isOwnedByStrategyOne(
            item,
          )
        ) {
          const reason =
            "Qualified candidate was rejected because exact Strategy #1 signal ownership is missing or mismatched.";

          this.dependencies
            .queue
            .cancel(
              item.id,
              reason,
            );

          ownershipRejections.push({
            queueItemId:
              item.id,
            candidateKey:
              item.candidateKey,
            reason,
          });

          continue;
        }

        const generationClaim =
          this.createGenerationClaim(
            mode,
            item,
          );

        if (
          this.activeRouteLocks
            .has(
              item.candidateKey,
            ) ||
          this.completedGenerationClaims
            .has(
              generationClaim,
            )
        ) {
          const reason =
            this.activeRouteLocks
              .has(
                item.candidateKey,
              )
              ? "Candidate route is already owned by an active execution cycle."
              : `This continuous candidate generation was already handled in ${mode} mode.`;

          if (
            !this.activeRouteLocks
              .has(
                item.candidateKey,
              )
          ) {
            this.dependencies
              .queue
              .consume(
                item.id,
                reason,
              );
          }

          duplicateRejections.push({
            queueItemId:
              item.id,
            candidateKey:
              item.candidateKey,
            reason,
          });

          continue;
        }

        this.activeRouteLocks
          .add(
            item.candidateKey,
          );

        acquiredRoutes.push(
          item.candidateKey,
        );

        ownedItems.push(
          item,
        );
      }

      this.ownershipRejectionCount +=
        ownershipRejections.length;

      this.duplicateRejectionCount +=
        duplicateRejections.length;

      if (
        ownedItems.length ===
        0
      ) {
        return this.complete({
          cycleId,
          startedAt,
          mode,
          status:
            "NO_OWNED_CANDIDATE",
          readyCandidates:
            readyItems.length,
          ownedCandidates:
            0,
          routeLocksAcquired:
            0,
          ownershipRejections,
          duplicateRejections,
          shadow:
            null,
          paper:
            null,
          reasons: [
            "No READY candidate remained after central ownership, deduplication, and route-lock checks.",
          ],
        });
      }

      const allowedCandidateKeys =
        new Set(
          ownedItems.map(
            (
              item,
            ) =>
              item.candidateKey,
          ),
        );

      if (
        mode ===
        "SHADOW"
      ) {
        this.shadowCycles +=
          1;

        const shadow =
          this.dependencies
            .shadowDispatcher
            .dispatchAvailable(
              allowedCandidateKeys,
            );

        const handledKeys =
          new Set(
            shadow.records
              .filter(
                (
                  record,
                ) =>
                  record.status ===
                    "SHADOW_DISPATCHED" ||
                  record.status ===
                    "DUPLICATE_SUPPRESSED",
              )
              .map(
                (
                  record,
                ) =>
                  record.candidateKey,
              ),
          );

        this.claimHandledGenerations(
          mode,
          ownedItems,
          handledKeys,
        );

        return this.complete({
          cycleId,
          startedAt,
          mode,
          status:
            shadow.dispatched >
              0
              ? "DISPATCHED"
              : "REJECTED",
          readyCandidates:
            readyItems.length,
          ownedCandidates:
            ownedItems.length,
          routeLocksAcquired:
            acquiredRoutes.length,
          ownershipRejections,
          duplicateRejections,
          shadow,
          paper:
            null,
          reasons: [
            "Strategy #1 candidates were routed through the central SHADOW execution owner.",
            "SHADOW dispatch did not reserve capital or submit an exchange order.",
          ],
        });
      }

      this.paperCycles +=
        1;

      const paper =
        await this.dependencies
          .paperScheduler
          .run(
            now,
            allowedCandidateKeys,
          );

      const attemptedKeys =
        new Set(
          paper.executions
            .filter(
              (
                execution,
              ) =>
                execution.result.status ===
                  "EXECUTED" ||
                execution.result.status ===
                  "EXECUTION_REJECTED",
            )
            .map(
              (
                execution,
              ) =>
                execution.candidateKey,
            ),
        );

      this.claimHandledGenerations(
        mode,
        ownedItems,
        attemptedKeys,
      );

      for (
        const item
        of ownedItems
      ) {
        if (
          !attemptedKeys.has(
            item.candidateKey,
          )
        ) {
          continue;
        }

        this.dependencies
          .queue
          .consume(
            item.id,
            "Candidate generation was consumed by the unified PAPER execution owner.",
          );
      }

      return this.complete({
        cycleId,
        startedAt,
        mode,
        status:
          paper.executed >
            0
            ? "DISPATCHED"
            : "REJECTED",
        readyCandidates:
          readyItems.length,
        ownedCandidates:
          ownedItems.length,
        routeLocksAcquired:
          acquiredRoutes.length,
        ownershipRejections,
        duplicateRejections,
        shadow:
          null,
        paper,
        reasons: [
          "Strategy #1 candidates were routed through the central PAPER execution owner.",
          "Existing PAPER readiness, capital arbitration, last-look, risk, market-rule, reservation, settlement, and attribution gates remained authoritative.",
          "No LIVE exchange-order path was reachable.",
        ],
      });
    } catch (
      error:
        unknown
    ) {
      return this.complete({
        cycleId,
        startedAt,
        mode,
        status:
          "FAILED",
        readyCandidates:
          0,
        ownedCandidates:
          0,
        routeLocksAcquired:
          acquiredRoutes.length,
        ownershipRejections:
          [],
        duplicateRejections:
          [],
        shadow:
          null,
        paper:
          null,
        reasons: [
          error instanceof Error
            ? error.message
            : "Unknown unified automated execution error.",
        ],
      });
    } finally {
      for (
        const route
        of acquiredRoutes
      ) {
        this.activeRouteLocks
          .delete(
            route,
          );
      }

      this.runningCycle =
        false;
    }
  }

  getDiagnostics():
    UnifiedAutomatedExecutionDiagnostics {
    return {
      generatedAt:
        Date.now(),
      strategyId:
        STRATEGY_ID,
      mode:
        this.resolveSafeMode(),
      runningCycle:
        this.runningCycle,
      totalCycles:
        this.totalCycles,
      shadowCycles:
        this.shadowCycles,
      paperCycles:
        this.paperCycles,
      disabledCycles:
        this.disabledCycles,
      liveBlockedCycles:
        this.liveBlockedCycles,
      ownershipRejections:
        this.ownershipRejectionCount,
      duplicateRejections:
        this.duplicateRejectionCount,
      completedGenerationClaims:
        this.completedGenerationClaims
          .size,
      activeRouteLocks:
        [
          ...this.activeRouteLocks,
        ].sort(),
      lastCycle:
        this.lastCycle
          ? structuredClone(
              this.lastCycle,
            )
          : null,
      liveExecutionAllowed:
        false,
      liveOrderSubmissionAllowed:
        false,
    };
  }

  private isOwnedByStrategyOne(
    item:
      ExecutionCandidateQueueItem,
  ): boolean {
    const attribution =
      item.strategyAttribution;

    return (
      attribution.attributionStatus ===
        "ATTRIBUTED" &&
      attribution.strategyId ===
        STRATEGY_ID &&
      attribution.signalId
        .trim()
        .length >
        0 &&
      item.qualification
        .candidate
        .strategyAttribution
        .attributionStatus ===
        "ATTRIBUTED" &&
      item.qualification
        .candidate
        .strategyAttribution
        .strategyId ===
        STRATEGY_ID &&
      item.qualification
        .candidate
        .strategyAttribution
        .signalId ===
        attribution.signalId
    );
  }

  private createGenerationClaim(
    mode:
      UnifiedAutomatedExecutionMode,

    item:
      ExecutionCandidateQueueItem,
  ): string {
    const candidate =
      item.qualification
        .candidate;

    return [
      mode,
      item.candidateKey,
      candidate.firstSeenAt,
      candidate.reappearances,
    ].join(
      ":",
    );
  }

  private claimHandledGenerations(
    mode:
      UnifiedAutomatedExecutionMode,

    items:
      readonly ExecutionCandidateQueueItem[],

    handledKeys:
      ReadonlySet<string>,
  ): void {
    for (
      const item
      of items
    ) {
      if (
        handledKeys.has(
          item.candidateKey,
        )
      ) {
        this.completedGenerationClaims
          .add(
            this.createGenerationClaim(
              mode,
              item,
            ),
          );

        while (
          this.completedGenerationClaims
            .size >
          MAXIMUM_COMPLETED_GENERATION_CLAIMS
        ) {
          const oldest =
            this.completedGenerationClaims
              .values()
              .next()
              .value;

          if (
            typeof oldest !==
            "string"
          ) {
            break;
          }

          this.completedGenerationClaims
            .delete(
              oldest,
            );
        }
      }
    }
  }

  private resolveSafeMode():
    UnifiedAutomatedExecutionMode {
    try {
      return this.dependencies
        .resolveMode();
    } catch {
      return "DISABLED";
    }
  }

  private complete(
    input:
      Omit<
        UnifiedAutomatedExecutionCycleResult,
        "completedAt" |
        "durationMs" |
        "strategyId" |
        "liveExecutionAllowed" |
        "liveOrderSubmissionAllowed" |
        "exchangeOrdersSubmitted"
      >,
  ): UnifiedAutomatedExecutionCycleResult {
    const result =
      this.createResult(
        input,
      );

    this.lastCycle =
      structuredClone(
        result,
      );

    try {
      this.dependencies
        .acceptanceRecorder
        .capture(
          result,
        );
    } catch (
      error:
        unknown
    ) {
      result.reasons.push(
        error instanceof Error
          ? `PAPER runtime acceptance evidence failed: ${error.message}`
          : "PAPER runtime acceptance evidence failed with an unknown error.",
      );

      this.lastCycle =
        structuredClone(
          result,
        );
    }

    return result;
  }

  private createResult(
    input:
      Omit<
        UnifiedAutomatedExecutionCycleResult,
        "completedAt" |
        "durationMs" |
        "strategyId" |
        "liveExecutionAllowed" |
        "liveOrderSubmissionAllowed" |
        "exchangeOrdersSubmitted"
      >,
  ): UnifiedAutomatedExecutionCycleResult {
    const completedAt =
      Date.now();

    return {
      ...input,
      completedAt,
      durationMs:
        Math.max(
          0,
          completedAt -
            input.startedAt,
        ),
      strategyId:
        STRATEGY_ID,
      liveExecutionAllowed:
        false,
      liveOrderSubmissionAllowed:
        false,
      exchangeOrdersSubmitted:
        0,
      ownershipRejections:
        structuredClone(
          input.ownershipRejections,
        ),
      duplicateRejections:
        structuredClone(
          input.duplicateRejections,
        ),
      shadow:
        input.shadow
          ? structuredClone(
              input.shadow,
            )
          : null,
      paper:
        input.paper
          ? structuredClone(
              input.paper,
            )
          : null,
      reasons:
        [
          ...new Set(
            input.reasons,
          ),
        ],
    };
  }
}

export const unifiedAutomatedExecutionOrchestratorService =
  new UnifiedAutomatedExecutionOrchestratorService();
