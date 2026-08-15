import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../../core/persistence/JsonlSnapshotStore";

import type {
  OrderLifecycleLeg,
  OrderLifecycleRecord,
  OrderLifecycleStatus,
} from "./OrderLifecycleRecord";

const DEFAULT_PERSISTENCE_FILE =
  resolve(
    process.cwd(),
    "logs",
    "execution",
    "order-lifecycle-evidence.jsonl",
  );

interface PersistedOrderLifecycleEvidence {
  schemaVersion: 1;

  capturedAt: number;

  dryRun: boolean;

  order: OrderLifecycleRecord;
}

export interface DuplicateOrderEvidence {
  orderId: string;

  sessionId: string;

  planId: string;

  leg: OrderLifecycleLeg;

  exchange: string;

  market: string;

  status: OrderLifecycleStatus;

  exchangeOrderId: string | null;

  clientOrderId: string | null;

  updatedAt: number;
}

export interface OrderLifecycleEvidenceDiagnostics {
  persistenceFilePath: string;

  restored: boolean;

  restoredAt: number | null;

  restoredOrders: number;

  restoredRealOrders: number;

  restoredDryRunOrders: number;

  possibleSubmittedRealOrders: number;

  duplicateGuardEntries: number;

  duplicateSubmissionRisk: boolean;

  writes: number;

  writeFailures: number;

  lastPersistedAt: number | null;

  lastError: string | null;

  foundation: {
    linesRead: number;

    validRecordsRead: number;

    legacyRecordsRead: number;

    malformedRecordsIgnored: number;

    lastSequence: number;
  };

  duplicateEvidence:
    DuplicateOrderEvidence[];
}

export interface NonLiveOrderEvidenceReclassification {
  requestedSessionIds: number;

  matchedOrders: number;

  reclassifiedOrders: number;

  failures: number;

  failedOrderIds: string[];
}

export class OrderLifecycleEvidenceService {
  private readonly store:
    JsonlSnapshotStore<
      PersistedOrderLifecycleEvidence
    >;

  private readonly latest =
    new Map<
      string,
      PersistedOrderLifecycleEvidence
    >();

  private restored =
    false;

  private restoredAt:
    number | null =
    null;

  private lastPersistedAt:
    number | null =
    null;

  constructor(
    persistenceFilePath =
      DEFAULT_PERSISTENCE_FILE,
  ) {
    this.store =
      new JsonlSnapshotStore<
        PersistedOrderLifecycleEvidence
      >({
        filePath:
          persistenceFilePath,

        isPayload:
          (
            value,
          ): value is
            PersistedOrderLifecycleEvidence =>
            this.isValidPayload(
              value,
            ),
      });

    this.restore();
  }

  capture(
    order:
      OrderLifecycleRecord,

    dryRun:
      boolean,
  ): void {
    const payload:
      PersistedOrderLifecycleEvidence = {
      schemaVersion:
        1,

      capturedAt:
        Date.now(),

      dryRun,

      order:
        structuredClone(
          order,
        ),
    };

    try {
      this.store.append(
        payload,
      );

      this.absorb(
        payload,
      );

      this.lastPersistedAt =
        payload.capturedAt;
    } catch {
      /*
       * Persistence diagnostics retain the
       * actual failure.
       *
       * No automatic recovery or order
       * resubmission is attempted here.
       */
    }
  }

  /**
   * Append durable corrections for orders whose owning sessions have already
   * been proven non-LIVE by persisted session evidence.
   *
   * The original snapshots remain in the JSONL audit trail. A correction is
   * only applied to an exact session ID supplied by the session-evidence
   * owner; plan names, exchange names, markets and order IDs are deliberately
   * not used as inference signals.
   */
  reclassifyVerifiedNonLiveSessions(
    sessionIds:
      ReadonlySet<string>,
  ): NonLiveOrderEvidenceReclassification {
    const verifiedSessionIds =
      new Set(
        Array.from(
          sessionIds,
        )
          .map(
            (
              sessionId,
            ) =>
              sessionId.trim(),
          )
          .filter(
            Boolean,
          ),
      );

    const candidates =
      Array.from(
        this.latest.values(),
      )
        .filter(
          (
            record,
          ) =>
            !record.dryRun &&
            verifiedSessionIds.has(
              record.order.sessionId,
            ),
        );

    let reclassifiedOrders =
      0;

    const failedOrderIds:
      string[] = [];

    for (
      const record
      of candidates
    ) {
      const correction:
        PersistedOrderLifecycleEvidence = {
        ...structuredClone(
          record,
        ),

        capturedAt:
          Date.now(),

        dryRun:
          true,
      };

      try {
        this.store.append(
          correction,
        );

        this.absorb(
          correction,
        );

        reclassifiedOrders +=
          1;
      } catch {
        failedOrderIds.push(
          record.order.id,
        );
      }
    }

    return {
      requestedSessionIds:
        verifiedSessionIds.size,

      matchedOrders:
        candidates.length,

      reclassifiedOrders,

      failures:
        failedOrderIds.length,

      failedOrderIds,
    };
  }

