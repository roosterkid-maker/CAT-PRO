import {
  createHash,
} from "node:crypto";

import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../../core/persistence/JsonlSnapshotStore";

import {
  liveExecutionSessionEvidenceService,
} from "../coordinator/LiveExecutionSessionEvidenceService";

import {
  orderLifecycleEvidenceService,
} from "../lifecycle/OrderLifecycleEvidenceService";

import {
  authoritativeRecoveryInspectionService,
} from "./AuthoritativeRecoveryInspectionService";

import type {
  ExecutionRecoveryResolutionDiagnostics,
  ExecutionRecoveryResolutionRecord,
  RecoveryResolutionBasis,
} from "./ExecutionRecoveryResolution";

const DEFAULT_PERSISTENCE_FILE =
  resolve(
    process.cwd(),

    "logs",

    "execution",

    "recovery-resolutions.jsonl",
  );

export class ExecutionRecoveryResolutionService {
  private readonly store:
    JsonlSnapshotStore<
      ExecutionRecoveryResolutionRecord
    >;

  private readonly latest =
    new Map<
      string,
      ExecutionRecoveryResolutionRecord
    >();

  private restored =
    false;

  private restoredAt:
    number | null =
    null;

  constructor(
    persistenceFilePath =
      DEFAULT_PERSISTENCE_FILE,
  ) {
    this.store =
      new JsonlSnapshotStore<
        ExecutionRecoveryResolutionRecord
      >({
        filePath:
          persistenceFilePath,

        isPayload:
          (
            value,
          ): value is
            ExecutionRecoveryResolutionRecord =>
            this.isValidPayload(
              value,
            ),
      });

    this.restore();
  }

  async resolveSession(
    sessionId:
      string,

    resolutionNote:
      string,
  ):
    Promise<
      ExecutionRecoveryResolutionRecord
    > {
    const normalizedSessionId =
      sessionId.trim();

    const normalizedNote =
      resolutionNote.trim();

    if (
      !normalizedSessionId
    ) {
      throw new Error(
        "sessionId is required.",
      );
    }

    if (
      !normalizedNote
    ) {
      throw new Error(
        "resolutionNote is required.",
      );
    }

    const sessionEvidence =
      liveExecutionSessionEvidenceService
        .getDiagnostics();

    const orderEvidence =
      orderLifecycleEvidenceService
        .getDiagnostics();

    const interrupted =
      sessionEvidence
        .interrupted
        .find(
          (
            session,
          ) =>
            !session.dryRun &&
            session.sessionId ===
              normalizedSessionId,
        ) ??
      null;

    const riskyOrders =
      orderEvidence
        .duplicateEvidence
        .filter(
          (
            order,
          ) =>
            order.sessionId ===
            normalizedSessionId,
        );

    if (
      !interrupted &&
      riskyOrders.length ===
        0
    ) {
      throw new Error(
        "No unresolved persisted recovery evidence exists for this session.",
      );
    }

    /*
     * Safe pre-submission resolution:
     *
     * VALIDATING / RESERVED /
     * READY_FOR_SUBMISSION with zero evidence
     * that an order crossed the submission
     * boundary.
     */
    if (
      interrupted &&
      interrupted.status !==
        "RUNNING" &&
      riskyOrders.length ===
        0
    ) {
      return this.persistResolution({
        sessionId:
          normalizedSessionId,

        basis:
          "PERSISTED_PRE_SUBMISSION_NO_ORDER",

        resolutionNote:
          normalizedNote,

        authoritativeOrdersChecked:
          0,

        authoritativeFilledBuyQuantity:
          0,

        authoritativeFilledSellQuantity:
          0,

        interruptedSessionStatus:
          interrupted.status,

        riskyOrderIds: [],

        authoritativeStatuses: [],
      });
    }

    /*
     * RUNNING with no order evidence is too
     * ambiguous to resolve automatically.
     *
     * Missing lifecycle evidence is not proof
     * that no exchange order was submitted.
     */
    if (
      riskyOrders.length ===
      0
    ) {
      throw new Error(
        "Interrupted RUNNING session has no authoritative order evidence. Recovery cannot be safely resolved.",
      );
    }

    const inspection =
      await authoritativeRecoveryInspectionService
        .inspect();

    const relevant =
      inspection
        .inspections
        .filter(
          (
            item,
          ) =>
            item.sessionId ===
            normalizedSessionId,
        );

    if (
      relevant.length !==
      riskyOrders.length
    ) {
      throw new Error(
        "Not every persisted risky order has authoritative inspection evidence.",
      );
    }

    const unresolved =
      relevant.filter(
        (
          item,
        ) =>
          item.inspectionStatus !==
          "CONFIRMED_TERMINAL",
      );

    if (
      unresolved.length >
      0
    ) {
      throw new Error(
        [
          "Recovery resolution blocked.",

          ...unresolved.map(
            (
              item,
            ) =>
              `${item.exchange}:${item.market}:${item.leg} is ${item.inspectionStatus}.`,
          ),
        ].join(
          " | ",
        ),
      );
    }

    /*
     * All risky orders are authoritative and
     * terminal. Now prove quantity balance.
     */
    const buyFilled =
      relevant
        .filter(
          (
            item,
          ) =>
            item.leg ===
            "BUY",
        )
        .reduce(
          (
            total,
            item,
          ) =>
            total +
            (
              item
                .authoritativeFilledQuantity ??
              0
            ),

          0,
        );

    const sellFilled =
      relevant
        .filter(
          (
            item,
          ) =>
            item.leg ===
            "SELL",
        )
        .reduce(
          (
            total,
            item,
          ) =>
            total +
            (
              item
                .authoritativeFilledQuantity ??
              0
            ),

          0,
        );

    const tolerance =
      this.quantityTolerance(
        Math.max(
          buyFilled,
          sellFilled,
        ),
      );

    if (
      Math.abs(
        buyFilled -
        sellFilled,
      ) >
      tolerance
    ) {
      throw new Error(
        `Authoritative terminal orders remain quantity-unbalanced. BUY=${buyFilled}, SELL=${sellFilled}.`,
      );
    }

    return this.persistResolution({
      sessionId:
        normalizedSessionId,

      basis:
        "AUTHORITATIVE_TERMINAL_BALANCED",

      resolutionNote:
        normalizedNote,

      authoritativeOrdersChecked:
        relevant.length,

      authoritativeFilledBuyQuantity:
        buyFilled,

      authoritativeFilledSellQuantity:
        sellFilled,

      interruptedSessionStatus:
        interrupted?.status ??
        null,

      riskyOrderIds:
        riskyOrders
          .map(
            (
              order,
            ) =>
              order.orderId,
          )
          .sort(),

      authoritativeStatuses:
        relevant.map(
          (
            item,
          ) => ({
            lifecycleOrderId:
              item.lifecycleOrderId,

            leg:
              item.leg,

            exchange:
              item.exchange,

            exchangeOrderId:
              item.exchangeOrderId,

            status:
              item.authoritativeStatus,

            filledQuantity:
              item
                .authoritativeFilledQuantity,
          }),
        ),
    });
  }

