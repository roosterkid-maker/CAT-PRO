import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {CentralStrategyExecutionPlan} from "../../../strategies/models/CentralStrategyExecutionPlan";
import {
  CENTRAL_LIVE_ACTION_CONFIRMATION,
  CentralLiveExecutionAdmissionService,
  type CentralLiveAdmissionEvidence,
} from "../central/CentralLiveExecutionAdmissionService";
import {CentralLiveExecutionAdmissionJournalService} from "../central/CentralLiveExecutionAdmissionJournalService";
import {CentralLiveExecutionQueueService} from "../central/CentralLiveExecutionQueueService";
import {CentralLiveExecutionOutcomeJournalService} from "../central/CentralLiveExecutionOutcomeJournalService";
import {CentralLiveLifecycleHandlerRegistry} from "../central/CentralLiveLifecycleHandlerRegistry";
import {CentralLiveExecutionDispatcherService} from "../central/CentralLiveExecutionDispatcherService";

const now = 1_780_300_000_000;

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-central-live-"));
  try {
    const plan = createPlan();
    const defaultAdmission = new CentralLiveExecutionAdmissionService().evaluate(plan, createEvidence(), now);
    assert.equal(defaultAdmission.state, "BLOCKED");
    assert.ok(defaultAdmission.blockers.includes("CENTRAL_LIVE_COMPILE_TIME_GATE_DISABLED"));

    const admissionService = new CentralLiveExecutionAdmissionService({
      compileTimeGateEnabled: true,
      allowedStrategies: ["cross-exchange-market-making"],
      registeredPatterns: ["PASSIVE_MAKER_THEN_HEDGE"],
      maximumCapitalPerPlanInr: 1_000,
    });
    const admission = admissionService.evaluate(plan, createEvidence(), now);
    assert.equal(admission.state, "ELIGIBLE_FOR_CENTRAL_LIVE_QUEUE");
    assert.equal(admission.handoffEligible, true);
    assert.equal(admission.executionStarted, false);
    assert.equal(admission.orderSubmissionPerformed, false);

    const triangularPlan = createTriangularPlan();
    const triangularEvidence = createTriangularEvidence();
    const triangularAdmissionService = new CentralLiveExecutionAdmissionService({
      compileTimeGateEnabled: true,
      allowedStrategies: ["triangular-arbitrage"],
      registeredPatterns: ["SEQUENTIAL_THREE_LEG"],
      maximumCapitalPerPlanInr: 1_000,
    });
    const triangularAdmission = triangularAdmissionService.evaluate(triangularPlan, triangularEvidence, now);
    assert.equal(triangularAdmission.state, "ELIGIBLE_FOR_CENTRAL_LIVE_QUEUE");
    assert.equal(triangularAdmission.blockers.includes("PLAN:SEQUENTIAL_LEG_FAILURE_RECOVERY_REQUIRED"), false);
    const unknownBlockerAdmission = triangularAdmissionService.evaluate({
      ...triangularPlan,
      executionReadinessBlockers: [...triangularPlan.executionReadinessBlockers, "UNKNOWN_LIVE_REQUIREMENT"],
    }, triangularEvidence, now);
    assert.equal(unknownBlockerAdmission.state, "BLOCKED");
    assert.ok(unknownBlockerAdmission.blockers.includes("PLAN:UNKNOWN_LIVE_REQUIREMENT"));

    const twoSidedPlan = createTwoSidedPlan();
    const twoSidedEvidence = createTwoSidedEvidence();
    const twoSidedAdmission = new CentralLiveExecutionAdmissionService({compileTimeGateEnabled: true,
      allowedStrategies: ["dynamic-market-making"], registeredPatterns: ["TWO_SIDED_PASSIVE_MAKER"],
      maximumCapitalPerPlanInr: 1_000}).evaluate(twoSidedPlan, twoSidedEvidence, now);
    assert.equal(twoSidedAdmission.state, "ELIGIBLE_FOR_CENTRAL_LIVE_QUEUE");
    assert.equal(twoSidedAdmission.blockers.includes("PLAN:QUEUE_POSITION_UNKNOWN"), false);
    assert.equal(twoSidedAdmission.blockers.includes("PLAN:POST_ONLY_EXECUTION_UNVERIFIED"), false);

    const derivativePlan = createDerivativePlan();
    const derivativeService = new CentralLiveExecutionAdmissionService({compileTimeGateEnabled: true,
      allowedStrategies: ["funding-rate-arbitrage"], registeredPatterns: ["PARALLEL_TWO_LEG"],
      maximumCapitalPerPlanInr: 1_000});
    const derivativeEvidence = createDerivativeEvidence();
    const derivativeAdmission = derivativeService.evaluate(derivativePlan, derivativeEvidence, now);
    assert.equal(derivativeAdmission.state, "ELIGIBLE_FOR_CENTRAL_LIVE_QUEUE");
    for (const blocker of derivativePlan.executionReadinessBlockers) {
      assert.equal(derivativeAdmission.blockers.includes(`PLAN:${blocker}`), false);
    }
    const unsafeDerivativeEvidence = {...derivativeEvidence, legs: derivativeEvidence.legs.map((leg, index) =>
      index === 0 ? {...leg, reduceOnlyExitVerified: false} : leg)};
    const unsafeDerivativeAdmission = derivativeService.evaluate(derivativePlan, unsafeDerivativeEvidence, now);
    assert.equal(unsafeDerivativeAdmission.state, "BLOCKED");
    assert.ok(unsafeDerivativeAdmission.blockers.includes("ONE_OR_MORE_LIVE_LEGS_NOT_READY"));
    assert.ok(unsafeDerivativeAdmission.blockers.includes("PLAN:REDUCE_ONLY_UNVERIFIED"));

    const journalPath = join(directory, "admissions.jsonl");
    const queuePath = join(directory, "queue.jsonl");
    const journal = new CentralLiveExecutionAdmissionJournalService(journalPath);
    const captured = journal.capture(plan, admission, now);
    assert.equal(journal.capture(plan, admission, now).id, captured.id);

    const queue = new CentralLiveExecutionQueueService(queuePath);
    const enqueued = queue.enqueue(plan, captured, now);
    assert.equal(enqueued.queued, true);
    assert.equal(queue.enqueue(plan, captured, now).duplicate, true);
    const leased = queue.leaseNext("central-live-worker-test", now, 1_000);
    assert.ok(leased?.leaseId);

    const restoredJournal = new CentralLiveExecutionAdmissionJournalService(journalPath);
    assert.equal(restoredJournal.get(captured.id)?.planHash, captured.planHash);
    const restoredQueue = new CentralLiveExecutionQueueService(queuePath);
    const reLeased = restoredQueue.leaseNext("central-live-worker-restart", now + 2_000, 1_000);
    assert.equal(reLeased?.attempts, 2);
    const terminal = restoredQueue.acknowledge(reLeased!.id, reLeased!.leaseId!, "COMPLETED", "terminal-journal:fixture", now + 2_500);
    assert.equal(terminal.state, "COMPLETED");

    const finalRestore = new CentralLiveExecutionQueueService(queuePath);
    assert.equal(finalRestore.getByPlanId(plan.id, now + 3_000)?.state, "COMPLETED");

    const alteredPlan = {...plan, modeledNetValue: 999};
    const separateQueue = new CentralLiveExecutionQueueService(join(directory, "tamper-queue.jsonl"));
    assert.throws(() => separateQueue.enqueue(alteredPlan, captured, now), /exact eligible journaled admission and plan hash/u);

    const staleEvidence = {...createEvidence(), actionAuthority: {...createEvidence().actionAuthority, expiresAt: now - 1}};
    const staleAdmission = admissionService.evaluate(plan, staleEvidence, now);
    assert.equal(staleAdmission.state, "BLOCKED");
    assert.ok(staleAdmission.blockers.includes("FRESH_ACTION_TIME_OPERATOR_CONFIRMATION_REQUIRED"));
    const blockedJournal = journal.capture(plan, staleAdmission, now + 1);
    assert.throws(() => separateQueue.enqueue(plan, blockedJournal, now + 1), /exact eligible journaled admission/u);

    const dispatcherQueuePath = join(directory, "dispatcher-queue.jsonl");
    const outcomePath = join(directory, "outcomes.jsonl");
    const dispatcherQueue = new CentralLiveExecutionQueueService(dispatcherQueuePath);
    dispatcherQueue.enqueue(plan, captured, now);
    const registry = new CentralLiveLifecycleHandlerRegistry();
    const idempotencyKeys: string[] = [];
    let resumes = 0;
    registry.register({
      id: "central-passive-maker-hedge-v80",
      pattern: "PASSIVE_MAKER_THEN_HEDGE",
      async resume(input) {
        resumes += 1;
        idempotencyKeys.push(input.idempotencyKey);
        if (resumes === 1) throw new Error("Simulated process crash after durable dispatch start.");
        return {planId: input.queueRecord.plan.id, handlerId: "central-passive-maker-hedge-v80", state: "COMPLETED",
          terminalEvidenceIds: ["fixture-order-reconciliation"], recoveryIntentIds: [], orderSubmissionPerformed: true,
          completedAt: now + 1_000, reasons: ["Fixture handler reconciled the same idempotent dispatch."]};
      },
    });
    assert.throws(() => registry.register({id: "duplicate-maker", pattern: "PASSIVE_MAKER_THEN_HEDGE", async resume() {
      throw new Error("Duplicate handler must never run.");
    }}), /pattern already has an owner/u);

    const disabledDispatcher = new CentralLiveExecutionDispatcherService({enabled: false}, dispatcherQueue,
      new CentralLiveExecutionOutcomeJournalService(outcomePath), registry);
    assert.equal((await disabledDispatcher.runOnce(now)).state, "DISABLED");
    assert.equal(resumes, 0);

    const dispatcher = new CentralLiveExecutionDispatcherService({enabled: true}, dispatcherQueue,
      new CentralLiveExecutionOutcomeJournalService(outcomePath), registry);
    const interrupted = await dispatcher.runOnce(now);
    assert.equal(interrupted.state, "RECONCILIATION_REQUIRED");
    assert.equal(dispatcherQueue.getByPlanId(plan.id, now)?.state, "DISPATCHING");
    assert.equal(new CentralLiveExecutionOutcomeJournalService(outcomePath).getPending().length, 1);

    const restoredDispatcher = new CentralLiveExecutionDispatcherService({enabled: true},
      new CentralLiveExecutionQueueService(dispatcherQueuePath), new CentralLiveExecutionOutcomeJournalService(outcomePath), registry);
    const reconciled = await restoredDispatcher.runOnce(now + 1_000);
    assert.equal(reconciled.state, "COMPLETED");
    assert.equal(reconciled.orderSubmissionPerformed, true);
    assert.equal(resumes, 2);
    assert.equal(idempotencyKeys[0], idempotencyKeys[1]);
    const reconciledQueue = new CentralLiveExecutionQueueService(dispatcherQueuePath).getByPlanId(plan.id, now + 1_001);
    assert.equal(reconciledQueue?.state, "COMPLETED");
    assert.equal(reconciledQueue?.orderSubmissionPerformed, true);
    assert.equal(new CentralLiveExecutionOutcomeJournalService(outcomePath).getPending().length, 0);

    const monitoringPlan = {...plan, id: "central-plan:monitor-maker", signalId: "signal:monitor-maker"};
    const baseEvidence = createEvidence();
    const monitoringEvidence: CentralLiveAdmissionEvidence = {...baseEvidence, planId: monitoringPlan.id,
      capital: {...baseEvidence.capital, planId: monitoringPlan.id, assessmentId: "capital-monitor-maker"},
      risk: {...baseEvidence.risk, planId: monitoringPlan.id, assessmentId: "risk-monitor-maker"},
      controls: {...baseEvidence.controls, planId: monitoringPlan.id},
      actionAuthority: {...baseEvidence.actionAuthority, planId: monitoringPlan.id, operatorActionId: "operator-monitor-maker"}};
    const monitoringAdmission = admissionService.evaluate(monitoringPlan, monitoringEvidence, now);
    const monitoringAdmissionJournal = new CentralLiveExecutionAdmissionJournalService(join(directory, "monitor-admissions.jsonl"));
    const monitoringCaptured = monitoringAdmissionJournal.capture(monitoringPlan, monitoringAdmission, now);
    const monitoringQueuePath = join(directory, "monitor-queue.jsonl");
    const monitoringOutcomePath = join(directory, "monitor-outcomes.jsonl");
    const monitoringQueue = new CentralLiveExecutionQueueService(monitoringQueuePath);
    monitoringQueue.enqueue(monitoringPlan, monitoringCaptured, now);
    let monitoringResumes = 0;
    const monitoringRegistry = new CentralLiveLifecycleHandlerRegistry();
    monitoringRegistry.register({id: "central-passive-maker-hedge-v80", pattern: "PASSIVE_MAKER_THEN_HEDGE", async resume(input) {
      monitoringResumes += 1;
      return monitoringResumes === 1
        ? {planId: input.queueRecord.plan.id, handlerId: "central-passive-maker-hedge-v80", state: "MONITORING" as const,
          evidenceIds: ["open-position:fixture", "exit-policy:hold"], orderSubmissionPerformed: true,
          observedAt: now + 100, reasons: ["Fixture position remains open under policy monitoring."]}
        : {planId: input.queueRecord.plan.id, handlerId: "central-passive-maker-hedge-v80", state: "COMPLETED" as const,
          terminalEvidenceIds: ["settlement:fixture"], recoveryIntentIds: [], orderSubmissionPerformed: true,
          completedAt: now + 1_000, reasons: ["Fixture position settled."]};
    }});
    const monitoringDispatcher = new CentralLiveExecutionDispatcherService({enabled: true}, monitoringQueue,
      new CentralLiveExecutionOutcomeJournalService(monitoringOutcomePath), monitoringRegistry);
    const monitoringRun = await monitoringDispatcher.runOnce(now);
    assert.equal(monitoringRun.state, "MONITORING");
    const persistedMonitoringQueue = new CentralLiveExecutionQueueService(monitoringQueuePath).getByPlanId(monitoringPlan.id, now + 101);
    assert.equal(persistedMonitoringQueue?.state, "DISPATCHING");
    assert.equal(persistedMonitoringQueue?.dispatchStartedAt, now);
    assert.equal(persistedMonitoringQueue?.updatedAt, now + 100);
    const pendingMonitoring = new CentralLiveExecutionOutcomeJournalService(monitoringOutcomePath).getPending();
    assert.equal(pendingMonitoring[0]?.progress?.state, "MONITORING");
    assert.equal(pendingMonitoring[0]?.progress?.orderSubmissionPerformed, true);
    const completedMonitoringRun = await new CentralLiveExecutionDispatcherService({enabled: true},
      new CentralLiveExecutionQueueService(monitoringQueuePath),
      new CentralLiveExecutionOutcomeJournalService(monitoringOutcomePath), monitoringRegistry).runOnce(now + 1_000);
    assert.equal(completedMonitoringRun.state, "COMPLETED");
    assert.equal(monitoringResumes, 2);

    console.log("CENTRAL LIVE ADMISSION + DURABLE DISPATCH TEST PASSED.");
    console.log("Admission lineage, derivative fail-closed gates, journal-before-queue, plan-hash tamper rejection, duplicate suppression, immutable dispatch time, durable monitoring, stable idempotency and crash/restart resume passed using fixtures; no external order occurred.");
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
}

