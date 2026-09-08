import {
  liveExecutionCoordinator,
} from "../coordinator/LiveExecutionCoordinator";

import type {
  ExecutionAuditRecord,
  ExecutionSettlementDiagnostics,
  ExecutionSettlementRecord,
} from "./ExecutionSettlementRecord";

import {
  tradingAccountService,
} from "../../../trading/account/TradingAccountService";

import {
  executionSettlementAccountingPersistenceService,
} from "./ExecutionSettlementAccountingPersistenceService";

import {
  executionSettlementService,
} from "./ExecutionSettlementService";

export class PersistentExecutionSettlementService {
  settle(
    sessionId:
      string,
  ): ExecutionSettlementRecord {
    /*
     * Validate the session exists BEFORE begin() below persists
     * PENDING_SETTLEMENT. begin()'s own catch-block comment explains that
     * keeping PENDING_SETTLEMENT on any failure is deliberate - the exact
     * point of failure inside the accounting transaction is ambiguous from
     * outside, so a human must manually confirm whether real PnL was
     * applied. That ambiguity does not exist for "session not found":
     * begin() (and therefore any accounting transaction) is never reached,
     * so there is nothing to investigate. Without this check, any
     * nonexistent or mistyped sessionId - including a real Strategy-One
     * LIVE session id, which genuinely never exists in
     * liveExecutionCoordinator - permanently poisons that id's accounting
     * evidence as PENDING_SETTLEMENT/uncertain, since preflight() blocks
     * all further attempts once that state is persisted and there is no
     * transition back out of it.
     */
    if (
      !liveExecutionCoordinator
        .getSession(
          sessionId,
        )
    ) {
      throw new Error(
        "Live execution session not found.",
      );
    }

    const accountingTransactionId =
      this.createAccountingTransactionId(
        sessionId,
      );

    const preflight =
      executionSettlementAccountingPersistenceService
        .preflight(
          sessionId,
        );

    if (
      !preflight.allowed
    ) {
      if (
        preflight.uncertain
      ) {
        throw new Error(
          preflight.reasons.join(
            " | ",
          ),
        );
      }

      if (
        preflight.existingSettlement
      ) {
        return structuredClone(
          preflight
            .existingSettlement,
        );
      }

      throw new Error(
        preflight.reasons.join(
          " | ",
        ),
      );
    }

    /*
     * This flag gates whether real accounting is
     * applied (ExecutionSettlementAccountingPersistenceService.finalize
     * marks ACCOUNTING_APPLIED vs DRY_RUN_NOT_ACCOUNTED). A PAPER
     * session must be excluded from real accounting exactly like a
     * DRY_RUN session is - isNonLiveSession() covers both, whereas
     * isDryRunSession() alone let PAPER settlements through as if
     * they were real.
     */
    const dryRun =
      liveExecutionCoordinator
        .isNonLiveSession(
          sessionId,
        );

    executionSettlementAccountingPersistenceService
      .begin(
        sessionId,
        dryRun,
      );

    let settlement:
      ExecutionSettlementRecord;

    try {
      /*
       * VERSION 18 BUILD 7
       *
       * The existing settlement engine still
       * performs the actual PnL calculation.
       *
       * TradingAccountService.recordProfit()
       * receives this deterministic transaction
       * ID through synchronous context.
       */
      settlement =
        tradingAccountService
          .runWithAccountingTransaction(
            accountingTransactionId,

            () =>
              executionSettlementService
                .settle(
                  sessionId,
                ),
          );
    } catch (
      error:
        unknown
    ) {
      /*
       * Keep PENDING_SETTLEMENT.
       *
       * Restart/recovery diagnostics will
       * inspect whether the persistent account
       * transaction exists before anyone
       * considers manual resolution.
       */
      throw error;
    }

    executionSettlementAccountingPersistenceService
      .finalize(
        settlement,
        dryRun,
      );

    return structuredClone(
      settlement,
    );
  }

  getSettlement(
    sessionId:
      string,
  ): ExecutionSettlementRecord | null {
    const runtime =
      executionSettlementService
        .getSettlement(
          sessionId,
        );

    if (
      runtime
    ) {
      return runtime;
    }

    return executionSettlementAccountingPersistenceService
      .getSettlement(
        sessionId,
      );
  }

  getAudit(
    sessionId:
      string,
  ): ExecutionAuditRecord {
    return executionSettlementService
      .getAudit(
        sessionId,
      );
  }

  getDiagnostics():
    ExecutionSettlementDiagnostics {
    return executionSettlementService
      .getDiagnostics();
  }

  hasPersistentAccountingTransaction(
    sessionId:
      string,
  ): boolean {
    return tradingAccountService
      .hasAppliedAccountingTransaction(
        this.createAccountingTransactionId(
          sessionId,
        ),
      );
  }

  private createAccountingTransactionId(
    sessionId:
      string,
  ): string {
    return `settlement:${sessionId}`;
  }
}

export const persistentExecutionSettlementService =
  new PersistentExecutionSettlementService();