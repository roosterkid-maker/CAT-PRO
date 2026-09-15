import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import type {CentralStrategyExecutionPlan} from "../../strategies/models/CentralStrategyExecutionPlan";
import {
  CENTRAL_LIVE_ACTION_CONFIRMATION,
  CentralLiveExecutionAdmissionService,
  type CentralLiveAdmissionEvidence,
} from "../../execution/live/central/CentralLiveExecutionAdmissionService";
import {CentralLiveExecutionAdmissionJournalService} from "../../execution/live/central/CentralLiveExecutionAdmissionJournalService";
import {CentralLiveExecutionQueueService} from "../../execution/live/central/CentralLiveExecutionQueueService";
import {CentralLiveExecutionOutcomeJournalService} from "../../execution/live/central/CentralLiveExecutionOutcomeJournalService";
import {CentralLiveLifecycleHandlerRegistry} from "../../execution/live/central/CentralLiveLifecycleHandlerRegistry";
import {CentralLiveExecutionDispatcherService} from "../../execution/live/central/CentralLiveExecutionDispatcherService";
import {SharedRecoveryIntentService} from "../services/SharedRecoveryIntentService";
import {SharedRecoveryResolutionService} from "../services/SharedRecoveryResolutionService";
import {SharedRecoveryHaltGateService} from "../services/SharedRecoveryHaltGateService";