function createEvidence(): CentralLiveAdmissionEvidence {
  return {
    planId: "central-plan:live-maker-1",
    generatedAt: now - 500,
    expiresAt: now + 10_000,
    paperSoak: {strategyId: "cross-exchange-market-making", state: "SOAK_ACCEPTED", closedCycles: 20, consecutivePasses: 20},
    capital: {assessmentId: "capital-assessment-1", planId: "central-plan:live-maker-1", requestedInr: 100, approved: true, reservationMutationPerformed: false},
    risk: {assessmentId: "risk-assessment-1", planId: "central-plan:live-maker-1", approved: true, level: "LOW", score: 90},
    legs: ["maker-leg", "hedge-leg"].map((legId) => ({legId, adapterRegistered: true, authenticatedReadFresh: true,
      productSupported: true, orderTypeSupported: true, marketRulesFresh: true, feeEvidenceFresh: true, quoteFresh: true})),
    controls: {planId: "central-plan:live-maker-1", lifecyclePattern: "PASSIVE_MAKER_THEN_HEDGE", lifecycleHandlerId: "central-passive-maker-hedge-v80",
      lifecycleHandlerRegistered: true, admissionJournalAvailable: true, sharedRecoveryAvailable: true, settlementAvailable: true, reconciliationAvailable: true},
    actionAuthority: {operatorActionId: "operator-action-1", planId: "central-plan:live-maker-1", confirmation: CENTRAL_LIVE_ACTION_CONFIRMATION,
      confirmedAt: now - 100, expiresAt: now + 30_000},
  };
}

