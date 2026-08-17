import assert from "node:assert/strict";
import {CentralPaperSimulationEvidenceProvider} from "../services/CentralPaperSimulationEvidenceProvider";
import type {CentralPaperMarketSimulationSource} from "../services/CentralPaperSimulationEvidenceProvider";
import type {CentralPaperQueueRecord} from "../services/CentralPaperExecutionQueueService";
import {CentralPaperPassiveFillEvidenceService, type CentralPaperPassiveTradeSource} from "../services/CentralPaperPassiveFillEvidenceService";
import {CentralMultiLegPaperSimulator} from "../services/CentralMultiLegPaperSimulator";
import type {CrossExchangeMarketMakingPublicTrade} from "../cross-exchange-market-making/CrossExchangeMarketMakingPublicTradeTapeService";

const now = 1_780_000_000_000;
function record(orderType: "MARKET" | "LIMIT_POST_ONLY" = "MARKET"): CentralPaperQueueRecord {
  return {id: "queue-provider", state: "LEASED", leaseId: "lease-provider", leaseExpiresAt: now + 2_000,
    plan: {id: "plan-provider", expiresAt: now + 5_000, legs: [{id: "leg-buy", product: "SPOT", exchange: "binance", market: "BTCUSDT",
      side: "BUY", orderType, quantity: 2, referencePrice: 100}]}} as unknown as CentralPaperQueueRecord;
}
const source: CentralPaperMarketSimulationSource = {inspect: () => ({levels: [{price: 100, quantity: 1}, {price: 102, quantity: 2}],
  quoteTimestamp: now - 100, feePercent: 0.1, feeEvidenceId: "fee-1", feeEvidenceSource: "STATIC_CONFIG", settlementAsset: "USDT", priceStep: 1})};

