import assert
  from "node:assert/strict";

import {
  resolve,
} from "node:path";

import {
  orderLifecycleEvidenceService,
} from "../../../execution/live/lifecycle/OrderLifecycleEvidenceService";

import {
  CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID,
} from "../../../strategies/models/StrategyMetadata";

import {
  tradingAccountService,
} from "../../account/TradingAccountService";

import type {
  ExecutionPlan,
} from "../../models/ExecutionPlan";

import {
  PaperExecutionAccountingService,
} from "../../services/PaperExecutionAccountingService";

import {
  PaperExecutionJournalService,
} from "../../services/PaperExecutionJournalService";

import {
  PaperTradeStore,
} from "../../services/PaperTradeStore";

import {
  PaperTradingService,
} from "../../services/PaperTradingService";

import {
  PaperVenueInventoryLedgerService,
} from "../../services/PaperVenueInventoryLedgerService";

import {
  paperTwoLegExecutionLifecycleService,
} from "../PaperTwoLegExecutionLifecycleService";

function createPlan(
  suffix:
    string,
): ExecutionPlan {
  const now =
    Date.now();

  const market =
    `${suffix.toUpperCase()}/USDT`;

  return {
    id:
      `restart-safe-${suffix}-${now}`,
    version:
      1,
    market,
    mode:
      "PAPER",
    strategy:
      "PARALLEL",
    status:
      "READY",
    capital:
      100,
    expectedProfit:
      2,
    expectedProfitPercent:
      2,
    expectedFees:
      0.202,
    expectedNetProfit:
      1.798,
    expectedNetProfitPercent:
      1.798,
    maximumSlippagePercent:
      0.1,
    expectedSlippagePercent:
      0.02,
    timeoutMs:
      5_000,
    buy: {
      exchange:
        "binance",
      market,
      side:
        "BUY",
      quantity:
        1,
      limitPrice:
        100,
      orderType:
        "limit",
      timeInForce:
        "IOC",
      baseAsset:
        suffix.toUpperCase(),
      quoteAsset:
        "USDT",
    },
    sell: {
      exchange:
        "bybit",
      market,
      side:
        "SELL",
      quantity:
        1,
      limitPrice:
        102,
      orderType:
        "limit",
      timeInForce:
        "IOC",
      baseAsset:
        suffix.toUpperCase(),
      quoteAsset:
        "USDT",
    },
    createdAt:
      now,
    expiresAt:
      now +
      5_000,
    opportunityTimestamp:
      now,
  };
}

function closeEnough(
  actual:
    number,

  expected:
    number,
): boolean {
  return Math.abs(
    actual -
      expected,
  ) <=
    1e-9;
}

