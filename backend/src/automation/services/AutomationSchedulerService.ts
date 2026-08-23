import {
  opportunityService,
} from "../../arbitrage/services/OpportunityService";

import type {
  OpportunitySnapshot,
  OpportunitySnapshotListener,
} from "../../arbitrage/services/OpportunityService";

import type {
  ArbitrageOpportunity,
} from "../../arbitrage/models/ArbitrageOpportunity";

import type {
  AutomationCycleResult,
  AutomationLatencyDistribution,
  AutomationObservedOpportunity,
  AutomationSchedulerDiagnostics,
} from "../models/AutomationScheduler";

import {
  candidateEvidenceAccumulatorService,
} from "./CandidateEvidenceAccumulatorService";

import {
  capitalAwareQualificationEvidenceService,
} from "./CapitalAwareQualificationEvidenceService";

import {
  candidateQualificationService,
} from "./CandidateQualificationService";

import {
  executionCandidateQueueService,
} from "./ExecutionCandidateQueueService";

import {
  opportunityMonitorService,
} from "./OpportunityMonitorService";

import {
  paperAutomationAccountingService,
} from "./PaperAutomationAccountingService";

import {
  shadowLearningEvidenceArchiveService,
} from "./ShadowLearningEvidenceArchiveService";

import {
  shadowTradeOutcomeTrackerService,
} from "./ShadowTradeOutcomeTrackerService";

import {
  strategyAttributionService,
  hedgeInventoryManagementStrategyController,
} from "../../strategies/bootstrap/StrategyBootstrap";

import {
  hedgeInventorySharedRecoveryBridgeService,
} from "../../recovery/adapters/HedgeInventorySharedRecoveryBridgeService";

import {
  unifiedAutomatedExecutionOrchestratorService,
} from "../../workflows/cross-exchange-arbitrage/services/UnifiedAutomatedExecutionOrchestratorService";

import {
  strategyOneExecutionTimingEvidenceService,
} from "../../arbitrage/execution/StrategyOneExecutionTimingEvidenceService";

import {
  strategyOnePilotEquivalentPaperEvidenceService,
} from "../../arbitrage/execution/StrategyOnePilotEquivalentPaperEvidenceService";

import {
  strategyOneTinyLivePreArmService,
} from "../../execution/live/tiny-live/StrategyOneTinyLivePreArmService";

export interface AutomationSchedulerConfig {
  intervalMs: number;

  maximumSnapshotAgeMs: number;

  runImmediately: boolean;
}

const DEFAULT_CONFIG:
  AutomationSchedulerConfig = {
  intervalMs:
    2_000,

  maximumSnapshotAgeMs:
    7_500,

  runImmediately:
  true,
};

const MAXIMUM_PENDING_SNAPSHOT_EVENTS =
  64;

const LATENCY_SAMPLE_CAPACITY =
  512;

const SHADOW_ARCHIVE_CAPTURE_INTERVAL_MS =
  1_000;

export interface AutomationOpportunitySnapshotSource {
  getLastOpportunitySnapshot():
    OpportunitySnapshot | null;

  subscribeToOpportunitySnapshots(
    listener:
      OpportunitySnapshotListener,
  ): () => void;
}

export interface AutomationSchedulerDependencies {
  opportunitySource?:
    AutomationOpportunitySnapshotSource;

  processSnapshot?: (
    snapshot:
      OpportunitySnapshot,
  ) => Promise<void> | void;
}

export class AutomationSchedulerService {
  private readonly config:
    AutomationSchedulerConfig;

  private readonly opportunitySource:
    AutomationOpportunitySnapshotSource;

  private readonly processSnapshot:
    (
      snapshot:
        OpportunitySnapshot,
    ) => Promise<void>;

  private timer:
    NodeJS.Timeout | null =
    null;

  private running =
    false;

  private cycleInProgress =
    false;

  private snapshotDrainInProgress =
    false;

  private snapshotDrainImmediate:
    NodeJS.Immediate | null =
    null;

  private unsubscribeFromSnapshots:
    (() => void) | null =
    null;

  private readonly pendingSnapshots:
    OpportunitySnapshot[] =
    [];

  private totalCycles =
    0;

  private completedCycles =
    0;

  private skippedOverlappingCycles =
    0;

  private snapshotEventsReceived =
    0;

  private eventTriggeredCycles =
    0;

  private droppedSnapshotEvents =
    0;

