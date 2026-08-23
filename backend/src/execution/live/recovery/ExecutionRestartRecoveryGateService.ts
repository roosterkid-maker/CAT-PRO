import {
  liveExecutionSessionEvidenceService,
} from "../coordinator/LiveExecutionSessionEvidenceService";

import {
  orderLifecycleEvidenceService,
} from "../lifecycle/OrderLifecycleEvidenceService";

import type {
  DuplicateOrderEvidence,
  NonLiveOrderEvidenceReclassification,
} from "../lifecycle/OrderLifecycleEvidenceService";

import type {
  ExecutionRestartRecoveryClassification,
  ExecutionRestartRecoveryFinding,
  ExecutionRestartRecoveryReport,
} from "./ExecutionRestartRecoveryGate";

import {
  executionRecoveryResolutionService,
} from "./ExecutionRecoveryResolutionService";

import {
  strategyOneTwoLegRestartRecoveryService,
} from "./StrategyOneTwoLegRestartRecoveryService";

const POSSIBLY_OPEN_STATUSES =
  new Set([
    "SUBMISSION_REQUESTED",
    "ACKNOWLEDGED",
    "OPEN",
    "TIMED_OUT",
  ]);

export class ExecutionRestartRecoveryGateService {
  private readonly startupNonLiveEvidenceReclassification:
    NonLiveOrderEvidenceReclassification;

  private readonly startupReport:
    ExecutionRestartRecoveryReport;

  constructor() {
    /*
     * Older PAPER lifecycles persisted the session-level `paper: true` proof
     * correctly but could write order snapshots before non-LIVE ownership was
     * propagated. Cross-correlate exact durable session IDs once at startup
     * and append corrections before the recovery gate is classified.
     */
    this.startupNonLiveEvidenceReclassification =
      orderLifecycleEvidenceService
        .reclassifyVerifiedNonLiveSessions(
          new Set([
            ...liveExecutionSessionEvidenceService
              .getVerifiedNonLiveSessionIds(),

            ...orderLifecycleEvidenceService
              .getSelfVerifiedSyntheticPaperSessionIds(),
          ]),
        );

    this.startupReport =
      this.evaluate();
  }

  getStartupReport():
    ExecutionRestartRecoveryReport {
    return structuredClone(
      this.startupReport,
    );
  }

  getReport():
    ExecutionRestartRecoveryReport {
    return this.evaluate();
  }

  canPrepareNewLiveExecution(): {
    allowed: boolean;

    report:
      ExecutionRestartRecoveryReport;

    reasons: string[];
  } {
    const report =
      this.getReport();

    return {
      allowed:
        report
          .allowNewLivePreparation,

      report,

      reasons:
        report
          .allowNewLivePreparation
          ? []
          : [
              ...report.blockers,
            ],
    };
  }

