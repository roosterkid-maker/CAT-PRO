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
  strategyOneTwoLegLiveExecutionService,
} from "../arbitrage/StrategyOneTwoLegLiveExecutionService";

import type {
  CentralLiveOrderGatewayResponse,
} from "../central/CentralLiveOrderExecutionGateway";

import type {
  LiveExecutionRequest,
} from "../models/LiveExecutionRequest";

import {
  liveExecutionCoordinator,
} from "../coordinator/LiveExecutionCoordinator";

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

/*
 * Strategy #1's real live dispatch (StrategyOneTwoLegLiveExecutionService ->
 * CentralLiveOrderExecutionGateway) never touches LiveExecutionCoordinator/
 * OrderLifecycleManager/FillEngine directly - but PaperTwoLegExecutionLifecycleService
 * (PAPER trading's own two-leg simulation) does route through that
 * coordinator/lifecycle/fill machinery and calls evaluateSession() against
 * it. This engine therefore watches BOTH session sources: the legacy
 * coordinator (still the real, exercised source for PAPER) and Strategy
 * #1's own live two-leg session store (the actual source for real LIVE
 * orders, which the coordinator never sees). Both sides are normalized to
 * the same StrategyOneLegSnapshot shape so the exposure/escalation logic
 * below is written once and applies identically to either source.
 */
interface StrategyOneLegSnapshot {
  readonly exchange: string;
  readonly market: string;
  readonly status: string | null;
  readonly orderId: string | null;
  readonly requestedQuantity: number;
  readonly filledQuantity: number;
  readonly averageFillPrice: number | null;
  readonly requestedPrice: number | null;
  readonly updatedAt: number | null;
}

function legSnapshotFromGatewayResponse(
  request: LiveExecutionRequest,
  response: CentralLiveOrderGatewayResponse | null,
  updatedAt: number | null,
): StrategyOneLegSnapshot {
  const result =
    response?.record?.result ??
    null;

  return {
    exchange:
      request.exchange,
    market:
      request.market,
    status:
      result?.status ??
      null,
    orderId:
      result?.orderId ??
      null,
    requestedQuantity:
      request.quantity,
    filledQuantity:
      Math.max(
        0,
        result?.filledQuantity ??
          0,
      ),
    averageFillPrice:
      result &&
      result.averageFillPrice >
        0
        ? result.averageFillPrice
        : null,
    requestedPrice:
      typeof request.price ===
        "number" &&
      request.price >
        0
        ? request.price
        : null,
    updatedAt,
  };
}

function resolveLifecycleFilledQuantity(
  order:
    OrderLifecycleRecord,
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
    order.filledQuantity,
  );
}

// orders/fills carry every order submitted for this leg (a retry can add
// a second order after the first), so filled quantity is summed across
// all of them - matching the original per-leg accounting this engine used
// before Strategy #1's own live sessions were added as a second source.
// The other, single-valued fields (status/orderId/prices/updatedAt) come
// from the latest order, since only the current attempt's status is
// relevant to "is the counter leg still active".
function legSnapshotFromLifecycle(
  orders:
    readonly OrderLifecycleRecord[],
  fillFor:
    (
      orderId: string,
    ) =>
      OrderFillSummary |
      null,
): StrategyOneLegSnapshot {
  const latest =
    orders[
      orders.length -
        1
    ] ??
    null;

  const filledQuantity =
    orders.reduce(
      (
        total,
        order,
      ) =>
        total +
        resolveLifecycleFilledQuantity(
          order,
          fillFor(
            order.id,
          ),
        ),
      0,
    );

  const latestFill =
    latest
      ? fillFor(
          latest.id,
        )
      : null;

  const averageFillPrice =
    latestFill &&
    latestFill.averageFillPrice >
      0
      ? latestFill.averageFillPrice
      : latest &&
        latest.averageFillPrice >
          0
        ? latest.averageFillPrice
        : null;

  const requestedPrice =
    latest?.requestedPrice !==
      null &&
    latest?.requestedPrice !==
      undefined &&
    latest.requestedPrice >
      0
      ? latest.requestedPrice
      : null;

  return {
    exchange:
      latest?.exchange ??
      "",
    market:
      latest?.market ??
      "",
    status:
      latest?.status ??
      null,
    orderId:
      latest?.id ??
      null,
    requestedQuantity:
      latest?.requestedQuantity ??
      0,
    filledQuantity,
    averageFillPrice,
    requestedPrice,
    updatedAt:
      latest?.updatedAt ??
      null,
  };
}

