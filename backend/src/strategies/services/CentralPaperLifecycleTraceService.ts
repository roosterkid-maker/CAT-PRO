import {
  centralPaperExecutionQueueService,
  centralStrategyExecutionAdmissionService,
} from "../bootstrap/StrategyBootstrap";

import {
  CENTRAL_PAPER_STRATEGY_IDS,
} from "../config/ActualStrategyCatalog";

import {
  centralPaperIntakeService,
} from "./CentralPaperIntakeService";

import {
  centralPaperSimulationJournalService,
} from "./CentralPaperSimulationJournalService";

import {
  centralPaperPositionLedgerService,
} from "./CentralPaperPositionLedgerService";

import {
  centralPaperPositionAccountingService,
} from "./CentralPaperPositionAccountingService";

import {
  centralPaperSoakAcceptanceService,
} from "./CentralPaperSoakAcceptanceService";

export type CentralPaperTraceStageId =
  | "ADMISSION"
  | "INTAKE"
  | "QUEUE"
  | "JOURNAL"
  | "POSITION"
  | "ACCOUNTING"
  | "SOAK";

export type CentralPaperTraceStageState =
  | "PASSED"
  | "IN_PROGRESS"
  | "WAITING"
  | "BLOCKED"
  | "NOT_REACHED";

export type CentralPaperTraceState =
  | "BLOCKED"
  | "WAITING"
  | "ACTIVE"
  | "CLOSED_ACCOUNTED"
  | "SOAK_ACCEPTED";

export type CentralPaperPlanPrerequisiteState =
  | "DEFERRED"
  | "DUE_AT_STAGE"
  | "RESOLVED";

interface AdmissionTraceEvidence {
  readonly id: string;
  readonly generatedAt: number;
  readonly strategyId: string;
  readonly signalId: string;
  readonly decision: string;
  readonly blockers: readonly string[];
  readonly plan: {readonly id: string; readonly strategyId: string} | null;
}

interface IntakeTraceEvidence {
  readonly id: string;
  readonly generatedAt: number;
  readonly admissionRecordId: string;
  readonly planId: string | null;
  readonly strategyId: string;
  readonly state: string;
  readonly paperAdmissionId: string | null;
  readonly queueRecordId: string | null;
  readonly blockers: readonly string[];
}

interface QueueTraceEvidence {
  readonly id: string;
  readonly plan: {readonly id: string; readonly strategyId: string};
  readonly admissionId: string;
  readonly state: string;
  readonly queuedAt: number;
  readonly updatedAt: number;
  readonly attempts: number;
  readonly evidenceDeferrals: number;
  readonly lastEvidenceWaitReason: string | null;
  readonly terminalEvidenceId: string | null;
}

interface JournalTraceEvidence {
  readonly id: string;
  readonly resultId: string;
  readonly planId: string;
  readonly queueRecordId: string;
  readonly strategyId: string;
  readonly state: string;
  readonly capturedAt: number;
  readonly updatedAt: number;
  readonly terminalEvidenceId: string | null;
}

interface PositionTraceEvidence {
  readonly id: string;
  readonly resultId: string;
  readonly planId: string;
  readonly strategyId: string;
  readonly state: string;
  readonly openedAt: number;
  readonly updatedAt: number;
  readonly closedAt: number | null;
  readonly closeEvidenceId: string | null;
  readonly realizedPnlEvidenceStatus: string;
  readonly realizedNetPnlQuote: number | null;
}

interface AccountingTraceEvidence {
  readonly id: string;
  readonly positionGroupId: string;
  readonly resultId: string;
  readonly state: string;
  readonly capturedAt: number;
  readonly appliedAt: number | null;
  readonly netPnlInr: number;
}

interface SoakTraceEvidence {
  readonly strategyId: string;
  readonly state: string;
  readonly closedCycles: number;
  readonly consecutivePasses: number;
  readonly blockers: readonly string[];
}