async function main(): Promise<void> {
  const provider = new CentralPaperSimulationEvidenceProvider(source, 1_000);
  const evidence = provider.getEvidence(record(), now);
  assert.ok(evidence);
  assert.equal(evidence.legs[0]?.fillRatio, 1);
  assert.equal(evidence.legs[0]?.simulatedSlippagePercent, 1);
  assert.equal(evidence.exchangeOrderEvidenceUsed, false);
  assert.equal(provider.getEvidence(record("LIMIT_POST_ONLY"), now), null);
  const thin = new CentralPaperSimulationEvidenceProvider({inspect: () => ({levels: [{price: 100, quantity: 1}], quoteTimestamp: now,
    feePercent: 0.1, feeEvidenceId: "fee", feeEvidenceSource: "STATIC_CONFIG", settlementAsset: "USDT", priceStep: 1})});
  assert.equal(thin.getEvidence(record(), now), null);
  const stale = new CentralPaperSimulationEvidenceProvider({inspect: () => ({levels: [{price: 100, quantity: 3}], quoteTimestamp: now - 2_000,
    feePercent: 0.1, feeEvidenceId: "fee", feeEvidenceSource: "STATIC_CONFIG", settlementAsset: "USDT", priceStep: 1})}, 1_000);
  assert.equal(stale.getEvidence(record(), now), null);

  const trades: CrossExchangeMarketMakingPublicTrade[] = [];
  const tape: CentralPaperPassiveTradeSource = {watch: () => undefined,
    getTrades: (_exchange, _market, after, through) => trades.filter((trade) => trade.occurredAt > after && trade.occurredAt <= through)};
  const passiveSource: CentralPaperMarketSimulationSource = {inspect: (leg, observedAt) => ({
    levels: [{price: leg.referencePrice, quantity: 5}], quoteTimestamp: observedAt - 50, feePercent: leg.orderType === "LIMIT_POST_ONLY" ? 0.05 : 0.1,
    feeEvidenceId: `fee:${leg.id}`, feeEvidenceSource: "STATIC_CONFIG", settlementAsset: "USDT", priceStep: 1})};
  const passiveProvider = new CentralPaperSimulationEvidenceProvider(passiveSource, 1_000,
    new CentralPaperPassiveFillEvidenceService(tape, 1_000, 1_500, 10));
  const passiveRecord = {version: "37.0", id: "queue:xemm", state: "LEASED", leaseId: "lease:xemm", leasedBy: "worker",
    leaseExpiresAt: now + 4_000, queuedAt: now, updatedAt: now, attempts: 1, evidenceDeferrals: 0,
    nextLeaseEligibleAt: now, lastEvidenceWaitReason: null, admissionId: "admission:xemm", terminalEvidenceId: null,
    executionAuthorized: false, liveExecutionAllowed: false, orderSubmissionAllowed: false,
    plan: {version: "35.0", id: "plan:xemm", strategyId: "cross-exchange-market-making", signalId: "signal:xemm",
      signalKind: "XEMM_SAFE_MAKER_PRICE", routeFamily: "SPOT_TWO_VENUE", pattern: "PASSIVE_MAKER_THEN_HEDGE",
      settlementPolicy: {kind: "PASSIVE_FILL_THEN_HEDGE_CYCLE", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR", requiresPassiveFillEvidence: true},
      executionOwner: "CENTRAL_SHARED_ORCHESTRATOR", compilationState: "COMPILED_SHADOW", promotionState: "BLOCKED",
      generatedAt: now, expiresAt: now + 5_000, legs: [
        {id: "maker", sequence: 1, exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "BUY", orderType: "LIMIT_POST_ONLY", quantity: 2, referencePrice: 100, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
        {id: "hedge", sequence: 2, exchange: "bybit", product: "SPOT", market: "BTCUSDT", side: "SELL", orderType: "MARKET", quantity: 2, referencePrice: 101, reduceOnly: false, dependency: "PASSIVE_FILL_TRIGGER", evidenceOnly: true}],
      modeledNetValue: 0.1, modeledNetValueUnit: "PERCENT_ONLY", executionReadinessBlockers: [], sourceExecutionAuthorized: false,
      capitalReservationAllowed: false, riskApprovalGranted: false, executionHandoffAllowed: false, automaticExecutionAllowed: false,
      paperExecutionAllowed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false}} as unknown as CentralPaperQueueRecord;
  assert.equal(passiveProvider.getEvidence(passiveRecord, now), null);
  trades.push({id: "trade-through-1", exchange: "binance", market: "BTCUSDT", price: 99, quantity: 1,
    occurredAt: now + 1_000, aggressorSide: "SELL", source: "BINANCE_AGG_TRADE"});
  const passiveEvidence = passiveProvider.getEvidence(passiveRecord, now + 1_000);
  assert.ok(passiveEvidence);
  assert.deepEqual(passiveEvidence.legs.map((leg) => leg.fillRatio), [0.5, 0.5]);
  assert.ok(passiveEvidence.legs[0]?.passiveFillEvidenceId?.includes("trade-through-1"));
  const passiveSimulation = new CentralMultiLegPaperSimulator().simulate(passiveRecord, passiveEvidence, now + 1_000);
  assert.equal(passiveSimulation.recoveryRequired, false);
  assert.equal(passiveSimulation.status, "SIMULATED_CYCLE_COMPLETE");
  assert.equal(passiveSimulation.cycleSettlement?.source, "SIMULATED_NEUTRAL_PASSIVE_FILL_AND_HEDGE_FLOW");
  assert.ok(passiveSimulation.realizedNetProfit !== null);
  assert.equal(passiveSimulation.exchangeOrderSubmitted, false);

  console.log("CENTRAL PAPER SIMULATION EVIDENCE PROVIDER TEST PASSED.");
  console.log("Fresh full-depth and one-tick public-trade-through evidence produced bounded market/passive PAPER fills; thin, stale and touch-only routes failed closed with no LIVE or order action.");
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
