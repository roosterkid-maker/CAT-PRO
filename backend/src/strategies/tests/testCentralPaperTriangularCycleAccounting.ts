import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import type {TradingAccount} from "../../trading/account/TradingAccount";
import type {CentralStrategyExecutionPlan} from "../models/CentralStrategyExecutionPlan";
import {CentralPaperExecutionQueueService} from "../services/CentralPaperExecutionQueueService";
import {CentralPaperSimulationJournalService} from "../services/CentralPaperSimulationJournalService";
import {CentralPaperPositionLedgerService} from "../services/CentralPaperPositionLedgerService";
import {CentralPaperPositionAccountingService, type CentralPaperAccountPort} from "../services/CentralPaperPositionAccountingService";
import {CentralPaperExecutionWorkerService, type CentralPaperSimulationEvidenceProvider} from "../services/CentralPaperExecutionWorkerService";
import {CentralPaperCapitalAllocationService} from "../services/CentralPaperCapitalAllocationService";
import {CentralPaperSharedRecoveryBridgeService} from "../../recovery/adapters/CentralPaperSharedRecoveryBridgeService";
import {SharedRecoveryIntentService} from "../../recovery/services/SharedRecoveryIntentService";
import type {CentralPaperPlanAdmission} from "../services/CentralPaperPlanAdmissionService";

const now = 1_780_500_000_000;

class Account implements CentralPaperAccountPort {
  private account: TradingAccount = {id: "cycle", name: "cycle", mode: "PAPER", enabled: true, emergencyStop: false,
    limits: {maximumCapitalPerTrade: 100_000, maximumDailyLoss: 100_000, maximumOpenTrades: 50, maximumDailyTrades: 500},
    initialCapital: 100_000, currentCapital: 100_000, availableCapital: 100_000, todayProfit: 0, todayLoss: 0, openTrades: 0, tradesToday: 0};
  private transaction: string | null = null;
  private readonly applied = new Set<string>();
  getAccount(): TradingAccount { return structuredClone(this.account); }
  runWithAccountingTransaction<T>(id: string, operation: () => T): T { this.transaction = id; try { return operation(); } finally { this.transaction = null; } }
  hasAppliedAccountingTransaction(id: string): boolean { return this.applied.has(id); }
  reserveCapital(value: number, transactionId: string): boolean {
    if (this.applied.has(transactionId)) return true;
    if (value > this.account.availableCapital) return false;
    this.applied.add(transactionId);
    this.account.availableCapital -= value;
    return true;
  }
  releaseCapital(value: number, transactionId: string): void {
    if (this.applied.has(transactionId)) return;
    this.applied.add(transactionId);
    this.account.availableCapital += value;
  }
  recordProfit(value: number): void { if (!this.transaction || this.applied.has(this.transaction)) return; this.applied.add(this.transaction);
    this.account.currentCapital += value; this.account.availableCapital += value; }
}

