import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../core/persistence/JsonlSnapshotStore";

import type {
  PaperExecutionJournalDiagnostics,
  PaperExecutionJournalRecord,
  PaperExecutionLineage,
} from "../models/PaperExecutionJournal";

import type {
  PaperTwoLegExecutionLifecycleResult,
} from "../models/PaperTwoLegExecutionLifecycle";

const DEFAULT_PAPER_EXECUTION_JOURNAL_FILE =
  resolve(
    process.cwd(),
    "logs",
    "paper",
    "execution-journal.jsonl",
  );

export class PaperExecutionJournalService {
  private readonly store:
    JsonlSnapshotStore<
      PaperExecutionJournalRecord
    >;

  private readonly latest =
    new Map<
      string,
      PaperExecutionJournalRecord
    >();

  private restored =
    false;

  private restoredAt:
    number | null =
    null;

  constructor(
    persistenceFilePath =
      DEFAULT_PAPER_EXECUTION_JOURNAL_FILE,
  ) {
    this.store =
      new JsonlSnapshotStore<
        PaperExecutionJournalRecord
      >({
        filePath:
          persistenceFilePath,

        isPayload:
          (
            value,
          ): value is
            PaperExecutionJournalRecord =>
            this.isValidRecord(
              value,
            ),
      });

    this.restore();
  }

  begin(
    lifecycle:
      PaperTwoLegExecutionLifecycleResult,
  ): PaperExecutionJournalRecord {
    if (
      lifecycle.status !==
        "COMPLETED" ||
      lifecycle.settlement.status !==
        "SETTLED" ||
      !lifecycle.result.successful ||
      lifecycle.result.mode !==
        "PAPER"
    ) {
      throw new Error(
        "Only a completed, settled PAPER lifecycle can enter pending accounting.",
      );
    }

    const existing =
      this.latest.get(
        lifecycle.result.planId,
      );

    if (
      existing
    ) {
      this.assertSameResult(
        existing,
        lifecycle,
      );

      if (
        existing.state ===
          "FAILED_NOT_ACCOUNTED"
      ) {
        throw new Error(
          `PAPER plan ${existing.planId} was already journaled as failed.`,
        );
      }

      return structuredClone(
        existing,
      );
    }

    return this.persist({
      schemaVersion:
        1,

      capturedAt:
        Date.now(),

      planId:
        lifecycle.result.planId,

      accountingTransactionId:
        this.createAccountingTransactionId(
          lifecycle.result.planId,
        ),

      state:
        "SETTLED_PENDING_ACCOUNTING",

      result:
        structuredClone(
          lifecycle.result,
        ),

      lineage:
        this.createLineage(
          lifecycle,
        ),

      paperTradeId:
        null,

      inventoryCheckpointId:
        null,

      accountingAppliedAt:
        null,

      reasons: [
        "Settled PAPER lifecycle persisted before trade, inventory, or account P&L mutation.",
        "Deterministic replay is allowed only through the PAPER accounting coordinator.",
      ],
    });
  }

  recordFailed(
    lifecycle:
      PaperTwoLegExecutionLifecycleResult,
  ): PaperExecutionJournalRecord {
    if (
      lifecycle.status ===
        "COMPLETED" ||
      lifecycle.settlement.status ===
        "SETTLED" ||
      lifecycle.result.successful
    ) {
      throw new Error(
        "A completed PAPER lifecycle cannot be journaled as failed.",
      );
    }

    const existing =
      this.latest.get(
        lifecycle.result.planId,
      );

    if (
      existing
    ) {
      this.assertSameResult(
        existing,
        lifecycle,
      );

      return structuredClone(
        existing,
      );
    }

    return this.persist({
      schemaVersion:
        1,

      capturedAt:
        Date.now(),

      planId:
        lifecycle.result.planId,

      accountingTransactionId:
        this.createAccountingTransactionId(
          lifecycle.result.planId,
        ),

      state:
        "FAILED_NOT_ACCOUNTED",

      result:
        structuredClone(
          lifecycle.result,
        ),

      lineage:
        this.createLineage(
          lifecycle,
        ),

      paperTradeId:
        null,

      inventoryCheckpointId:
        null,

      accountingAppliedAt:
        null,

      reasons: [
        ...lifecycle.reasons,
        "Incomplete PAPER execution was persisted and is not eligible for automatic P&L replay.",
      ],
    });
  }

