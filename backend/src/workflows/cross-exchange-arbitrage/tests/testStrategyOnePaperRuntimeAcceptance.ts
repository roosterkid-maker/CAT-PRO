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
} from "../../../trading/account/TradingAccountService";

import type {
  ExecutionPlan,
} from "../../../trading/models/ExecutionPlan";

import type {
  PaperTwoLegExecutionLifecycleResult,
} from "../../../trading/models/PaperTwoLegExecutionLifecycle";

import {
  paperTwoLegExecutionLifecycleService,
} from "../../../trading/execution/PaperTwoLegExecutionLifecycleService";

import {
  PaperExecutionAccountingService,
} from "../../../trading/services/PaperExecutionAccountingService";

import {
  PaperExecutionJournalService,
} from "../../../trading/services/PaperExecutionJournalService";

import {
  PaperTradeStore,
} from "../../../trading/services/PaperTradeStore";

import {
  PaperTradingService,
} from "../../../trading/services/PaperTradingService";

import {
  PaperVenueInventoryLedgerService,
} from "../../../trading/services/PaperVenueInventoryLedgerService";

import type {
  UnifiedAutomatedExecutionCycleResult,
} from "../models/UnifiedAutomatedExecution";

import {
  StrategyOnePaperRuntimeAcceptanceService,
} from "../services/StrategyOnePaperRuntimeAcceptanceService";

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
      `runtime-acceptance-${suffix}-${now}`,
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

const attribution = {
  attributionStatus:
    "ATTRIBUTED",
  strategyId:
    CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID,
  signalId:
    "strategy-one-runtime-acceptance-signal",
  intentId:
    "strategy-one-runtime-acceptance-intent",
} as const;

function createCycle(
  lifecycle:
    PaperTwoLegExecutionLifecycleResult,

  status:
    "EXECUTED" |
    "EXECUTION_REJECTED",

  batchNumber:
    number,
): UnifiedAutomatedExecutionCycleResult {
  const candidateKey =
    `${lifecycle.result.market}|${lifecycle.result.buy.exchange}|${lifecycle.result.sell.exchange}`;

  const now =
    Date.now();

  return {
    cycleId:
      batchNumber,
    startedAt:
      now,
    completedAt:
      now,
    durationMs:
      0,
    mode:
      "PAPER",
    status:
      status ===
        "EXECUTED"
        ? "DISPATCHED"
        : "REJECTED",
    strategyId:
      CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID,
    readyCandidates:
      1,
    ownedCandidates:
      1,
    routeLocksAcquired:
      1,
    ownershipRejections:
      [],
    duplicateRejections:
      [],
    shadow:
      null,
    paper: {
      id:
        `runtime-acceptance-batch-${batchNumber}`,
      batchNumber,
      status:
        status ===
          "EXECUTED"
          ? "EXECUTED"
          : "ALL_REJECTED",
      startedAt:
        now,
      completedAt:
        now,
      durationMs:
        0,
      readinessScore:
        100,
      readinessLevel:
        "READY_FOR_PAPER",
      paperExecutionArmed:
        true,
      candidatesConsidered:
        1,
      candidatesSelected:
        1,
      executionAttempts:
        1,
      executed:
        status ===
          "EXECUTED"
          ? 1
          : 0,
      rejected:
        status ===
          "EXECUTED"
          ? 0
          : 1,
      capitalScheduled:
        100,
      capitalExecuted:
        status ===
          "EXECUTED"
          ? lifecycle.result
              .capitalUsed
          : 0,
      projectedExchangeCapital:
        {},
      executions: [
        {
          candidateKey,
          market:
            lifecycle.result.market,
          buyExchange:
            lifecycle.result.buy.exchange,
          sellExchange:
            lifecycle.result.sell.exchange,
          requestedCapital:
            100,
          qualificationScore:
            100,
          netProfitPercent:
            lifecycle.result
              .netProfitPercent,
          result: {
            cycleId:
              batchNumber,
            status,
            startedAt:
              now,
            completedAt:
              now,
            durationMs:
              0,
            readinessScore:
              100,
            readinessLevel:
              "READY_FOR_PAPER",
            paperExecutionArmed:
              true,
            requestedCapital:
              100,
            candidate: {
              strategyAttribution:
                attribution,
              candidateKey,
              candidateGeneration:
                `${candidateKey}:generation-${batchNumber}`,
              opportunityId:
                `opportunity-${batchNumber}`,
              market:
                lifecycle.result.market,
              buyExchange:
                lifecycle.result.buy.exchange,
              sellExchange:
                lifecycle.result.sell.exchange,
              qualificationScore:
                100,
              netProfitPercent:
                lifecycle.result
                  .netProfitPercent,
              liquidityScore:
                100,
              freshnessScore:
                100,
              consecutiveObservations:
                3,
              persistenceMs:
                6_000,
            },
            result:
              lifecycle.result,
            reasons: [
              "Deterministic runtime acceptance fixture.",
            ],
          },
        },
      ],
      skipped:
        [],
      reasons: [
        "Deterministic unified PAPER batch fixture.",
      ],
    },
    liveExecutionAllowed:
      false,
    liveOrderSubmissionAllowed:
      false,
    exchangeOrdersSubmitted:
      0,
    reasons: [
      "Unified PAPER owner completed deterministic acceptance fixture.",
    ],
  };
}

