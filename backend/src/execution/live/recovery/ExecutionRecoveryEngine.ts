import {
  randomUUID,
} from "node:crypto";

import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../../core/persistence/JsonlSnapshotStore";

import {
  liveExecutionCoordinator,
} from "../coordinator/LiveExecutionCoordinator";

import type {
  LiveExecutionSession,
} from "../coordinator/LiveExecutionSession";

import {
  fillEngine,
} from "../fills/FillEngine";

import type {
  OrderFillSummary,
} from "../fills/FillRecord";

import {
  orderLifecycleManager,
} from "../lifecycle/OrderLifecycleManager";

import type {
  OrderLifecycleRecord,
  OrderLifecycleStatus,
} from "../lifecycle/OrderLifecycleRecord";

import type {
  ExecutionExposureDirection,
  ExecutionRecoveryDiagnostics,
  ExecutionRecoveryEvaluation,
  ExecutionRecoveryIncident,
  ExecutionRecoveryIncidentStatus,
  ExecutionRecoverySeverity,
  ExecutionRecoveryStrategy,
} from "./ExecutionRecoveryRecord";

const DEFAULT_FILE =
  resolve(
    process.cwd(),
    "logs",
    "live",
    "execution-recovery-incidents.jsonl",
  );

const INCIDENT_STATUSES:
  readonly ExecutionRecoveryIncidentStatus[] = [
    "OPEN",
    "ACKNOWLEDGED",
    "RESOLVED",
  ];

function isIncidentRecord(
  value: unknown,
): value is ExecutionRecoveryIncident {
  if (
    typeof value !==
      "object" ||
    value ===
      null
  ) {
    return false;
  }

  const item =
    value as Partial<ExecutionRecoveryIncident>;

  return typeof item.id ===
      "string" &&
    item.id.length >
      0 &&
    typeof item.sessionId ===
      "string" &&
    INCIDENT_STATUSES.includes(
      item.status as ExecutionRecoveryIncidentStatus,
    ) &&
    Number.isSafeInteger(
      item.createdAt,
    ) &&
    Number.isSafeInteger(
      item.updatedAt,
    );
}

export class ExecutionRecoveryEngine {
  private static readonly SCAN_INTERVAL_MS =
    1_000;

  private static readonly COUNTER_LEG_GRACE_MS =
    2_500;

  private static readonly CRITICAL_EXPOSURE_AGE_MS =
    5_000;

  private static readonly MAXIMUM_HISTORY =
    250;

  private static readonly SEVERITY_RANK: Readonly<
    Record<ExecutionRecoverySeverity, number>
  > = {
    INFO: 0,
    WARNING: 1,
    CRITICAL: 2,
  };

  private readonly incidents =
    new Map<
      string,
      ExecutionRecoveryIncident
    >();

  private readonly activeIncidentBySession =
    new Map<
      string,
      string
    >();

  // Durable, delta-per-mutation journal for incidents. Every sibling
  // recovery service in this directory uses JsonlSnapshotStore precisely
  // because liveExecutionCoordinator's in-memory session state does not
  // survive a restart - without this, every incident/severity/
  // acknowledgement/resolution this engine ever produced was lost on
  // every process restart.
  private readonly store:
    JsonlSnapshotStore<ExecutionRecoveryIncident>;

  private timer:
    ReturnType<typeof setInterval> |
    null =
    null;

  private lastScanAt:
    number |
    null =
    null;

  private scans =
    0;

  private sessionsEvaluated =
    0;

  private balancedSessions =
    0;

  private recoveryDetections =
    0;

  constructor(
    filePath =
      DEFAULT_FILE,
  ) {
    this.store =
      new JsonlSnapshotStore({
        filePath,
        isPayload:
          isIncidentRecord,
      });

    for (
      const record
      of this.store
        .readAll()
    ) {
      const current =
        this.incidents.get(
          record.id,
        );

      if (
        !current ||
        record.updatedAt >=
          current.updatedAt
      ) {
        this.incidents.set(
          record.id,
          structuredClone(
            record,
          ),
        );
      }
    }

    for (
      const incident
      of this.incidents.values()
    ) {
      if (
        incident.status !==
        "RESOLVED"
      ) {
        this.activeIncidentBySession.set(
          incident.sessionId,
          incident.id,
        );
      }
    }

    this.trimHistory();
  }