const now = 1_790_000_000_000;

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-shared-recovery-"));
  try {
    // --- Resolution service: LONG residual (surplus intermediate asset,
    // e.g. leg 2 filled but leg 3 never consumed the resulting ETH). ---
    const intents = new SharedRecoveryIntentService();
    const longIntent = intents.stage(triangularResidualProposal({
      sourceEvidenceId: "triangle-leg-2:ETH",
      asset: "ETH",
      residualDirection: "LONG",
      quantity: 0.03,
      venue: "binance",
    }), now);

    const resolutions = new SharedRecoveryResolutionService(intents, join(directory, "resolutions.jsonl"));

    assert.throws(
      () => resolutions.resolveByAuthoritativeBalance(
        longIntent.id,
        balanceEvidence({exchange: "bybit", asset: "ETH", availableBalance: 1}),
        "Wrong venue must fail closed.",
        now + 10,
      ),
      /remains unresolved/u,
    );

    assert.throws(
      () => resolutions.resolveByAuthoritativeBalance(
        longIntent.id,
        balanceEvidence({exchange: "binance", asset: "ETH", availableBalance: 0.01}),
        "Insufficient remaining LONG residual must fail closed.",
        now + 10,
      ),
      /remains unresolved/u,
    );

    assert.throws(
      () => resolutions.resolveByAuthoritativeBalance(
        longIntent.id,
        balanceEvidence({exchange: "binance", asset: "ETH", availableBalance: 0.03, borrowedAmount: 0.01}),
        "Non-zero borrow must fail closed.",
        now + 10,
      ),
      /remains unresolved/u,
    );

    const longResolution = resolutions.resolveByAuthoritativeBalance(
      longIntent.id,
      balanceEvidence({exchange: "binance", asset: "ETH", availableBalance: 0.03}),
      "Live authoritative Binance balance confirms the ETH residual is still fully held.",
      now + 10,
    );
    assert.equal(longResolution.basis, "AUTHORITATIVE_BALANCE_COVERS_RESIDUAL");
    assert.equal(longResolution.automaticOrderActionPerformed, false);
    assert.equal(resolutions.isIntentResolved(longIntent.id), true);

    // --- Resolution service: SHORT residual (owed more than acquired) -
    // only a non-negative, zero-borrow balance is required, mirroring the
    // sell-filled two-leg case from StrategyOneTwoLegRecoveryResolutionService. ---
    const shortIntent = intents.stage(triangularResidualProposal({
      sourceEvidenceId: "triangle-leg-3:USDT",
      asset: "USDT",
      residualDirection: "SHORT",
      quantity: 100,
      venue: "binance",
    }), now + 20);

    const shortResolution = resolutions.resolveByAuthoritativeBalance(
      shortIntent.id,
      balanceEvidence({exchange: "binance", asset: "USDT", availableBalance: 0}),
      "Zero borrow, non-negative balance confirms no naked short currently exists.",
      now + 30,
    );
    assert.equal(shortResolution.basis, "AUTHORITATIVE_BALANCE_COVERS_RESIDUAL");
    assert.equal(resolutions.isIntentResolved(shortIntent.id), true);

    // --- Halt gate: unresolved intents block the source strategy; an
    // unrelated strategy is never affected; resolving clears the halt. ---
    const freshIntents = new SharedRecoveryIntentService();
    const freshResolutions = new SharedRecoveryResolutionService(freshIntents, join(directory, "gate-resolutions.jsonl"));
    const haltGate = new SharedRecoveryHaltGateService(freshIntents, freshResolutions);

    assert.equal(haltGate.isStrategyHalted("triangular-arbitrage", now), false);

    const gateIntent = freshIntents.stage(triangularResidualProposal({
      sourceEvidenceId: "triangle-leg-2:ETH",
      asset: "ETH",
      residualDirection: "LONG",
      quantity: 0.03,
      venue: "binance",
    }), now);

    assert.equal(haltGate.isStrategyHalted("triangular-arbitrage", now + 1), true);
    assert.equal(haltGate.isStrategyHalted("dynamic-market-making", now + 1), false);
    assert.deepEqual(haltGate.getReport(now + 1).haltedStrategyIds, ["triangular-arbitrage"]);

    freshResolutions.resolveByAuthoritativeBalance(
      gateIntent.id,
      balanceEvidence({exchange: "binance", asset: "ETH", availableBalance: 0.03}),
      "Resolved for halt-gate verification.",
      now + 6,
    );
    assert.equal(haltGate.isStrategyHalted("triangular-arbitrage", now + 7), false);

    // --- Dispatcher/queue: a halted strategy's queued plan is excluded from
    // leasing NEW work, while an unrelated strategy's plan still leases. ---
    const dispatchIntents = new SharedRecoveryIntentService();
    const dispatchResolutions = new SharedRecoveryResolutionService(dispatchIntents, join(directory, "dispatch-resolutions.jsonl"));
    const dispatchHaltGate = new SharedRecoveryHaltGateService(dispatchIntents, dispatchResolutions);

    dispatchIntents.stage(triangularResidualProposal({
      sourceEvidenceId: "triangle-leg-2:ETH",
      asset: "ETH",
      residualDirection: "LONG",
      quantity: 0.03,
      venue: "binance",
    }), now);

    const triangularPlan = createTriangularPlan();
    const triangularAdmission = new CentralLiveExecutionAdmissionService({
      compileTimeGateEnabled: true,
      allowedStrategies: ["triangular-arbitrage"],
      registeredPatterns: ["SEQUENTIAL_THREE_LEG"],
      maximumCapitalPerPlanInr: 1_000,
    }).evaluate(triangularPlan, createTriangularEvidence(), now);
    assert.equal(triangularAdmission.state, "ELIGIBLE_FOR_CENTRAL_LIVE_QUEUE");

    const otherPlan = createOtherStrategyPlan();
    const otherAdmission = new CentralLiveExecutionAdmissionService({
      compileTimeGateEnabled: true,
      allowedStrategies: ["dynamic-market-making"],
      registeredPatterns: ["TWO_SIDED_PASSIVE_MAKER"],
      maximumCapitalPerPlanInr: 1_000,
    }).evaluate(otherPlan, createOtherStrategyEvidence(), now);
    assert.equal(otherAdmission.state, "ELIGIBLE_FOR_CENTRAL_LIVE_QUEUE");

    const journal = new CentralLiveExecutionAdmissionJournalService(join(directory, "dispatch-admissions.jsonl"));
    const queue = new CentralLiveExecutionQueueService(join(directory, "dispatch-queue.jsonl"));
    queue.enqueue(triangularPlan, journal.capture(triangularPlan, triangularAdmission, now), now);
    queue.enqueue(otherPlan, journal.capture(otherPlan, otherAdmission, now), now);

    const registry = new CentralLiveLifecycleHandlerRegistry();
    registry.register({
      id: "central-two-sided-passive-maker-v72",
      pattern: "TWO_SIDED_PASSIVE_MAKER",
      async resume(input) {
        return {planId: input.queueRecord.plan.id, handlerId: "central-two-sided-passive-maker-v72", state: "COMPLETED",
          terminalEvidenceIds: ["fixture-settlement"], recoveryIntentIds: [], orderSubmissionPerformed: true,
          completedAt: now + 1_000, reasons: ["Fixture handler completed the unrelated strategy's plan."]};
      },
    });

    const dispatcher = new CentralLiveExecutionDispatcherService(
      {enabled: true},
      queue,
      new CentralLiveExecutionOutcomeJournalService(join(directory, "dispatch-outcomes.jsonl")),
      registry,
      dispatchHaltGate,
    );

    const firstRun = await dispatcher.runOnce(now);
    assert.equal(firstRun.state, "COMPLETED");
    assert.equal(queue.getByPlanId(otherPlan.id, now + 1)?.state, "COMPLETED");
    assert.equal(queue.getByPlanId(triangularPlan.id, now + 1)?.state, "QUEUED");

    const secondRun = await dispatcher.runOnce(now + 1_000);
    assert.equal(secondRun.state, "NO_DATA");
    assert.ok(secondRun.reasons.some((reason) => reason.includes("triangular-arbitrage")));
    assert.equal(queue.getByPlanId(triangularPlan.id, now + 1_001)?.state, "QUEUED");

    dispatchResolutions.resolveByAuthoritativeBalance(
      dispatchIntents.getReport(now + 2_000).intents[0]!.id,
      balanceEvidence({exchange: "binance", asset: "ETH", availableBalance: 0.03}),
      "Resolved so the triangular plan can now lease.",
      now + 2_000,
    );
    const thirdRun = await dispatcher.runOnce(now + 2_100);
    assert.equal(thirdRun.state, "REJECTED");
    assert.equal(thirdRun.reasons[0], "Exact central LIVE lifecycle handler is not registered.");
    assert.equal(queue.getByPlanId(triangularPlan.id, now + 2_101)?.state, "REJECTED");

    console.log("SHARED RECOVERY RESOLUTION + HALT GATE TEST PASSED.");
    console.log("LONG and SHORT residual resolution require live authoritative zero-borrow balance evidence; an unresolved intent excludes only its own strategy from new central LIVE leases while an unrelated strategy's plan and any already-dispatching plan are unaffected; no exchange order occurred.");
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
}