export interface CentralPaperLifecycleTracePort {
  getAdmissions(now: number): readonly AdmissionTraceEvidence[];
  getIntake(now: number): readonly IntakeTraceEvidence[];
  getQueue(now: number): readonly QueueTraceEvidence[];
  getJournal(now: number): readonly JournalTraceEvidence[];
  getPositions(now: number): readonly PositionTraceEvidence[];
  getAccounting(now: number): readonly AccountingTraceEvidence[];
  getSoak(now: number): {
    readonly thresholds: {
      readonly minimumClosedCycles: number;
      readonly minimumConsecutivePasses: number;
    };
    readonly strategies: readonly SoakTraceEvidence[];
  };
}

export class CentralPaperLifecycleTraceService {
  constructor(
    private readonly port:
      CentralPaperLifecycleTracePort =
      new DefaultCentralPaperLifecycleTracePort(),
  ) {}

  getReport(
    now =
      Date.now(),
  ) {
    if (
      !Number.isSafeInteger(
        now,
      ) ||
      now <=
        0
    ) {
      throw new Error(
        "Central PAPER lifecycle trace timestamp must be positive.",
      );
    }

    const admissions =
      this.port.getAdmissions(
        now,
      );
    const intake =
      this.port.getIntake(
        now,
      );
    const queue =
      this.port.getQueue(
        now,
      );
    const journal =
      this.port.getJournal(
        now,
      );
    const positions =
      this.port.getPositions(
        now,
      );
    const accounting =
      this.port.getAccounting(
        now,
      );
    const soak =
      this.port.getSoak(
        now,
      );

    const strategyIds =
      new Set<string>(
        CENTRAL_PAPER_STRATEGY_IDS,
      );

    const planIds =
      new Set<string>();

    for (const record of admissions) {
      if (
        record.plan &&
        strategyIds.has(
          record.strategyId,
        )
      ) {
        planIds.add(
          record.plan.id,
        );
      }
    }
    for (const record of intake) {
      if (
        record.planId &&
        strategyIds.has(
          record.strategyId,
        )
      ) {
        planIds.add(
          record.planId,
        );
      }
    }
    for (const record of queue) {
      if (
        strategyIds.has(
          record.plan.strategyId,
        )
      ) {
        planIds.add(
          record.plan.id,
        );
      }
    }
    for (const record of journal) {
      if (
        strategyIds.has(
          record.strategyId,
        )
      ) {
        planIds.add(
          record.planId,
        );
      }
    }
    for (const record of positions) {
      if (
        strategyIds.has(
          record.strategyId,
        )
      ) {
        planIds.add(
          record.planId,
        );
      }
    }

    const traces =
      [...planIds]
        .map(
          (
            planId,
          ) =>
            this.buildTrace({
              planId,
              admissions,
              intake,
              queue,
              journal,
              positions,
              accounting,
              soak,
            }),
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.latestActivityAt -
              first.latestActivityAt ||
            first.planId.localeCompare(
              second.planId,
            ),
        );

    const strategies =
      CENTRAL_PAPER_STRATEGY_IDS.map(
        (
          strategyId,
          index,
        ) => {
          const strategyTraces =
            traces.filter(
              (
                trace,
              ) =>
                trace.strategyId ===
                strategyId,
            );
          const latest =
            strategyTraces[0] ??
            null;

          return {
            strategyId,
            strategyNumber:
              index +
              2,
            plansObserved:
              strategyTraces.length,
            latestTrace:
              latest,
            lifecycleState:
              latest
                ?.state ??
              "WAITING" as const,
            currentStage:
              latest
                ?.currentStage ??
              "ADMISSION" as const,
            nextTransition:
              latest
                ?.nextTransition ??
              "Wait for a current strategy-qualified signal and canonical admission plan.",
          };
        },
      );

    return freeze({
      version:
        "76.0" as const,
      generatedAt:
        now,
      mode:
        "CENTRAL_PAPER_EXACT_LIFECYCLE_TRACE" as const,
      summary: {
        targetStrategies:
          7 as const,
        plansObserved:
          traces.length,
        blocked:
          traces.filter(
            (
              trace,
            ) =>
              trace.state ===
              "BLOCKED",
          ).length,
        waiting:
          traces.filter(
            (
              trace,
            ) =>
              trace.state ===
              "WAITING",
          ).length,
        active:
          traces.filter(
            (
              trace,
            ) =>
              trace.state ===
              "ACTIVE",
          ).length,
        closedAccounted:
          traces.filter(
            (
              trace,
            ) =>
              trace.state ===
              "CLOSED_ACCOUNTED" ||
              trace.state ===
              "SOAK_ACCEPTED",
          ).length,
        soakAccepted:
          strategies.filter(
            (
              strategy,
            ) =>
              strategy.lifecycleState ===
              "SOAK_ACCEPTED",
          ).length,
        lineageIntegrityFailures:
          traces.filter(
            (
              trace,
            ) =>
              trace.integrityBlockers.length >
              0,
          ).length,
        deferredPrerequisites:
          traces.reduce(
            (
              total,
              trace,
            ) =>
              total +
              trace.planPrerequisites.filter(
                (
                  prerequisite,
                ) =>
                  prerequisite.state ===
                  "DEFERRED",
              ).length,
            0,
          ),
        prerequisitesDueAtCurrentStage:
          traces.reduce(
            (
              total,
              trace,
            ) =>
              total +
              trace.planPrerequisites.filter(
                (
                  prerequisite,
                ) =>
                  prerequisite.state ===
                  "DUE_AT_STAGE",
              ).length,
            0,
          ),
      },
      strategies,
      recentTraces:
        traces.slice(
          0,
          50,
        ),
      safety: {
        readOnlyAggregation:
          true as const,
        actualPlanIdsOnly:
          true as const,
        exactLineageRequired:
          true as const,
        missingEvidenceFailsClosed:
          true as const,
        modeledLifecycleCompletionAllowed:
          false as const,
        executionTriggered:
          false as const,
        accountMutationPerformed:
          false as const,
        liveExecutionAllowed:
          false as const,
        orderSubmissionAllowed:
          false as const,
      },
    });
  }

