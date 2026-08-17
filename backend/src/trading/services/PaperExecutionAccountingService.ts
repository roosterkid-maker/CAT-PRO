import type {
  PaperExecutionJournalRecord,
} from "../models/PaperExecutionJournal";

import type {
  PaperTwoLegExecutionLifecycleResult,
} from "../models/PaperTwoLegExecutionLifecycle";

import {
  tradingAccountService,
  type TradingAccountService,
} from "../account/TradingAccountService";

import {
  PaperExecutionJournalService,
  paperExecutionJournalService,
} from "./PaperExecutionJournalService";

import {
  paperTradingService,
  type PaperTradingService,
} from "./PaperTradingService";

import {
  PaperVenueInventoryLedgerService,
  paperVenueInventoryLedgerService,
} from "./PaperVenueInventoryLedgerService";

export interface PaperExecutionAccountingReceipt {
  planId: string;

  accountingTransactionId: string;

  paperTradeId: string;

  inventoryCheckpointId: string;

  accountProfitApplied: boolean;

  replaySafe: true;

  liveOrderSubmissionAllowed: false;
}

export interface PaperExecutionAccountingReplayReport {
  attempted: number;

  completed: number;

  failed: number;

  remainingPending: number;

  errors: string[];
}

export interface PaperExecutionAccountingDiagnostics {
  generatedAt: number;

  startupReplay:
    PaperExecutionAccountingReplayReport | null;

  lastReplay:
    PaperExecutionAccountingReplayReport | null;

  replayAttempts: number;

  replayedExecutions: number;

  replayFailures: number;

  duplicatePnlProtectionActive: true;

  automaticPendingReplayAllowed: true;

  newExecutionAllowed: boolean;

  journal:
    ReturnType<
      PaperExecutionJournalService[
        "getDiagnostics"
      ]
    >;

  venueInventory:
    ReturnType<
      PaperVenueInventoryLedgerService[
        "getDiagnostics"
      ]
    >;

  paperTrades:
    ReturnType<
      PaperTradingService[
        "getStoreDiagnostics"
      ]
    >;

  liveOrderSubmissionAllowed: false;
}

export class PaperExecutionAccountingService {
  private startupReplay:
    PaperExecutionAccountingReplayReport | null =
    null;

  private lastReplay:
    PaperExecutionAccountingReplayReport | null =
    null;

  private replayAttempts =
    0;

  private replayedExecutions =
    0;

  private replayFailures =
    0;

  constructor(
    private readonly journal:
      PaperExecutionJournalService =
      paperExecutionJournalService,

    private readonly inventory:
      PaperVenueInventoryLedgerService =
      paperVenueInventoryLedgerService,

    private readonly paperTrades:
      PaperTradingService =
      paperTradingService,

    private readonly account:
      TradingAccountService =
      tradingAccountService,

    replayOnStart =
      false,
  ) {
    if (
      replayOnStart
    ) {
      this.startupReplay =
        this.replayPending();
    }
  }

  settleLifecycle(
    lifecycle:
      PaperTwoLegExecutionLifecycleResult,
  ): PaperExecutionAccountingReceipt {
    const record =
      this.journal.begin(
        lifecycle,
      );

    return this.commit(
      record,
    );
  }

  recordFailedLifecycle(
    lifecycle:
      PaperTwoLegExecutionLifecycleResult,
  ): PaperExecutionJournalRecord {
    return this.journal
      .recordFailed(
        lifecycle,
      );
  }

  replayPending():
    PaperExecutionAccountingReplayReport {
    const pending =
      this.journal
        .getPending();

    const errors:
      string[] = [];

    let completed =
      0;

    for (
      const record
      of pending
    ) {
      try {
        this.commit(
          record,
        );

        completed +=
          1;
      } catch (
        error:
          unknown
      ) {
        errors.push(
          `${record.planId}: ${
            error instanceof Error
              ? error.message
              : "Unknown PAPER accounting replay error."
          }`,
        );
      }
    }

    const report:
      PaperExecutionAccountingReplayReport = {
      attempted:
        pending.length,

      completed,

      failed:
        errors.length,

      remainingPending:
        this.journal
          .getPending()
          .length,

      errors,
    };

    this.replayAttempts +=
      pending.length;

    this.replayedExecutions +=
      completed;

    this.replayFailures +=
      errors.length;

    this.lastReplay =
      structuredClone(
        report,
      );

    return structuredClone(
      report,
    );
  }

  getDiagnostics():
    PaperExecutionAccountingDiagnostics {
    const journal =
      this.journal
        .getDiagnostics();

    return {
      generatedAt:
        Date.now(),

      startupReplay:
        this.startupReplay
          ? structuredClone(
              this.startupReplay,
            )
          : null,

      lastReplay:
        this.lastReplay
          ? structuredClone(
              this.lastReplay,
            )
          : null,

      replayAttempts:
        this.replayAttempts,

      replayedExecutions:
        this.replayedExecutions,

      replayFailures:
        this.replayFailures,

      duplicatePnlProtectionActive:
        true,

      automaticPendingReplayAllowed:
        true,

      newExecutionAllowed:
        journal.pendingAccounting ===
        0,

      journal,

      venueInventory:
        this.inventory
          .getDiagnostics(),

      paperTrades:
        this.paperTrades
          .getStoreDiagnostics(),

      liveOrderSubmissionAllowed:
        false,
    };
  }

  private commit(
    record:
      PaperExecutionJournalRecord,
  ): PaperExecutionAccountingReceipt {
    if (
      record.state ===
        "FAILED_NOT_ACCOUNTED" ||
      record.result.mode !==
        "PAPER" ||
      !record.result.successful ||
      record.lineage
        .settlementStatus !==
        "SETTLED"
    ) {
      throw new Error(
        `PAPER plan ${record.planId} is not eligible for P&L accounting.`,
      );
    }

    const paperTrade =
      this.paperTrades
        .recordCompletedExecution(
          record.result,
        );

    const inventoryCheckpoint =
      this.inventory.apply(
        record.result,
        record.accountingTransactionId,
      );

    const accountProfitApplied =
      !this.account
        .hasAppliedAccountingTransaction(
          record
            .accountingTransactionId,
        );

    if (
      accountProfitApplied
    ) {
      this.account
        .runWithAccountingTransaction(
          record
            .accountingTransactionId,

          () =>
            this.account
              .recordProfit(
                record.result
                  .netProfit,
              ),
        );
    }

    this.journal
      .markAccounted(
        record.planId,
        paperTrade.id,
        inventoryCheckpoint
          .checkpointId,
      );

    return {
      planId:
        record.planId,

      accountingTransactionId:
        record
          .accountingTransactionId,

      paperTradeId:
        paperTrade.id,

      inventoryCheckpointId:
        inventoryCheckpoint
          .checkpointId,

      accountProfitApplied,

      replaySafe:
        true,

      liveOrderSubmissionAllowed:
        false,
    };
  }
}

export const paperExecutionAccountingService =
  new PaperExecutionAccountingService(
    paperExecutionJournalService,
    paperVenueInventoryLedgerService,
    paperTradingService,
    tradingAccountService,
    true,
  );