  private evaluate():
    ExecutionRestartRecoveryReport {
    const sessionEvidence =
      liveExecutionSessionEvidenceService
        .getDiagnostics();

    const orderEvidence =
      orderLifecycleEvidenceService
        .getDiagnostics();

    const strategyOnePairs =
      strategyOneTwoLegRestartRecoveryService
        .getReport();

    const findings:
      ExecutionRestartRecoveryFinding[] =
      [];

    const persistenceIntegrityProblems:
      string[] = [];

    if (
      sessionEvidence.lastError
    ) {
      persistenceIntegrityProblems.push(
        `LIVE session evidence persistence error: ${sessionEvidence.lastError}`,
      );
    }

    if (
      sessionEvidence
        .writeFailures >
      0
    ) {
      persistenceIntegrityProblems.push(
        `LIVE session evidence has ${sessionEvidence.writeFailures} persistence write failure(s).`,
      );
    }

    if (
      orderEvidence.lastError
    ) {
      persistenceIntegrityProblems.push(
        `Order lifecycle evidence persistence error: ${orderEvidence.lastError}`,
      );
    }

    if (
      orderEvidence
        .writeFailures >
      0
    ) {
      persistenceIntegrityProblems.push(
        `Order lifecycle evidence has ${orderEvidence.writeFailures} persistence write failure(s).`,
      );
    }

    persistenceIntegrityProblems.push(
      ...strategyOnePairs.persistenceProblems,
    );

    for (
      const problem
      of persistenceIntegrityProblems
    ) {
      findings.push({
        key:
          "PERSISTENCE_INTEGRITY_PROBLEM",

        source:
          "PERSISTENCE_INTEGRITY",

        sessionId:
          null,

        orderId:
          null,

        severity:
          "CRITICAL",

        message:
          problem,
      });
    }

    /*
     * VERSION 18 BUILD 13
     *
     * A persisted historical condition may only
     * be excluded after explicit durable recovery
     * resolution whose evidence fingerprint still
     * matches current evidence.
     */
    const unresolvedInterrupted =
      sessionEvidence
        .interrupted
        .filter(
          (
            session,
          ) =>
            !session.dryRun &&
            !executionRecoveryResolutionService
              .isSessionResolved(
                session.sessionId,
              ),
        );

    const unresolvedOrders =
      orderEvidence
        .duplicateEvidence
        .filter(
          (
            order,
          ) =>
            !executionRecoveryResolutionService
              .isSessionResolved(
                order.sessionId,
              ),
        );

    for (
      const session
      of unresolvedInterrupted
    ) {
      findings.push({
        key:
          "INTERRUPTED_REAL_LIVE_SESSION",

        source:
          "SESSION_EVIDENCE",

        sessionId:
          session.sessionId,

        orderId:
          null,

        severity:
          session.status ===
            "RUNNING"
            ? "CRITICAL"
            : "WARNING",

        message:
          `Persisted real LIVE session ${session.sessionId} remains unresolved in status ${session.status}.`,
      });
    }

    const possibleOpenOrders =
      unresolvedOrders.filter(
        (
          order,
        ) =>
          POSSIBLY_OPEN_STATUSES
            .has(
              order.status,
            ),
      );

    for (
      const order
      of possibleOpenOrders
    ) {
      findings.push({
        key:
          "POSSIBLE_OPEN_EXCHANGE_ORDER",

        source:
          "ORDER_EVIDENCE",

        sessionId:
          order.sessionId,

        orderId:
          order.orderId,

        severity:
          "CRITICAL",

        message:
          `Persisted ${order.leg} order ${order.orderId} remains unresolved with status ${order.status}.`,
      });
    }

    const possibleExposureSessions =
      this.findPossibleExposureSessions(
        unresolvedOrders,
      );

    for (
      const sessionId
      of possibleExposureSessions
    ) {
      findings.push({
        key:
          "POSSIBLE_UNBALANCED_EXECUTION_EXPOSURE",

        source:
          "ORDER_EVIDENCE",

        sessionId,

        orderId:
          null,

        severity:
          "CRITICAL",

        message:
          `Persisted order evidence for session ${sessionId} indicates unresolved execution exposure.`,
      });
    }

    for (const pair of strategyOnePairs.unresolved) {
      findings.push({
        key:
          pair.state === "PREPARED"
            ? "STRATEGY_ONE_PAIR_PREPARED_BEFORE_DISPATCH"
            : "STRATEGY_ONE_PAIR_REQUIRES_AUTHORITATIVE_RECOVERY",

        source:
          "STRATEGY_ONE_TWO_LEG_EVIDENCE",

        sessionId:
          pair.sessionId,

        orderId:
          null,

        severity:
          pair.state === "PREPARED"
            ? "WARNING"
            : "CRITICAL",

        message:
          pair.state === "PREPARED"
            ? `Strategy #1 pair ${pair.sessionId} was durably prepared but never crossed its dispatch boundary; explicit evidence-bound resolution is required.`
            : `Strategy #1 pair ${pair.sessionId} remains ${pair.state}; no retry, replacement, hedge, or unwind is automatic.`,
      });
    }

    const classification =
      this.resolveClassification(
        persistenceIntegrityProblems,
        unresolvedInterrupted.length,
        possibleOpenOrders.length,
        possibleExposureSessions.length,
        strategyOnePairs.summary.unresolvedSessions,
        strategyOnePairs.summary.possibleExposureSessions,
      );

    const allowNewLivePreparation =
      classification ===
      "CLEAN";

    const blockers =
      allowNewLivePreparation
        ? []
        : this.buildBlockers(
            classification,
            persistenceIntegrityProblems,
            unresolvedInterrupted.length,
            possibleOpenOrders.length,
            possibleExposureSessions.length,
            strategyOnePairs.summary.unresolvedSessions,
            strategyOnePairs.summary.possibleExposureSessions,
          );

    return {
      generatedAt:
        Date.now(),

      version:
        "18.0",

      build:
        "4",

      classification,

      failClosed:
        true,

      liveTradingEnabled:
        false,

      liveSubmissionAllowed:
        false,

      automaticRecoveryAllowed:
        false,

      automaticOrderResumeAllowed:
        false,

      automaticOrderResubmissionAllowed:
        false,

      automaticCancelAllowed:
        false,

      automaticHedgeAllowed:
        false,

      automaticUnwindAllowed:
        false,

      allowNewLivePreparation,

      summary: {
        interruptedRealSessions:
          unresolvedInterrupted.length,

        possibleSubmittedRealOrders:
          unresolvedOrders.length,

        possibleOpenOrders:
          possibleOpenOrders.length,

        possibleExposureSessions:
          possibleExposureSessions
            .length,

        unresolvedStrategyOneTwoLegSessions:
          strategyOnePairs.summary.unresolvedSessions,

        strategyOneTwoLegPossibleExposureSessions:
          strategyOnePairs.summary.possibleExposureSessions,

        persistenceIntegrityProblems:
          persistenceIntegrityProblems
            .length,

        findings:
          findings.length,
      },

      findings,

      blockers,

      nextActions:
        this.buildNextActions(
          classification,
        ),

      notes: [
        "Version 18 Build 13 extends the restart-recovery gate with explicit evidence-backed recovery resolutions.",

        "Alert acknowledgement or alert resolution does not clear restart recovery evidence.",

        "A recovery resolution is honored only while its evidence fingerprint still matches persisted session/order evidence.",

        "New or changed evidence automatically makes an older recovery resolution stale.",

        "No historical operational session is restored into coordinator memory.",

        "No automatic cancellation, resubmission, hedge or unwind occurs.",

        "V109 includes durable Strategy #1 pair-session evidence in restart recovery; DISPATCHING is treated as possible exposure.",

        "LIVE trading and LIVE order submission remain disabled.",

        `Startup non-LIVE evidence reconciliation matched ${this.startupNonLiveEvidenceReclassification.matchedOrders} order(s), durably reclassified ${this.startupNonLiveEvidenceReclassification.reclassifiedOrders}, and failed ${this.startupNonLiveEvidenceReclassification.failures}.`,
      ],
    };
  }

