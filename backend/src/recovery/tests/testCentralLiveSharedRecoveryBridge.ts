import assert from "node:assert/strict";
import {CentralLiveSharedRecoveryBridgeService} from "../adapters/CentralLiveSharedRecoveryBridgeService";
import {SharedRecoveryIntentService} from "../services/SharedRecoveryIntentService";

const now = 1_780_900_000_000;

function main(): void {
  const recovery = new SharedRecoveryIntentService({maximumIntentTtlMs: 60_000, maximumQuoteValue: 10_000, maximumIntents: 10});
  const bridge = new CentralLiveSharedRecoveryBridgeService(recovery);
  const input = {planId: "central-plan:funding-1", dispatchId: "central-dispatch:funding-1",
    strategyId: "funding-rate-arbitrage" as const, sourceEvidenceId: "order:partial-exit-1", exchange: "bybit",
    product: "PERPETUAL" as const, market: "BTCUSDT", asset: "BTC", quoteAsset: "USDT",
    residualDirection: "SHORT" as const, side: "BUY" as const, quantity: 0.006, referencePrice: 50_000,
    capturedAt: now - 1, expiresAt: now + 30_000, reason: "EXIT_RESIDUAL"};
  const first = bridge.stage(input, now); const duplicate = bridge.stage(input, now);
  assert.equal(first, duplicate);
  const report = recovery.getReport(now);
  assert.equal(report.intents.length, 1); assert.equal(report.intents[0]?.mode, "LIVE");
  assert.equal(report.intents[0]?.liveExecutionAllowed, false); assert.equal(report.intents[0]?.orderSubmissionAllowed, false);
  assert.equal(bridge.getDiagnostics(now).safety.automaticRecoveryExecutionAllowed, false);
  console.log("CENTRAL LIVE SHARED RECOVERY BRIDGE TEST PASSED.");
  console.log("Actual LIVE residual lineage staged idempotently into the one immutable shared recovery registry while automatic recovery execution and order submission remained unavailable.");
}

main();
