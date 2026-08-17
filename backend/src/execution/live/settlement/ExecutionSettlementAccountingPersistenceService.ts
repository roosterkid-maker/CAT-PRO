import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../../core/persistence/JsonlSnapshotStore";

import type {
  ExecutionSettlementRecord,
} from "./ExecutionSettlementRecord";

export type SettlementAccountingEvidenceState =
  | "PENDING_SETTLEMENT"
  | "BLOCKED_NOT_ACCOUNTED"
  | "DRY_RUN_NOT_ACCOUNTED"
  | "ACCOUNTING_APPLIED";

interface PersistedSettlementAccountingEvidence {
  schemaVersion: 1;

  capturedAt: number;

  sessionId: string;

  dryRun: boolean;

  state:
    SettlementAccountingEvidenceState;

  settlement:
    ExecutionSettlementRecord |
    null;

  message: string;
}

export interface SettlementAccountingPreflightResult {
  allowed: boolean;

  uncertain: boolean;

  existingSettlement:
    ExecutionSettlementRecord |
    null;

  reasons: string[];
}

export interface ExecutionSettlementAccountingPersistenceDiagnostics {
  persistenceFilePath: string;

  restored: boolean;

  restoredAt: number | null;

  restoredSessions: number;

  settledSessions: number;

  blockedSessions: number;

  accountingApplied: number;

  dryRunNotAccounted: number;

  accountingUncertain: number;

  duplicateSettlementProtectionActive: true;

  automaticAccountingReplayAllowed: false;

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

  uncertainSessionIds: string[];
}

const DEFAULT_PERSISTENCE_FILE =
  resolve(
    process.cwd(),

    "logs",

    "execution",

    "settlement-accounting-evidence.jsonl",
  );

export class ExecutionSettlementAccountingPersistenceService {
  private readonly store:
    JsonlSnapshotStore<
      PersistedSettlementAccountingEvidence
    >;

  private readonly latest =
    new Map<
      string,
      PersistedSettlementAccountingEvidence
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
        PersistedSettlementAccountingEvidence
      >({
        filePath:
          persistenceFilePath,

        isPayload:
          (
            value,
          ): value is
            PersistedSettlementAccountingEvidence =>
            this.isValidPayload(
              value,
            ),
      });