  markAccounted(
    planId:
      string,

    paperTradeId:
      string,

    inventoryCheckpointId:
      string,
  ): PaperExecutionJournalRecord {
    const existing =
      this.latest.get(
        planId,
      );

    if (
      !existing
    ) {
      throw new Error(
        `PAPER journal record not found: ${planId}`,
      );
    }

    if (
      existing.state ===
        "ACCOUNTED"
    ) {
      if (
        existing.paperTradeId !==
          paperTradeId ||
        existing.inventoryCheckpointId !==
          inventoryCheckpointId
      ) {
        throw new Error(
          `PAPER accounting evidence conflicts for plan ${planId}.`,
        );
      }

      return structuredClone(
        existing,
      );
    }

    if (
      existing.state !==
        "SETTLED_PENDING_ACCOUNTING"
    ) {
      throw new Error(
        `PAPER plan ${planId} is not eligible for accounting finalization.`,
      );
    }

    const accountingAppliedAt =
      Date.now();

    return this.persist({
      ...existing,

      capturedAt:
        accountingAppliedAt,

      state:
        "ACCOUNTED",

      paperTradeId,

      inventoryCheckpointId,

      accountingAppliedAt,

      reasons: [
        ...existing.reasons,
        "PaperTrade, venue inventory checkpoint, and idempotent account P&L are committed.",
      ],
    });
  }

  get(
    planId:
      string,
  ): PaperExecutionJournalRecord | null {
    const record =
      this.latest.get(
        planId,
      );

    return record
      ? structuredClone(
          record,
        )
      : null;
  }

  getPending():
    PaperExecutionJournalRecord[] {
    return Array.from(
      this.latest.values(),
    )
      .filter(
        (
          record,
        ) =>
          record.state ===
          "SETTLED_PENDING_ACCOUNTING",
      )
      .sort(
        (
          first,
          second,
        ) =>
          first.capturedAt -
          second.capturedAt,
      )
      .map(
        (
          record,
        ) =>
          structuredClone(
            record,
          ),
      );
  }

  getPlanIds(): string[] {
    return Array.from(
      this.latest.keys(),
    ).sort();
  }

  getDiagnostics():
    PaperExecutionJournalDiagnostics {
    const foundation =
      this.store
        .getDiagnostics();

    const records =
      Array.from(
        this.latest.values(),
      );

    const pending =
      records.filter(
        (
          record,
        ) =>
          record.state ===
          "SETTLED_PENDING_ACCOUNTING",
      );

    return {
      persistenceFilePath:
        foundation.filePath,

      restored:
        this.restored,

      restoredAt:
        this.restoredAt,

      executions:
        records.length,

      pendingAccounting:
        pending.length,

      accounted:
        records.filter(
          (
            record,
          ) =>
            record.state ===
            "ACCOUNTED",
        ).length,

      failedNotAccounted:
        records.filter(
          (
            record,
          ) =>
            record.state ===
            "FAILED_NOT_ACCOUNTED",
        ).length,

      pendingPlanIds:
        pending
          .map(
            (
              record,
            ) =>
              record.planId,
          )
          .sort(),

      writes:
        foundation.writes,

      writeFailures:
        foundation.writeFailures,

      malformedRecordsIgnored:
        foundation
          .malformedRecordsIgnored,

      lastError:
        foundation.lastError,

      liveOrderSubmissionAllowed:
        false,
    };
  }