function triangularResidualProposal(input: {
  readonly sourceEvidenceId: string;
  readonly asset: string;
  readonly residualDirection: "LONG" | "SHORT";
  readonly quantity: number;
  readonly venue: string;
}) {
  return {
    sourceStrategyId: "triangular-arbitrage",
    sourceEvidenceId: input.sourceEvidenceId,
    sourceValidationHash: `hash:${input.sourceEvidenceId}`,
    sourceType: "STRATEGY_RESIDUAL_EXPOSURE" as const,
    mode: "LIVE" as const,
    severity: "CRITICAL" as const,
    routeId: "route:usdt-btc-eth-usdt",
    asset: input.asset,
    quoteAsset: "USDT",
    residualDirection: input.residualDirection,
    venue: input.venue,
    market: `${input.asset}USDT`,
    side: input.residualDirection === "LONG" ? "SELL" as const : "BUY" as const,
    quantity: input.quantity,
    referencePrice: 100,
    estimatedQuoteValue: input.quantity * 100,
    sourceCreatedAt: now,
    sourceExpiresAt: now + 300_000,
  };
}

function balanceEvidence(overrides: {
  readonly exchange: string;
  readonly asset: string;
  readonly availableBalance: number;
  readonly borrowedAmount?: number;
}) {
  return {
    exchange: overrides.exchange,
    asset: overrides.asset,
    availableBalance: overrides.availableBalance,
    borrowedAmount: overrides.borrowedAmount ?? 0,
    queriedAt: now + 5,
    evidenceSource: "TEST_FIXTURE_LIVE_SIGNED_QUERY",
  };
}

