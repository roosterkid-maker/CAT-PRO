import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import type {TradingAccount} from "../../trading/account/TradingAccount";
import {CentralPaperSharedRecoveryBridgeService} from "../../recovery/adapters/CentralPaperSharedRecoveryBridgeService";
import {SharedRecoveryIntentService} from "../../recovery/services/SharedRecoveryIntentService";
import type {CrossExchangeMarketMakingPublicTrade} from "../cross-exchange-market-making/CrossExchangeMarketMakingPublicTradeTapeService";
import type {CentralStrategyExecutionPlan} from "../models/CentralStrategyExecutionPlan";
import type {DynamicMarketMakingStrategySignal} from "../models/StrategySignal";
import {CentralPaperCapitalAllocationService, type CentralPaperCapitalAccountPort} from "../services/CentralPaperCapitalAllocationService";
import {CentralPaperExecutionQueueService} from "../services/CentralPaperExecutionQueueService";
import {CentralPaperExecutionWorkerService} from "../services/CentralPaperExecutionWorkerService";
import {CentralPaperPassiveFillEvidenceService, type CentralPaperPassiveTradeSource} from "../services/CentralPaperPassiveFillEvidenceService";
import {CentralPaperPlanAdmissionService, type CentralPaperPlanEvidence} from "../services/CentralPaperPlanAdmissionService";
import {CentralPaperPositionAccountingService, type CentralPaperAccountPort} from "../services/CentralPaperPositionAccountingService";
import {CentralPaperPositionLedgerService} from "../services/CentralPaperPositionLedgerService";
import {CentralPaperSimulationEvidenceProvider, type CentralPaperMarketSimulationSource} from "../services/CentralPaperSimulationEvidenceProvider";
import {CentralPaperSimulationJournalService} from "../services/CentralPaperSimulationJournalService";
import {CentralStrategyExecutionPlanCompiler} from "../services/CentralStrategyExecutionPlanCompiler";

const now = 1_783_000_000_000;