  /**
   * Recover exact session IDs from orphan order snapshots only when every
   * latest order in that session contains the PAPER executor's explicit
   * result provenance and no exchange-submission lifecycle event.
   *
   * This exists for historical PAPER resets that correctly removed session
   * evidence but predated order-evidence cleanup. Plan IDs and market names do
   * not participate in the decision.
   */
  getSelfVerifiedSyntheticPaperSessionIds():
    ReadonlySet<string> {
    const grouped =
      new Map<
        string,
        PersistedOrderLifecycleEvidence[]
      >();

    for (
      const record
      of this.latest.values()
    ) {
      if (
        record.dryRun
      ) {
        continue;
      }

      const existing =
        grouped.get(
          record.order.sessionId,
        );

      if (
        existing
      ) {
        existing.push(
          record,
        );
      } else {
        grouped.set(
          record.order.sessionId,
          [
            record,
          ],
        );
      }
    }

    const verified =
      new Set<string>();

    for (
      const [
        sessionId,
        records,
      ]
      of grouped
    ) {
      if (
        records.length >
          0 &&
        records.every(
          (
            record,
          ) =>
            this.hasExplicitSyntheticPaperProvenance(
              record.order,
            ),
        )
      ) {
        verified.add(
          sessionId,
        );
      }
    }

    return verified;
  }

  findPotentialDuplicate(
    sessionId:
      string,

    leg:
      OrderLifecycleLeg,

    clientOrderId?:
      string | null,
  ):
    DuplicateOrderEvidence | null {
    const normalizedClientOrderId =
      clientOrderId
        ?.trim() ||
      null;

    const candidates =
      Array.from(
        this.latest.values(),
      )
        .filter(
          (
            record,
          ) =>
            !record.dryRun,
        )
        .filter(
          (
            record,
          ) =>
            this.mayHaveReachedExchange(
              record.order.status,
            ),
        )
        .filter(
          (
            record,
          ) =>
            (
              record.order.sessionId ===
                sessionId &&
              record.order.leg ===
                leg
            ) ||
            (
              normalizedClientOrderId !==
                null &&
              record.order.clientOrderId ===
                normalizedClientOrderId
            ),
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.order.updatedAt -
            first.order.updatedAt,
        );

    const record =
      candidates[0];

    return record
      ? this.toDuplicateEvidence(
          record.order,
        )
      : null;
  }