function createTriangularPlan(): CentralStrategyExecutionPlan {
  return {
    version: "35.0", id: "central-plan:halt-triangle-1", strategyId: "triangular-arbitrage", signalId: "signal:halt-triangle-1",
    signalKind: "TRIANGULAR_ARBITRAGE_SHADOW_PATH", routeFamily: "SPOT_TRIANGULAR", pattern: "SEQUENTIAL_THREE_LEG",
    settlementPolicy: {kind: "IMMEDIATE_CONVERSION_CYCLE", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR", startAsset: "USDT",
      initialQuantity: 100, modeledFinalQuantity: 100.5, flows: [
        {legId: "halt-triangle-leg-1", fromAsset: "USDT", toAsset: "BTC"},
        {legId: "halt-triangle-leg-2", fromAsset: "BTC", toAsset: "ETH"},
        {legId: "halt-triangle-leg-3", fromAsset: "ETH", toAsset: "USDT"},
      ]},
    executionOwner: "CENTRAL_SHARED_ORCHESTRATOR", compilationState: "COMPILED_SHADOW", promotionState: "BLOCKED",
    generatedAt: now - 1_000, expiresAt: now + 60_000,
    legs: [
      {id: "halt-triangle-leg-1", sequence: 1, exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "BUY", orderType: "MARKET",
        quantity: 0.002, referencePrice: 50_000, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
      {id: "halt-triangle-leg-2", sequence: 2, exchange: "binance", product: "SPOT", market: "BTCETH", side: "SELL", orderType: "MARKET",
        quantity: 0.002, referencePrice: 15, reduceOnly: false, dependency: "AFTER_PREVIOUS", evidenceOnly: true},
      {id: "halt-triangle-leg-3", sequence: 3, exchange: "binance", product: "SPOT", market: "ETHUSDT", side: "SELL", orderType: "MARKET",
        quantity: 0.03, referencePrice: 3_350, reduceOnly: false, dependency: "AFTER_PREVIOUS", evidenceOnly: true},
    ],
    modeledNetValue: 0.5, modeledNetValueUnit: "START_ASSET", executionReadinessBlockers: ["SEQUENTIAL_LEG_FAILURE_RECOVERY_REQUIRED"],
    sourceExecutionAuthorized: false, capitalReservationAllowed: false, riskApprovalGranted: false, executionHandoffAllowed: false,
    automaticExecutionAllowed: false, paperExecutionAllowed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false,
  };
}

function createTriangularEvidence(): CentralLiveAdmissionEvidence {
  return {
    planId: "central-plan:halt-triangle-1", generatedAt: now - 500, expiresAt: now + 10_000,
    paperSoak: {strategyId: "triangular-arbitrage", state: "SOAK_ACCEPTED", closedCycles: 20, consecutivePasses: 20},
    capital: {assessmentId: "capital-halt-triangle-1", planId: "central-plan:halt-triangle-1", requestedInr: 100, approved: true,
      reservationMutationPerformed: false},
    risk: {assessmentId: "risk-halt-triangle-1", planId: "central-plan:halt-triangle-1", approved: true, level: "LOW", score: 90},
    legs: ["halt-triangle-leg-1", "halt-triangle-leg-2", "halt-triangle-leg-3"].map((legId) => ({legId, adapterRegistered: true,
      authenticatedReadFresh: true, productSupported: true, orderTypeSupported: true, marketRulesFresh: true,
      feeEvidenceFresh: true, quoteFresh: true})),
    controls: {planId: "central-plan:halt-triangle-1", lifecyclePattern: "SEQUENTIAL_THREE_LEG",
      lifecycleHandlerId: "central-sequential-three-leg-v71", lifecycleHandlerRegistered: true, admissionJournalAvailable: true,
      sharedRecoveryAvailable: true, settlementAvailable: true, reconciliationAvailable: true},
    actionAuthority: {operatorActionId: "operator-halt-triangle-1", planId: "central-plan:halt-triangle-1",
      confirmation: CENTRAL_LIVE_ACTION_CONFIRMATION, confirmedAt: now - 100, expiresAt: now + 30_000},
  };
}

function createOtherStrategyPlan(): CentralStrategyExecutionPlan {
  return {version: "35.0", id: "central-plan:halt-dynamic-mm-1", strategyId: "dynamic-market-making",
    signalId: "signal:halt-dynamic-mm-1", signalKind: "DYNAMIC_MARKET_MAKING_SHADOW_QUOTE_PLAN",
    routeFamily: "SPOT_MARKET_MAKING", pattern: "TWO_SIDED_PASSIVE_MAKER",
    settlementPolicy: {kind: "TWO_SIDED_PASSIVE_FILL_CYCLE", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR",
      requiresEveryPassiveFillEvidence: true}, executionOwner: "CENTRAL_SHARED_ORCHESTRATOR",
    compilationState: "COMPILED_SHADOW", promotionState: "BLOCKED", generatedAt: now - 1_000, expiresAt: now + 60_000,
    legs: [
      {id: "halt-dynamic-bid", sequence: 1, exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "BUY",
        orderType: "LIMIT_POST_ONLY", quantity: 0.1, referencePrice: 99, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
      {id: "halt-dynamic-ask", sequence: 2, exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "SELL",
        orderType: "LIMIT_POST_ONLY", quantity: 0.1, referencePrice: 101, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
    ], modeledNetValue: 0.2, modeledNetValueUnit: "PERCENT_ONLY",
    executionReadinessBlockers: [],
    sourceExecutionAuthorized: false, capitalReservationAllowed: false, riskApprovalGranted: false,
    executionHandoffAllowed: false, automaticExecutionAllowed: false, paperExecutionAllowed: false,
    liveExecutionAllowed: false, orderSubmissionAllowed: false};
}

function createOtherStrategyEvidence(): CentralLiveAdmissionEvidence {
  return {planId: "central-plan:halt-dynamic-mm-1", generatedAt: now - 500, expiresAt: now + 10_000,
    paperSoak: {strategyId: "dynamic-market-making", state: "SOAK_ACCEPTED", closedCycles: 20, consecutivePasses: 20},
    capital: {assessmentId: "capital-halt-dynamic-mm-1", planId: "central-plan:halt-dynamic-mm-1", requestedInr: 100,
      approved: true, reservationMutationPerformed: false},
    risk: {assessmentId: "risk-halt-dynamic-mm-1", planId: "central-plan:halt-dynamic-mm-1", approved: true, level: "LOW", score: 90},
    legs: ["halt-dynamic-bid", "halt-dynamic-ask"].map((legId) => ({legId, adapterRegistered: true,
      authenticatedReadFresh: true, productSupported: true, orderTypeSupported: true, marketRulesFresh: true,
      feeEvidenceFresh: true, quoteFresh: true})),
    controls: {planId: "central-plan:halt-dynamic-mm-1", lifecyclePattern: "TWO_SIDED_PASSIVE_MAKER",
      lifecycleHandlerId: "central-two-sided-passive-maker-v72", lifecycleHandlerRegistered: true, admissionJournalAvailable: true,
      sharedRecoveryAvailable: true, settlementAvailable: true, reconciliationAvailable: true},
    actionAuthority: {operatorActionId: "operator-halt-dynamic-mm-1", planId: "central-plan:halt-dynamic-mm-1",
      confirmation: CENTRAL_LIVE_ACTION_CONFIRMATION, confirmedAt: now - 100, expiresAt: now + 30_000}};
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