  start(): void {
    if (
      this.timer !==
      null
    ) {
      return;
    }

    this.scan();

    this.timer =
      setInterval(
        () => {
          this.scan();
        },

        ExecutionRecoveryEngine
          .SCAN_INTERVAL_MS,
      );

    this.timer.unref?.();

    console.log(
      "[ExecutionRecovery] Recovery engine started.",
    );
  }

  stop(): void {
    if (
      this.timer ===
      null
    ) {
      return;
    }

    clearInterval(
      this.timer,
    );

    this.timer =
      null;

    console.log(
      "[ExecutionRecovery] Recovery engine stopped.",
    );
  }

  scan(
    now =
      Date.now(),
  ): number {
    this.lastScanAt =
      now;

    this.scans +=
      1;

    // failInternal() can move ANY active session (including one already
    // mid-flight with a real fill on one leg) straight to FAILED - it
    // never requires the legs to be flat first. A session that leaves
    // RUNNING this way still needs exposure monitoring, so FAILED must
    // stay in scope here too; only pre-submission (VALIDATING/RESERVED/
    // READY_FOR_SUBMISSION) and genuinely order-free terminal states
    // (COMPLETED, CANCELLED - cancel() refuses a RUNNING session -,
    // EXPIRED - only reachable before order submission) are safe to skip.
    const sessions =
      liveExecutionCoordinator
        .getDiagnostics()
        .sessions
        .filter(
          (
            session,
          ) =>
            session.status ===
              "RUNNING" ||
            session.status ===
              "FAILED",
        );

    let detections =
      0;

    for (
      const session
      of sessions
    ) {
      const evaluation =
        this.evaluateSession(
          session.id,
          now,
        );

      if (
        evaluation
          .requiresRecovery
      ) {
        detections +=
          1;
      }
    }

    return detections;
  }

  evaluateSession(
    sessionId:
      string,

    now =
      Date.now(),
  ): ExecutionRecoveryEvaluation {
    const session =
      liveExecutionCoordinator
        .getSession(
          sessionId,
        );

    if (
      !session
    ) {
      throw new Error(
        "Live execution session not found.",
      );
    }

    this.sessionsEvaluated +=
      1;

    const orders =
      orderLifecycleManager
        .getBySession(
          session.id,
        );

    const buyOrders =
      orders.filter(
        (
          order,
        ) =>
          order.leg ===
          "BUY",
      );

    const sellOrders =
      orders.filter(
        (
          order,
        ) =>
          order.leg ===
          "SELL",
      );

    const buyOrder =
      buyOrders[
        buyOrders.length -
          1
      ] ??
      null;

    const sellOrder =
      sellOrders[
        sellOrders.length -
          1
      ] ??
      null;

    const buyFill =
      buyOrder
        ? fillEngine
            .getSummary(
              buyOrder.id,
            )
        : null;

    const sellFill =
      sellOrder
        ? fillEngine
            .getSummary(
              sellOrder.id,
            )
        : null;

    const boughtQuantity =
      buyOrders.reduce(
        (
          total,
          order,
        ) =>
          total +
          this.resolveFilledQuantity(
            order,
            fillEngine
              .getSummary(
                order.id,
              ),
          ),
        0,
      );

    const soldQuantity =
      sellOrders.reduce(
        (
          total,
          order,
        ) =>
          total +
          this.resolveFilledQuantity(
            order,
            fillEngine
              .getSummary(
                order.id,
              ),
          ),
        0,
      );

    const rawDelta =
      boughtQuantity -
      soldQuantity;

    const tolerance =
      this.quantityTolerance(
        Math.max(
          ...orders.map(
            (
              order,
            ) =>
              order.requestedQuantity,
          ),

          boughtQuantity,

          soldQuantity,
        ),
      );

    const exposureDirection:
      ExecutionExposureDirection =
      Math.abs(
        rawDelta,
      ) <=
      tolerance
        ? "BALANCED"
        : rawDelta >
          0
          ? "LONG"
          : "SHORT";

    const exposedQuantity =
      exposureDirection ===
      "BALANCED"
        ? 0
        : Math.abs(
            rawDelta,
          );

    if (
      exposureDirection ===
      "BALANCED"
    ) {
      this.balancedSessions +=
        1;

      this.resolveActiveIncidentIfBalanced(
        session.id,
        now,
      );

      return {
        sessionId:
          session.id,

        requiresRecovery:
          false,

        exposureDirection,

        boughtQuantity,

        soldQuantity,

        exposedQuantity:
          0,

        strategy:
          "NONE",

        severity:
          "INFO",

        reason:
          "Execution legs are quantity-balanced; no asymmetric exposure is detected.",

        incident:
          null,
      };
    }

    const assessment =
      this.chooseRecovery(
        session,
        buyOrder,
        sellOrder,
        exposureDirection,
        exposedQuantity,
        now,
      );

    const incident =
      this.upsertIncident({
        session,

        buyOrder,

        sellOrder,

        buyFill,

        sellFill,

        boughtQuantity,

        soldQuantity,

        exposedQuantity,

        exposureDirection,

        strategy:
          assessment.strategy,

        severity:
          assessment.severity,

        reason:
          assessment.reason,

        now,
      });

    this.recoveryDetections +=
      1;

    return {
      sessionId:
        session.id,

      requiresRecovery:
        true,

      exposureDirection,

      boughtQuantity,

      soldQuantity,

      exposedQuantity,

      strategy:
        assessment.strategy,

      severity:
        assessment.severity,

      reason:
        assessment.reason,

      incident,
    };
  }