  private findPossibleExposureSessions(
    orders:
      readonly DuplicateOrderEvidence[],
  ): string[] {
    const grouped =
      new Map<
        string,
        DuplicateOrderEvidence[]
      >();

    for (
      const order
      of orders
    ) {
      const existing =
        grouped.get(
          order.sessionId,
        );

      if (
        existing
      ) {
        existing.push(
          order,
        );
      } else {
        grouped.set(
          order.sessionId,
          [
            order,
          ],
        );
      }
    }

    const possibleExposure =
      new Set<string>();

    for (
      const [
        sessionId,
        sessionOrders,
      ]
      of grouped
    ) {
      const buy =
        this.latestForLeg(
          sessionOrders,
          "BUY",
        );

      const sell =
        this.latestForLeg(
          sessionOrders,
          "SELL",
        );

      if (
        buy?.status ===
          "PARTIALLY_FILLED" ||
        sell?.status ===
          "PARTIALLY_FILLED"
      ) {
        possibleExposure.add(
          sessionId,
        );

        continue;
      }

      const buyFilled =
        buy?.status ===
        "FILLED";

      const sellFilled =
        sell?.status ===
        "FILLED";

      if (
        buyFilled !==
        sellFilled
      ) {
        possibleExposure.add(
          sessionId,
        );
      }
    }

    return Array.from(
      possibleExposure,
    );
  }

