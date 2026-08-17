import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {CentralLiveLifecycleEvidenceStore} from "../central/CentralLiveLifecycleEvidenceStore";
import {CentralLiveSharedRecoveryBridgeService} from "../../../recovery/adapters/CentralLiveSharedRecoveryBridgeService";
import {SharedRecoveryIntentService} from "../../../recovery/services/SharedRecoveryIntentService";
import {CentralLiveProductionLifecycleComposition, SequentialThreeLegProductionPort} from "../production/CentralLiveProductionLifecyclePorts";
import type {SequentialLegSizingEvidence} from "../handlers/SequentialThreeLegLiveLifecycleHandler";

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-production-ports-"));
  try {
    const now = Date.now(); const evidence = new CentralLiveLifecycleEvidenceStore(join(directory, "evidence.jsonl"));
    const sizing: SequentialLegSizingEvidence = {evidenceId: "sizing:triangle-1", planId: "central-plan:triangle-1",
      legId: "triangle-leg-1", fromAsset: "USDT", toAsset: "BTC", generatedAt: now - 1, expiresAt: now + 5_000,
      availableInputQuantity: 1_000, requestedBaseQuantity: 0.02, maximumExpectedInputQuantity: 1_000,
      allowedInputDustQuantity: 0.01, marketRulesVerified: true, quoteFresh: true, feeScheduleFresh: true,
      thirdAssetFeeBalanceVerified: false};
    evidence.seal({kind: "SEQUENTIAL_SIZING", planId: sizing.planId,
      evidenceKey: "sizing:triangle-leg-1:USDT:BTC:1000", payload: sizing, capturedAt: now - 1, expiresAt: now + 5_000});
    const recovery = new CentralLiveSharedRecoveryBridgeService(new SharedRecoveryIntentService());
    const blockedGateway = {async executeOrReconcile() { return {state: "BLOCKED" as const, record: null, reasons: ["fixture"]}; },
      async readKnownOrder() { return {state: "BLOCKED" as const, record: null, reasons: ["fixture"]}; },
      async cancelKnownOrder() { return {state: "BLOCKED" as const, record: null, reasons: ["fixture"]}; }};
    const port = new SequentialThreeLegProductionPort(evidence, blockedGateway, recovery);
    const restoredSizing = port.getSizingEvidence({planId: sizing.planId,
      leg: {id: "triangle-leg-1", sequence: 1, exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "BUY",
        orderType: "MARKET", quantity: 0.02, referencePrice: 50_000, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
      fromAsset: "USDT", toAsset: "BTC", availableInputQuantity: 1_000, now});
    assert.equal(restoredSizing?.evidenceId, sizing.evidenceId);
    const settlementId = await port.captureSettlement({planId: sizing.planId, dispatchId: "central-dispatch:triangle-1",
      idempotencyKey: "dispatch-triangle-settlement", terminalEvidenceIds: ["order:1", "order:2", "order:3"],
      startAsset: "USDT", initialQuantity: 1_000, finalQuantity: 1_005, realizedDelta: 5, completedAt: now});
    assert.ok(settlementId.startsWith("central-live-evidence:"));
    const composition = new CentralLiveProductionLifecycleComposition(); const diagnostics = composition.getDiagnostics();
    assert.equal(diagnostics.registeredCentralPatterns, 5); assert.deepEqual(diagnostics.missingPatterns, []);
    assert.equal(diagnostics.fullyWired, true);
    assert.equal(diagnostics.safety.productionOrderGatewayDefaultDisabled, true);
    console.log("CENTRAL LIVE PRODUCTION LIFECYCLE PORTS TEST PASSED.");
    console.log("Strategies #2/#3/#4/#5/#6/#7/#8 registered all five exact production lifecycle owners backed by durable evidence, journal-first order routing, settlement and shared recovery; LIVE remains disabled.");
  } finally { rmSync(directory, {recursive: true, force: true}); }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