  acknowledge(
    incidentId:
      string,
  ): ExecutionRecoveryIncident {
    const incident =
      this.requireIncident(
        incidentId,
      );

    if (
      incident.status ===
      "RESOLVED"
    ) {
      throw new Error(
        "Resolved recovery incident cannot be acknowledged again.",
      );
    }

    if (
      incident.status ===
      "OPEN"
    ) {
      incident.status =
        "ACKNOWLEDGED";

      incident.acknowledgedAt =
        Date.now();

      incident.updatedAt =
        incident.acknowledgedAt;

      this.persist(
        incident,
      );
    }

    return structuredClone(
      incident,
    );
  }

  resolve(
    incidentId:
      string,

    resolutionNote:
      string,
  ): ExecutionRecoveryIncident {
    const incident =
      this.requireIncident(
        incidentId,
      );

    if (
      incident.status ===
      "RESOLVED"
    ) {
      return structuredClone(
        incident,
      );
    }

    const note =
      resolutionNote
        .trim();

    if (
      !note
    ) {
      throw new Error(
        "Recovery resolution note is required.",
      );
    }

    const now =
      Date.now();

    incident.status =
      "RESOLVED";

    incident.resolvedAt =
      now;

    incident.updatedAt =
      now;

    incident.resolutionNote =
      note;

    const activeIncidentId =
      this.activeIncidentBySession
        .get(
          incident.sessionId,
        );

    if (
      activeIncidentId ===
      incident.id
    ) {
      this.activeIncidentBySession
        .delete(
          incident.sessionId,
        );
    }

    this.persist(
      incident,
    );

    return structuredClone(
      incident,
    );
  }

  getIncident(
    incidentId:
      string,
  ): ExecutionRecoveryIncident | null {
    const incident =
      this.incidents
        .get(
          incidentId,
        );

    return incident
      ? structuredClone(
          incident,
        )
      : null;
  }

  getBySession(
    sessionId:
      string,
  ): ExecutionRecoveryIncident[] {
    return Array.from(
      this.incidents
        .values(),
    )
      .filter(
        (
          incident,
        ) =>
          incident.sessionId ===
          sessionId,
      )
      .sort(
        (
          first,
          second,
        ) =>
          second.createdAt -
          first.createdAt,
      )
      .map(
        (
          incident,
        ) =>
          structuredClone(
            incident,
          ),
      );
  }

