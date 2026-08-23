import {
  strategyOneTwoLegRestartRecoveryService,
} from "../../execution/live/recovery/StrategyOneTwoLegRestartRecoveryService";

import {
  executionSettlementService,
} from "../../execution/live/settlement/ExecutionSettlementService";

import type {
  TradingAccount,
} from "../../trading/account/TradingAccount";

export interface CapitalManagerSafetyContext {
  readonly executionRecoveryPending: boolean;
  readonly settlementReconciliationPending: boolean;
  readonly emergencyStopActive: boolean;
}

/**
 * Read-only boundary adapter between capital analysis and LIVE evidence owners.
 * It exposes only booleans and cannot resolve recovery, settle an execution,
 * mutate the account, submit a transfer or reach an exchange order method.
 */
export class CapitalManagerSafetyContextService {
  getContext(
    account: Pick<TradingAccount, "emergencyStop">,
    now = Date.now(),
  ): CapitalManagerSafetyContext {
    if (!Number.isSafeInteger(now) || now <= 0) {
      throw new Error("Capital-manager safety timestamp must be a positive safe integer.");
    }

    return Object.freeze({
      executionRecoveryPending:
        strategyOneTwoLegRestartRecoveryService
          .getReport(now)
          .classification !== "CLEAN",
      settlementReconciliationPending:
        executionSettlementService
          .hasPendingReconciliation(),
      emergencyStopActive: account.emergencyStop,
    });
  }
}

export const capitalManagerSafetyContextService =
  new CapitalManagerSafetyContextService();