  private buildTrace(
    input: {
      readonly planId: string;
      readonly admissions: readonly AdmissionTraceEvidence[];
      readonly intake: readonly IntakeTraceEvidence[];
      readonly queue: readonly QueueTraceEvidence[];
      readonly journal: readonly JournalTraceEvidence[];
      readonly positions: readonly PositionTraceEvidence[];
      readonly accounting: readonly AccountingTraceEvidence[];
      readonly soak: ReturnType<CentralPaperLifecycleTracePort["getSoak"]>;
    },
  ) {
    const admission =
      newest(
        input.admissions.filter(
          (
            record,
          ) =>
            record.plan
              ?.id ===
            input.planId,
        ),
        (
          record,
        ) =>
          record.generatedAt,
      );
    const intake =
      newest(
        input.intake.filter(
          (
            record,
          ) =>
            record.planId ===
            input.planId,
        ),
        (
          record,
        ) =>
          record.generatedAt,
      );
    const queue =
      newest(
        input.queue.filter(
          (
            record,
          ) =>
            record.plan.id ===
            input.planId,
        ),
        (
          record,
        ) =>
          record.updatedAt,
      );
    const journal =
      newest(
        input.journal.filter(
          (
            record,
          ) =>
            record.planId ===
            input.planId,
        ),
        (
          record,
        ) =>
          record.updatedAt,
      );
    const position =
      newest(
        input.positions.filter(
          (
            record,
          ) =>
            record.planId ===
            input.planId,
        ),
        (
          record,
        ) =>
          record.updatedAt,
      );
    const accounting =
      newest(
        input.accounting.filter(
          (
            record,
          ) =>
            record.resultId ===
              journal
                ?.resultId ||
            record.positionGroupId ===
              position
                ?.id,
        ),
        (
          record,
        ) =>
          record.appliedAt ??
          record.capturedAt,
      );

    const strategyId =
      admission
        ?.strategyId ??
      intake
        ?.strategyId ??
      queue
        ?.plan.strategyId ??
      journal
        ?.strategyId ??
      position
        ?.strategyId ??
      "UNKNOWN";
    const soak =
      input.soak.strategies.find(
        (
          record,
        ) =>
          record.strategyId ===
          strategyId,
      ) ??
      null;

    const integrityBlockers:
      string[] = [];
    if (
      intake &&
      admission &&
      intake.admissionRecordId !==
        admission.id
    ) {
      integrityBlockers.push(
        "INTAKE_ADMISSION_LINEAGE_MISMATCH",
      );
    }
    if (
      intake &&
      intake.strategyId !==
        strategyId
    ) {
      integrityBlockers.push(
        "INTAKE_STRATEGY_LINEAGE_MISMATCH",
      );
    }
    if (
      queue &&
      intake
        ?.paperAdmissionId &&
      queue.admissionId !==
        intake.paperAdmissionId
    ) {
      integrityBlockers.push(
        "QUEUE_ADMISSION_LINEAGE_MISMATCH",
      );
    }
    if (
      journal &&
      queue &&
      journal.queueRecordId !==
        queue.id
    ) {
      integrityBlockers.push(
        "JOURNAL_QUEUE_LINEAGE_MISMATCH",
      );
    }
    if (
      position &&
      journal &&
      position.resultId !==
        journal.resultId
    ) {
      integrityBlockers.push(
        "POSITION_RESULT_LINEAGE_MISMATCH",
      );
    }
    if (
      accounting &&
      position &&
      (
        accounting.positionGroupId !==
          position.id ||
        accounting.resultId !==
          position.resultId
      )
    ) {
      integrityBlockers.push(
        "ACCOUNTING_POSITION_LINEAGE_MISMATCH",
      );
    }

    const stages = [
      stage(
        "ADMISSION",
        admission
          ? admission.decision ===
              "SHADOW_SIGNAL_ADMITTED"
            ? "PASSED"
            : "BLOCKED"
          : "NOT_REACHED",
        admission
          ? `Decision=${admission.decision}; signal=${admission.signalId}.`
          : "No canonical central admission plan is present.",
        admission
          ?.id ??
        null,
        admission
          ?.generatedAt ??
        null,
      ),
      stage(
        "INTAKE",
        intake
          ? intake.state ===
                "QUEUED" ||
              intake.state ===
                "DUPLICATE"
            ? "PASSED"
            : intake.state ===
                  "BLOCKED" ||
                intake.state ===
                  "FAILED"
              ? "BLOCKED"
              : "WAITING"
          : admission
            ? "WAITING"
            : "NOT_REACHED",
        intake
          ? `State=${intake.state}; blockers=${intake.blockers.length}.`
          : "Waiting for exact runtime evidence and central PAPER admission.",
        intake
          ?.id ??
        null,
        intake
          ?.generatedAt ??
        null,
      ),
      stage(
        "QUEUE",
        queue
          ? queue.state ===
              "COMPLETED"
            ? "PASSED"
            : queue.state ===
                  "QUEUED" ||
                queue.state ===
                  "LEASED"
              ? "IN_PROGRESS"
              : "BLOCKED"
          : intake
              ?.state ===
              "QUEUED"
            ? "WAITING"
            : "NOT_REACHED",
        queue
          ? `State=${queue.state}; attempts=${queue.attempts}; evidence deferrals=${queue.evidenceDeferrals}.`
          : "No durable queue record exists for this plan.",
        queue
          ?.id ??
        null,
        queue
          ?.updatedAt ??
        null,
      ),
      stage(
        "JOURNAL",
        journal
          ? journal.state ===
                "POSITION_ACCOUNTED" ||
              journal.state ===
                "RECOVERY_COMPLETED"
            ? "PASSED"
            : journal.state ===
                "RECOVERY_STAGING_FAILED"
              ? "BLOCKED"
              : "IN_PROGRESS"
          : queue
            ? "WAITING"
            : "NOT_REACHED",
        journal
          ? `State=${journal.state}; result=${journal.resultId}.`
          : "No journal-before-terminal simulation evidence exists.",
        journal
          ?.id ??
        null,
        journal
          ?.updatedAt ??
        null,
      ),
      stage(
        "POSITION",
        position
          ? position.state ===
              "CLOSED"
            ? "PASSED"
            : "IN_PROGRESS"
          : journal
            ? "WAITING"
            : "NOT_REACHED",
        position
          ? `State=${position.state}; realized P&L evidence=${position.realizedPnlEvidenceStatus}.`
          : "No exact position-group evidence exists.",
        position
          ?.id ??
        null,
        position
          ?.updatedAt ??
        null,
      ),
      stage(
        "ACCOUNTING",
        accounting
          ? accounting.state ===
              "ACCOUNT_POSTED"
            ? "PASSED"
            : "IN_PROGRESS"
          : position
              ?.state ===
              "CLOSED"
            ? "WAITING"
            : "NOT_REACHED",
        accounting
          ? `State=${accounting.state}; posted net P&L INR=${accounting.netPnlInr}.`
          : "No replay-safe PAPER account-post evidence exists.",
        accounting
          ?.id ??
        null,
        accounting
          ? accounting.appliedAt ??
            accounting.capturedAt
          : null,
      ),
      stage(
        "SOAK",
        soak
          ?.state ===
          "SOAK_ACCEPTED"
          ? "PASSED"
          : accounting
              ?.state ===
              "ACCOUNT_POSTED"
            ? "IN_PROGRESS"
            : "NOT_REACHED",
        soak
          ? `${soak.closedCycles}/${input.soak.thresholds.minimumClosedCycles} closed cycles; ${soak.consecutivePasses}/${input.soak.thresholds.minimumConsecutivePasses} consecutive passes.`
          : "No strategy soak evidence exists.",
        null,
        null,
      ),
    ];

    const firstIncomplete =
      stages.find(
        (
          item,
        ) =>
          item.state !==
          "PASSED",
      );
    const currentStage =
      firstIncomplete
        ?.id ??
      "SOAK";
    const currentStageBlockers =
      blockersForStage({
        currentStage,
        admission,
        intake,
        queue,
        journal,
        soak,
      });
    const blockingEvidence = [
      ...integrityBlockers,
      ...currentStageBlockers,
    ];
    const planPrerequisites =
      admission
          ?.decision ===
        "SHADOW_SIGNAL_ADMITTED"
        ? unique(
            admission.blockers,
          ).map(
            (
              code,
            ) => {
              const ownerStage =
                prerequisiteOwnerStage(
                  code,
                );
              const ownerStageState =
                stages.find(
                  (
                    item,
                  ) =>
                    item.id ===
                    ownerStage,
                )
                  ?.state ??
                "NOT_REACHED";
              const state:
                CentralPaperPlanPrerequisiteState =
                ownerStageState ===
                  "PASSED" ||
                stageIndex(
                  currentStage,
                ) >
                  stageIndex(
                    ownerStage,
                  )
                  ? "RESOLVED"
                  : currentStage ===
                      ownerStage
                    ? "DUE_AT_STAGE"
                    : "DEFERRED";
              return freeze({
                code,
                ownerStage,
                state,
                blocksCurrentStage:
                  state ===
                  "DUE_AT_STAGE",
              });
            },
          )
        : [];

    const state:
      CentralPaperTraceState =
      integrityBlockers.length >
          0 ||
        stages.some(
          (
            item,
          ) =>
            item.state ===
            "BLOCKED",
        )
        ? "BLOCKED"
        : soak
            ?.state ===
            "SOAK_ACCEPTED"
          ? "SOAK_ACCEPTED"
          : accounting
              ?.state ===
              "ACCOUNT_POSTED"
            ? "CLOSED_ACCOUNTED"
            : stages.some(
                  (
                    item,
                  ) =>
                    item.state ===
                    "IN_PROGRESS",
                )
              ? "ACTIVE"
              : "WAITING";

    const timestamps = [
      admission
        ?.generatedAt,
      intake
        ?.generatedAt,
      queue
        ?.updatedAt,
      journal
        ?.updatedAt,
      position
        ?.updatedAt,
      accounting
        ?.appliedAt,
      accounting
        ?.capturedAt,
    ].filter(
      (
        value,
      ): value is number =>
        typeof value ===
        "number",
    );

    return freeze({
      planId:
        input.planId,
      strategyId,
      signalId:
        admission
          ?.signalId ??
        null,
      state,
      currentStage,
      passedStages:
        stages.filter(
          (
            item,
          ) =>
            item.state ===
            "PASSED",
        ).length,
      totalStages:
        stages.length,
      latestActivityAt:
        timestamps.length >
          0
          ? Math.max(
              ...timestamps,
            )
          : 0,
      stages,
      blockers:
        unique(
          blockingEvidence,
        ).slice(
          0,
          12,
        ),
      integrityBlockers:
        unique(
          integrityBlockers,
        ),
      planPrerequisites,
      nextTransition:
        nextTransition(
          currentStage,
          state,
          blockingEvidence,
        ),
      closedPnlInr:
        accounting
          ?.state ===
          "ACCOUNT_POSTED"
          ? accounting.netPnlInr
          : null,
      executionTriggeredByRead:
        false as const,
      accountMutationPerformedByRead:
        false as const,
      liveExecutionAllowed:
        false as const,
      orderSubmissionAllowed:
        false as const,
    });
  }
}