  getDiagnostics():
    ExecutionRecoveryDiagnostics {
    const incidents =
      Array.from(
        this.incidents
          .values(),
      )
        .sort(
          (
            first,
            second,
          ) =>
            second.updatedAt -
            first.updatedAt,
        )
        .slice(
          0,
          ExecutionRecoveryEngine
            .MAXIMUM_HISTORY,
        )
        .map(
          (
            incident,
          ) =>
            structuredClone(
              incident,
            ),
        );

    return {
      generatedAt:
        Date.now(),

      running:
        this.timer !==
        null,

      scanIntervalMs:
        ExecutionRecoveryEngine
          .SCAN_INTERVAL_MS,

      lastScanAt:
        this.lastScanAt,

      scans:
        this.scans,

      sessionsEvaluated:
        this.sessionsEvaluated,

      balancedSessions:
        this.balancedSessions,

      recoveryDetections:
        this.recoveryDetections,

      openIncidents:
        incidents.filter(
          (
            incident,
          ) =>
            incident.status ===
            "OPEN",
        ).length,

      acknowledgedIncidents:
        incidents.filter(
          (
            incident,
          ) =>
            incident.status ===
            "ACKNOWLEDGED",
        ).length,

      resolvedIncidents:
        incidents.filter(
          (
            incident,
          ) =>
            incident.status ===
            "RESOLVED",
        ).length,

      criticalIncidents:
        incidents.filter(
          (
            incident,
          ) =>
            incident.status !==
              "RESOLVED" &&
            incident.severity ===
              "CRITICAL",
        ).length,

      warningIncidents:
        incidents.filter(
          (
            incident,
          ) =>
            incident.status !==
              "RESOLVED" &&
            incident.severity ===
              "WARNING",
        ).length,

      emergencyExitRecommendations:
        incidents.filter(
          (
            incident,
          ) =>
            incident.strategy ===
            "EMERGENCY_EXIT",
        ).length,

      retryRecommendations:
        incidents.filter(
          (
            incident,
          ) =>
            incident.strategy ===
            "RETRY_COUNTER_LEG",
        ).length,

      waitRecommendations:
        incidents.filter(
          (
            incident,
          ) =>
            incident.strategy ===
            "WAIT_FOR_COUNTER_LEG",
        ).length,

      manualInterventionRecommendations:
        incidents.filter(
          (
            incident,
          ) =>
            incident.strategy ===
            "MANUAL_INTERVENTION",
        ).length,

      automaticEmergencySubmissionEnabled:
        false,

      incidents,
    };
  }