  isSessionResolved(
    sessionId:
      string,
  ): boolean {
    const resolution =
      this.latest.get(
        sessionId,
      );

    if (
      !resolution
    ) {
      return false;
    }

    return (
      resolution
        .evidenceFingerprint ===
      this.createCurrentFingerprint(
        sessionId,
      )
    );
  }

  getResolution(
    sessionId:
      string,
  ):
    ExecutionRecoveryResolutionRecord |
    null {
    const resolution =
      this.latest.get(
        sessionId,
      );

    return resolution
      ? structuredClone(
          resolution,
        )
      : null;
  }

  getDiagnostics():
    ExecutionRecoveryResolutionDiagnostics {
    const foundation =
      this.store
        .getDiagnostics();

    const resolutions =
      Array.from(
        this.latest.values(),
      )
        .sort(
          (
            first,
            second,
          ) =>
            second.resolvedAt -
            first.resolvedAt,
        )
        .map(
          (
            resolution,
          ) =>
            structuredClone(
              resolution,
            ),
        );

    const currentlyValidResolutions =
      resolutions.filter(
        (
          resolution,
        ) =>
          this.isSessionResolved(
            resolution.sessionId,
          ),
      ).length;

    return {
      generatedAt:
        Date.now(),

      version:
        "18.0",

      build:
        "13",

      liveTradingEnabled:
        false,

      liveSubmissionAllowed:
        false,

      automaticRecoveryAllowed:
        false,

      automaticGateClearingAllowed:
        false,

      explicitEvidenceRequired:
        true,

      restored:
        this.restored,

      restoredAt:
        this.restoredAt,

      totalResolutions:
        resolutions.length,

      currentlyValidResolutions,

      staleResolutions:
        resolutions.length -
        currentlyValidResolutions,

      writes:
        foundation.writes,

      writeFailures:
        foundation.writeFailures,

      lastError:
        foundation.lastError,

      resolutions,
    };
  }