function isLegFailureTerminal(
  status:
    string |
    null,
): boolean {
  return status ===
      "CANCELLED" ||
    status ===
      "REJECTED" ||
    status ===
      "TIMED_OUT" ||
    status ===
      "FAILED" ||
    status ===
      "ABORTED";
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
  // because in-memory session/order state does not survive a restart -
  // without this, every incident/severity/acknowledgement/resolution this
  // engine ever produced was lost on every process restart.
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

    // PREPARED means neither leg has dispatched yet (no exposure is
    // possible), and COMPLETED means both legs settled without the pair
    // owner itself ever flagging POSSIBLE_EXPOSURE - both are safe to
    // skip. Every other state (DISPATCHING, POSSIBLE_EXPOSURE,
    // RECOVERY_REQUIRED, FAILED) can carry a real, still-unresolved
    // imbalance and stays in scope so it keeps being watched (and its
    // incident severity keeps escalating) until it's actually resolved.
    const strategyOneSessionIds =
      strategyOneTwoLegLiveExecutionService
        .listSessions()
        .filter(
          (
            session,
          ) =>
            session.state !==
              "PREPARED" &&
            session.state !==
              "COMPLETED",
        )
        .map(
          (
            session,
          ) =>
            session.sessionId,
        );

    // failInternal() can move ANY active coordinator session (including
    // one already mid-flight with a real fill on one leg) straight to
    // FAILED - it never requires the legs to be flat first. A session
    // that leaves RUNNING this way still needs exposure monitoring, so
    // FAILED must stay in scope here too; only pre-submission
    // (VALIDATING/RESERVED/READY_FOR_SUBMISSION) and genuinely order-free
    // terminal states (COMPLETED, CANCELLED, EXPIRED) are safe to skip.
    const coordinatorSessionIds =
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
        )
        .map(
          (
            session,
          ) =>
            session.id,
        );

    let detections =
      0;

    for (
      const sessionId
      of [
        ...strategyOneSessionIds,
        ...coordinatorSessionIds,
      ]
    ) {
      const evaluation =
        this.evaluateSession(
          sessionId,
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
    const resolved =
      this.resolveSessionLegs(
        sessionId,
      );

    if (
      !resolved
    ) {
      throw new Error(
        "Live execution session not found.",
      );
    }

    const {
      sessionId:
        resolvedSessionId,
      planId,
      preparedAt,
      buyLeg,
      sellLeg,
    } =
      resolved;

    this.sessionsEvaluated +=
      1;

    const boughtQuantity =
      buyLeg.filledQuantity;

    const soldQuantity =
      sellLeg.filledQuantity;

    const rawDelta =
      boughtQuantity -
      soldQuantity;

    const tolerance =
      this.quantityTolerance(
        Math.max(
          buyLeg.requestedQuantity,
          sellLeg.requestedQuantity,
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
        resolvedSessionId,
        now,
      );

      return {
        sessionId:
          resolvedSessionId,

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
        preparedAt,
        buyLeg,
        sellLeg,
        exposureDirection,
        exposedQuantity,
        now,
      );

    const incident =
      this.upsertIncident({
        sessionId:
          resolvedSessionId,

        planId,

        buyLeg,

        sellLeg,

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
        resolvedSessionId,

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

  private resolveSessionLegs(
    sessionId:
      string,
  ): {
    sessionId:
      string;
    planId:
      string;
    preparedAt:
      number;
    buyLeg:
      StrategyOneLegSnapshot;
    sellLeg:
      StrategyOneLegSnapshot;
  } |
    null {
    const strategyOneSession =
      strategyOneTwoLegLiveExecutionService
        .getSession(
          sessionId,
        );

    if (
      strategyOneSession
    ) {
      return {
        sessionId:
          strategyOneSession.sessionId,
        planId:
          strategyOneSession.opportunityId,
        preparedAt:
          strategyOneSession.preparedAt,
        buyLeg:
          legSnapshotFromGatewayResponse(
            strategyOneSession.buyRequest,
            strategyOneSession.buyResponse,
            strategyOneSession.buyDispatchedAt,
          ),
        sellLeg:
          legSnapshotFromGatewayResponse(
            strategyOneSession.sellRequest,
            strategyOneSession.sellResponse,
            strategyOneSession.sellDispatchedAt,
          ),
      };
    }

    const coordinatorSession =
      liveExecutionCoordinator
        .getSession(
          sessionId,
        );

    if (
      !coordinatorSession
    ) {
      return null;
    }

    const orders =
      orderLifecycleManager
        .getBySession(
          coordinatorSession.id,
        );

    const fillFor =
      (
        orderId: string,
      ) =>
        fillEngine
          .getSummary(
            orderId,
          );

    return {
      sessionId:
        coordinatorSession.id,
      planId:
        coordinatorSession.planId,
      preparedAt:
        coordinatorSession.createdAt,
      buyLeg:
        legSnapshotFromLifecycle(
          orders.filter(
            (
              order,
            ) =>
              order.leg ===
              "BUY",
          ),
          fillFor,
        ),
      sellLeg:
        legSnapshotFromLifecycle(
          orders.filter(
            (
              order,
            ) =>
              order.leg ===
              "SELL",
          ),
          fillFor,
        ),
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
    fallbackCreatedAt:
      number,

    buyLeg:
      StrategyOneLegSnapshot,

    sellLeg:
      StrategyOneLegSnapshot,

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
    const counterLeg =
      exposureDirection ===
      "LONG"
        ? sellLeg
        : buyLeg;

    const exposureAgeMs =
      this.resolveExposureAgeMs(
        fallbackCreatedAt,
        buyLeg,
        sellLeg,
        now,
      );

    if (
      counterLeg.status ===
        null
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
          `${exposureDirection} exposure of ${exposedQuantity} units exists, but the counter-leg has not dispatched. ` +
          "Prepare/retry the counter leg before considering emergency exit.",
      };
    }

    if (
      isLegFailureTerminal(
        counterLeg.status,
      )
    ) {
      return {
        strategy:
          "EMERGENCY_EXIT",

        severity:
          "CRITICAL",

        reason:
          `${exposureDirection} exposure of ${exposedQuantity} units remains after the counter leg reached terminal status ${counterLeg.status}. ` +
          "Emergency exit is recommended, but automatic emergency order submission is intentionally disabled.",
      };
    }

    if (
      counterLeg.status ===
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
      sessionId:
        string;

      planId:
        string;

      buyLeg:
        StrategyOneLegSnapshot;

      sellLeg:
        StrategyOneLegSnapshot;

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
          input.sessionId,
        );

    const existing =
      existingId
        ? this.incidents
            .get(
              existingId,
            )
        : undefined;

    // An operator who resolved a prior incident for this exact session
    // attested that this specific exposure snapshot is handled (e.g. a
    // compensating order placed out-of-band on a different venue than the
    // session itself tracked). The underlying session record never
    // changes as a result of that manual resolution - re-evaluating it on
    // the next scan tick would otherwise recreate a brand-new OPEN
    // incident every single tick forever, making a resolved incident
    // impossible to keep resolved. Only escalate again if the exposure
    // has genuinely changed since that resolution.
    if (
      !existing
    ) {
      const mostRecentResolved =
        [...this.incidents.values()]
          .filter(
            (
              incident,
            ) =>
              incident.sessionId ===
                input.sessionId &&
              incident.status ===
                "RESOLVED",
          )
          .sort(
            (
              first,
              second,
            ) =>
              second.updatedAt -
              first.updatedAt,
          )[0];

      if (
        mostRecentResolved &&
        mostRecentResolved.exposureDirection ===
          input.exposureDirection &&
        mostRecentResolved.boughtQuantity ===
          input.boughtQuantity &&
        mostRecentResolved.soldQuantity ===
          input.soldQuantity
      ) {
        return structuredClone(
          mostRecentResolved,
        );
      }
    }

    const estimatedExposureNotional =
      this.estimateExposureNotional(
        input.exposureDirection,
        input.exposedQuantity,
        input.buyLeg,
        input.sellLeg,
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
        input.buyLeg.status;

      existing.sellLifecycleStatus =
        input.sellLeg.status;

      existing.buyOrderLifecycleId =
        input.buyLeg.orderId;

      existing.sellOrderLifecycleId =
        input.sellLeg.orderId;

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
        input.sessionId,

      planId:
        input.planId,

      market:
        input.buyLeg.market,

      buyExchange:
        input.buyLeg.exchange,

      sellExchange:
        input.sellLeg.exchange,

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
        input.buyLeg.status,

      sellLifecycleStatus:
        input.sellLeg.status,

      buyOrderLifecycleId:
        input.buyLeg.orderId,

      sellOrderLifecycleId:
        input.sellLeg.orderId,

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
        input.sessionId,
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

    buyLeg:
      StrategyOneLegSnapshot,

    sellLeg:
      StrategyOneLegSnapshot,
  ): number | null {
    const price =
      this.resolveReferencePrice(
        direction ===
        "LONG"
          ? buyLeg
          : sellLeg,
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
    leg:
      StrategyOneLegSnapshot,
  ): number | null {
    if (
      leg.averageFillPrice !==
        null
    ) {
      return leg
        .averageFillPrice;
    }

    if (
      leg.requestedPrice !==
        null
    ) {
      return leg
        .requestedPrice;
    }

    return null;
  }

  private resolveExposureAgeMs(
    fallbackCreatedAt:
      number,

    buyLeg:
      StrategyOneLegSnapshot,

    sellLeg:
      StrategyOneLegSnapshot,

    now:
      number,
  ): number {
    // Exposure age must measure how long the imbalance itself has existed,
    // not how long the session has existed. fallbackCreatedAt is
    // deliberately excluded from the candidate list below: a session that
    // ran balanced for a while before one leg was cancelled must not
    // inherit that leg's whole lifetime as its exposure age. The most
    // recent of the two legs' updatedAt is the moment the current
    // (im)balance was created, so it is the correct reference point - not
    // the oldest (Math.min), which would skip the counter-leg grace
    // window entirely for any session that had been running for a while
    // before the imbalance appeared.
    const candidateTimes = [
      buyLeg
        .updatedAt,

      sellLeg
        .updatedAt,
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
        : fallbackCreatedAt;

    return Math.max(
      0,
      now -
        reference,
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
