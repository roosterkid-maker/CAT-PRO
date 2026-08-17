import {
  candidateEvidenceAccumulatorService,
} from "../../automation/services/CandidateEvidenceAccumulatorService";

import {
  shadowLearningEvidenceArchiveService,
} from "../../automation/services/ShadowLearningEvidenceArchiveService";

import {
  shadowPerformanceAnalyticsService,
} from "../../automation/services/ShadowPerformanceAnalyticsService";

import {
  shadowTradeOutcomeTrackerService,
} from "../../automation/services/ShadowTradeOutcomeTrackerService";

import {
  liveExecutionCoordinator,
} from "../../execution/live/coordinator/LiveExecutionCoordinator";

import {
  executionHistoryService,
} from "../../execution/live/history/ExecutionHistoryService";

import {
  executionMetricsService,
} from "../../execution/live/metrics/ExecutionMetricsService";

import {
  executionMetricsSnapshotService,
} from "../../execution/live/metrics/ExecutionMetricsSnapshotService";

import {
  executionSettlementService,
} from "../../execution/live/settlement/ExecutionSettlementService";

import type {
  EvidenceIntegrityAuditReport,
  EvidenceIntegrityComponent,
  EvidenceIntegrityStatus,
  EvidencePersistenceMode,
} from "../models/EvidenceIntegrityAudit";

interface ComponentInput {
  key: string;

  persistenceMode: EvidencePersistenceMode;

  restartSafe: boolean;

  healthy: boolean;

  evidenceCount: number | null;

  restored?: boolean | null;

  writes?: number | null;

  writeFailures?: number | null;

  lastPersistedAt?: number | null;

  message: string;

  reasons?: string[];
}