class DefaultCentralPaperLifecycleTracePort implements CentralPaperLifecycleTracePort {
  getAdmissions(
    now:
      number,
  ) {
    return centralStrategyExecutionAdmissionService
      .getDiagnostics(
        now,
      )
      .recent;
  }

  getIntake(
    now:
      number,
  ) {
    return centralPaperIntakeService
      .getDiagnostics(
        now,
      )
      .recent;
  }

  getQueue(
    now:
      number,
  ) {
    return centralPaperExecutionQueueService
      .getDiagnostics(
        now,
      )
      .recent;
  }

  getJournal(
    now:
      number,
  ) {
    return centralPaperSimulationJournalService
      .getDiagnostics(
        now,
      )
      .recent;
  }

  getPositions(
    now:
      number,
  ) {
    return centralPaperPositionLedgerService
      .getDiagnostics(
        now,
      )
      .recent;
  }

  getAccounting(
    now:
      number,
  ) {
    return centralPaperPositionAccountingService
      .getDiagnostics(
        now,
      )
      .recent;
  }

  getSoak(
    now:
      number,
  ) {
    return centralPaperSoakAcceptanceService
      .getReport(
        now,
      );
  }
}

function stage(
  id:
    CentralPaperTraceStageId,
  state:
    CentralPaperTraceStageState,
  detail:
    string,
  evidenceId:
    string | null,
  observedAt:
    number | null,
) {
  return freeze({
    id,
    state,
    detail,
    evidenceId,
    observedAt,
  });
}