  private droppedEmptySnapshotEvents =
    0;

  private droppedCandidateSnapshotEvents =
    0;

  private coalescedEmptySnapshotEvents =
    0;

  private coalescedCandidateSnapshotEvents =
    0;

  private pendingSnapshotHighWaterMark =
    0;

  private cyclesWithOpportunity =
    0;

  private cyclesWithoutOpportunity =
    0;

  private staleSnapshotCycles =
    0;

  private missingSnapshotCycles =
    0;

  private lastStartedAt:
    number | null =
    null;

  private lastCompletedAt:
    number | null =
    null;

  private lastSuccessfulAt:
    number | null =
    null;

  private lastFailedAt:
    number | null =
    null;

  private lastError:
    string | null =
    null;

  private lastCycle:
    AutomationCycleResult | null =
    null;

  private lastPipelineStageDurationsMs:
    Readonly<Record<string, number>> =
    {};

  private readonly snapshotToPipelineStartLatencySamples:
    number[] =
    [];

  private readonly decisionToQueueLatencySamples:
    number[] =
    [];

  private readonly candidateDecisionToExecutionStartLatencySamples:
    number[] =
    [];

  private readonly decisionToExecutionCompleteLatencySamples:
    number[] =
    [];

  private lastShadowArchiveCaptureAt:
    number | null =
    null;

  private lastObservedSnapshotGeneratedAt:
    number | null =
    null;

  constructor(
    config:
      Partial<AutomationSchedulerConfig> = {},

    dependencies:
      AutomationSchedulerDependencies = {},
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.opportunitySource =
      dependencies
        .opportunitySource ??
      opportunityService;

    this.processSnapshot =
      async (
        snapshot,
      ) => {
        if (
          dependencies
            .processSnapshot
        ) {
          await dependencies
            .processSnapshot(
              snapshot,
            );

          return;
        }

        await this.processAutomationSnapshot(
          snapshot,
        );
      };

    this.validateConfig();
  }

  start(): void {
    if (
      this.running
    ) {
      return;
    }

    this.running =
      true;

    this.unsubscribeFromSnapshots =
      this.opportunitySource
        .subscribeToOpportunitySnapshots(
          (
            snapshot,
          ) => {
            this.enqueueSnapshot(
              snapshot,
            );
          },
        );

    console.log(
      `[AutomationScheduler] Scheduler started with interval ${this.config.intervalMs} ms.`,
    );

    if (
      this.config.runImmediately
    ) {
      void this.runScheduledCycle();
    }

    this.timer =
      setInterval(
        () => {
          void this.runScheduledCycle();
        },

        this.config.intervalMs,
      );

    this.timer.unref();
  }

  stop(): void {
    if (
      this.timer !==
      null
    ) {
      clearInterval(
        this.timer,
      );

      this.timer =
        null;
    }

    this.unsubscribeFromSnapshots
      ?.();

    this.unsubscribeFromSnapshots =
      null;

    if (
      this.snapshotDrainImmediate !==
      null
    ) {
      clearImmediate(
        this.snapshotDrainImmediate,
      );

      this.snapshotDrainImmediate =
        null;
    }

    this.pendingSnapshots.splice(
      0,
      this.pendingSnapshots.length,
    );

    if (
      !this.running
    ) {
      return;
    }

    this.running =
      false;

    console.log(
      "[AutomationScheduler] Scheduler stopped.",
    );
  }

  async runNow():
    Promise<
      AutomationCycleResult | null
    > {
    return this.runCycle(
      true,
    );
  }