function closeEnough(
  first:
    number,

  second:
    number,
): boolean {
  return Math.abs(
    first -
      second,
  ) <=
    1e-9;
}

function main(): void {
  const acceptancePath =
    resolve(
      process.cwd(),
      "strategy-one-runtime-acceptance.jsonl",
    );

  const journalPath =
    resolve(
      process.cwd(),
      "strategy-one-runtime-journal.jsonl",
    );

  const inventoryPath =
    resolve(
      process.cwd(),
      "strategy-one-runtime-inventory.jsonl",
    );

  const tradesPath =
    resolve(
      process.cwd(),
      "strategy-one-runtime-trades.jsonl",
    );

  const accountBefore =
    tradingAccountService
      .getAccount();

  const possibleRealOrdersBefore =
    orderLifecycleEvidenceService
      .getDiagnostics()
      .possibleSubmittedRealOrders;

  const journal =
    new PaperExecutionJournalService(
      journalPath,
    );

  const inventory =
    new PaperVenueInventoryLedgerService(
      inventoryPath,
    );

  const tradeStore =
    new PaperTradeStore(
      tradesPath,
    );

  const paperTrading =
    new PaperTradingService(
      tradeStore,
    );

  const accounting =
    new PaperExecutionAccountingService(
      journal,
      inventory,
      paperTrading,
      tradingAccountService,
    );

  const acceptance =
    new StrategyOnePaperRuntimeAcceptanceService(
      acceptancePath,
      {
        minimumConsecutivePasses:
          2,
        maximumRecords:
          20,
      },
      {
        journal:
          (
            planId,
          ) =>
            journal.get(
              planId,
            ),
        inventory:
          (
            planId,
          ) =>
            inventory
              .getCheckpoint(
                planId,
              ),
        paperTrade:
          (
            planId,
          ) =>
            paperTrading
              .getTrade(
                planId,
              ) ??
            null,
        accountingTransactionApplied:
          (
            transactionId,
          ) =>
            tradingAccountService
              .hasAppliedAccountingTransaction(
                transactionId,
              ),
      },
    );

  const first =
    paperTwoLegExecutionLifecycleService
      .execute(
        createPlan(
          "acceptfirst",
        ),
        attribution,
      );

  journal.begin(
    first,
  );

  const firstCycle =
    createCycle(
      first,
      "EXECUTED",
      1,
    );

  const noCandidateCycle =
    structuredClone(
      firstCycle,
    );

  const noCandidateController =
    noCandidateCycle.paper
      ?.executions[0]
      ?.result;

  if (!noCandidateController) {
    throw new Error("Expected deterministic PAPER controller fixture.");
  }

  noCandidateController.status =
    "NO_CANDIDATE";
  noCandidateController.candidate =
    null;
  noCandidateController.result =
    null;
  noCandidateController.requestedCapital =
    null;

  assert.equal(
    acceptance.capture(noCandidateCycle).length,
    0,
    "A cooldown/deduplication NO_CANDIDATE observation is not a PAPER execution attempt.",
  );
  assert.equal(
    acceptance.getReport().totalAttempts,
    0,
  );

  const pendingCapture =
    acceptance.capture(
      firstCycle,
    );

  assert.equal(
    pendingCapture[0]
      ?.status,
    "EVIDENCE_INCOMPLETE",
    "An EXECUTED label without terminal accounting evidence must fail closed.",
  );

  assert.equal(
    acceptance
      .getReport()
      .readyForPaperSoakReview,
    false,
  );

  assert.equal(
    accounting
      .replayPending()
      .completed,
    1,
  );

  assert.equal(
    acceptance.reconcile(),
    1,
  );

  const firstPassed =
    acceptance
      .getReport();

  assert.equal(
    firstPassed.passed,
    1,
  );
  assert.equal(
    firstPassed
      .consecutivePasses,
    1,
  );
  assert.equal(
    firstPassed
      .readyForPaperSoakReview,
    false,
  );

  acceptance.capture(
    firstCycle,
  );

  assert.equal(
    acceptance
      .getReport()
      .totalAttempts,
    1,
    "Capturing the same unified batch twice must remain idempotent.",
  );

  const recovered =
    paperTwoLegExecutionLifecycleService
      .execute(
        createPlan(
          "acceptrecovered",
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
              "Injected SELL failure for runtime acceptance recovery.",
          },
        },
      );

  assert.equal(
    recovered
      .automaticPaperRecoveryExecuted,
    true,
  );

  accounting.settleLifecycle(
    recovered,
  );

  acceptance.capture(
    createCycle(
      recovered,
      "EXECUTED",
      2,
    ),
  );

  const soaked =
    acceptance
      .getReport();

  assert.equal(
    soaked.passed,
    2,
  );
  assert.equal(
    soaked.recoveredPasses,
    1,
  );
  assert.equal(
    soaked.consecutivePasses,
    2,
  );
  assert.equal(
    soaked.soakStatus,
    "PASSED",
  );
  assert.equal(
    soaked.readyForPaperSoakReview,
    true,
  );

  const restoredJournal =
    new PaperExecutionJournalService(
      journalPath,
    );

  const restoredInventory =
    new PaperVenueInventoryLedgerService(
      inventoryPath,
    );

  const restoredPaperTrading =
    new PaperTradingService(
      new PaperTradeStore(
        tradesPath,
      ),
    );

  const restoredAccounting =
    new PaperExecutionAccountingService(
      restoredJournal,
      restoredInventory,
      restoredPaperTrading,
      tradingAccountService,
    );

  const restoredAcceptance =
    new StrategyOnePaperRuntimeAcceptanceService(
      acceptancePath,
      {
        minimumConsecutivePasses:
          2,
        maximumRecords:
          20,
      },
      {
        journal:
          (
            planId,
          ) =>
            restoredJournal
              .get(
                planId,
              ),
        inventory:
          (
            planId,
          ) =>
            restoredInventory
              .getCheckpoint(
                planId,
              ),
        paperTrade:
          (
            planId,
          ) =>
            restoredPaperTrading
              .getTrade(
                planId,
              ) ??
            null,
        accountingTransactionApplied:
          (
            transactionId,
          ) =>
            tradingAccountService
              .hasAppliedAccountingTransaction(
                transactionId,
              ),
      },
    );

  const restoredReport =
    restoredAcceptance
      .getReport();

  assert.equal(
    restoredReport
      .persistence
      .restored,
    true,
  );
  assert.equal(
    restoredReport
      .readyForPaperSoakReview,
    true,
    "Terminal runtime acceptance evidence must survive restart.",
  );

  const distortedPlanSeed =
    createPlan(
      "acceptdistorted",
    );

  const distortedPlan:
    ExecutionPlan = {
    ...distortedPlanSeed,
    sell: {
      ...distortedPlanSeed.sell,
      limitPrice:
        140,
    },
  };

  const distorted =
    paperTwoLegExecutionLifecycleService
      .execute(
        distortedPlan,
        attribution,
      );

  restoredAccounting
    .settleLifecycle(
      distorted,
    );

  const distortedCapture =
    restoredAcceptance.capture(
      createCycle(
        distorted,
        "EXECUTED",
        3,
      ),
    );

  assert.equal(
    distortedCapture[0]
      ?.status,
    "EXCLUDED_UNCREDIBLE",
  );

  const afterDistorted =
    restoredAcceptance
      .getReport();

  assert.equal(
    afterDistorted
      .credibilityExcluded,
    1,
  );
  assert.equal(
    afterDistorted
      .passed,
    2,
  );
  assert.equal(
    afterDistorted
      .consecutivePasses,
    2,
    "A completed but distorted fill must never count as accepted soak evidence.",
  );
  assert.equal(
    afterDistorted
      .readyForPaperSoakReview,
    true,
    "Preserved distorted history is excluded, not treated as missing terminal accounting.",
  );

  const rejected =
    paperTwoLegExecutionLifecycleService
      .execute(
        createPlan(
          "acceptrejected",
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

  restoredAccounting
    .recordFailedLifecycle(
    rejected,
  );

  restoredAcceptance.capture(
    createCycle(
      rejected,
      "EXECUTION_REJECTED",
      4,
    ),
  );

  const afterSafeRejection =
    restoredAcceptance
      .getReport();

  assert.equal(
    afterSafeRejection
      .rejectedSafe,
    1,
  );
  assert.equal(
    afterSafeRejection
      .evidenceIncomplete,
    0,
  );
  assert.equal(
    afterSafeRejection
      .consecutivePasses,
    soaked.consecutivePasses,
    "A safe pre-execution rejection must not erase completed, reconciled PAPER passes.",
  );
  assert.equal(
    afterSafeRejection
      .readyForPaperSoakReview,
    true,
  );
  assert.equal(
    afterSafeRejection
      .streakEvidence
      .safeRejectionsExcluded >
      0,
    true,
  );
  assert.deepEqual(
    afterSafeRejection
      .streakEvidence
      .latestSafeRejectionReasons,
    [
      "Deterministic runtime acceptance fixture.",
    ],
  );

  const expectedCapital =
    accountBefore.currentCapital +
    first.result.netProfit +
    recovered.result.netProfit +
    distorted.result.netProfit;

  assert.equal(
    closeEnough(
      tradingAccountService
        .getAccount()
        .currentCapital,
      expectedCapital,
    ),
    true,
    "Rejected acceptance evidence must not mutate realized P&L.",
  );

  assert.equal(
    orderLifecycleEvidenceService
      .getDiagnostics()
      .possibleSubmittedRealOrders,
    possibleRealOrdersBefore,
  );

  console.log(
    "STRATEGY #1 PAPER RUNTIME ACCEPTANCE TEST PASSED.",
  );
  console.log(
    "Journal-first fail-closed capture, terminal reconciliation, recovery acceptance, restart restore, price-credibility exclusion, completed-pass soak, safe-rejection isolation, and LIVE isolation verified.",
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
      ? error.stack ??
        error.message
      : error,
  );

  process.exitCode =
    1;
}
