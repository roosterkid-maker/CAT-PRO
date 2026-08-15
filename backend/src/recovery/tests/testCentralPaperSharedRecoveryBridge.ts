import assert from "node:assert/strict";
import {SharedRecoveryIntentService} from "../services/SharedRecoveryIntentService";
import {CentralPaperSharedRecoveryBridgeService} from "../adapters/CentralPaperSharedRecoveryBridgeService";
import type {CentralPaperQueueRecord} from "../../strategies/services/CentralPaperExecutionQueueService";
import type {CentralMultiLegPaperSimulationResult} from "../../strategies/services/CentralMultiLegPaperSimulator";

const now = 1_780_000_000_000;
const record = {id: "queue-1", leaseId: "lease-1", plan: {id: "plan-1", routeFamily: "SPOT_TWO_VENUE", expiresAt: now + 30_000}} as CentralPaperQueueRecord;
const simulation = {id: "simulation-1", planId: "plan-1", strategyId: "cross-exchange-market-making", queueRecordId: "queue-1", leaseId: "lease-1",
  generatedAt: now - 10, recoveryRequired: true, economicExposure: [{product: "SPOT", market: "BTCUSDT", signedQuantity: 0.01}],
  legs: [{legId: "leg-1", sequence: 1, exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "BUY", status: "PARTIALLY_FILLED",
    requestedQuantity: 0.02, filledQuantity: 0.01, referencePrice: 50_000, averageFillPrice: 50_010, filledNotional: 500.1,
    feePercent: 0.1, feeQuote: 0.5001, feeEvidenceId: "fee-1", feeEvidenceSource: "ACCOUNT_API", signedPositionDelta: 0.01,
    simulated: true, exchangeOrderId: null}]} as unknown as CentralMultiLegPaperSimulationResult;

async function main(): Promise<void> {
  const shared = new SharedRecoveryIntentService({maximumIntentTtlMs: 60_000, maximumQuoteValue: 10_000, maximumIntents: 10});
  const bridge = new CentralPaperSharedRecoveryBridgeService(shared);
  const staged = bridge.synchronize(record, simulation, now);
  assert.equal(staged.staged, 1);
  assert.equal(staged.rejected, 0);
  assert.equal(staged.intents[0]?.mode, "PAPER");
  assert.equal(staged.intents[0]?.leg.side, "SELL");
  assert.equal(staged.intents[0]?.paperExecutionAllowed, false);
  const duplicate = bridge.synchronize(record, simulation, now + 1);
  assert.equal(duplicate.intents[0]?.id, staged.intents[0]?.id);
  assert.equal(shared.getReport(now + 2).summary.total, 1);

  const balanced = bridge.synchronize(record, {...simulation, id: "simulation-2", recoveryRequired: false, economicExposure: []}, now + 2);
  assert.equal(balanced.required, false);
  assert.equal(balanced.staged, 0);
  assert.equal(balanced.paperRecoveryExecuted, false);
  assert.throws(() => bridge.synchronize({...record, leaseId: "other"}, simulation, now), /exact queue/);

  console.log("CENTRAL PAPER SHARED RECOVERY BRIDGE TEST PASSED.");
  console.log("PAPER residual exposure was normalized idempotently into the one shared non-executable recovery contract; no capital, recovery execution, LIVE or order action occurred.");
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