  getDiagnostics():
    OrderLifecycleEvidenceDiagnostics {
    const foundation =
      this.store
        .getDiagnostics();

    const records =
      Array.from(
        this.latest.values(),
      );

    const real =
      records.filter(
        (
          record,
        ) =>
          !record.dryRun,
      );

    const dryRun =
      records.filter(
        (
          record,
        ) =>
          record.dryRun,
      );

    const duplicateEvidence =
      real
        .filter(
          (
            record,
          ) =>
            this.mayHaveReachedExchange(
              record.order.status,
            ),
        )
        .map(
          (
            record,
          ) =>
            this.toDuplicateEvidence(
              record.order,
            ),
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.updatedAt -
            first.updatedAt,
        );

    return {
      persistenceFilePath:
        foundation.filePath,

      restored:
        this.restored,

      restoredAt:
        this.restoredAt,

      restoredOrders:
        records.length,

      restoredRealOrders:
        real.length,

      restoredDryRunOrders:
        dryRun.length,

      possibleSubmittedRealOrders:
        duplicateEvidence.length,

      duplicateGuardEntries:
        duplicateEvidence.length,

      duplicateSubmissionRisk:
        duplicateEvidence.length >
        0,

      writes:
        foundation.writes,

      writeFailures:
        foundation.writeFailures,

      lastPersistedAt:
        this.lastPersistedAt,

      lastError:
        foundation.lastError,

      foundation: {
        linesRead:
          foundation.linesRead,

        validRecordsRead:
          foundation.validRecordsRead,

        legacyRecordsRead:
          foundation.legacyRecordsRead,

        malformedRecordsIgnored:
          foundation
            .malformedRecordsIgnored,

        lastSequence:
          foundation.lastSequence,
      },

      duplicateEvidence,
    };
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
      this.absorb(
        record,
      );
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

  private absorb(
    record:
      PersistedOrderLifecycleEvidence,
  ): void {
    const existing =
      this.latest
        .get(
          record.order.id,
        );

    if (
      !existing ||
      record.order.updatedAt >
        existing.order.updatedAt ||
      (
        record.order.updatedAt ===
          existing.order.updatedAt &&
        record.capturedAt >=
          existing.capturedAt
      )
    ) {
      this.latest.set(
        record.order.id,

        structuredClone(
          record,
        ),
      );
    }

    this.lastPersistedAt =
      Math.max(
        this.lastPersistedAt ??
          0,

        record.capturedAt,
      );
  }

  private mayHaveReachedExchange(
    status:
      OrderLifecycleStatus,
  ): boolean {
    return (
      status !==
        "PREPARED" &&
      status !==
        "ABORTED"
    );
  }

  private hasExplicitSyntheticPaperProvenance(
    order:
      OrderLifecycleRecord,
  ): boolean {
    const result =
      order.latestResult;

    if (
      !result ||
      result.executionTimeMs !==
        0
    ) {
      return false;
    }

    const resultMessages = [
      result.failureReason,
      ...result.reasons,
    ]
      .filter(
        (
          message,
        ): message is string =>
          typeof message ===
            "string",
      );

    const explicitPaperResult =
      resultMessages.some(
        (
          message,
        ) =>
          message ===
            "Synthetic PAPER leg completed." ||
          /^Synthetic PAPER (BUY|SELL) leg ended with [A-Z_]+\.$/
            .test(
              message,
            ) ||
          /^Injected deterministic (BUY|SELL)-leg failure\.$/
            .test(
              message,
            ),
      );

    if (
      !explicitPaperResult
    ) {
      return false;
    }

    const submissionEventTypes =
      new Set([
        "SUBMISSION_REQUESTED",
        "ORDER_ACKNOWLEDGED",
        "ORDER_OPEN",
      ]);

    const hasSubmissionEvidence =
      order.events.some(
        (
          event,
        ) =>
          submissionEventTypes.has(
            event.type,
          ),
      );

    const hasExplicitPreSubmissionBoundary =
      order.events.some(
        (
          event,
        ) =>
          event.type ===
            "ORDER_PREPARED" &&
          event.message.includes(
            "No exchange order has been submitted",
          ),
      );

    return (
      !hasSubmissionEvidence &&
      hasExplicitPreSubmissionBoundary
    );
  }

  private toDuplicateEvidence(
    order:
      OrderLifecycleRecord,
  ): DuplicateOrderEvidence {
    return {
      orderId:
        order.id,

      sessionId:
        order.sessionId,

      planId:
        order.planId,

      leg:
        order.leg,

      exchange:
        order.exchange,

      market:
        order.market,

      status:
        order.status,

      exchangeOrderId:
        order.exchangeOrderId,

      clientOrderId:
        order.clientOrderId,

      updatedAt:
        order.updatedAt,
    };
  }

  private isValidPayload(
    value:
      unknown,
  ): value is
    PersistedOrderLifecycleEvidence {
    if (
      !this.isRecord(
        value,
      ) ||
      value.schemaVersion !==
        1 ||
      typeof value.capturedAt !==
        "number" ||
      !Number.isFinite(
        value.capturedAt,
      ) ||
      typeof value.dryRun !==
        "boolean" ||
      !this.isRecord(
        value.order,
      )
    ) {
      return false;
    }

    const order =
      value.order;

    return (
      typeof order.id ===
        "string" &&
      typeof order.sessionId ===
        "string" &&
      typeof order.planId ===
        "string" &&
      typeof order.leg ===
        "string" &&
      typeof order.status ===
        "string" &&
      typeof order.updatedAt ===
        "number" &&
      Array.isArray(
        order.events,
      )
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

export const orderLifecycleEvidenceService =
  new OrderLifecycleEvidenceService();