function blockersForStage(
  input: {
    readonly currentStage: CentralPaperTraceStageId;
    readonly admission: AdmissionTraceEvidence | null;
    readonly intake: IntakeTraceEvidence | null;
    readonly queue: QueueTraceEvidence | null;
    readonly journal: JournalTraceEvidence | null;
    readonly soak: SoakTraceEvidence | null;
  },
): string[] {
  switch (input.currentStage) {
    case "ADMISSION":
      return input.admission && input.admission.decision !== "SHADOW_SIGNAL_ADMITTED"
        ? unique(input.admission.blockers)
        : [];
    case "INTAKE":
      return unique(input.intake?.blockers ?? []);
    case "QUEUE":
      return input.queue?.lastEvidenceWaitReason
        ? [input.queue.lastEvidenceWaitReason]
        : input.queue && (input.queue.state === "REJECTED" || input.queue.state === "EXPIRED")
          ? [`QUEUE_${input.queue.state}`]
          : [];
    case "JOURNAL":
      return input.journal?.state === "RECOVERY_STAGING_FAILED"
        ? ["RECOVERY_STAGING_FAILED"]
        : [];
    case "POSITION":
    case "ACCOUNTING":
      return [];
    case "SOAK":
      return unique(input.soak?.blockers ?? []);
  }
}