  getDiagnostics():
    AutomationSchedulerDiagnostics {
    return {
      generatedAt:
        Date.now(),

      running:
        this.running,

      mode:
        "SHADOW",

      cycleInProgress:
        this.cycleInProgress,

      snapshotSubscriptionActive:
        this.unsubscribeFromSnapshots !==
        null,

      pendingSnapshotEvents:
        this.pendingSnapshots.length,

      maximumPendingSnapshotEvents:
        MAXIMUM_PENDING_SNAPSHOT_EVENTS,

      intervalMs:
        this.config.intervalMs,

      maximumSnapshotAgeMs:
        this.config
          .maximumSnapshotAgeMs,

      paperExecutionAllowed:
        false,

      liveExecutionAllowed:
        false,

      totalCycles:
        this.totalCycles,

      completedCycles:
        this.completedCycles,

      skippedOverlappingCycles:
        this.skippedOverlappingCycles,

      snapshotEventsReceived:
        this.snapshotEventsReceived,

      eventTriggeredCycles:
        this.eventTriggeredCycles,

      droppedSnapshotEvents:
        this.droppedSnapshotEvents,

      droppedEmptySnapshotEvents:
        this.droppedEmptySnapshotEvents,

      droppedCandidateSnapshotEvents:
        this.droppedCandidateSnapshotEvents,

      coalescedEmptySnapshotEvents:
        this.coalescedEmptySnapshotEvents,

      coalescedCandidateSnapshotEvents:
        this.coalescedCandidateSnapshotEvents,

      pendingSnapshotHighWaterMark:
        this.pendingSnapshotHighWaterMark,

      cyclesWithOpportunity:
        this.cyclesWithOpportunity,

      cyclesWithoutOpportunity:
        this.cyclesWithoutOpportunity,

      staleSnapshotCycles:
        this.staleSnapshotCycles,

      missingSnapshotCycles:
        this.missingSnapshotCycles,

      lastStartedAt:
        this.lastStartedAt,

      lastCompletedAt:
        this.lastCompletedAt,

      lastSuccessfulAt:
        this.lastSuccessfulAt,

      lastFailedAt:
        this.lastFailedAt,

      lastError:
        this.lastError,

      lastCycle:
        this.lastCycle ===
        null
          ? null
          : structuredClone(
              this.lastCycle,
            ),

      lastPipelineStageDurationsMs: {
        ...this.lastPipelineStageDurationsMs,
      },

      latency: {
        snapshotToPipelineStartMs:
          this.summarizeLatency(
            this.snapshotToPipelineStartLatencySamples,
          ),

        decisionToQueueMs:
          this.summarizeLatency(
            this.decisionToQueueLatencySamples,
          ),

        candidateDecisionToExecutionStartMs:
          this.summarizeLatency(
            this.candidateDecisionToExecutionStartLatencySamples,
          ),

        decisionToExecutionCompleteMs:
          this.summarizeLatency(
            this.decisionToExecutionCompleteLatencySamples,
          ),
      },
    };
  }

  private async runScheduledCycle():
    Promise<void> {
    if (
      this.pendingSnapshots.length >
      0
    ) {
      await this.drainPendingSnapshots();

      return;
    }

    await this.runCycle(
      false,
    );
  }