  private persistResolution(
    input: {
      sessionId: string;

      basis:
        RecoveryResolutionBasis;

      resolutionNote:
        string;

      authoritativeOrdersChecked:
        number;

      authoritativeFilledBuyQuantity:
        number;

      authoritativeFilledSellQuantity:
        number;

      interruptedSessionStatus:
        string | null;

      riskyOrderIds:
        string[];

      authoritativeStatuses:
        ExecutionRecoveryResolutionRecord[
          "evidence"
        ][
          "authoritativeStatuses"
        ];
    },
  ):
    ExecutionRecoveryResolutionRecord {
    const record:
      ExecutionRecoveryResolutionRecord = {
      schemaVersion:
        1,

      sessionId:
        input.sessionId,

      status:
        "RESOLVED",

      basis:
        input.basis,

      evidenceFingerprint:
        this.createCurrentFingerprint(
          input.sessionId,
        ),

      resolutionNote:
        input.resolutionNote,

      resolvedAt:
        Date.now(),

      authoritativeOrdersChecked:
        input
          .authoritativeOrdersChecked,

      authoritativeFilledBuyQuantity:
        input
          .authoritativeFilledBuyQuantity,

      authoritativeFilledSellQuantity:
        input
          .authoritativeFilledSellQuantity,

      evidence: {
        interruptedSessionStatus:
          input
            .interruptedSessionStatus,

        riskyOrderIds:
          input
            .riskyOrderIds,

        authoritativeStatuses:
          input
            .authoritativeStatuses,
      },
    };

    /*
     * Durable first.
     *
     * Gate must never clear only in memory.
     */
    this.store.append(
      record,
    );

    this.latest.set(
      record.sessionId,

      structuredClone(
        record,
      ),
    );

    return structuredClone(
      record,
    );
  }

  private createCurrentFingerprint(
    sessionId:
      string,
  ): string {
    const sessions =
      liveExecutionSessionEvidenceService
        .getDiagnostics();

    const orders =
      orderLifecycleEvidenceService
        .getDiagnostics();

    const interrupted =
      sessions
        .interrupted
        .filter(
          (
            session,
          ) =>
            !session.dryRun &&
            session.sessionId ===
              sessionId,
        )
        .map(
          (
            session,
          ) => ({
            sessionId:
              session.sessionId,

            status:
              session.status,

            updatedAt:
              session.updatedAt,
          }),
        )
        .sort(
          (
            first,
            second,
          ) =>
            first.updatedAt -
            second.updatedAt,
        );

    const riskyOrders =
      orders
        .duplicateEvidence
        .filter(
          (
            order,
          ) =>
            order.sessionId ===
            sessionId,
        )
        .map(
          (
            order,
          ) => ({
            orderId:
              order.orderId,

            leg:
              order.leg,

            status:
              order.status,

            exchangeOrderId:
              order.exchangeOrderId,

            updatedAt:
              order.updatedAt,
          }),
        )
        .sort(
          (
            first,
            second,
          ) =>
            first.orderId.localeCompare(
              second.orderId,
            ),
        );

    return createHash(
      "sha256",
    )
      .update(
        JSON.stringify({
          interrupted,

          riskyOrders,
        }),
      )
      .digest(
        "hex",
      );
  }

  private quantityTolerance(
    quantity:
      number,
  ): number {
    return Math.max(
      1e-10,

      Math.abs(
        quantity,
      ) *
        1e-8,
    );
  }

  private restore():
    void {
    const records =
      this.store
        .readAll();

    for (
      const record
      of records
    ) {
      const existing =
        this.latest.get(
          record.sessionId,
        );

      if (
        !existing ||
        record.resolvedAt >=
          existing.resolvedAt
      ) {
        this.latest.set(
          record.sessionId,

          structuredClone(
            record,
          ),
        );
      }
    }

    if (
      records.length >
      0
    ) {
      this.restored =
        true;

      this.restoredAt =
        Date.now();
    }
  }

  private isValidPayload(
    value:
      unknown,
  ): value is
    ExecutionRecoveryResolutionRecord {
    if (
      !this.isRecord(
        value,
      ) ||
      value.schemaVersion !==
        1 ||
      typeof value.sessionId !==
        "string" ||
      value.status !==
        "RESOLVED" ||
      typeof value.basis !==
        "string" ||
      typeof value.evidenceFingerprint !==
        "string" ||
      typeof value.resolutionNote !==
        "string" ||
      typeof value.resolvedAt !==
        "number" ||
      !Number.isFinite(
        value.resolvedAt,
      ) ||
      !this.isRecord(
        value.evidence,
      )
    ) {
      return false;
    }

    return (
      value.basis ===
        "AUTHORITATIVE_TERMINAL_BALANCED" ||
      value.basis ===
        "PERSISTED_PRE_SUBMISSION_NO_ORDER"
    );
  }

  private isRecord(
    value:
      unknown,
  ): value is
    Record<
      string,
      unknown
    > {
    return (
      typeof value ===
        "object" &&
      value !==
        null &&
      !Array.isArray(
        value,
      )
    );
  }
}

export const executionRecoveryResolutionService =
  new ExecutionRecoveryResolutionService();