function prerequisiteOwnerStage(
  code: string,
): CentralPaperTraceStageId {
  if (
    code === "CAPITAL_RESERVATION_REQUIRED"
  ) {
    return "QUEUE";
  }
  if (
    code === "MAKER_FILL_EVIDENCE_REQUIRED" ||
    code === "SEQUENTIAL_LEG_FAILURE_RECOVERY_REQUIRED" ||
    code === "QUEUE_POSITION_UNKNOWN" ||
    code === "FILL_PROBABILITY_UNKNOWN" ||
    code === "POST_ONLY_EXECUTION_UNVERIFIED"
  ) {
    return "JOURNAL";
  }
  return "INTAKE";
}

function stageIndex(
  stageId: CentralPaperTraceStageId,
): number {
  return [
    "ADMISSION",
    "INTAKE",
    "QUEUE",
    "JOURNAL",
    "POSITION",
    "ACCOUNTING",
    "SOAK",
  ].indexOf(stageId);
}

function nextTransition(
  stageId:
    CentralPaperTraceStageId,
  state:
    CentralPaperTraceState,
  blockers:
    readonly string[],
): string {
  if (
    state ===
    "SOAK_ACCEPTED"
  ) {
    return "Maintain accepted PAPER soak evidence; no LIVE authority is granted.";
  }
  if (
    state ===
      "BLOCKED" &&
    blockers[0]
  ) {
    return `Restore exact evidence for ${blockers[0]}.`;
  }
  switch (stageId) {
    case "ADMISSION":
      return "Wait for a current strategy-qualified signal and canonical admission plan.";
    case "INTAKE":
      return "Collect exact balance, rule, fee, depth and risk evidence for central PAPER intake.";
    case "QUEUE":
      return "Persist one eligible plan to the durable queue and allow the shared worker to lease it.";
    case "JOURNAL":
      return "Capture simulator output in the journal before terminal queue acknowledgement.";
    case "POSITION":
      return "Capture or close the exact PAPER position group with current exit evidence.";
    case "ACCOUNTING":
      return "Post closed realized P&L through the replay-safe PAPER accounting transaction.";
    case "SOAK":
      return "Collect real closed, accounting-posted PAPER cycles until soak thresholds pass.";
  }
}

function newest<T>(
  values:
    readonly T[],
  timestamp:
    (
      value:
        T,
    ) => number,
): T | null {
  return [
    ...values,
  ]
    .sort(
      (
        first,
        second,
      ) =>
        timestamp(
          second,
        ) -
        timestamp(
          first,
        ),
    )[0] ??
    null;
}

function unique(
  values:
    readonly string[],
): string[] {
  return [
    ...new Set(
      values,
    ),
  ];
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
  for (const nested of Object.values(value)) {
    freeze(
      nested,
    );
  }
  return Object.freeze(
    value,
  );
}

export const centralPaperLifecycleTraceService =
  new CentralPaperLifecycleTraceService();
