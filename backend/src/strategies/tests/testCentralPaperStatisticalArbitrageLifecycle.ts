import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import type {DerivativeFundingSettlementEvidence} from "../../derivatives/models/DerivativeFundingSettlementEvidence";
import {CentralPaperSharedRecoveryBridgeService} from "../../recovery/adapters/CentralPaperSharedRecoveryBridgeService";
import {SharedRecoveryIntentService} from "../../recovery/services/SharedRecoveryIntentService";
import type {TradingAccount} from "../../trading/account/TradingAccount";
import type {CentralStrategyExecutionPlan} from "../models/CentralStrategyExecutionPlan";
import type {StatisticalArbitrageStrategySignal} from "../models/StrategySignal";
import {CentralMultiLegPaperSimulator, type CentralPaperSimulationEvidence} from "../services/CentralMultiLegPaperSimulator";
import {CentralPaperExecutionQueueService, type CentralPaperQueueRecord} from "../services/CentralPaperExecutionQueueService";
import {CentralPaperExitEvidenceProvider, type CentralPaperExitMarketSource} from "../services/CentralPaperExitEvidenceProvider";
import {CentralPaperPositionAccountingService, type CentralPaperAccountPort} from "../services/CentralPaperPositionAccountingService";
import {CentralPaperPositionLedgerService} from "../services/CentralPaperPositionLedgerService";
import {CentralPaperSimulationJournalService} from "../services/CentralPaperSimulationJournalService";
import {CentralPaperPlanAdmissionService, type CentralPaperPlanEvidence} from "../services/CentralPaperPlanAdmissionService";
import {CentralStrategyExecutionPlanCompiler} from "../services/CentralStrategyExecutionPlanCompiler";

const now = 1_783_000_000_000;