  private async runCycle(
    allowWhenStopped:
      boolean,

    suppliedSnapshot?:
      OpportunitySnapshot,

    eventTriggered =
      false,
  ): Promise<
    AutomationCycleResult | null
  > {
    if (
      !this.running &&
      !allowWhenStopped
    ) {
      return null;
    }

    if (
      this.cycleInProgress
    ) {
      this.skippedOverlappingCycles +=
        1;

      return null;
    }

    this.cycleInProgress =
      true;

    this.totalCycles +=
      1;

    const cycleId =
      this.totalCycles;

    const startedAt =
      Date.now();

    this.lastStartedAt =
      startedAt;

    try {
      const snapshot =
        suppliedSnapshot ??
        this.opportunitySource
          .getLastOpportunitySnapshot();

      if (
        !snapshot
      ) {
        const result =
          this.completeCycle({
            cycleId,

            startedAt,

            status:
              "NO_SNAPSHOT",

            opportunitySnapshotGeneratedAt:
              null,

            opportunitySnapshotAgeMs:
              null,

            opportunityCount:
              0,

            selectedOpportunity:
              null,

            reasons: [
              "Opportunity diagnostics runner has not produced a snapshot yet.",
            ],
          });

        this.missingSnapshotCycles +=
          1;

        this.cyclesWithoutOpportunity +=
          1;

        return result;
      }

      const snapshotAgeMs =
        Math.max(
          0,

          Date.now() -
            snapshot.generatedAt,
        );

      if (
        snapshotAgeMs >
        this.config
          .maximumSnapshotAgeMs
      ) {
        const result =
          this.completeCycle({
            cycleId,

            startedAt,

            status:
              "SNAPSHOT_STALE",

            opportunitySnapshotGeneratedAt:
              snapshot.generatedAt,

            opportunitySnapshotAgeMs:
              snapshotAgeMs,

            opportunityCount:
              snapshot
                .opportunities
                .length,

            selectedOpportunity:
              null,

            reasons: [
              `Latest opportunity snapshot is ${snapshotAgeMs} ms old, above the ${this.config.maximumSnapshotAgeMs} ms scheduler limit.`,
            ],
          });

        this.staleSnapshotCycles +=
          1;

        this.cyclesWithoutOpportunity +=
          1;

        return result;
      }

      if (
        this.lastObservedSnapshotGeneratedAt !==
        snapshot.generatedAt
      ) {
        await this.processSnapshot(
          snapshot,
        );

        this.lastObservedSnapshotGeneratedAt =
          snapshot.generatedAt;

        if (
          eventTriggered
        ) {
          this.eventTriggeredCycles +=
            1;
        }
      }

      const selected =
        this.selectOpportunity(
          snapshot.opportunities,
        );

      if (
        !selected
      ) {
        const result =
          this.completeCycle({
            cycleId,

            startedAt,

            status:
              "NO_OPPORTUNITY",

            opportunitySnapshotGeneratedAt:
              snapshot.generatedAt,

            opportunitySnapshotAgeMs:
              snapshotAgeMs,

            opportunityCount:
              0,

            selectedOpportunity:
              null,

            reasons: [
              "Latest fresh opportunity snapshot contains no accepted opportunities.",
            ],
          });

        this.cyclesWithoutOpportunity +=
          1;

        return result;
      }

      const result =
        this.completeCycle({
          cycleId,

          startedAt,

          status:
            "OPPORTUNITY_OBSERVED",

          opportunitySnapshotGeneratedAt:
            snapshot.generatedAt,

          opportunitySnapshotAgeMs:
            snapshotAgeMs,

          opportunityCount:
            snapshot
              .opportunities
              .length,

          selectedOpportunity:
            this.toObservedOpportunity(
              selected,
            ),

          reasons: [
            "Fresh opportunity observed.",
            "Persistence monitor updated.",
            "Qualification evaluated.",
            "Candidate evidence persisted.",
            "Capital-aware qualification evidence persisted.",
            "Execution candidate queue synchronized.",
            "Shadow dispatcher evaluated.",
            "Shadow outcome tracker processed.",
            "Shadow-learning lifecycle evidence persisted.",
            "Paper automation remains gated.",
            "Live execution remains disabled.",
          ],
        });

      this.cyclesWithOpportunity +=
        1;

      return result;
    } catch (
      error:
        unknown
    ) {
      const failedAt =
        Date.now();

      this.lastCompletedAt =
        failedAt;

      this.lastFailedAt =
        failedAt;

      this.lastError =
        error instanceof Error
          ? error.message
          : "Unknown automation scheduler error.";

      console.error(
        "[AutomationScheduler] Cycle failed:",
        this.lastError,
      );

      return null;
    } finally {
      this.cycleInProgress =
        false;

      if (
        this.running &&
        this.pendingSnapshots.length >
          0 &&
        !this
          .snapshotDrainInProgress
      ) {
        this.scheduleSnapshotDrain();
      }
    }
  }