class PaperAccount implements CentralPaperAccountPort, CentralPaperCapitalAccountPort {
  private account: TradingAccount = {
    id: "dynamic-maker-paper",
    name: "dynamic-maker-paper",
    mode: "PAPER",
    enabled: true,
    emergencyStop: false,
    limits: {maximumCapitalPerTrade: 100_000, maximumDailyLoss: 100_000, maximumOpenTrades: 50, maximumDailyTrades: 500},
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
  hasAppliedAccountingTransaction(id: string): boolean { return this.applied.has(id); }
  runWithAccountingTransaction<T>(id: string, operation: () => T): T {
    this.transaction = id;
    try { return operation(); } finally { this.transaction = null; }
  }
  recordProfit(value: number): void {
    if (!this.transaction || this.applied.has(this.transaction)) return;
    this.applied.add(this.transaction);
    this.account.currentCapital += value;
    this.account.availableCapital += value;
  }
  reserveCapital(amount: number, transactionId: string): boolean {
    if (this.applied.has(transactionId)) return true;
    if (amount > this.account.availableCapital) return false;
    this.applied.add(transactionId);
    this.account.availableCapital -= amount;
    return true;
  }
  releaseCapital(amount: number, transactionId: string): void {
    if (this.applied.has(transactionId)) return;
    this.applied.add(transactionId);
    this.account.availableCapital += amount;
  }
}

class TradeTape implements CentralPaperPassiveTradeSource {
  readonly trades: CrossExchangeMarketMakingPublicTrade[] = [];
  watch(): void { /* deterministic public tape */ }
  getTrades(exchange: string, market: string, afterExclusive: number, throughInclusive: number) {
    return this.trades.filter((trade) => trade.exchange === exchange && trade.market === market &&
      trade.occurredAt > afterExclusive && trade.occurredAt <= throughInclusive);
  }
}

function signal(id: string, generatedAt: number, ttlMs = 10_000): DynamicMarketMakingStrategySignal {
  return {
    id,
    strategyId: "dynamic-market-making",
    kind: "DYNAMIC_MARKET_MAKING_SHADOW_QUOTE_PLAN",
    evidenceStatus: "AVAILABLE",
    source: "OrderBookService",
    sourceSnapshotGeneratedAt: generatedAt,
    generatedAt,
    observedAt: generatedAt,
    expiresAt: generatedAt + ttlMs,
    executionAuthorized: false,
    automaticExecutionAllowed: false,
    evidence: {
      exchange: "binance",
      market: "BTCUSDT",
      fairPrice: 100,
      unadjustedFairPrice: 100,
      midPrice: 100,
      microprice: 100,
      bookSpreadPercent: 0.2,
      depthImbalance: 0,
      realizedVolatilityPercent: 0.1,
      volatilitySampleCount: 10,
      marketRegime: "NORMAL",
      regimeSpreadMultiplier: 1.25,
      publicTradeEvidenceSource: "EXCHANGE_PUBLIC_TRADE_TAPE",
      publicTradeSampleCount: 20,
      publicTradeLookbackMs: 60_000,
      aggressorFlowImbalance: 0,
      tradeFlowFairValueSkewPercent: 0,
      adverseSelectionSpreadPercent: 0,
      liquidityCoverageMultiple: 10,
      liquiditySpreadPenaltyPercent: 0,
      bidFillProbabilityPercent: 80,
      askFillProbabilityPercent: 80,
      bidQuotePrice: 99,
      askQuotePrice: 101,
      quoteQuantity: 1,
      targetQuoteQuantity: 1,
      adaptiveHalfSpreadPercent: 1,
      modeledGrossCapturePercent: 2,
      makerRoundTripFeePercent: 0.04,
      safetyBufferPercent: 0.02,
      modeledNetCapturePercent: 1.94,
      modeledCaptureGuaranteed: false,
      priceStep: 0.1,
      quantityStep: 0.001,
      passiveQuotesEnforced: true,
      inventoryAdjustmentApplied: true,
      inventoryEvidenceSource: "AUTHENTICATED_EXCHANGE_BALANCE_SNAPSHOTS",
      inventorySynchronizedAt: generatedAt,
      inventoryAgeMs: 0,
      inventoryBaseAsset: "BTC",
      inventoryQuoteAsset: "USDT",
      inventoryBaseTotal: 2,
      inventoryQuoteTotal: 20_000,
      inventoryBaseAvailable: 2,
      inventoryQuoteAvailable: 20_000,
      inventoryBaseValueQuote: 200,
      inventoryTotalValueQuote: 20_200,
      inventoryBaseSharePercent: 0.990099009901,
      inventoryTargetBasePercent: 50,
      inventoryDeviationPercent: -49.009900990099,
      inventorySkewPercent: 0.19603960396,
      queuePositionKnown: false,
      fillProbabilityKnown: true,
      fullDepthApplied: true,
      marketRulesApplied: true,
      explicitFeesApplied: true,
      executionReadinessBlockers: ["QUEUE_POSITION_UNKNOWN", "POST_ONLY_EXECUTION_UNVERIFIED"],
    },
  };
}

function admit(plan: CentralStrategyExecutionPlan, observedAt: number) {
  const account = new PaperAccount().getAccount();
  const evidence: CentralPaperPlanEvidence = {
    planId: plan.id,
    generatedAt: observedAt,
    expiresAt: observedAt + 5_000,
    account,
    capital: {assessmentId: `capital:${plan.id}`, planId: plan.id, requestedAmount: 1_000, currency: "INR",
      conversionEvidenceIds: [`valuation:${plan.id}`], approved: true, reservationMutationPerformed: false},
    risk: {assessmentId: `risk:${plan.id}`, planId: plan.id, approved: true, level: "LOW", score: 90},
    legs: plan.legs.map((leg) => ({legId: leg.id, balanceVerified: true, paperAdapterSupported: true,
      marketRulesVerified: true, feeEvidenceFresh: true, quoteFresh: true})),
    controls: {planId: plan.id, paperSimulatorAvailable: true, failureRecoveryAvailable: true,
      accountingJournalAvailable: true, settlementAvailable: true, liveAdapterReachable: false},
    statisticalPromotion: null,
  };
  const result = new CentralPaperPlanAdmissionService({enabled: true, allowedStrategies: ["dynamic-market-making"],
    maximumEvidenceAgeMs: 5_000, maximumCapitalPerPlan: 5_000}).evaluate(plan, evidence, observedAt);
  assert.equal(result.state, "ELIGIBLE_FOR_CENTRAL_PAPER_QUEUE");
  assert.deepEqual(result.intrinsicPlanBlockers, []);
  assert.equal(result.gates.everyLegReady, true);
  return result;
}

function trade(id: string, side: "BUY" | "SELL", price: number, occurredAt: number): CrossExchangeMarketMakingPublicTrade {
  return {id, exchange: "binance", market: "BTCUSDT", price, quantity: 1, occurredAt,
    aggressorSide: side, source: "BINANCE_AGG_TRADE"};
}

function run(testDirectory: string): void {
  const queuePath = join(testDirectory, "queue.jsonl");
  const journalPath = join(testDirectory, "journal.jsonl");
  const positionPath = join(testDirectory, "positions.jsonl");
  const accountingPath = join(testDirectory, "accounting.jsonl");
  const capitalPath = join(testDirectory, "capital.jsonl");
  const compiler = new CentralStrategyExecutionPlanCompiler();
  const queue = new CentralPaperExecutionQueueService(queuePath, 20);
  const journal = new CentralPaperSimulationJournalService(journalPath, 20);
  const positions = new CentralPaperPositionLedgerService(positionPath, 20);
  const account = new PaperAccount();
  const accounting = new CentralPaperPositionAccountingService(accountingPath, account);
  const capital = new CentralPaperCapitalAllocationService(account, capitalPath, 20);
  const recoveryIntents = new SharedRecoveryIntentService({maximumIntents: 20});
  const recovery = new CentralPaperSharedRecoveryBridgeService(recoveryIntents);
  const tape = new TradeTape();
  const passive = new CentralPaperPassiveFillEvidenceService(tape, 1_000, 1_500, 20);
  const market: CentralPaperMarketSimulationSource = {inspect: (leg, observedAt) => ({
    levels: [{price: leg.referencePrice, quantity: 5}],
    quoteTimestamp: observedAt,
    feePercent: 0.02,
    feeEvidenceId: `maker-fee:${leg.exchange}:${leg.market}`,
    feeEvidenceSource: "STATIC_CONFIG",
    settlementAsset: "USDT",
    priceStep: 0.1,
  })};
  const evidence = new CentralPaperSimulationEvidenceProvider(market, 3_000, passive);
  const conversion = {convertAssetToInr: (asset: string, quantity: number, context: string, observedAt: number) => ({
    id: `conversion:${context}`, sourceAsset: asset, targetAsset: "INR" as const, sourceQuantity: quantity,
    targetQuantity: quantity * 85, path: [], generatedAt: observedAt, expiresAt: observedAt + 1_000,
    valuationOnly: true as const, orderSubmissionAllowed: false as const,
  })};
  const worker = new CentralPaperExecutionWorkerService({enabled: true, workerId: "dynamic-maker-worker",
    leaseTtlMs: 5_000, pollIntervalMs: 1_000, evidenceRetryDelayMs: 250, maximumEvidenceAttempts: 10},
  evidence, queue, undefined, journal, recovery, positions, accounting, conversion, capital);

  const completePlan = compiler.compile(signal("dynamic-maker-complete", now), now);
  assert.equal(completePlan.pattern, "TWO_SIDED_PASSIVE_MAKER");
  assert.equal(completePlan.settlementPolicy.kind, "TWO_SIDED_PASSIVE_FILL_CYCLE");
  assert.deepEqual(completePlan.legs.map((leg) => [leg.side, leg.orderType, leg.dependency]), [
    ["BUY", "LIMIT_POST_ONLY", "PARALLEL"],
    ["SELL", "LIMIT_POST_ONLY", "PARALLEL"],
  ]);
  queue.enqueue(completePlan, admit(completePlan, now), now);
  const waiting = worker.runOnce(now);
  assert.equal(waiting.state, "WAITING_FOR_EVIDENCE");
  assert.equal(capital.getByPlanId(completePlan.id)?.state, "ACTIVE");
  tape.trades.push(
    trade("complete-bid-through", "SELL", 98.9, now + 1_000),
    trade("complete-ask-through", "BUY", 101.1, now + 1_000),
  );
  const completed = worker.runOnce(now + 1_000);
  assert.equal(completed.state, "POSITION_ACCOUNTED");
  assert.equal(completed.accountPnlMutationPerformed, true);
  assert.equal(completed.liveExecutionAllowed, false);
  assert.equal(completed.orderSubmissionAllowed, false);
  const completedJournal = journal.get(completed.simulationResultId!);
  assert.equal(completedJournal?.simulation.status, "SIMULATED_CYCLE_COMPLETE");
  assert.equal(completedJournal?.simulation.cycleSettlement?.source, "SIMULATED_NEUTRAL_PASSIVE_FILL_AND_HEDGE_FLOW");
  assert.equal(completedJournal?.simulation.legs.every((leg) => leg.exchangeOrderId === null), true);
  assert.ok(completedJournal?.simulation.reasons.some((reason) => reason.includes("neutral passive cycle")));
  const closed = positions.getByResultId(completed.simulationResultId!)!;
  assert.equal(closed.state, "CLOSED");
  assert.equal(closed.realizedPnlEvidenceStatus, "AVAILABLE");
  assert.ok((closed.realizedNetPnlQuote ?? 0) > 0);
  assert.equal(accounting.get(closed.id)?.state, "ACCOUNT_POSTED");
  assert.equal(capital.getByPlanId(completePlan.id)?.state, "RELEASED");
  assert.ok(account.getAccount().currentCapital > 100_000);

  assert.equal(new CentralPaperExecutionQueueService(queuePath, 20).getByPlanId(completePlan.id, now + 1_001)?.state, "COMPLETED");
  assert.equal(new CentralPaperSimulationJournalService(journalPath, 20).get(completed.simulationResultId!)?.state, "POSITION_ACCOUNTED");
  assert.equal(new CentralPaperPositionLedgerService(positionPath, 20).getByResultId(completed.simulationResultId!)?.state, "CLOSED");
  assert.equal(new CentralPaperPositionAccountingService(accountingPath, account).get(closed.id)?.state, "ACCOUNT_POSTED");
  assert.equal(new CentralPaperCapitalAllocationService(account, capitalPath, 20).getByPlanId(completePlan.id)?.state, "RELEASED");

  const recoveryStart = now + 20_000;
  const recoveryPlan = compiler.compile(signal("dynamic-maker-one-sided", recoveryStart, 5_000), recoveryStart);
  queue.enqueue(recoveryPlan, admit(recoveryPlan, recoveryStart), recoveryStart);
  const recoveryWaiting = worker.runOnce(recoveryStart);
  assert.equal(recoveryWaiting.state, "WAITING_FOR_EVIDENCE");
  tape.trades.push(trade("recovery-bid-through", "SELL", 98.9, recoveryStart + 1_000));
  const recovered = worker.runOnce(recoveryStart + 3_600);
  assert.equal(recovered.state, "SHARED_RECOVERY_STAGED");
  assert.equal(recovered.accountPnlMutationPerformed, false);
  const recoveryJournal = journal.get(recovered.simulationResultId!);
  assert.equal(recoveryJournal?.simulation.status, "RECOVERY_REQUIRED");
  assert.equal(recoveryJournal?.simulation.pnlEvidenceStatus, "NO_DATA");
  assert.equal(recoveryJournal?.state, "SHARED_RECOVERY_STAGED");
  const recoveryReport = recoveryIntents.getReport(recoveryStart + 3_600);
  assert.equal(recoveryReport.summary.staged, 1);
  assert.equal(recoveryReport.intents[0]?.sourceStrategyId, "dynamic-market-making");
  assert.equal(recoveryReport.intents[0]?.leg.venue, "binance");
  assert.equal(recoveryReport.intents[0]?.leg.market, "BTCUSDT");
  assert.equal(recoveryReport.intents[0]?.leg.side, "SELL");
  assert.equal(recoveryReport.intents[0]?.leg.quantity, 1);
  assert.equal(recoveryReport.intents[0]?.paperExecutionAllowed, false);
  assert.equal(queue.getByPlanId(recoveryPlan.id, recoveryStart + 3_601)?.state, "REJECTED");
  assert.equal(capital.getByPlanId(recoveryPlan.id)?.state, "ACTIVE");

  console.log("CENTRAL PAPER DYNAMIC MARKET-MAKING LIFECYCLE TEST PASSED.");
  console.log("Real admission, one-tick public trade-through fills, neutral maker P&L, restart accounting and one-sided inventory recovery stayed PAPER-only with no exchange order.");
}

function main(): void {
  const testDirectory = mkdtempSync(join(tmpdir(), "cat-pro-dynamic-maker-paper-"));
  try { run(testDirectory); } finally { rmSync(testDirectory, {recursive: true, force: true}); }
}

main();