function plan(): CentralStrategyExecutionPlan {
  const id = "triangle-plan";
  return {version: "35.0", id, strategyId: "triangular-arbitrage", signalId: "triangle-signal",
    signalKind: "TRIANGULAR_ARBITRAGE_SHADOW_PATH", routeFamily: "SPOT_TRIANGULAR", pattern: "SEQUENTIAL_THREE_LEG",
    settlementPolicy: {kind: "IMMEDIATE_CONVERSION_CYCLE", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR", startAsset: "USDT",
      initialQuantity: 100, modeledFinalQuantity: 101, flows: [
        {legId: `${id}:1`, fromAsset: "USDT", toAsset: "BTC"},
        {legId: `${id}:2`, fromAsset: "BTC", toAsset: "ETH"},
        {legId: `${id}:3`, fromAsset: "ETH", toAsset: "USDT"},
      ]},
    executionOwner: "CENTRAL_SHARED_ORCHESTRATOR", compilationState: "COMPILED_SHADOW", promotionState: "BLOCKED",
    generatedAt: now, expiresAt: now + 20_000, legs: [
      {id: `${id}:1`, sequence: 1, exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "BUY", orderType: "MARKET", quantity: 0.999, referencePrice: 100, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
      {id: `${id}:2`, sequence: 2, exchange: "binance", product: "SPOT", market: "ETHBTC", side: "BUY", orderType: "MARKET", quantity: 0.009, referencePrice: 101, reduceOnly: false, dependency: "AFTER_PREVIOUS", evidenceOnly: true},
      {id: `${id}:3`, sequence: 3, exchange: "binance", product: "SPOT", market: "ETHUSDT", side: "SELL", orderType: "MARKET", quantity: 0.008, referencePrice: 102, reduceOnly: false, dependency: "AFTER_PREVIOUS", evidenceOnly: true},
    ], modeledNetValue: 1, modeledNetValueUnit: "START_ASSET", executionReadinessBlockers: [], sourceExecutionAuthorized: false,
    capitalReservationAllowed: false, riskApprovalGranted: false, executionHandoffAllowed: false, automaticExecutionAllowed: false,
    paperExecutionAllowed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false};
}

function admission(value: CentralStrategyExecutionPlan): CentralPaperPlanAdmission {
  return {version: "36.0", id: "triangle-admission", generatedAt: now, planId: value.id, strategyId: value.strategyId,
    state: "ELIGIBLE_FOR_CENTRAL_PAPER_QUEUE", blockers: [], intrinsicPlanBlockers: [], gates: {runtimeEnabled: true,
      strategyAllowed: true, planCurrent: true, evidenceCurrent: true, accountReady: true, capitalApproved: true, riskApproved: true,
      everyLegReady: true, controlsReady: true, researchPromotionReady: true}, approvedCapitalInr: 100,
    capitalReservationMutationPerformed: false,
    executionHandoffAllowed: false, paperExecutionPerformed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false};
}

function run(testDirectory: string): void {
  const queue = new CentralPaperExecutionQueueService(join(testDirectory, "triangle-queue.jsonl"), 10);
  const journal = new CentralPaperSimulationJournalService(join(testDirectory, "triangle-journal.jsonl"), 10);
  const positions = new CentralPaperPositionLedgerService(join(testDirectory, "triangle-positions.jsonl"), 10);
  const account = new Account();
  const accounting = new CentralPaperPositionAccountingService(join(testDirectory, "triangle-accounting.jsonl"), account);
  const capital = new CentralPaperCapitalAllocationService(account, join(testDirectory, "triangle-capital.jsonl"), 10);
  const recovery = new CentralPaperSharedRecoveryBridgeService(new SharedRecoveryIntentService({maximumIntents: 10}));
  const source = plan();
  queue.enqueue(source, admission(source), now);
  const evidence: CentralPaperSimulationEvidenceProvider = {getEvidence: (record, observedAt) => ({
    planId: record.plan.id, queueRecordId: record.id, leaseId: record.leaseId!, generatedAt: observedAt, expiresAt: observedAt + 2_000,
    legs: record.plan.legs.map((leg) => ({legId: leg.id, settlementAsset: "USDT", feePercent: 0.1,
      feeEvidenceId: `fee:${leg.id}`, feeEvidenceSource: "ACCOUNT_API", simulatedSlippagePercent: 0,
      fillRatio: 1, terminalStatus: "FILLED", passiveFillEvidenceId: null})), exchangeOrderEvidenceUsed: false,
  })};
  const conversion = {convertAssetToInr: (asset: string, quantity: number, context: string, observedAt: number) => ({
    id: `conversion:${context}`, sourceAsset: asset, targetAsset: "INR" as const, sourceQuantity: quantity,
    targetQuantity: quantity * 85, path: [], generatedAt: observedAt, expiresAt: observedAt + 1_000,
    valuationOnly: true as const, orderSubmissionAllowed: false as const,
  })};
  const worker = new CentralPaperExecutionWorkerService({enabled: true}, evidence, queue, undefined, journal, recovery, positions, accounting, conversion, capital);
  const result = worker.runOnce(now + 1);
  assert.equal(result.state, "POSITION_ACCOUNTED");
  assert.equal(result.accountPnlMutationPerformed, true);
  const group = positions.getByResultId(result.simulationResultId!)!;
  assert.equal(group.state, "CLOSED");
  assert.equal(group.realizedPnlEvidenceStatus, "AVAILABLE");
  assert.equal(group.realizedPnlAsset, "USDT");
  assert.equal(accounting.get(group.id)?.state, "ACCOUNT_POSTED");
  assert.notEqual(account.getAccount().currentCapital, 100_000);
  assert.equal(queue.getDiagnostics(now + 2).states.completed, 1);
  assert.equal(result.liveExecutionAllowed, false);
  assert.equal(result.orderSubmissionAllowed, false);

  console.log("CENTRAL PAPER TRIANGULAR CYCLE ACCOUNTING TEST PASSED.");
  console.log("Exact sequential fills and fees produced start-asset cycle P&L, then current INR conversion and journal-first accounting posted it exactly once; no LIVE adapter or exchange order was used.");
}

function main(): void {
  const testDirectory = mkdtempSync(join(tmpdir(), "cat-pro-triangular-paper-"));
  try {
    run(testDirectory);
  } finally {
    rmSync(testDirectory, {recursive: true, force: true});
  }
}

main();