    this.restore();
  }

  preflight(
    sessionId:
      string,
  ): SettlementAccountingPreflightResult {
    const existing =
      this.latest.get(
        sessionId,
      );

    if (
      !existing
    ) {
      return {
        allowed:
          true,

        uncertain:
          false,

        existingSettlement:
          null,

        reasons:
          [],
      };
    }

    if (
      existing.state ===
      "PENDING_SETTLEMENT"
    ) {
      return {
        allowed:
          false,

        uncertain:
          true,

        existingSettlement:
          existing.settlement
            ? structuredClone(
                existing.settlement,
              )
            : null,

        reasons: [
          "A previous settlement attempt was persisted as PENDING_SETTLEMENT.",

          "The prior process may have crashed before or after account PnL application.",

          "Automatic replay is blocked to prevent duplicate settlement/accounting.",
        ],
      };
    }

    if (
      existing.state ===
        "ACCOUNTING_APPLIED" ||
      existing.state ===
        "DRY_RUN_NOT_ACCOUNTED"
    ) {
      return {
        allowed:
          false,

        uncertain:
          false,

        existingSettlement:
          existing.settlement
            ? structuredClone(
                existing.settlement,
              )
            : null,

        reasons: [
          `Settlement evidence already exists in state ${existing.state}.`,

          "Duplicate settlement/accounting application is blocked.",
        ],
      };
    }

    /*
     * BLOCKED_NOT_ACCOUNTED may safely be
     * attempted again later because no account
     * PnL was applied.
     */
    return {
      allowed:
        true,

      uncertain:
        false,

      existingSettlement:
        null,

      reasons:
        [],
    };
  }

  begin(
    sessionId:
      string,

    dryRun:
      boolean,
  ): void {
    this.persist({
      schemaVersion:
        1,

      capturedAt:
        Date.now(),

      sessionId,

      dryRun,

      state:
        "PENDING_SETTLEMENT",

      settlement:
        null,

      message:
        "Settlement attempt started before calling the in-memory settlement engine.",
    });
  }

  finalize(
    record:
      ExecutionSettlementRecord,

    dryRun:
      boolean,
  ): void {
    let state:
      SettlementAccountingEvidenceState;

    if (
      record.status !==
      "SETTLED"
    ) {
      state =
        "BLOCKED_NOT_ACCOUNTED";
    } else if (
      dryRun
    ) {
      state =
        "DRY_RUN_NOT_ACCOUNTED";
    } else {
      state =
        "ACCOUNTING_APPLIED";
    }

    this.persist({
      schemaVersion:
        1,

      capturedAt:
        Date.now(),

      sessionId:
        record.sessionId,

      dryRun,

      state,

      settlement:
        structuredClone(
          record,
        ),

      message:
        state ===
        "ACCOUNTING_APPLIED"
          ? "Base settlement service returned SETTLED for a real session; account PnL application completed before this commit marker."
          : state ===
              "DRY_RUN_NOT_ACCOUNTED"
            ? "Dry-run settlement completed without account PnL mutation."
            : "Settlement did not finalize; no account PnL was applied.",
    });
  }

  getSettlement(
    sessionId:
      string,
  ): ExecutionSettlementRecord | null {
    const existing =
      this.latest.get(
        sessionId,
      );

    return existing
      ?.settlement
      ? structuredClone(
          existing.settlement,
        )
      : null;
  }

  getDiagnostics():
    ExecutionSettlementAccountingPersistenceDiagnostics {
    const foundation =
      this.store
        .getDiagnostics();

    const records =
      Array.from(
        this.latest.values(),
      );

    const uncertain =
      records.filter(
        (
          record,
        ) =>
          record.state ===
          "PENDING_SETTLEMENT",
      );

    return {
      persistenceFilePath:
        foundation.filePath,

      restored:
        this.restored,

      restoredAt:
        this.restoredAt,

      restoredSessions:
        records.length,

      settledSessions:
        records.filter(
          (
            record,
          ) =>
            record.settlement
              ?.status ===
            "SETTLED",
        ).length,

      blockedSessions:
        records.filter(
          (
            record,
          ) =>
            record.settlement
              ?.status ===
            "BLOCKED",
        ).length,

      accountingApplied:
        records.filter(
          (
            record,
          ) =>
            record.state ===
            "ACCOUNTING_APPLIED",
        ).length,

      dryRunNotAccounted:
        records.filter(
          (
            record,
          ) =>
            record.state ===
            "DRY_RUN_NOT_ACCOUNTED",
        ).length,

      accountingUncertain:
        uncertain.length,

      duplicateSettlementProtectionActive:
        true,

      automaticAccountingReplayAllowed:
        false,

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

      uncertainSessionIds:
        uncertain
          .map(
            (
              record,
            ) =>
              record.sessionId,
          )
          .sort(),
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

  private persist(
    record:
      PersistedSettlementAccountingEvidence,
  ): void {
    this.store.append(
      record,
    );

    this.absorb(
      record,
    );

    this.lastPersistedAt =
      record.capturedAt;
  }

  private absorb(
    record:
      PersistedSettlementAccountingEvidence,
  ): void {
    const existing =
      this.latest.get(
        record.sessionId,
      );

    if (
      !existing ||
      record.capturedAt >=
        existing.capturedAt
    ) {
      this.latest.set(
        record.sessionId,

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

  private isValidPayload(
    value:
      unknown,
  ): value is
    PersistedSettlementAccountingEvidence {
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
      typeof value.sessionId !==
        "string" ||
      typeof value.dryRun !==
        "boolean" ||
      ![
        "PENDING_SETTLEMENT",
        "BLOCKED_NOT_ACCOUNTED",
        "DRY_RUN_NOT_ACCOUNTED",
        "ACCOUNTING_APPLIED",
      ].includes(
        String(
          value.state,
        ),
      ) ||
      typeof value.message !==
        "string"
    ) {
      return false;
    }

    if (
      value.settlement ===
      null
    ) {
      return true;
    }

    if (
      !this.isRecord(
        value.settlement,
      )
    ) {
      return false;
    }

    return (
      typeof value.settlement
        .id ===
        "string" &&
      typeof value.settlement
        .sessionId ===
        "string" &&
      typeof value.settlement
        .status ===
        "string" &&
      typeof value.settlement
        .createdAt ===
        "number" &&
      Array.isArray(
        value.settlement
          .reasons,
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

export const executionSettlementAccountingPersistenceService =
  new ExecutionSettlementAccountingPersistenceService();