function createPlan(): CentralStrategyExecutionPlan {
  return {
    version: "35.0", id: "central-plan:live-maker-1", strategyId: "cross-exchange-market-making", signalId: "signal:live-maker-1",
    signalKind: "XEMM_SAFE_MAKER_PRICE", routeFamily: "SPOT_MARKET_MAKING", pattern: "PASSIVE_MAKER_THEN_HEDGE",
    settlementPolicy: {kind: "PASSIVE_FILL_THEN_HEDGE_CYCLE", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR", requiresPassiveFillEvidence: true},
    executionOwner: "CENTRAL_SHARED_ORCHESTRATOR", compilationState: "COMPILED_SHADOW", promotionState: "BLOCKED",
    generatedAt: now - 1_000, expiresAt: now + 60_000,
    legs: [
      {id: "maker-leg", sequence: 1, exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "BUY", orderType: "LIMIT_POST_ONLY", quantity: 1,
        referencePrice: 100, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
      {id: "hedge-leg", sequence: 2, exchange: "bybit", product: "SPOT", market: "BTCUSDT", side: "SELL", orderType: "MARKET", quantity: 1,
        referencePrice: 100.5, reduceOnly: false, dependency: "PASSIVE_FILL_TRIGGER", evidenceOnly: true},
    ],
    modeledNetValue: 0.5, modeledNetValueUnit: "QUOTE", executionReadinessBlockers: [], sourceExecutionAuthorized: false,
    capitalReservationAllowed: false, riskApprovalGranted: false, executionHandoffAllowed: false, automaticExecutionAllowed: false,
    paperExecutionAllowed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false,
  };
}

function createTriangularPlan(): CentralStrategyExecutionPlan {
  return {
    version: "35.0", id: "central-plan:live-triangle-1", strategyId: "triangular-arbitrage", signalId: "signal:live-triangle-1",
    signalKind: "TRIANGULAR_ARBITRAGE_SHADOW_PATH", routeFamily: "SPOT_TRIANGULAR", pattern: "SEQUENTIAL_THREE_LEG",
    settlementPolicy: {kind: "IMMEDIATE_CONVERSION_CYCLE", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR", startAsset: "USDT",
      initialQuantity: 100, modeledFinalQuantity: 100.5, flows: [
        {legId: "triangle-leg-1", fromAsset: "USDT", toAsset: "BTC"},
        {legId: "triangle-leg-2", fromAsset: "BTC", toAsset: "ETH"},
        {legId: "triangle-leg-3", fromAsset: "ETH", toAsset: "USDT"},
      ]},
    executionOwner: "CENTRAL_SHARED_ORCHESTRATOR", compilationState: "COMPILED_SHADOW", promotionState: "BLOCKED",
    generatedAt: now - 1_000, expiresAt: now + 60_000,
    legs: [
      {id: "triangle-leg-1", sequence: 1, exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "BUY", orderType: "MARKET",
        quantity: 0.002, referencePrice: 50_000, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
      {id: "triangle-leg-2", sequence: 2, exchange: "binance", product: "SPOT", market: "BTCETH", side: "SELL", orderType: "MARKET",
        quantity: 0.002, referencePrice: 15, reduceOnly: false, dependency: "AFTER_PREVIOUS", evidenceOnly: true},
      {id: "triangle-leg-3", sequence: 3, exchange: "binance", product: "SPOT", market: "ETHUSDT", side: "SELL", orderType: "MARKET",
        quantity: 0.03, referencePrice: 3_350, reduceOnly: false, dependency: "AFTER_PREVIOUS", evidenceOnly: true},
    ],
    modeledNetValue: 0.5, modeledNetValueUnit: "START_ASSET", executionReadinessBlockers: ["SEQUENTIAL_LEG_FAILURE_RECOVERY_REQUIRED"],
    sourceExecutionAuthorized: false, capitalReservationAllowed: false, riskApprovalGranted: false, executionHandoffAllowed: false,
    automaticExecutionAllowed: false, paperExecutionAllowed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false,
  };
}

function createTriangularEvidence(): CentralLiveAdmissionEvidence {
  return {
    planId: "central-plan:live-triangle-1", generatedAt: now - 500, expiresAt: now + 10_000,
    paperSoak: {strategyId: "triangular-arbitrage", state: "SOAK_ACCEPTED", closedCycles: 20, consecutivePasses: 20},
    capital: {assessmentId: "capital-triangle-1", planId: "central-plan:live-triangle-1", requestedInr: 100, approved: true,
      reservationMutationPerformed: false},
    risk: {assessmentId: "risk-triangle-1", planId: "central-plan:live-triangle-1", approved: true, level: "LOW", score: 90},
    legs: ["triangle-leg-1", "triangle-leg-2", "triangle-leg-3"].map((legId) => ({legId, adapterRegistered: true,
      authenticatedReadFresh: true, productSupported: true, orderTypeSupported: true, marketRulesFresh: true,
      feeEvidenceFresh: true, quoteFresh: true})),
    controls: {planId: "central-plan:live-triangle-1", lifecyclePattern: "SEQUENTIAL_THREE_LEG",
      lifecycleHandlerId: "central-sequential-three-leg-v71", lifecycleHandlerRegistered: true, admissionJournalAvailable: true,
      sharedRecoveryAvailable: true, settlementAvailable: true, reconciliationAvailable: true},
    actionAuthority: {operatorActionId: "operator-triangle-1", planId: "central-plan:live-triangle-1",
      confirmation: CENTRAL_LIVE_ACTION_CONFIRMATION, confirmedAt: now - 100, expiresAt: now + 30_000},
  };
}

function createTwoSidedPlan(): CentralStrategyExecutionPlan {
  return {version: "35.0", id: "central-plan:live-dynamic-mm-1", strategyId: "dynamic-market-making",
    signalId: "signal:live-dynamic-mm-1", signalKind: "DYNAMIC_MARKET_MAKING_SHADOW_QUOTE_PLAN",
    routeFamily: "SPOT_MARKET_MAKING", pattern: "TWO_SIDED_PASSIVE_MAKER",
    settlementPolicy: {kind: "TWO_SIDED_PASSIVE_FILL_CYCLE", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR",
      requiresEveryPassiveFillEvidence: true}, executionOwner: "CENTRAL_SHARED_ORCHESTRATOR",
    compilationState: "COMPILED_SHADOW", promotionState: "BLOCKED", generatedAt: now - 1_000, expiresAt: now + 60_000,
    legs: [
      {id: "dynamic-bid", sequence: 1, exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "BUY",
        orderType: "LIMIT_POST_ONLY", quantity: 0.1, referencePrice: 99, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
      {id: "dynamic-ask", sequence: 2, exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "SELL",
        orderType: "LIMIT_POST_ONLY", quantity: 0.1, referencePrice: 101, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
    ], modeledNetValue: 0.2, modeledNetValueUnit: "PERCENT_ONLY",
    executionReadinessBlockers: ["QUEUE_POSITION_UNKNOWN", "POST_ONLY_EXECUTION_UNVERIFIED"],
    sourceExecutionAuthorized: false, capitalReservationAllowed: false, riskApprovalGranted: false,
    executionHandoffAllowed: false, automaticExecutionAllowed: false, paperExecutionAllowed: false,
    liveExecutionAllowed: false, orderSubmissionAllowed: false};
}

function createTwoSidedEvidence(): CentralLiveAdmissionEvidence {
  return {planId: "central-plan:live-dynamic-mm-1", generatedAt: now - 500, expiresAt: now + 10_000,
    paperSoak: {strategyId: "dynamic-market-making", state: "SOAK_ACCEPTED", closedCycles: 20, consecutivePasses: 20},
    capital: {assessmentId: "capital-dynamic-mm-1", planId: "central-plan:live-dynamic-mm-1", requestedInr: 100,
      approved: true, reservationMutationPerformed: false},
    risk: {assessmentId: "risk-dynamic-mm-1", planId: "central-plan:live-dynamic-mm-1", approved: true, level: "LOW", score: 90},
    legs: ["dynamic-bid", "dynamic-ask"].map((legId) => ({legId, adapterRegistered: true, authenticatedReadFresh: true,
      productSupported: true, orderTypeSupported: true, marketRulesFresh: true, feeEvidenceFresh: true, quoteFresh: true})),
    controls: {planId: "central-plan:live-dynamic-mm-1", lifecyclePattern: "TWO_SIDED_PASSIVE_MAKER",
      lifecycleHandlerId: "central-two-sided-passive-maker-v72", lifecycleHandlerRegistered: true,
      admissionJournalAvailable: true, sharedRecoveryAvailable: true, settlementAvailable: true, reconciliationAvailable: true},
    actionAuthority: {operatorActionId: "operator-dynamic-mm-1", planId: "central-plan:live-dynamic-mm-1",
      confirmation: CENTRAL_LIVE_ACTION_CONFIRMATION, confirmedAt: now - 100, expiresAt: now + 30_000}};
}

function createDerivativePlan(): CentralStrategyExecutionPlan {
  return {version: "35.0", id: "central-plan:live-funding-1", strategyId: "funding-rate-arbitrage",
    signalId: "signal:live-funding-1", signalKind: "FUNDING_RATE_ARBITRAGE_SHADOW_OPPORTUNITY",
    routeFamily: "PERPETUAL_TWO_VENUE", pattern: "PARALLEL_TWO_LEG",
    settlementPolicy: {kind: "FUNDING_CAPTURE_THEN_EXIT", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR",
      notBefore: now - 1, fundingTimestamps: [now - 1], requiresFundingEvidence: true, forcedTimeExitAllowed: false},
    executionOwner: "CENTRAL_SHARED_ORCHESTRATOR", compilationState: "COMPILED_SHADOW", promotionState: "BLOCKED",
    generatedAt: now - 1_000, expiresAt: now + 60_000, legs: [
      {id: "funding-long", sequence: 1, exchange: "binance", product: "PERPETUAL", market: "BTCUSDT", side: "BUY",
        orderType: "MARKET", quantity: 0.01, referencePrice: 50_000, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
      {id: "funding-short", sequence: 2, exchange: "bybit", product: "PERPETUAL", market: "BTCUSDT", side: "SELL",
        orderType: "MARKET", quantity: 0.01, referencePrice: 50_100, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
    ], modeledNetValue: 0.1, modeledNetValueUnit: "PERCENT_ONLY",
    executionReadinessBlockers: ["POSITION_EVIDENCE_MISSING", "MARGIN_EVIDENCE_MISSING", "LIQUIDATION_CONTROL_MISSING",
      "REDUCE_ONLY_UNVERIFIED", "DERIVATIVE_ADAPTER_MISSING"], sourceExecutionAuthorized: false,
    capitalReservationAllowed: false, riskApprovalGranted: false, executionHandoffAllowed: false,
    automaticExecutionAllowed: false, paperExecutionAllowed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false};
}

function createDerivativeEvidence(): CentralLiveAdmissionEvidence {
  return {planId: "central-plan:live-funding-1", generatedAt: now - 500, expiresAt: now + 10_000,
    paperSoak: {strategyId: "funding-rate-arbitrage", state: "SOAK_ACCEPTED", closedCycles: 20, consecutivePasses: 20},
    capital: {assessmentId: "capital-funding-1", planId: "central-plan:live-funding-1", requestedInr: 100,
      approved: true, reservationMutationPerformed: false},
    risk: {assessmentId: "risk-funding-1", planId: "central-plan:live-funding-1", approved: true, level: "LOW", score: 90},
    legs: ["funding-long", "funding-short"].map((legId) => ({legId, adapterRegistered: true,
      authenticatedReadFresh: true, productSupported: true, orderTypeSupported: true, marketRulesFresh: true,
      feeEvidenceFresh: true, quoteFresh: true, positionEvidenceFresh: true, marginEvidenceFresh: true,
      liquidationControlReady: true, reduceOnlyExitVerified: true})),
    controls: {planId: "central-plan:live-funding-1", lifecyclePattern: "PARALLEL_TWO_LEG",
      lifecycleHandlerId: "central-parallel-derivative-v74", lifecycleHandlerRegistered: true,
      admissionJournalAvailable: true, sharedRecoveryAvailable: true, settlementAvailable: true, reconciliationAvailable: true},
    actionAuthority: {operatorActionId: "operator-funding-1", planId: "central-plan:live-funding-1",
      confirmation: CENTRAL_LIVE_ACTION_CONFIRMATION, confirmedAt: now - 100, expiresAt: now + 30_000}};
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
