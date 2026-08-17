import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import type {TradingAccount} from "../../trading/account/TradingAccount";
import type {DerivativeFundingSettlementEvidence} from "../../derivatives/models/DerivativeFundingSettlementEvidence";
import {CentralPaperSharedRecoveryBridgeService} from "../../recovery/adapters/CentralPaperSharedRecoveryBridgeService";
import {SharedRecoveryIntentService} from "../../recovery/services/SharedRecoveryIntentService";
import type {FundingRateArbitrageStrategySignal} from "../models/StrategySignal";
import {CentralMultiLegPaperSimulator, type CentralPaperSimulationEvidence} from "../services/CentralMultiLegPaperSimulator";
import {CentralPaperExecutionQueueService, type CentralPaperQueueRecord} from "../services/CentralPaperExecutionQueueService";
import {CentralPaperExitEvidenceProvider, type CentralPaperExitMarketSource} from "../services/CentralPaperExitEvidenceProvider";
import {CentralPaperPositionAccountingService, type CentralPaperAccountPort} from "../services/CentralPaperPositionAccountingService";
import {CentralPaperPositionLedgerService} from "../services/CentralPaperPositionLedgerService";
import {CentralPaperSimulationJournalService} from "../services/CentralPaperSimulationJournalService";
import type {CentralPaperPlanAdmission} from "../services/CentralPaperPlanAdmissionService";
import {CentralStrategyExecutionPlanCompiler} from "../services/CentralStrategyExecutionPlanCompiler";

const now = 1_781_000_000_000;

class PaperAccount implements CentralPaperAccountPort {
  private account: TradingAccount = {
    id: "funding-paper",
    name: "funding-paper",
    mode: "PAPER",
    enabled: true,
    emergencyStop: false,
    limits: {
      maximumCapitalPerTrade: 100_000,
      maximumDailyLoss: 100_000,
      maximumOpenTrades: 50,
      maximumDailyTrades: 500,
    },
    initialCapital: 100_000,
    currentCapital: 100_000,
    availableCapital: 100_000,
    todayProfit: 0,
    todayLoss: 0,
    openTrades: 0,
    tradesToday: 0,
  };
  private transaction: string | null = null;
  private readonly applied = new Set<string>();

  getAccount(): TradingAccount { return structuredClone(this.account); }
  runWithAccountingTransaction<T>(id: string, operation: () => T): T {
    this.transaction = id;
    try { return operation(); } finally { this.transaction = null; }
  }
  hasAppliedAccountingTransaction(id: string): boolean { return this.applied.has(id); }
  recordProfit(value: number): void {
    if (!this.transaction || this.applied.has(this.transaction)) return;
    this.applied.add(this.transaction);
    this.account.currentCapital += value;
    this.account.availableCapital += value;
  }
}

function signal(id: string): FundingRateArbitrageStrategySignal {
  return {
    id,
    strategyId: "funding-rate-arbitrage",
    kind: "FUNDING_RATE_ARBITRAGE_SHADOW_OPPORTUNITY",
    evidenceStatus: "AVAILABLE",
    source: "DerivativeMarketData",
    sourceSnapshotGeneratedAt: now,
    generatedAt: now,
    observedAt: now,
    expiresAt: now + 120_000,
    executionAuthorized: false,
    automaticExecutionAllowed: false,
    evidence: {
      market: "BTCUSDT",
      longExchange: "binance",
      shortExchange: "bybit",
      quantity: 1,
      longFundingRate: -0.002,
      shortFundingRate: 0.004,
      fundingDifferentialPercent: 0.6,
      singlePeriodExpectedFundingQuote: 0.6,
      singlePeriodExpectedFundingPercent: 0.6,
      expectedFundingQuote: 1.8,
      expectedFundingGuaranteed: false,
      projectedFundingRatePersistenceRequired: true,
      modeledFundingPeriods: 3,
      minimumQualifyingFundingPeriods: 1,
      maximumFundingPeriodsToCapture: 6,
      projectedHoldingTimeMs: 57_610_100,
      longEntryBestAsk: 100.1,
      longEntryVwap: 100.1,
      shortEntryBestBid: 100.3,
      shortEntryVwap: 100.3,
      entryBasisCostQuote: 0,
      favorableEntryBasisExcluded: true,
      roundTripFeeQuote: 0.4008,
      safetyBufferQuote: 0.05,
      expectedNetQuote: 1.3492,
      expectedNetPercent: 1.3492,
      minimumExpectedNetPercent: 0.05,
      fundingIntervalMinutes: 480,
      nextFundingTimeLong: now + 10_000,
      nextFundingTimeShort: now + 10_100,
      fundingTimeSkewMs: 100,
      maximumObservedEvidenceSkewMs: 50,
      fullDepthApplied: true,
      marketRulesApplied: true,
      explicitFeesApplied: true,
      roundTripFeesReserved: true,
      executionReadinessBlockers: [
        "POSITION_EVIDENCE_MISSING",
        "MARGIN_EVIDENCE_MISSING",
        "LIQUIDATION_CONTROL_MISSING",
        "REDUCE_ONLY_UNVERIFIED",
        "DERIVATIVE_ADAPTER_MISSING",
      ],
    },
  };
}