  private latestForLeg(
    orders:
      readonly DuplicateOrderEvidence[],

    leg:
      "BUY" |
      "SELL",
  ):
    DuplicateOrderEvidence |
    null {
    return (
      orders
        .filter(
          (
            order,
          ) =>
            order.leg ===
            leg,
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.updatedAt -
            first.updatedAt,
        )[0] ??
      null
    );
  }

  private resolveClassification(
    persistenceProblems:
      readonly string[],

    interruptedRealSessions:
      number,

    possibleOpenOrders:
      number,

    possibleExposureSessions:
      number,

    strategyOnePairSessions:
      number,

    strategyOnePairPossibleExposureSessions:
      number,
  ):
    ExecutionRestartRecoveryClassification {
    if (
      possibleExposureSessions +
        strategyOnePairPossibleExposureSessions >
      0
    ) {
      return "POSSIBLE_EXPOSURE";
    }

    if (
      possibleOpenOrders >
      0
    ) {
      return "POSSIBLE_OPEN_ORDER";
    }

    if (
      persistenceProblems.length >
        0 ||
      interruptedRealSessions >
        0 ||
      strategyOnePairSessions >
        0
    ) {
      return "REVIEW_REQUIRED";
    }

    return "CLEAN";
  }

  private buildBlockers(
    classification:
      ExecutionRestartRecoveryClassification,

    persistenceProblems:
      readonly string[],

    interruptedRealSessions:
      number,

    possibleOpenOrders:
      number,

    possibleExposureSessions:
      number,

    strategyOnePairSessions:
      number,

    strategyOnePairPossibleExposureSessions:
      number,
  ): string[] {
    const blockers:
      string[] = [
      ...persistenceProblems,
    ];

    if (
      interruptedRealSessions >
      0
    ) {
      blockers.push(
        `${interruptedRealSessions} interrupted real LIVE session(s) remain unresolved.`,
      );
    }

    if (
      possibleOpenOrders >
      0
    ) {
      blockers.push(
        `${possibleOpenOrders} persisted order(s) still require authoritative resolution.`,
      );
    }

    if (
      possibleExposureSessions >
      0
    ) {
      blockers.push(
        `${possibleExposureSessions} session(s) still contain possible execution exposure.`,
      );
    }

    if (
      strategyOnePairSessions >
      0
    ) {
      blockers.push(
        `${strategyOnePairSessions} Strategy #1 two-leg session(s) require explicit durable recovery resolution.`,
      );
    }

    if (
      strategyOnePairPossibleExposureSessions >
      0
    ) {
      blockers.push(
        `${strategyOnePairPossibleExposureSessions} Strategy #1 two-leg session(s) may contain real execution exposure.`,
      );
    }

    blockers.push(
      `Restart recovery classification is ${classification}; new LIVE preparation is fail-closed.`,
    );

    return [
      ...new Set(
        blockers,
      ),
    ];
  }

  private buildNextActions(
    classification:
      ExecutionRestartRecoveryClassification,
  ): string[] {
    if (
      classification ===
      "CLEAN"
    ) {
      return [
        "No unresolved restart-recovery evidence currently blocks future LIVE preparation.",

        "All other production safety gates still apply.",
      ];
    }

    return [
      "Run authoritative recovery inspection.",

      "Reconcile every potentially submitted order.",

      "Confirm terminal and quantity-balanced exchange state.",

      "Create an explicit evidence-backed recovery resolution.",

      "Re-check restart-recovery classification before any future LIVE preparation.",
    ];
  }
}

export const executionRestartRecoveryGateService =
  new ExecutionRestartRecoveryGateService();