class PaperAccount implements CentralPaperAccountPort {
  private account: TradingAccount = {
    id: "statistical-arbitrage-paper", name: "statistical-arbitrage-paper", mode: "PAPER",
    enabled: true, emergencyStop: false,
    limits: {maximumCapitalPerTrade: 100_000, maximumDailyLoss: 100_000, maximumOpenTrades: 50, maximumDailyTrades: 500},
    initialCapital: 100_000, currentCapital: 100_000, availableCapital: 100_000,
    todayProfit: 0, todayLoss: 0, openTrades: 0, tradesToday: 0,
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

function signal(id: string, generatedAt = now): StatisticalArbitrageStrategySignal {
  const currentSpread = Math.log(102) - Math.log(98);
  return {
    id, strategyId: "statistical-arbitrage", kind: "STATISTICAL_ARBITRAGE_SHADOW_PAIR",
    evidenceStatus: "AVAILABLE", source: "DerivativeMarketData", sourceSnapshotGeneratedAt: generatedAt,
    generatedAt, observedAt: generatedAt, expiresAt: generatedAt + 120_000,
    executionAuthorized: false, automaticExecutionAllowed: false,
    evidence: {
      pairId: "binance:BTCUSDT:ETHUSDT", exchange: "binance",
      leftMarket: "BTCUSDT", rightMarket: "ETHUSDT", direction: "SHORT_LEFT_LONG_RIGHT",
      baselineSampleCount: 200, baselineExcludesCurrentObservation: true,
      hedgeBeta: 1, returnCorrelation: 0.92, currentSpread,
      baselineSpreadMean: 0, baselineSpreadStandardDeviation: 0.01,
      zScore: currentSpread / 0.01, entryZScoreThreshold: 2,
      nextFundingTimeLong: generatedAt + 5_000, nextFundingTimeShort: generatedAt + 5_100,
      longMarket: "ETHUSDT", shortMarket: "BTCUSDT", longQuantity: 1, shortQuantity: 1,
      longEntryVwap: 98, shortEntryVwap: 102, modeledGrossReversionQuote: 4,
      roundTripFeeQuote: 0.4, adverseFundingReserveQuote: 0.25, safetyBufferQuote: 0.05,
      modeledNetQuote: 3.3, modeledNetPercent: 3.3, modeledReversionGuaranteed: false,
      cointegrationVerified: false, correlationImpliesCausation: false, fullDepthApplied: true,
      marketRulesApplied: true, explicitFeesApplied: true,
      executionReadinessBlockers: ["POSITION_EVIDENCE_MISSING", "MARGIN_EVIDENCE_MISSING",
        "LIQUIDATION_CONTROL_MISSING", "REDUCE_ONLY_UNVERIFIED", "DERIVATIVE_ADAPTER_MISSING"],
    },
  };
}

function evidence(plan: CentralStrategyExecutionPlan, promotionReady: boolean, observedAt = now): CentralPaperPlanEvidence {
  return {
    planId: plan.id, generatedAt: observedAt, expiresAt: observedAt + 5_000,
    account: new PaperAccount().getAccount(),
    capital: {assessmentId: `capital:${plan.id}`, planId: plan.id, requestedAmount: 10_000,
      currency: "INR", conversionEvidenceIds: [`valuation:${plan.id}`], approved: true, reservationMutationPerformed: false},
    risk: {assessmentId: `risk:${plan.id}`, planId: plan.id, approved: true, level: "LOW", score: 90},
    legs: plan.legs.map((leg) => ({legId: leg.id, balanceVerified: true, paperAdapterSupported: true,
      marketRulesVerified: true, feeEvidenceFresh: true, quoteFresh: true})),
    controls: {planId: plan.id, paperSimulatorAvailable: true, failureRecoveryAvailable: true,
      accountingJournalAvailable: true, settlementAvailable: true, liveAdapterReachable: false},
    statisticalPromotion: {planId: plan.id, walkForwardPassed: promotionReady, regimeAdmitted: promotionReady},
  };
}

function admissionService(): CentralPaperPlanAdmissionService {
  return new CentralPaperPlanAdmissionService({enabled: true, allowedStrategies: ["statistical-arbitrage"],
    maximumEvidenceAgeMs: 5_000, maximumCapitalPerPlan: 20_000});
}

function simulationEvidence(record: CentralPaperQueueRecord, fillRatios: readonly [number, number], observedAt: number): CentralPaperSimulationEvidence {
  return {
    planId: record.plan.id, queueRecordId: record.id, leaseId: record.leaseId!,
    generatedAt: observedAt, expiresAt: observedAt + 2_000,
    legs: record.plan.legs.map((leg, index) => ({legId: leg.id, settlementAsset: "USDT", feePercent: 0.1,
      feeEvidenceId: `derivative-fee:${leg.exchange}`, feeEvidenceSource: "STATIC_CONFIG",
      simulatedSlippagePercent: 0, fillRatio: fillRatios[index]!,
      terminalStatus: fillRatios[index] === 1 ? "FILLED" : fillRatios[index] === 0 ? "FAILED" : "PARTIALLY_FILLED",
      passiveFillEvidenceId: null})),
    exchangeOrderEvidenceUsed: false,
  };
}

function funding(exchange: string, market: string, requestedFundingTime: number, observedAt: number): DerivativeFundingSettlementEvidence {
  const longLeg = market === "ETHUSDT";
  return {
    version: "56.0", id: `statistical-funding:${exchange}:${market}:${requestedFundingTime + 6}`,
    exchange, market, settlementAsset: "USDT", fundingTime: requestedFundingTime + 6,
    fundingRate: longLeg ? -0.001 : 0.0015, markPrice: longLeg ? 100.5 : 101.5,
    rateSource: "PUBLIC_SETTLED_FUNDING_RATE_HISTORY",
    priceSource: longLeg ? "FUNDING_HISTORY_ASSOCIATED_MARK_PRICE" : "ONE_MINUTE_MARK_PRICE_KLINE_OPEN",
    priceQuality: longLeg ? "EXACT_EXCHANGE_ASSOCIATED_MARK_PRICE" : "BOUNDED_PUBLIC_MARK_KLINE_PROXY",
    observedAt, paymentFormula: "NEGATIVE_SIGNED_QUANTITY_X_MARK_PRICE_X_FUNDING_RATE",
    accountTransactionEvidenceUsed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false,
  };
}

function exitMarket(observedAt: number, longClosePrice: number, shortClosePrice: number, quantity = 2): CentralPaperExitMarketSource {
  return {inspect: (position) => ({levels: [{price: position.signedQuantity > 0 ? longClosePrice : shortClosePrice, quantity}],
    observedAt, sourceTimestamp: observedAt, feePercent: 0.1,
    feeEvidenceId: `close-fee:${position.exchange}:${position.market}`, feeEvidenceSource: "STATIC_CONFIG"})};
}

function run(testDirectory: string): void {
  const queuePath = join(testDirectory, "queue.jsonl");
  const journalPath = join(testDirectory, "journal.jsonl");
  const positionPath = join(testDirectory, "positions.jsonl");
  const accountingPath = join(testDirectory, "accounting.jsonl");
  const compiler = new CentralStrategyExecutionPlanCompiler();
  const queue = new CentralPaperExecutionQueueService(queuePath, 10);
  const journal = new CentralPaperSimulationJournalService(journalPath, 10);
  const positions = new CentralPaperPositionLedgerService(positionPath, 10);
  const simulator = new CentralMultiLegPaperSimulator();

  const plan = compiler.compile(signal("statistical-complete"), now);
  assert.equal(plan.strategyId, "statistical-arbitrage");
  assert.equal(plan.pattern, "PARALLEL_STATISTICAL_PAIR");
  assert.equal(plan.settlementPolicy.kind, "STATISTICAL_MEAN_REVERSION");
  assert.deepEqual(plan.legs.map((leg) => [leg.exchange, leg.market, leg.product, leg.side, leg.dependency]), [
    ["binance", "ETHUSDT", "PERPETUAL", "BUY", "PARALLEL"],
    ["binance", "BTCUSDT", "PERPETUAL", "SELL", "PARALLEL"],
  ]);
  assert.equal(plan.settlementPolicy.requiresFundingEvidence, true);
  assert.equal(plan.settlementPolicy.forcedTimeExitAllowed, false);

  const blockedAdmission = admissionService().evaluate(plan, evidence(plan, false), now);
  assert.equal(blockedAdmission.state, "BLOCKED");
  assert.equal(blockedAdmission.gates.researchPromotionReady, false);
  assert.ok(blockedAdmission.blockers.includes("STATISTICAL_RESEARCH_PROMOTION_NOT_READY"));
  assert.deepEqual(blockedAdmission.intrinsicPlanBlockers, []);

  const eligibleAdmission = admissionService().evaluate(plan, evidence(plan, true), now);
  assert.equal(eligibleAdmission.state, "ELIGIBLE_FOR_CENTRAL_PAPER_QUEUE");
  assert.equal(eligibleAdmission.gates.researchPromotionReady, true);
  assert.equal(eligibleAdmission.liveExecutionAllowed, false);
  assert.equal(eligibleAdmission.orderSubmissionAllowed, false);

  queue.enqueue(plan, eligibleAdmission, now);
  const leased = queue.leaseNext("statistical-paper-worker", now + 1, 5_000);
  assert.ok(leased);
  const simulated = simulator.simulate(leased, simulationEvidence(leased, [1, 1], now + 1), now + 1);
  assert.equal(simulated.status, "SIMULATED_ENTRY_COMPLETE");
  assert.equal(simulated.recoveryRequired, false);
  assert.equal(simulated.pnlEvidenceStatus, "NO_DATA");
  const captured = journal.capture(leased, simulated, now + 2);
  const open = positions.recordEntry(captured, now + 2);
  assert.equal(open.state, "OPEN");
  assert.equal(open.positions.length, 2);
  const accountedEntry = journal.markPositionAccounted(simulated.id, open.id, now + 2);
  queue.acknowledge(leased.id, leased.leaseId!, "COMPLETED", accountedEntry.id, now + 2);

  const restoredQueue = new CentralPaperExecutionQueueService(queuePath, 10);
  const restoredJournal = new CentralPaperSimulationJournalService(journalPath, 10);
  const restoredPositions = new CentralPaperPositionLedgerService(positionPath, 10);
  assert.equal(restoredQueue.getByPlanId(plan.id, now + 3)?.state, "COMPLETED");
  assert.equal(restoredJournal.get(simulated.id)?.state, "POSITION_ACCOUNTED");
  assert.equal(restoredPositions.getByResultId(simulated.id)?.state, "OPEN");

  const policy = plan.settlementPolicy;
  assert.equal(policy.kind, "STATISTICAL_MEAN_REVERSION");
  if (policy.kind !== "STATISTICAL_MEAN_REVERSION") throw new Error("Expected statistical mean-reversion settlement policy.");
  const holdAt = now + 1_000;
  const hold = new CentralPaperExitEvidenceProvider(exitMarket(holdAt, 99, 102), 1_000,
    {get: () => { throw new Error("Funding evidence must not be requested before settlement time."); }})
    .evaluate(restoredPositions.getByResultId(simulated.id)!, policy, holdAt);
  assert.equal(hold.state, "HOLD");
  assert.ok(hold.metric !== null && hold.threshold !== null && hold.metric > hold.threshold);
  assert.ok(hold.blockers.includes("STRATEGY_EXIT_CONDITION_NOT_MET"));

  const exitAt = now + 12_000;
  const shallow = new CentralPaperExitEvidenceProvider(exitMarket(exitAt - 100, 101, 101.1, 0.25), 1_000,
    {get: (exchange, market, fundingTime) => funding(exchange, market, fundingTime, exitAt)})
    .evaluate(restoredPositions.getByResultId(simulated.id)!, policy, exitAt);
  assert.equal(shallow.state, "BLOCKED");
  assert.ok(shallow.blockers.includes("FRESH_FULL_DEPTH_CLOSE_EVIDENCE_UNAVAILABLE"));

  const exit = new CentralPaperExitEvidenceProvider(exitMarket(exitAt - 100, 101, 101.1), 1_000,
    {get: (exchange, market, fundingTime) => funding(exchange, market, fundingTime, exitAt)})
    .evaluate(restoredPositions.getByResultId(simulated.id)!, policy, exitAt);
  assert.equal(exit.state, "READY_TO_CLOSE");
  assert.ok(exit.metric !== null && exit.threshold !== null && exit.metric <= exit.threshold);
  assert.ok(exit.closeEvidence);
  assert.equal(exit.closeEvidence.exchangeOrderEvidenceUsed, false);
  assert.equal(exit.closeEvidence.positions.every((position) => position.fundingPaymentQuote > 0), true);

  const closed = restoredPositions.close(open.id, exit.closeEvidence, exitAt);
  assert.equal(closed.state, "CLOSED");
  assert.equal(closed.realizedPnlEvidenceStatus, "AVAILABLE");
  assert.ok((closed.realizedNetPnlQuote ?? 0) > 0);
  const account = new PaperAccount();
  const accounting = new CentralPaperPositionAccountingService(accountingPath, account);
  const conversion = {id: `conversion:${closed.id}`, sourceAsset: "USDT", targetAsset: "INR" as const,
    sourceQuantity: Math.abs(closed.realizedNetPnlQuote!), targetQuantity: Math.abs(closed.realizedNetPnlQuote!) * 85,
    path: [], generatedAt: exitAt, expiresAt: exitAt + 1_000, valuationOnly: true as const, orderSubmissionAllowed: false as const};
  const posted = accounting.book(closed, conversion, exitAt);
  assert.equal(posted.state, "ACCOUNT_POSTED");
  assert.ok(account.getAccount().currentCapital > 100_000);
  assert.equal(new CentralPaperPositionAccountingService(accountingPath, account).get(closed.id)?.state, "ACCOUNT_POSTED");
  assert.equal(new CentralPaperPositionLedgerService(positionPath, 10).getByResultId(simulated.id)?.state, "CLOSED");

  const recoveryPlan = compiler.compile(signal("statistical-partial", now + 10), now + 10);
  const recoveryAdmission = admissionService().evaluate(recoveryPlan, evidence(recoveryPlan, true, now + 10), now + 10);
  queue.enqueue(recoveryPlan, recoveryAdmission, now + 10);
  const recoveryLease = queue.leaseNext("statistical-paper-worker", now + 11, 5_000);
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

  console.log("CENTRAL PAPER STATISTICAL ARBITRAGE LIFECYCLE TEST PASSED.");
  console.log("Promotion gates, paired derivative entry, z-score hold/close, bounded funding, restart accounting and residual recovery remained PAPER-only with no exchange order.");
}

function main(): void {
  const testDirectory = mkdtempSync(join(tmpdir(), "cat-pro-statistical-paper-"));
  try { run(testDirectory); } finally { rmSync(testDirectory, {recursive: true, force: true}); }
}

main();