function admission(record: ReturnType<CentralStrategyExecutionPlanCompiler["compile"]>): CentralPaperPlanAdmission {
  return {
    version: "36.0",
    id: `funding-admission:${record.id}`,
    generatedAt: now,
    planId: record.id,
    strategyId: record.strategyId,
    state: "ELIGIBLE_FOR_CENTRAL_PAPER_QUEUE",
    blockers: [],
    intrinsicPlanBlockers: [],
    gates: {
      runtimeEnabled: true,
      strategyAllowed: true,
      planCurrent: true,
      evidenceCurrent: true,
      accountReady: true,
      capitalApproved: true,
      riskApproved: true,
      everyLegReady: true,
      controlsReady: true,
      researchPromotionReady: true,
    },
    approvedCapitalInr: 10_000,
    capitalReservationMutationPerformed: false,
    executionHandoffAllowed: false,
    paperExecutionPerformed: false,
    liveExecutionAllowed: false,
    orderSubmissionAllowed: false,
  };
}

function simulationEvidence(
  record: CentralPaperQueueRecord,
  fillRatios: readonly [number, number],
  observedAt: number,
): CentralPaperSimulationEvidence {
  return {
    planId: record.plan.id,
    queueRecordId: record.id,
    leaseId: record.leaseId!,
    generatedAt: observedAt,
    expiresAt: observedAt + 2_000,
    legs: record.plan.legs.map((leg, index) => ({
      legId: leg.id,
      settlementAsset: "USDT",
      feePercent: 0.1,
      feeEvidenceId: `derivative-fee:${leg.exchange}`,
      feeEvidenceSource: "STATIC_CONFIG",
      simulatedSlippagePercent: 0,
      fillRatio: fillRatios[index]!,
      terminalStatus: fillRatios[index] === 1 ? "FILLED" : fillRatios[index] === 0 ? "FAILED" : "PARTIALLY_FILLED",
      passiveFillEvidenceId: null,
    })),
    exchangeOrderEvidenceUsed: false,
  };
}

function funding(
  exchange: string,
  market: string,
  requestedFundingTime: number,
  observedAt: number,
): DerivativeFundingSettlementEvidence {
  const isLong = exchange === "binance";
  return {
    version: "56.0",
    id: `funding-settlement:${exchange}:${market}:${requestedFundingTime + 6}`,
    exchange,
    market,
    settlementAsset: "USDT",
    fundingTime: requestedFundingTime + 6,
    fundingRate: isLong ? -0.002 : 0.004,
    markPrice: isLong ? 100 : 100.2,
    rateSource: "PUBLIC_SETTLED_FUNDING_RATE_HISTORY",
    priceSource: isLong ? "FUNDING_HISTORY_ASSOCIATED_MARK_PRICE" : "ONE_MINUTE_MARK_PRICE_KLINE_OPEN",
    priceQuality: isLong ? "EXACT_EXCHANGE_ASSOCIATED_MARK_PRICE" : "BOUNDED_PUBLIC_MARK_KLINE_PROXY",
    observedAt,
    paymentFormula: "NEGATIVE_SIGNED_QUANTITY_X_MARK_PRICE_X_FUNDING_RATE",
    accountTransactionEvidenceUsed: false,
    liveExecutionAllowed: false,
    orderSubmissionAllowed: false,
  };
}