  clear(): void {
    this.store.clear();

    this.latest.clear();

    this.restored =
      false;

    this.restoredAt =
      null;
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
      this.latest.set(
        record.planId,
        structuredClone(
          record,
        ),
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
      PaperExecutionJournalRecord,
  ): PaperExecutionJournalRecord {
    this.store.append(
      record,
    );

    this.latest.set(
      record.planId,
      structuredClone(
        record,
      ),
    );

    return structuredClone(
      record,
    );
  }

  private createLineage(
    lifecycle:
      PaperTwoLegExecutionLifecycleResult,
  ): PaperExecutionLineage {
    return {
      sessionId:
        lifecycle.sessionId,

      settlementId:
        lifecycle.settlement.id,

      settlementStatus:
        lifecycle.settlement.status,

      buyReconciliationId:
        lifecycle.reconciliation
          .buy.id,

      sellReconciliationId:
        lifecycle.reconciliation
          .sell.id,

      initialRecoveryIncidentId:
        lifecycle.initialRecovery
          .incident?.id ??
        null,

      initialRecoveryStrategy:
        lifecycle.initialRecovery
          .strategy,

      initialExposureDirection:
        lifecycle.initialRecovery
          .exposureDirection,

      initialExposedQuantity:
        lifecycle.initialRecovery
          .exposedQuantity,

      recoveryActionId:
        lifecycle.recoveryAction
          ?.actionId ??
        null,

      recoveryActionStatus:
        lifecycle.recoveryAction
          ?.status ??
        null,

      recoveryIncidentResolved:
        lifecycle.recoveryAction
          ?.incidentResolved ??
        !lifecycle.initialRecovery
          .requiresRecovery,

      finalRecoveryRequired:
        lifecycle.recovery
          .requiresRecovery,

      automaticPaperRecoveryExecuted:
        lifecycle
          .automaticPaperRecoveryExecuted,

      liveOrderSubmissionAllowed:
        false,

      exchangeOrdersSubmitted:
        0,
    };
  }

  private createAccountingTransactionId(
    planId:
      string,
  ): string {
    return `paper-settlement:${planId}`;
  }

  private assertSameResult(
    existing:
      PaperExecutionJournalRecord,

    lifecycle:
      PaperTwoLegExecutionLifecycleResult,
  ): void {
    if (
      JSON.stringify(
        existing.result,
      ) !==
      JSON.stringify(
        lifecycle.result,
      )
    ) {
      throw new Error(
        `PAPER plan ${existing.planId} has conflicting execution evidence.`,
      );
    }
  }

  private isValidRecord(
    value:
      unknown,
  ): value is
    PaperExecutionJournalRecord {
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
      typeof value.planId !==
        "string" ||
      typeof value.accountingTransactionId !==
        "string" ||
      ![
        "SETTLED_PENDING_ACCOUNTING",
        "ACCOUNTED",
        "FAILED_NOT_ACCOUNTED",
      ].includes(
        String(
          value.state,
        ),
      ) ||
      !this.isExecutionResult(
        value.result,
      ) ||
      !this.isRecord(
        value.lineage,
      ) ||
      !Array.isArray(
        value.reasons,
      ) ||
      !value.reasons.every(
        (
          reason,
        ) =>
          typeof reason ===
          "string",
      )
    ) {
      return false;
    }

    const identifiersValid =
      (
        value.paperTradeId ===
          null ||
        typeof value.paperTradeId ===
          "string"
      ) &&
      (
        value.inventoryCheckpointId ===
          null ||
        typeof value.inventoryCheckpointId ===
          "string"
      ) &&
      (
        value.accountingAppliedAt ===
          null ||
        (
          typeof value.accountingAppliedAt ===
            "number" &&
          Number.isFinite(
            value.accountingAppliedAt,
          )
        )
      );

    const stateInvariantValid =
      value.state ===
        "ACCOUNTED"
        ? typeof value.paperTradeId ===
            "string" &&
          typeof value.inventoryCheckpointId ===
            "string" &&
          typeof value.accountingAppliedAt ===
            "number"
        : value.paperTradeId ===
            null &&
          value.inventoryCheckpointId ===
            null &&
          value.accountingAppliedAt ===
            null;

    return (
      identifiersValid &&
      stateInvariantValid &&
      value.result.planId ===
        value.planId &&
      value.accountingTransactionId ===
        this.createAccountingTransactionId(
          value.planId,
        ) &&
      typeof value.lineage
        .sessionId ===
        "string" &&
      typeof value.lineage
        .settlementId ===
        "string" &&
      typeof value.lineage
        .buyReconciliationId ===
        "string" &&
      typeof value.lineage
        .sellReconciliationId ===
        "string" &&
      typeof value.lineage
        .initialRecoveryStrategy ===
        "string" &&
      typeof value.lineage
        .initialExposureDirection ===
        "string" &&
      typeof value.lineage
        .initialExposedQuantity ===
        "number" &&
      Number.isFinite(
        value.lineage
          .initialExposedQuantity,
      ) &&
      typeof value.lineage
        .finalRecoveryRequired ===
        "boolean" &&
      typeof value.lineage
        .automaticPaperRecoveryExecuted ===
        "boolean" &&
      typeof value.lineage
        .liveOrderSubmissionAllowed ===
        "boolean" &&
      value.lineage
        .liveOrderSubmissionAllowed ===
        false &&
      value.lineage
        .exchangeOrdersSubmitted ===
        0
    );
  }

  private isExecutionResult(
    value:
      unknown,
  ): value is
    PaperExecutionJournalRecord["result"] {
    return (
      this.isRecord(
        value,
      ) &&
      this.isRecord(
        value.strategyAttribution,
      ) &&
      typeof value.planId ===
        "string" &&
      typeof value.market ===
        "string" &&
      value.mode ===
        "PAPER" &&
      this.isRecord(
        value.buy,
      ) &&
      this.isRecord(
        value.sell,
      ) &&
      typeof value.buy.exchange ===
        "string" &&
      typeof value.sell.exchange ===
        "string" &&
      typeof value.buy.filledQuantity ===
        "number" &&
      Number.isFinite(
        value.buy.filledQuantity,
      ) &&
      typeof value.sell.filledQuantity ===
        "number" &&
      Number.isFinite(
        value.sell.filledQuantity,
      ) &&
      typeof value.netProfit ===
        "number" &&
      Number.isFinite(
        value.netProfit,
      ) &&
      typeof value.successful ===
        "boolean"
    );
  }

  private isRecord(
    value:
      unknown,
  ): value is
    Record<string, unknown> {
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

export const paperExecutionJournalService =
  new PaperExecutionJournalService();