  private chooseRecovery(
    session:
      LiveExecutionSession,

    buyOrder:
      OrderLifecycleRecord |
      null,

    sellOrder:
      OrderLifecycleRecord |
      null,

    exposureDirection:
      Exclude<
        ExecutionExposureDirection,
        "BALANCED"
      >,

    exposedQuantity:
      number,

    now:
      number,
  ): {
    strategy:
      ExecutionRecoveryStrategy;

    severity:
      ExecutionRecoverySeverity;

    reason:
      string;
  } {
    const counterOrder =
      exposureDirection ===
      "LONG"
        ? sellOrder
        : buyOrder;

    const exposureAgeMs =
      this.resolveExposureAgeMs(
        session,
        buyOrder,
        sellOrder,
        now,
      );

    if (
      !counterOrder
    ) {
      return {
        strategy:
          "RETRY_COUNTER_LEG",

        severity:
          exposureAgeMs >=
          ExecutionRecoveryEngine
            .CRITICAL_EXPOSURE_AGE_MS
            ? "CRITICAL"
            : "WARNING",

        reason:
          `${exposureDirection} exposure of ${exposedQuantity} units exists, but the counter-leg lifecycle is missing. ` +
          "Prepare/retry the counter leg before considering emergency exit.",
      };
    }

    if (
      this.isFailureTerminal(
        counterOrder.status,
      )
    ) {
      return {
        strategy:
          "EMERGENCY_EXIT",

        severity:
          "CRITICAL",

        reason:
          `${exposureDirection} exposure of ${exposedQuantity} units remains after the counter leg reached terminal status ${counterOrder.status}. ` +
          "Emergency exit is recommended, but automatic emergency order submission is intentionally disabled.",
      };
    }

    if (
      counterOrder.status ===
      "FILLED"
    ) {
      return {
        strategy:
          "MANUAL_INTERVENTION",

        severity:
          "CRITICAL",

        reason:
          `${exposureDirection} exposure remains even though the counter leg reports FILLED. ` +
          "The leg quantities are inconsistent and require reconciliation before further automated action.",
      };
    }

    if (
      exposureAgeMs <=
      ExecutionRecoveryEngine
        .COUNTER_LEG_GRACE_MS
    ) {
      return {
        strategy:
          "WAIT_FOR_COUNTER_LEG",

        severity:
          "WARNING",

        reason:
          `${exposureDirection} exposure of ${exposedQuantity} units is currently unhedged, but the counter leg is still active inside the recovery grace window.`,
      };
    }

    if (
      exposureAgeMs >=
      ExecutionRecoveryEngine
        .CRITICAL_EXPOSURE_AGE_MS
    ) {
      return {
        strategy:
          "EMERGENCY_EXIT",

        severity:
          "CRITICAL",

        reason:
          `${exposureDirection} exposure of ${exposedQuantity} units has remained unhedged beyond the critical exposure window. ` +
          "Emergency exit is recommended; automatic exchange submission remains disabled.",
      };
    }

    return {
      strategy:
        "RETRY_COUNTER_LEG",

      severity:
        "WARNING",

      reason:
        `${exposureDirection} exposure of ${exposedQuantity} units remains after the initial grace window. ` +
        "Counter-leg retry is recommended before escalation to emergency exit.",
    };
  }

  private upsertIncident(
    input: {
      session:
        LiveExecutionSession;

      buyOrder:
        OrderLifecycleRecord |
        null;

      sellOrder:
        OrderLifecycleRecord |
        null;

      buyFill:
        OrderFillSummary |
        null;

      sellFill:
        OrderFillSummary |
        null;

      boughtQuantity:
        number;

      soldQuantity:
        number;

      exposedQuantity:
        number;

      exposureDirection:
        Exclude<
          ExecutionExposureDirection,
          "BALANCED"
        >;

      strategy:
        ExecutionRecoveryStrategy;

      severity:
        ExecutionRecoverySeverity;

      reason:
        string;

      now:
        number;
    },
  ): ExecutionRecoveryIncident {
    const existingId =
      this.activeIncidentBySession
        .get(
          input.session.id,
        );

    const existing =
      existingId
        ? this.incidents
            .get(
              existingId,
            )
        : undefined;

    const estimatedExposureNotional =
      this.estimateExposureNotional(
        input.exposureDirection,
        input.exposedQuantity,
        input.buyOrder,
        input.sellOrder,
        input.buyFill,
        input.sellFill,
      );

    if (
      existing &&
      existing.status !==
        "RESOLVED"
    ) {
      // An operator who acknowledged this incident acknowledged it at its
      // PRIOR severity. If it has since escalated (e.g. WARNING ->
      // CRITICAL as the counter-leg grace window expires), that
      // acknowledgement no longer covers the current risk - re-open it so
      // diagnostics/alerting that key off status==="OPEN" see it again.
      if (
        existing.status ===
          "ACKNOWLEDGED" &&
        ExecutionRecoveryEngine.SEVERITY_RANK[
          input.severity
        ] >
          ExecutionRecoveryEngine.SEVERITY_RANK[
            existing.severity
          ]
      ) {
        existing.status =
          "OPEN";
      }

      existing.severity =
        input.severity;

      existing.strategy =
        input.strategy;

      existing.exposureDirection =
        input.exposureDirection;

      existing.boughtQuantity =
        input.boughtQuantity;

      existing.soldQuantity =
        input.soldQuantity;

      existing.exposedQuantity =
        input.exposedQuantity;

      existing.estimatedExposureNotional =
        estimatedExposureNotional;

      existing.buyLifecycleStatus =
        input.buyOrder
          ?.status ??
        null;

      existing.sellLifecycleStatus =
        input.sellOrder
          ?.status ??
        null;

      existing.buyOrderLifecycleId =
        input.buyOrder
          ?.id ??
        null;

      existing.sellOrderLifecycleId =
        input.sellOrder
          ?.id ??
        null;

      existing.reason =
        input.reason;

      existing.updatedAt =
        input.now;

      this.persist(
        existing,
      );

      return structuredClone(
        existing,
      );
    }

    const incident:
      ExecutionRecoveryIncident = {
      id:
        randomUUID(),

      sessionId:
        input.session.id,

      planId:
        input.session.planId,

      market:
        input.session.market,

      buyExchange:
        input.session.buyExchange,

      sellExchange:
        input.session.sellExchange,

      status:
        "OPEN",

      severity:
        input.severity,

      strategy:
        input.strategy,

      exposureDirection:
        input.exposureDirection,

      boughtQuantity:
        input.boughtQuantity,

      soldQuantity:
        input.soldQuantity,

      exposedQuantity:
        input.exposedQuantity,

      estimatedExposureNotional,

      buyLifecycleStatus:
        input.buyOrder
          ?.status ??
        null,

      sellLifecycleStatus:
        input.sellOrder
          ?.status ??
        null,

      buyOrderLifecycleId:
        input.buyOrder
          ?.id ??
        null,

      sellOrderLifecycleId:
        input.sellOrder
          ?.id ??
        null,

      reason:
        input.reason,

      createdAt:
        input.now,

      updatedAt:
        input.now,

      acknowledgedAt:
        null,

      resolvedAt:
        null,

      resolutionNote:
        null,
    };

    this.incidents.set(
      incident.id,
      incident,
    );

    this.activeIncidentBySession
      .set(
        input.session.id,
        incident.id,
      );

    this.persist(
      incident,
    );

    this.trimHistory();

    return structuredClone(
      incident,
    );
  }