  private enqueueSnapshot(
    snapshot:
      OpportunitySnapshot,
  ): void {
    if (
      !this.running
    ) {
      return;
    }

    this.snapshotEventsReceived +=
      1;

    if (
      snapshot.generatedAt ===
        this
          .lastObservedSnapshotGeneratedAt ||
      this.pendingSnapshots
        .some(
          (
            pending,
          ) =>
            pending.generatedAt ===
            snapshot.generatedAt,
        )
    ) {
      return;
    }

    /*
     * Empty snapshots carry disappearance truth, but a burst of consecutive
     * empty snapshots carries the same operational state. Consecutive
     * candidate-bearing snapshots are also revisions of the same current
     * market state, so keep the newest trailing revision instead of making a
     * live candidate wait behind already-superseded scans. Never coalesce
     * across a candidate/empty boundary: opportunity appearance and
     * disappearance remain authoritative and ordered.
     */
    const lastPending =
      this.pendingSnapshots[
        this.pendingSnapshots.length -
          1
      ];

    if (
      snapshot.opportunities.length ===
        0 &&
      lastPending?.opportunities.length ===
        0
    ) {
      this.pendingSnapshots[
        this.pendingSnapshots.length -
          1
      ] = snapshot;

      this.coalescedEmptySnapshotEvents +=
        1;

      this.scheduleSnapshotDrain();

      return;
    }

    if (
      snapshot.opportunities.length >
        0 &&
      lastPending !==
        undefined &&
      lastPending.opportunities.length >
        0
    ) {
      this.pendingSnapshots[
        this.pendingSnapshots.length -
          1
      ] = snapshot;

      this.coalescedCandidateSnapshotEvents +=
        1;

      this.scheduleSnapshotDrain();

      return;
    }

    if (
      this.pendingSnapshots.length >=
      MAXIMUM_PENDING_SNAPSHOT_EVENTS
    ) {
      const emptyIndex =
        this.pendingSnapshots
          .findIndex(
            (
              pending,
            ) =>
              pending.opportunities.length ===
              0,
          );

      const removed =
        emptyIndex >=
        0
          ? this.pendingSnapshots
              .splice(
                emptyIndex,
                1,
              )[0]
          : this.pendingSnapshots
              .shift();

      this.droppedSnapshotEvents +=
        1;

      if (
        removed?.opportunities.length ===
        0
      ) {
        this.droppedEmptySnapshotEvents +=
          1;
      } else {
        this.droppedCandidateSnapshotEvents +=
          1;
      }
    }

    this.pendingSnapshots.push(
      snapshot,
    );

    this.pendingSnapshotHighWaterMark =
      Math.max(
        this.pendingSnapshotHighWaterMark,
        this.pendingSnapshots.length,
      );

    this.scheduleSnapshotDrain();
  }

  /**
   * Snapshot publication happens on the same event-loop turn as executable
   * market data. Defer the heavier persistence/qualification pipeline to the
   * check phase so the market-data handler can return immediately, while the
   * state queue below preserves candidate/empty transitions in exact order
   * while replacing only consecutive revisions of the same state class.
   */
  private scheduleSnapshotDrain():
    void {
    if (
      !this.running ||
      this.snapshotDrainImmediate !==
        null ||
      this.snapshotDrainInProgress
    ) {
      return;
    }

    this.snapshotDrainImmediate =
      setImmediate(
        () => {
          this.snapshotDrainImmediate =
            null;

          void this.drainPendingSnapshots();
        },
      );

    this.snapshotDrainImmediate.unref();
  }

  private async drainPendingSnapshots():
    Promise<void> {
    if (
      !this.running ||
      this.snapshotDrainInProgress ||
      this.cycleInProgress
    ) {
      return;
    }

    this.snapshotDrainInProgress =
      true;

    try {
      while (
        this.running &&
        this.pendingSnapshots.length >
          0
      ) {
        const snapshot =
          this.pendingSnapshots
            .shift();

        if (
          !snapshot
        ) {
          break;
        }

        await this.runCycle(
          false,
          snapshot,
          true,
        );
      }
    } finally {
      this.snapshotDrainInProgress =
        false;

      if (
        this.pendingSnapshots.length >
        0
      ) {
        this.scheduleSnapshotDrain();
      }
    }
  }