export class EvidenceIntegrityAuditService {
  async getReport():
  Promise<EvidenceIntegrityAuditReport> {
    const candidateEvidence =
      candidateEvidenceAccumulatorService
        .getDiagnostics();

    const shadowArchive =
      shadowLearningEvidenceArchiveService
        .getDiagnostics();

    const shadowRuntime =
      shadowTradeOutcomeTrackerService
        .getDiagnostics();

    const shadowAnalytics =
      shadowPerformanceAnalyticsService
        .getAnalytics();

    const executionHistory =
      await executionHistoryService
        .getRecent(
          100,
        );

    const executionMetrics =
      executionMetricsService
        .getReport();

    const metricSnapshots =
      executionMetricsSnapshotService
        .getRecent(
          720,
        );

    const settlements =
      executionSettlementService
        .getDiagnostics();

    const coordinator =
      liveExecutionCoordinator
        .getDiagnostics();

    const archivedCompletedOutcomes =
      shadowArchive
        .outcomeRecords
        .filter(
          (
            record,
          ) =>
            record.status !==
            "TRACKING",
        )
        .length;

    const runtimeCompletedOutcomes =
      shadowRuntime
        .records
        .filter(
          (
            record,
          ) =>
            record.status !==
            "TRACKING",
        )
        .length;

    const shadowContinuityPreserved =
      shadowAnalytics
        .summary
        .completed >=
      archivedCompletedOutcomes;

    const components:
      EvidenceIntegrityComponent[] = [
      this.component({
        key:
          "CANDIDATE_EVIDENCE",

        persistenceMode:
          "PERSISTENT",

        restartSafe:
          true,

        healthy:
          candidateEvidence
            .persistence
            .writeFailures ===
          0,

        evidenceCount:
          candidateEvidence
            .summary
            .routesObserved,

        restored:
          candidateEvidence
            .persistence
            .restored,

        writes:
          candidateEvidence
            .persistence
            .writes,

        writeFailures:
          candidateEvidence
            .persistence
            .writeFailures,

        lastPersistedAt:
          candidateEvidence
            .persistence
            .lastPersistedAt,

        message:
          "Candidate evidence uses restart-safe JSONL snapshots.",

        reasons:
          candidateEvidence
              .persistence
              .writeFailures ===
            0
            ? []
            : [
                candidateEvidence
                  .persistence
                  .lastError ??
                  "Candidate evidence persistence has write failures.",
              ],
      }),

      this.component({
        key:
          "SHADOW_LEARNING_ARCHIVE",

        persistenceMode:
          "PERSISTENT",

        restartSafe:
          true,

        healthy:
          shadowArchive
            .persistence
            .writeFailures ===
          0,

        evidenceCount:
          shadowArchive
            .summary
            .outcomeRecordsArchived,

        restored:
          shadowArchive
            .persistence
            .restored,

        writes:
          shadowArchive
            .persistence
            .writes,

        writeFailures:
          shadowArchive
            .persistence
            .writeFailures,

        lastPersistedAt:
          shadowArchive
            .persistence
            .lastPersistedAt,

        message:
          "Shadow queue, dispatch, and outcome history is persisted as diagnostic JSONL evidence.",

        reasons:
          shadowArchive
              .persistence
              .writeFailures ===
            0
            ? []
            : [
                shadowArchive
                  .persistence
                  .lastError ??
                  "Shadow archive persistence has write failures.",
              ],
      }),

      this.component({
        key:
          "SHADOW_ANALYTICS_CONTINUITY",

        persistenceMode:
          "PERSISTENT",

        restartSafe:
          shadowContinuityPreserved,

        healthy:
          shadowContinuityPreserved,

        evidenceCount:
          shadowAnalytics
            .summary
            .completed,

        restored:
          shadowArchive
            .persistence
            .restored,

        lastPersistedAt:
          shadowArchive
            .persistence
            .lastPersistedAt,

        message:
          shadowContinuityPreserved
            ? "Shadow performance analytics preserves archived completed outcomes across restart."
            : "Shadow performance analytics is not currently consuming all archived completed outcomes after restart.",

        reasons:
          shadowContinuityPreserved
            ? []
            : [
                `Archived completed shadow outcomes=${archivedCompletedOutcomes}, but current shadow analytics completed=${shadowAnalytics.summary.completed}.`,
              ],
      }),

      this.component({
        key:
          "LIVE_EXECUTION_AUDIT_HISTORY",

        persistenceMode:
          "PERSISTENT",

        restartSafe:
          true,

        healthy:
          true,

        evidenceCount:
          executionHistory.total,

        restored:
          null,

        lastPersistedAt:
          executionHistory
            .executions[0]
            ?.timestamp ??
          null,

        message:
          "Execution history is reconstructed from the persistent live-execution audit JSONL file.",
      }),

      this.component({
        key:
          "EXECUTION_METRICS",

        persistenceMode:
          "VOLATILE",

        restartSafe:
          false,

        healthy:
          true,

        evidenceCount:
          executionMetrics
            .totalExecutions,

        restored:
          false,

        message:
          "ExecutionMetricsService is process-memory only and resets after process restart.",

        reasons: [
          "Execution metrics are not currently restored from persistent storage.",
        ],
      }),

      this.component({
        key:
          "EXECUTION_METRIC_SNAPSHOTS",

        persistenceMode:
          "VOLATILE",

        restartSafe:
          false,

        healthy:
          true,

        evidenceCount:
          metricSnapshots.length,

        restored:
          false,

        lastPersistedAt:
          metricSnapshots[
            metricSnapshots.length -
            1
          ]?.timestamp ??
          null,

        message:
          "Execution metric snapshots are retained in memory only.",

        reasons: [
          "Metric snapshots are lost when the backend process restarts.",
        ],
      }),

      this.component({
        key:
          "EXECUTION_SETTLEMENTS",

        persistenceMode:
          "VOLATILE",

        restartSafe:
          false,

        healthy:
          true,

        evidenceCount:
          settlements
            .totalSettlements,

        restored:
          false,

        lastPersistedAt:
          settlements
            .settlements[0]
            ?.settledAt ??
          null,

        message:
          "Execution settlements are currently stored in the in-memory settlement map.",

        reasons: [
          "Settlement analytics evidence is not restart-safe yet.",
        ],
      }),

      this.component({
        key:
          "LIVE_EXECUTION_SESSIONS",

        persistenceMode:
          "VOLATILE",

        restartSafe:
          false,

        healthy:
          true,

        evidenceCount:
          coordinator
            .sessions
            .length,

        restored:
          false,

        message:
          "Live execution coordinator sessions and locks are process-memory state.",

        reasons: [
          "Persistent LIVE sessions and duplicate-order protection across restart remain production-hardening work.",
        ],
      }),
    ];

    const persistenceFailures =
      [
        ...new Set(
          components
            .filter(
              (
                component,
              ) =>
                !component.healthy,
            )
            .flatMap(
              (
                component,
              ) =>
                component.reasons.length >
                  0
                  ? component.reasons
                  : [
                      `${component.key} integrity check failed.`,
                    ],
            ),
        ),
      ];

    const restartSafetyGaps =
      [
        ...new Set(
          components
            .filter(
              (
                component,
              ) =>
                !component.restartSafe,
            )
            .map(
              (
                component,
              ) =>
                `${component.key}: ${component.message}`,
            ),
        ),
      ];

    return {
      generatedAt:
        Date.now(),

      version:
        "17.6",

      build:
        "6",

      status:
        this.resolveStatus(
          persistenceFailures,
          restartSafetyGaps,
        ),

      analyticsOnly:
        true,

      liveTradingEnabled:
        false,

      liveSubmissionAllowed:
        false,

      failClosed:
        true,

      shadowContinuity: {
        runtimeOutcomes:
          shadowRuntime
            .records
            .length,

        runtimeCompletedOutcomes,

        archivedOutcomes:
          shadowArchive
            .outcomeRecords
            .length,

        archivedCompletedOutcomes,

        mergedTrackedDispatches:
          shadowAnalytics
            .summary
            .trackedDispatches,

        mergedCompletedOutcomes:
          shadowAnalytics
            .summary
            .completed,

        minimumCompletedOutcomes:
          shadowAnalytics
            .sampleRequirement
            .minimumCompletedOutcomes,

        remainingCompletedOutcomes:
          shadowAnalytics
            .sampleRequirement
            .remaining,

        historicalCompletedEvidencePreserved:
          shadowContinuityPreserved,
      },

      components,

      restartSafeComponents:
        components
          .filter(
            (
              component,
            ) =>
              component.restartSafe,
          )
          .length,

      volatileComponents:
        components
          .filter(
            (
              component,
            ) =>
              !component.restartSafe,
          )
          .length,

      persistenceFailures,

      restartSafetyGaps,

      notes: [
        "Version 17.6 Build 6 is diagnostic-only and cannot enable LIVE trading.",

        "The audit compares current shadow analytics against the persistent shadow-learning archive and reports any restart continuity mismatch.",

        "Historical TRACKING shadow outcomes remain archive-only and are not automatically resumed after restart.",

        "Execution audit history is persistent, while execution metrics, metric snapshots, settlements, and live coordinator sessions are not fully restart-safe yet.",

        "Volatile LIVE evidence is reported as a hardening gap rather than silently treated as persistent evidence.",
      ],
    };
  }

  private component(
    input:
      ComponentInput,
  ): EvidenceIntegrityComponent {
    return {
      key:
        input.key,

      persistenceMode:
        input.persistenceMode,

      restartSafe:
        input.restartSafe,

      healthy:
        input.healthy,

      evidenceCount:
        input.evidenceCount,

      restored:
        input.restored ??
        null,

      writes:
        input.writes ??
        null,

      writeFailures:
        input.writeFailures ??
        null,

      lastPersistedAt:
        input.lastPersistedAt ??
        null,

      message:
        input.message,

      reasons:
        input.reasons ??
        [],
    };
  }

  private resolveStatus(
    persistenceFailures:
      readonly string[],

    restartSafetyGaps:
      readonly string[],
  ): EvidenceIntegrityStatus {
    if (
      persistenceFailures.length >
      0
    ) {
      return "DEGRADED";
    }

    if (
      restartSafetyGaps.length >
      0
    ) {
      return "PARTIAL_RESTART_SAFETY";
    }

    return "HEALTHY";
  }
}

export const evidenceIntegrityAuditService =
  new EvidenceIntegrityAuditService();