  private resolveActiveIncidentIfBalanced(
    sessionId:
      string,

    now:
      number,
  ): void {
    const activeId =
      this.activeIncidentBySession
        .get(
          sessionId,
        );

    if (
      !activeId
    ) {
      return;
    }

    const incident =
      this.incidents
        .get(
          activeId,
        );

    if (
      !incident ||
      incident.status ===
      "RESOLVED"
    ) {
      this.activeIncidentBySession
        .delete(
          sessionId,
        );

      return;
    }

    incident.status =
      "RESOLVED";

    incident.resolvedAt =
      now;

    incident.updatedAt =
      now;

    incident.resolutionNote =
      "Automatically resolved because buy and sell filled quantities became balanced.";

    this.persist(
      incident,
    );

    this.activeIncidentBySession
      .delete(
        sessionId,
      );
  }

  private estimateExposureNotional(
    direction:
      Exclude<
        ExecutionExposureDirection,
        "BALANCED"
      >,

    quantity:
      number,

    buyOrder:
      OrderLifecycleRecord |
      null,

    sellOrder:
      OrderLifecycleRecord |
      null,

    buyFill:
      OrderFillSummary |
      null,

    sellFill:
      OrderFillSummary |
      null,
  ): number | null {
    const price =
      direction ===
      "LONG"
        ? this.resolveReferencePrice(
            buyFill,
            buyOrder,
          )
        : this.resolveReferencePrice(
            sellFill,
            sellOrder,
          );

    if (
      price ===
      null
    ) {
      return null;
    }

    return this.round(
      quantity *
        price,
      12,
    );
  }

  private resolveReferencePrice(
    fill:
      OrderFillSummary |
      null,

    order:
      OrderLifecycleRecord |
      null,
  ): number | null {
    if (
      fill &&
      fill.averageFillPrice >
        0
    ) {
      return fill
        .averageFillPrice;
    }

    if (
      order &&
      order.averageFillPrice >
        0
    ) {
      return order
        .averageFillPrice;
    }

    if (
      order
        ?.requestedPrice !==
        null &&
      order
        ?.requestedPrice !==
        undefined &&
      order.requestedPrice >
        0
    ) {
      return order
        .requestedPrice;
    }

    return null;
  }

