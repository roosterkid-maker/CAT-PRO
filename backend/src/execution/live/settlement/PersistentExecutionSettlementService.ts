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

    const dryRun =
      liveExecutionCoordinator
        .isDryRunSession(
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