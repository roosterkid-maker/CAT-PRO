import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {CentralStrategyExecutionPlan} from "../../../strategies/models/CentralStrategyExecutionPlan";
import {CentralLiveExecutionAdmissionJournalService} from "../central/CentralLiveExecutionAdmissionJournalService";
import type {CentralLiveAdmissionEvidence} from "../central/CentralLiveExecutionAdmissionService";
import {CentralLiveExecutionOutcomeJournalService} from "../central/CentralLiveExecutionOutcomeJournalService";
import {CentralLiveExecutionQueueService} from "../central/CentralLiveExecutionQueueService";
import {CentralLiveExecutionSystem} from "../central/CentralLiveExecutionSystem";
import {CentralLiveProductionLifecycleComposition} from "../production/CentralLiveProductionLifecyclePorts";

const now = 1_780_700_000_000;

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-live-system-"));
  try {
    const disabled = system(directory, "disabled", false);
    const blocked = disabled.intake(plan(), evidence(), now);
    assert.equal(blocked.state, "BLOCKED"); assert.equal(blocked.admission.handoffEligible, false);
    assert.ok(blocked.admission.blockers.includes("CENTRAL_LIVE_COMPILE_TIME_GATE_DISABLED"));
    assert.equal(disabled.getDiagnostics(now).queue.records, 0);
    assert.equal((await disabled.runOnce(now)).state, "DISABLED");

    const explicitlyGateEnabledButDispatcherDisabled = system(directory, "eligible", true);
    const queued = explicitlyGateEnabledButDispatcherDisabled.intake(plan(), evidence(), now);
    assert.equal(queued.state, "QUEUED"); assert.equal(queued.admission.handoffEligible, true);
    assert.equal(queued.executionStarted, false); assert.equal(queued.orderSubmissionPerformed, false);
    const duplicate = explicitlyGateEnabledButDispatcherDisabled.intake(plan(), evidence(), now);
    assert.equal(duplicate.state, "DUPLICATE");
    assert.equal((await explicitlyGateEnabledButDispatcherDisabled.runOnce(now + 1)).state, "DISABLED");
    const diagnostics = explicitlyGateEnabledButDispatcherDisabled.getDiagnostics(now + 1);
    assert.equal(diagnostics.fullyWired, true); assert.equal(diagnostics.production.registeredCentralPatterns, 5);
    assert.equal(diagnostics.queue.states.queued, 1); assert.equal(diagnostics.queue.safety.executionStarted, false);
    assert.equal(diagnostics.safety.productionOrderGatewayDefaultDisabled, true);
    assert.equal(diagnostics.safety.liveExecutionAllowed, false); assert.equal(diagnostics.safety.orderSubmissionAllowed, false);
    console.log("CENTRAL LIVE EXECUTION SYSTEM COMPOSITION TEST PASSED.");
    console.log("One admission-journal-queue-dispatcher composition owns all five central patterns; default gates block queue/dispatch, explicit admission can journal and queue deterministically, dispatcher/order gateway remain disabled, and no handler or exchange order ran.");
  } finally { rmSync(directory, {recursive: true, force: true}); }
}

function system(directory: string, name: string, compileTimeGateEnabled: boolean): CentralLiveExecutionSystem {
  return new CentralLiveExecutionSystem({compileTimeGateEnabled, dispatcherEnabled: false}, {
    admissionJournal: new CentralLiveExecutionAdmissionJournalService(join(directory, `${name}-admission.jsonl`)),
    queue: new CentralLiveExecutionQueueService(join(directory, `${name}-queue.jsonl`)),
    outcomeJournal: new CentralLiveExecutionOutcomeJournalService(join(directory, `${name}-outcome.jsonl`)),
    production: new CentralLiveProductionLifecycleComposition(),
  });
}

function plan(): CentralStrategyExecutionPlan {
  return {version: "35.0", id: "central-plan:system-maker", strategyId: "cross-exchange-market-making",
    signalId: "signal:system-maker", signalKind: "XEMM_SAFE_MAKER_PRICE", routeFamily: "SPOT_TWO_VENUE",
    pattern: "PASSIVE_MAKER_THEN_HEDGE", settlementPolicy: {kind: "PASSIVE_FILL_THEN_HEDGE_CYCLE",
      lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR", requiresPassiveFillEvidence: true},
    executionOwner: "CENTRAL_SHARED_ORCHESTRATOR", compilationState: "COMPILED_SHADOW", promotionState: "BLOCKED",
    generatedAt: now - 1_000, expiresAt: now + 30_000, legs: [
      {id: "maker", sequence: 1, exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "BUY",
        orderType: "LIMIT_POST_ONLY", quantity: 0.1, referencePrice: 99, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
      {id: "hedge", sequence: 2, exchange: "bybit", product: "SPOT", market: "BTCUSDT", side: "SELL",
        orderType: "MARKET", quantity: 0.1, referencePrice: 100, reduceOnly: false, dependency: "PASSIVE_FILL_TRIGGER", evidenceOnly: true}],
    modeledNetValue: 0.1, modeledNetValueUnit: "PERCENT_ONLY", executionReadinessBlockers: ["MAKER_FILL_EVIDENCE_REQUIRED", "HEDGE_BALANCE_EVIDENCE_REQUIRED"],
    sourceExecutionAuthorized: false, capitalReservationAllowed: false, riskApprovalGranted: false,
    executionHandoffAllowed: false, automaticExecutionAllowed: false, paperExecutionAllowed: false,
    liveExecutionAllowed: false, orderSubmissionAllowed: false};
}
function evidence(): CentralLiveAdmissionEvidence {
  return {planId: plan().id, generatedAt: now - 100, expiresAt: now + 5_000,
    paperSoak: {strategyId: "cross-exchange-market-making", state: "SOAK_ACCEPTED", closedCycles: 20, consecutivePasses: 20},
    capital: {assessmentId: "capital:system-maker", planId: plan().id, requestedInr: 1_000, approved: true,
      reservationMutationPerformed: false}, risk: {assessmentId: "risk:system-maker", planId: plan().id,
      approved: true, level: "LOW", score: 90}, legs: plan().legs.map((leg) => ({legId: leg.id, adapterRegistered: true,
      authenticatedReadFresh: true, productSupported: true, orderTypeSupported: true, marketRulesFresh: true,
      feeEvidenceFresh: true, quoteFresh: true})), controls: {planId: plan().id,
      lifecyclePattern: "PASSIVE_MAKER_THEN_HEDGE", lifecycleHandlerId: "central-passive-maker-hedge-v80",
      lifecycleHandlerRegistered: true, admissionJournalAvailable: true, sharedRecoveryAvailable: true,
      settlementAvailable: true, reconciliationAvailable: true}, actionAuthority: {operatorActionId: "operator:system-maker",
      planId: plan().id, confirmation: "CONFIRM_CENTRAL_STRATEGY_LIVE_ACTION", confirmedAt: now - 10,
      expiresAt: now + 5_000}};
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