  private resolveFilledQuantity(
    order:
      OrderLifecycleRecord |
      null,

    fill:
      OrderFillSummary |
      null,
  ): number {
    if (
      fill
    ) {
      return Math.max(
        0,
        fill.filledQuantity,
      );
    }

    return Math.max(
      0,
      order
        ?.filledQuantity ??
        0,
    );
  }

  private resolveExposureAgeMs(
    session:
      LiveExecutionSession,

    buyOrder:
      OrderLifecycleRecord |
      null,

    sellOrder:
      OrderLifecycleRecord |
      null,

    now:
      number,
  ): number {
    // Exposure age must measure how long the imbalance itself has existed,
    // not how long the session has existed. session.startedAt/updatedAt
    // are deliberately excluded: a session that ran balanced for a while
    // before one leg was cancelled must not inherit that leg's whole
    // lifetime as its exposure age. The most recent of the two legs'
    // updatedAt is the moment the current (im)balance was created, so it
    // is the correct reference point - not the oldest (Math.min), which
    // would skip the counter-leg grace window entirely for any session
    // that had been running for a while before the imbalance appeared.
    const candidateTimes = [
      buyOrder
        ?.updatedAt,

      sellOrder
        ?.updatedAt,
    ].filter(
      (
        value,
      ): value is number =>
        typeof value ===
          "number" &&
        Number.isFinite(
          value,
        ) &&
        value >
          0,
    );

    const reference =
      candidateTimes.length >
      0
        ? Math.max(
            ...candidateTimes,
          )
        : session.createdAt;

    return Math.max(
      0,
      now -
        reference,
    );
  }

  private isFailureTerminal(
    status:
      OrderLifecycleStatus,
  ): boolean {
    return (
      status ===
        "CANCELLED" ||
      status ===
        "REJECTED" ||
      status ===
        "TIMED_OUT" ||
      status ===
        "FAILED" ||
      status ===
        "ABORTED"
    );
  }

  private quantityTolerance(
    quantity:
      number,
  ): number {
    return Math.max(
      1e-12,

      Math.abs(
        quantity,
      ) *
        1e-9,
    );
  }

  private requireIncident(
    incidentId:
      string,
  ): ExecutionRecoveryIncident {
    const incident =
      this.incidents
        .get(
          incidentId,
        );

    if (
      !incident
    ) {
      throw new Error(
        "Execution recovery incident not found.",
      );
    }

    return incident;
  }

  private persist(
    incident: ExecutionRecoveryIncident,
  ): void {
    this.store.append(
      structuredClone(
        incident,
      ),
    );
  }

  private trimHistory():
    void {
    if (
      this.incidents.size <=
      ExecutionRecoveryEngine
        .MAXIMUM_HISTORY
    ) {
      return;
    }

    const removable =
      Array.from(
        this.incidents
          .values(),
      )
        .filter(
          (
            incident,
          ) =>
            incident.status ===
            "RESOLVED",
        )
        .sort(
          (
            first,
            second,
          ) =>
            first.updatedAt -
            second.updatedAt,
        );

    while (
      this.incidents.size >
        ExecutionRecoveryEngine
          .MAXIMUM_HISTORY &&
      removable.length >
        0
    ) {
      const oldest =
        removable.shift();

      if (
        !oldest
      ) {
        break;
      }

      this.incidents.delete(
        oldest.id,
      );
    }
  }

  private round(
    value:
      number,

    decimalPlaces =
      2,
  ): number {
    if (
      !Number.isFinite(
        value,
      )
    ) {
      return 0;
    }

    const multiplier =
      10 **
      decimalPlaces;

    return (
      Math.round(
        (
          value +
          Number.EPSILON
        ) *
          multiplier,
      ) /
      multiplier
    );
  }
}

export const executionRecoveryEngine =
  new ExecutionRecoveryEngine();