  private async processAutomationSnapshot(
    snapshot:
      OpportunitySnapshot,
  ): Promise<void> {
    const pipelineStartedAt =
      Date.now();

    this.recordLatencySample(
      this.snapshotToPipelineStartLatencySamples,
      Math.max(
        0,
        pipelineStartedAt -
          snapshot.generatedAt,
      ),
    );

    strategyOneExecutionTimingEvidenceService
      .observePaperStage(
        snapshot,
        "PIPELINE_START",
        pipelineStartedAt,
      );

    /*
     * V125 one-shot Tiny-LIVE trigger. With no active arm this is an O(1)
     * in-memory return. This scheduler already runs after the scanner snapshot
     * callback; an armed exact route therefore receives priority over PAPER
     * analytics without adding network/persistence work to market-data ingest.
     */
    void strategyOneTinyLivePreArmService
      .observeSnapshot(
        snapshot,
      )
      .catch(
        (
          error:
            unknown,
        ) => {
          console.error(
            "[AutomationScheduler] Strategy #1 one-shot pre-arm trigger failed closed:",
            error instanceof Error
              ? error.message
              : "Unknown pre-arm trigger failure.",
          );
        },
      );

    const stageDurations:
      Record<string, number> =
      {};

    let stageStartedAt =
      performance.now();

    const completeStage =
      (
        name:
          string,
      ): void => {
        const completedAt =
          performance.now();

        stageDurations[name] =
          Number(
            (
              completedAt -
              stageStartedAt
            ).toFixed(
              3,
            ),
          );

        stageStartedAt =
          completedAt;
      };

    const strategyAttributions =
      strategyAttributionService
        .resolveSnapshot(
          snapshot,
        );

    completeStage(
      "strategyAttribution",
    );

    opportunityMonitorService
      .observeSnapshot(
        snapshot.opportunities,
        snapshot.generatedAt,
        strategyAttributions,
      );

    completeStage(
      "opportunityMonitor",
    );

    /*
     * Compute capital-aware qualification once. The queue is the first
     * consumer so a valid PAPER candidate is handed to the sole execution
     * owner before diagnostic archives and recovery analytics run.
     */
    const qualifications =
      candidateQualificationService
        .getActiveQualifications(
          Date.now(),
        );

    completeStage(
      "candidateQualification",
    );

    executionCandidateQueueService
      .synchronize(
        snapshot.generatedAt,
        qualifications,
      );

    completeStage(
      "candidateQueue",
    );

    this.recordLatencySample(
      this.decisionToQueueLatencySamples,
      Math.max(
        0,
        Date.now() -
          snapshot.generatedAt,
      ),
    );

    strategyOneExecutionTimingEvidenceService
      .observePaperStage(
        snapshot,
        "QUEUE_READY",
        Date.now(),
      );

    if (
      snapshot.opportunities.length >
      0
    ) {
      this.recordLatencySample(
        this.candidateDecisionToExecutionStartLatencySamples,
        Math.max(
          0,
          Date.now() -
            snapshot.generatedAt,
        ),
      );
    }

    strategyOneExecutionTimingEvidenceService
      .observePaperStage(
        snapshot,
        "EXECUTION_START",
        Date.now(),
      );

    try {
      await unifiedAutomatedExecutionOrchestratorService
        .run(
          snapshot.generatedAt,
        );
    } finally {
      /*
       * The pilot freshness owner receives the exact immutable snapshot and
       * original pipeline observation time, but its route/dedup/distribution
       * bookkeeping runs only after the sole PAPER execution handoff. This
       * preserves evidence even when that handoff fails without delaying
       * candidate qualification, queueing or execution start.
       */
      strategyOnePilotEquivalentPaperEvidenceService
        .observeSnapshot(
          snapshot,
          pipelineStartedAt,
        );
    }

    completeStage(
      "executionOrchestrator",
    );

    this.recordLatencySample(
      this.decisionToExecutionCompleteLatencySamples,
      Math.max(
        0,
        Date.now() -
          snapshot.generatedAt,
      ),
    );

    strategyOneExecutionTimingEvidenceService
      .observePaperStage(
        snapshot,
        "EXECUTION_COMPLETE",
        Date.now(),
      );

    /*
     * These collectors are evidence/analytics owners. They consume the exact
     * qualification batch only after the execution handoff, so their cloning,
     * simulations and bounded persistence cannot delay a valid PAPER start.
     */
    candidateEvidenceAccumulatorService
      .observeSnapshot(
        snapshot.generatedAt,
        qualifications,
      );

    completeStage(
      "candidateEvidence",
    );

    capitalAwareQualificationEvidenceService
      .capture(
        snapshot.generatedAt,
        qualifications,
      );

    completeStage(
      "capitalQualificationEvidence",
    );

    const recoveryHandoffSnapshot =
      hedgeInventoryManagementStrategyController
        .getHedgeRecoveryActionHandoffSnapshot(
          snapshot.generatedAt,
        );

    completeStage(
      "recoveryAssessment",
    );

    hedgeInventorySharedRecoveryBridgeService
      .synchronize(
        recoveryHandoffSnapshot
          .assessments
          .flatMap(
            (assessment) =>
              assessment.handoff
                ? [
                    assessment.handoff,
                  ]
                : [],
          ),
        snapshot.generatedAt,
      );

    completeStage(
      "recoveryBridge",
    );

    shadowTradeOutcomeTrackerService
      .process();

    completeStage(
      "shadowOutcome",
    );

    if (
      this.lastShadowArchiveCaptureAt ===
        null ||
      snapshot.generatedAt -
        this.lastShadowArchiveCaptureAt >=
        SHADOW_ARCHIVE_CAPTURE_INTERVAL_MS
    ) {
      shadowLearningEvidenceArchiveService
        .capture(
          snapshot.generatedAt,
        );

      this.lastShadowArchiveCaptureAt =
        snapshot.generatedAt;
    }

    completeStage(
      "shadowArchive",
    );

    paperAutomationAccountingService
      .synchronizeState();

    completeStage(
      "paperAccounting",
    );

    this.lastPipelineStageDurationsMs =
      stageDurations;
  }