function main(): void {
  const journalPath =
    resolve(
      process.cwd(),
      "paper-restart-journal.jsonl",
    );

  const inventoryPath =
    resolve(
      process.cwd(),
      "paper-restart-inventory.jsonl",
    );

  const tradePath =
    resolve(
      process.cwd(),
      "paper-restart-trades.jsonl",
    );

  const attribution = {
    attributionStatus:
      "ATTRIBUTED",
    strategyId:
      CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID,
    signalId:
      "paper-restart-safe-accounting-test",
    intentId:
      null,
  } as const;

  const accountBefore =
    tradingAccountService
      .getAccount();

  const possibleRealOrdersBefore =
    orderLifecycleEvidenceService
      .getDiagnostics()
      .possibleSubmittedRealOrders;

  const balanced =
    paperTwoLegExecutionLifecycleService
      .execute(
        createPlan(
          "restartbalanced",
        ),
        attribution,
      );

  assert.equal(
    balanced.status,
    "COMPLETED",
  );

  const journalBeforeCrash =
    new PaperExecutionJournalService(
      journalPath,
    );

  journalBeforeCrash.begin(
    balanced,
  );

  assert.equal(
    journalBeforeCrash
      .getDiagnostics()
      .pendingAccounting,
    1,
    "Settled evidence must exist before any PaperTrade or P&L mutation.",
  );

  /*
   * Simulated restart after journal BEGIN but
   * before any downstream accounting mutation.
   */
  const restoredJournal =
    new PaperExecutionJournalService(
      journalPath,
    );

  const restoredInventory =
    new PaperVenueInventoryLedgerService(
      inventoryPath,
    );

  const restoredTradeStore =
    new PaperTradeStore(
      tradePath,
    );

  const restoredPaperTrading =
    new PaperTradingService(
      restoredTradeStore,
    );

  const restoredAccounting =
    new PaperExecutionAccountingService(
      restoredJournal,
      restoredInventory,
      restoredPaperTrading,
      tradingAccountService,
    );

  const firstReplay =
    restoredAccounting
      .replayPending();

  assert.deepEqual(
    {
      attempted:
        firstReplay.attempted,
      completed:
        firstReplay.completed,
      failed:
        firstReplay.failed,
      remainingPending:
        firstReplay
          .remainingPending,
    },
    {
      attempted:
        1,
      completed:
        1,
      failed:
        0,
      remainingPending:
        0,
    },
  );

  assert.equal(
    restoredTradeStore
      .getById(
        balanced.result.planId,
      )
      ?.actualProfit,
    balanced.result.netProfit,
  );

  assert.equal(
    restoredInventory
      .getPosition(
        "binance",
        balanced.result.market,
      )
      .quantity,
    1,
  );

  assert.equal(
    restoredInventory
      .getPosition(
        "bybit",
        balanced.result.market,
      )
      .quantity,
    -1,
  );

  const capitalAfterFirstReplay =
    tradingAccountService
      .getAccount()
      .currentCapital;

  assert.equal(
    closeEnough(
      capitalAfterFirstReplay,
      accountBefore.currentCapital +
        balanced.result.netProfit,
    ),
    true,
  );

  /*
   * Second restart and explicit duplicate settle
   * must not duplicate trade, inventory, or P&L.
   */
  const secondRestartAccounting =
    new PaperExecutionAccountingService(
      new PaperExecutionJournalService(
        journalPath,
      ),
      new PaperVenueInventoryLedgerService(
        inventoryPath,
      ),
      new PaperTradingService(
        new PaperTradeStore(
          tradePath,
        ),
      ),
      tradingAccountService,
    );

  assert.equal(
    secondRestartAccounting
      .replayPending()
      .attempted,
    0,
  );

  const duplicateReceipt =
    secondRestartAccounting
      .settleLifecycle(
        balanced,
      );

  assert.equal(
    duplicateReceipt
      .accountProfitApplied,
    false,
  );

  assert.equal(
    tradingAccountService
      .getAccount()
      .currentCapital,
    capitalAfterFirstReplay,
  );

  const recovered =
    paperTwoLegExecutionLifecycleService
      .execute(
        createPlan(
          "restartrecovered",
        ),
        attribution,
        {
          simulatedSlippagePercent:
            0.02,
          sell: {
            fillRatio:
              0,
            terminalStatus:
              "FAILED",
            failureReason:
              "Injected SELL failure before bounded PAPER recovery.",
          },
        },
      );

  assert.equal(
    recovered
      .automaticPaperRecoveryExecuted,
    true,
  );

  const preFinalMarkerJournal =
    new PaperExecutionJournalService(
      journalPath,
    );

  const preFinalMarkerInventory =
    new PaperVenueInventoryLedgerService(
      inventoryPath,
    );

  const preFinalMarkerTrades =
    new PaperTradingService(
      new PaperTradeStore(
        tradePath,
      ),
    );

  const pendingRecovered =
    preFinalMarkerJournal.begin(
      recovered,
    );

  preFinalMarkerTrades
    .recordCompletedExecution(
      recovered.result,
    );

  preFinalMarkerInventory.apply(
    recovered.result,
    pendingRecovered
      .accountingTransactionId,
  );

  tradingAccountService
    .runWithAccountingTransaction(
      pendingRecovered
        .accountingTransactionId,
      () =>
        tradingAccountService
          .recordProfit(
            recovered.result
              .netProfit,
          ),
    );

  const capitalBeforeSecondReplay =
    tradingAccountService
      .getAccount()
      .currentCapital;

  /*
   * Simulated crash after the account ledger
   * commit but before journal ACCOUNTED marker.
   */
  const finalRestartJournal =
    new PaperExecutionJournalService(
      journalPath,
    );

  const finalRestartInventory =
    new PaperVenueInventoryLedgerService(
      inventoryPath,
    );

  const finalRestartTradeStore =
    new PaperTradeStore(
      tradePath,
    );

  const finalRestartAccounting =
    new PaperExecutionAccountingService(
      finalRestartJournal,
      finalRestartInventory,
      new PaperTradingService(
        finalRestartTradeStore,
      ),
      tradingAccountService,
    );

  const secondReplay =
    finalRestartAccounting
      .replayPending();

  assert.equal(
    secondReplay.completed,
    1,
  );

  assert.equal(
    secondReplay
      .remainingPending,
    0,
  );

  assert.equal(
    tradingAccountService
      .getAccount()
      .currentCapital,
    capitalBeforeSecondReplay,
    "Restored account transaction ID must prevent duplicate P&L.",
  );

  assert.equal(
    finalRestartJournal
      .get(
        recovered.result
          .planId,
      )
      ?.state,
    "ACCOUNTED",
  );

  assert.equal(
    finalRestartJournal
      .get(
        recovered.result
          .planId,
      )
      ?.lineage
      .recoveryActionId,
    recovered.recoveryAction
      ?.actionId,
  );

  assert.equal(
    finalRestartInventory
      .getPosition(
        "binance",
        recovered.result.market,
      )
      .quantity,
    0,
    "Same-venue emergency exit must leave zero PAPER venue inventory.",
  );

  const failed =
    paperTwoLegExecutionLifecycleService
      .execute(
        createPlan(
          "restartfailed",
        ),
        attribution,
        {
          simulatedSlippagePercent:
            0.02,
          buy: {
            fillRatio:
              0.6,
            terminalStatus:
              "PARTIALLY_FILLED",
          },
          sell: {
            fillRatio:
              0.2,
            terminalStatus:
              "PARTIALLY_FILLED",
          },
        },
      );

  assert.equal(
    failed.status,
    "RECOVERY_REQUIRED",
  );

  finalRestartAccounting
    .recordFailedLifecycle(
      failed,
    );

  const failedRestartJournal =
    new PaperExecutionJournalService(
      journalPath,
    );

  assert.equal(
    failedRestartJournal
      .get(
        failed.result.planId,
      )
      ?.state,
    "FAILED_NOT_ACCOUNTED",
  );

  assert.equal(
    failedRestartJournal
      .getPending()
      .length,
    0,
    "Failed/recovery-required evidence must never enter automatic P&L replay.",
  );

  const expectedCapital =
    accountBefore.currentCapital +
    balanced.result.netProfit +
    recovered.result.netProfit;

  assert.equal(
    closeEnough(
      tradingAccountService
        .getAccount()
        .currentCapital,
      expectedCapital,
    ),
    true,
  );

  assert.equal(
    finalRestartTradeStore
      .getAll()
      .length,
    2,
    "Only two unique settled executions should survive PaperTradeStore restart.",
  );

  assert.equal(
    orderLifecycleEvidenceService
      .getDiagnostics()
      .possibleSubmittedRealOrders,
    possibleRealOrdersBefore,
    "PAPER restart/replay must not create possible real-order evidence.",
  );

  console.log(
    "PAPER RESTART-SAFE ACCOUNTING TEST PASSED.",
  );
  console.log(
    "Journal-first replay, durable PaperTrade restore, venue inventory restore, recovery lineage, and duplicate P&L prevention verified with LIVE isolated.",
  );
}

try {
  main();
} catch (
  error:
    unknown
) {
  console.error(
    error instanceof Error
      ? error.message
      : error,
  );

  process.exitCode =
    1;
}