function run(testDirectory: string): void {
  const queuePath = join(testDirectory, "funding-paper-queue.jsonl");
  const journalPath = join(testDirectory, "funding-paper-journal.jsonl");
  const positionPath = join(testDirectory, "funding-paper-positions.jsonl");
  const accountingPath = join(testDirectory, "funding-paper-accounting.jsonl");
  const compiler = new CentralStrategyExecutionPlanCompiler();
  const queue = new CentralPaperExecutionQueueService(queuePath, 10);
  const journal = new CentralPaperSimulationJournalService(journalPath, 10);
  const positions = new CentralPaperPositionLedgerService(positionPath, 10);
  const simulator = new CentralMultiLegPaperSimulator();

  const plan = compiler.compile(signal("funding-complete"), now);
  assert.equal(plan.settlementPolicy.kind, "FUNDING_CAPTURE_THEN_EXIT");
  assert.deepEqual(plan.legs.map((leg) => [leg.product, leg.side, leg.dependency]), [
    ["PERPETUAL", "BUY", "PARALLEL"],
    ["PERPETUAL", "SELL", "PARALLEL"],
  ]);
  queue.enqueue(plan, admission(plan), now);
  const leased = queue.leaseNext("funding-paper-worker", now + 1, 5_000);
  assert.ok(leased);
  const simulated = simulator.simulate(leased, simulationEvidence(leased, [1, 1], now + 1), now + 1);
  assert.equal(simulated.status, "SIMULATED_ENTRY_COMPLETE");
  assert.equal(simulated.recoveryRequired, false);
  assert.equal(simulated.pnlEvidenceStatus, "NO_DATA");

  const captured = journal.capture(leased, simulated, now + 2);
  const open = positions.recordEntry(captured, now + 2);
  assert.equal(open.state, "OPEN");
  assert.equal(open.positions.length, 2);
  assert.equal(open.positions.reduce((sum, position) => sum + position.signedQuantity, 0), 0);
  const accountedEntry = journal.markPositionAccounted(simulated.id, open.id, now + 2);
  queue.acknowledge(leased.id, leased.leaseId!, "COMPLETED", accountedEntry.id, now + 2);

  const restoredQueue = new CentralPaperExecutionQueueService(queuePath, 10);
  const restoredJournal = new CentralPaperSimulationJournalService(journalPath, 10);
  const restoredPositions = new CentralPaperPositionLedgerService(positionPath, 10);
  assert.equal(restoredQueue.getByPlanId(plan.id, now + 3)?.state, "COMPLETED");
  assert.equal(restoredJournal.get(simulated.id)?.state, "POSITION_ACCOUNTED");
  assert.equal(restoredPositions.getByResultId(simulated.id)?.state, "OPEN");

  const policy = plan.settlementPolicy;
  assert.equal(policy.kind, "FUNDING_CAPTURE_THEN_EXIT");
  if (policy.kind !== "FUNDING_CAPTURE_THEN_EXIT") throw new Error("Expected funding settlement policy.");
  assert.equal(policy.fundingSchedule?.length, 3);
  const exitAt = policy.notBefore + 1;
  const exitMarket: CentralPaperExitMarketSource = {
    inspect: (position) => ({
      levels: [{
        price: position.signedQuantity > 0 ? 101 : 99.5,
        quantity: 2,
      }],
      observedAt: exitAt - 100,
      sourceTimestamp: exitAt + 250,
      feePercent: 0.1,
      feeEvidenceId: `close-fee:${position.exchange}`,
      feeEvidenceSource: "STATIC_CONFIG",
    }),
  };
  const exit = new CentralPaperExitEvidenceProvider(
    exitMarket,
    1_000,
    {get: (exchange, market, fundingTime) => funding(exchange, market, fundingTime, exitAt)},
  ).evaluate(restoredPositions.getByResultId(simulated.id)!, policy, exitAt);
  assert.equal(exit.state, "READY_TO_CLOSE");
  assert.ok(exit.closeEvidence);
  assert.equal(exit.closeEvidence.positions.every((position) => position.fundingPaymentQuote > 0), true);
  assert.equal(exit.closeEvidence.positions.every((position) =>
    position.fundingPaymentEvidenceId.startsWith("funding-bundle:3:")), true);
  const longPositionId = open.positions.find((position) => position.exchange === "binance")?.id;
  const shortPositionId = open.positions.find((position) => position.exchange === "bybit")?.id;
  assert.equal(exit.closeEvidence.positions.find((position) =>
    position.positionId === longPositionId)?.fundingPaymentQuote, 0.6);
  assert.equal(exit.closeEvidence.positions.find((position) =>
    position.positionId === shortPositionId)?.fundingPaymentQuote, 1.2024);

  const closed = restoredPositions.close(open.id, exit.closeEvidence, exitAt);
  assert.equal(closed.state, "CLOSED");
  assert.equal(closed.realizedPnlEvidenceStatus, "AVAILABLE");
  assert.ok((closed.realizedNetPnlQuote ?? 0) > 0);
  const account = new PaperAccount();
  const accounting = new CentralPaperPositionAccountingService(accountingPath, account);
  const conversion = {
    id: `conversion:${closed.id}`,
    sourceAsset: "USDT",
    targetAsset: "INR" as const,
    sourceQuantity: Math.abs(closed.realizedNetPnlQuote!),
    targetQuantity: Math.abs(closed.realizedNetPnlQuote!) * 85,
    path: [],
    generatedAt: exitAt,
    expiresAt: exitAt + 1_000,
    valuationOnly: true as const,
    orderSubmissionAllowed: false as const,
  };
  const posted = accounting.book(closed, conversion, exitAt);
  assert.equal(posted.state, "ACCOUNT_POSTED");
  assert.ok(account.getAccount().currentCapital > 100_000);
  assert.equal(new CentralPaperPositionAccountingService(accountingPath, account).get(closed.id)?.state, "ACCOUNT_POSTED");
  assert.equal(new CentralPaperPositionLedgerService(positionPath, 10).getByResultId(simulated.id)?.state, "CLOSED");

  const recoveryPlan = compiler.compile(signal("funding-partial-recovery"), now + 10);
  queue.enqueue(recoveryPlan, admission(recoveryPlan), now + 10);
  const recoveryLease = queue.leaseNext("funding-paper-worker", now + 11, 5_000);
  assert.ok(recoveryLease);
  const partial = simulator.simulate(recoveryLease, simulationEvidence(recoveryLease, [1, 0], now + 11), now + 11);
  assert.equal(partial.status, "RECOVERY_REQUIRED");
  assert.equal(partial.pnlEvidenceStatus, "NO_DATA");
  const partialJournal = journal.capture(recoveryLease, partial, now + 12);
  assert.equal(partialJournal.state, "PENDING_SHARED_RECOVERY");
  const bridge = new CentralPaperSharedRecoveryBridgeService(new SharedRecoveryIntentService({maximumIntents: 10}));
  const staged = bridge.synchronize(recoveryLease, partial, now + 12);
  assert.equal(staged.staged, 1);
  assert.equal(staged.rejected, 0);
  assert.equal(staged.intents[0]?.mode, "PAPER");
  assert.equal(staged.intents[0]?.paperExecutionAllowed, false);
  assert.equal(staged.liveExecutionAllowed, false);
  assert.equal(staged.orderSubmissionAllowed, false);

  console.log("CENTRAL PAPER FUNDING-RATE LIFECYCLE TEST PASSED.");
  console.log("Matched derivative entry, bounded settled-funding lineage, full-depth exit, fee/P&L accounting, restart restore and residual recovery handoff stayed PAPER-only with no exchange order.");
}

function main(): void {
  const testDirectory = mkdtempSync(join(tmpdir(), "cat-pro-funding-paper-"));
  try {
    run(testDirectory);
  } finally {
    rmSync(testDirectory, {recursive: true, force: true});
  }
}

main();