  private recordLatencySample(
    samples:
      number[],

    value:
      number,
  ): void {
    if (
      !Number.isFinite(
        value,
      ) ||
      value <
        0
    ) {
      return;
    }

    samples.push(
      Number(
        value.toFixed(
          3,
        ),
      ),
    );

    const overflow =
      samples.length -
      LATENCY_SAMPLE_CAPACITY;

    if (
      overflow >
      0
    ) {
      samples.splice(
        0,
        overflow,
      );
    }
  }

  private summarizeLatency(
    samples:
      readonly number[],
  ): AutomationLatencyDistribution {
    if (
      samples.length ===
      0
    ) {
      return {
        sampleCount:
          0,
        p50Ms:
          null,
        p95Ms:
          null,
        p99Ms:
          null,
        maxMs:
          null,
      };
    }

    const ordered =
      [...samples]
        .sort(
          (
            first,
            second,
          ) =>
            first -
            second,
        );

    return {
      sampleCount:
        ordered.length,
      p50Ms:
        this.percentile(
          ordered,
          0.5,
        ),
      p95Ms:
        this.percentile(
          ordered,
          0.95,
        ),
      p99Ms:
        this.percentile(
          ordered,
          0.99,
        ),
      maxMs:
        ordered[
          ordered.length -
            1
        ] ??
        null,
    };
  }

  private percentile(
    ordered:
      readonly number[],

    quantile:
      number,
  ): number | null {
    if (
      ordered.length ===
      0
    ) {
      return null;
    }

    const index =
      Math.min(
        ordered.length -
          1,
        Math.max(
          0,
          Math.ceil(
            quantile *
              ordered.length,
          ) -
            1,
        ),
      );

    return ordered[
      index
    ] ??
    null;
  }

  private completeCycle(
    input:
      Omit<
        AutomationCycleResult,
        "completedAt" |
        "durationMs"
      >,
  ): AutomationCycleResult {
    const completedAt =
      Date.now();

    const result:
      AutomationCycleResult = {
      ...input,

      completedAt,

      durationMs:
        Math.max(
          0,

          completedAt -
            input.startedAt,
        ),
    };

    this.completedCycles +=
      1;

    this.lastCompletedAt =
      completedAt;

    this.lastSuccessfulAt =
      completedAt;

    this.lastError =
      null;

    this.lastCycle =
      structuredClone(
        result,
      );

    return structuredClone(
      result,
    );
  }

  private selectOpportunity(
    opportunities:
      ArbitrageOpportunity[],
  ): ArbitrageOpportunity | null {
    if (
      opportunities.length ===
      0
    ) {
      return null;
    }

    return opportunities.reduce(
      (
        best,
        candidate,
      ) =>
        candidate.netProfitPercent >
        best.netProfitPercent
          ? candidate
          : best,
    );
  }

  private toObservedOpportunity(
    opportunity:
      ArbitrageOpportunity,
  ): AutomationObservedOpportunity {
    return {
      id:
        opportunity.id,

      market:
        opportunity.pair.market,

      buyExchange:
        opportunity.pair.buy.exchange,

      sellExchange:
        opportunity.pair.sell.exchange,

      netProfit:
        opportunity.netProfit,

      netProfitPercent:
        opportunity.netProfitPercent,

      liquidityScore:
        opportunity.liquidityScore,

      freshnessScore:
        opportunity.freshnessScore,

      timestamp:
        opportunity.timestamp,
    };
  }

  private validateConfig():
    void {
    if (
      !Number.isFinite(
        this.config.intervalMs,
      ) ||
      this.config.intervalMs <
        250
    ) {
      throw new Error(
        "Automation scheduler interval must be at least 250 ms.",
      );
    }

    if (
      !Number.isFinite(
        this.config
          .maximumSnapshotAgeMs,
      ) ||
      this.config
        .maximumSnapshotAgeMs <=
        0
    ) {
      throw new Error(
        "Automation scheduler maximum snapshot age must be positive.",
      );
    }
  }
}

export const automationSchedulerService =
  new AutomationSchedulerService();
