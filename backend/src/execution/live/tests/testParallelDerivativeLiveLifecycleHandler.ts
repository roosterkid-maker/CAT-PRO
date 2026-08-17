import assert from "node:assert/strict";
import type {CentralLiveQueueRecord} from "../central/CentralLiveExecutionQueueService";
import {
  ParallelDerivativeLiveLifecycleHandler,
  type DerivativeEntryAdmissionEvidence,
  type DerivativeExitEvaluationEvidence,
  type DerivativeLifecycleOrderEvidence,
  type DerivativeLiveRecoveryRequest,
  type ParallelDerivativeLiveLifecyclePort,
} from "../handlers/ParallelDerivativeLiveLifecycleHandler";
import type {LiveExecutionRequest} from "../models/LiveExecutionRequest";

const baseNow = 1_780_500_000_000;

async function main(): Promise<void> {
  await testMonitoringExpiredResumeAndReduceOnlySettlement();
  await testPartialEntryStagesEveryMaterialExposure();
  await testPartialSecondExitDoesNotRecoverClosedFirstLeg();
  console.log("PARALLEL DERIVATIVE LIVE LIFECYCLE TEST PASSED.");
  console.log("Historical admission, durable monitoring, expired-authority reconciliation, exact reduce-only exits, stable idempotency, and residual-only shared recovery passed using fixtures; no external order occurred.");
}

async function testMonitoringExpiredResumeAndReduceOnlySettlement(): Promise<void> {
  let clock = baseNow;
  let exitReady = false;
  let physicalSubmissions = 0;
  const requests = new Map<string, LiveExecutionRequest>();
  const port = createPort({
    now: () => clock,
    getEntryAdmissionEvidence: (_planId, dispatchStartedAt) => admission(dispatchStartedAt),
    async executeOrReconcile(input) {
      const existing = requests.get(input.idempotencyKey);
      if (!existing) {
        assert.equal(input.allowNewSubmission, true);
        requests.set(input.idempotencyKey, input.request);
        physicalSubmissions += 1;
      } else {
        assert.deepEqual(input.request, existing);
      }
      return orderEvidence(input.request, input.idempotencyKey, input.phase, input.legId,
        input.request.quantity, clock, !existing);
    },
    evaluateExit: (input) => exitEvidence(input.planId, input.positionGroupEvidenceId, clock,
      exitReady ? "READY_TO_CLOSE" : "HOLD"),
  });
  const handler = new ParallelDerivativeLiveLifecycleHandler(port, "PARALLEL_TWO_LEG");
  const input = resumeInput(baseNow + 500);
  const monitoring = await handler.resume(input);
  assert.equal(monitoring.state, "MONITORING");
  assert.equal(monitoring.orderSubmissionPerformed, true);
  assert.equal(physicalSubmissions, 2);

  clock = baseNow + 5_000;
  exitReady = true;
  const completed = await handler.resume(input);
  assert.equal(completed.state, "COMPLETED");
  assert.equal(physicalSubmissions, 4);
  const exitRequests = [...requests.entries()].filter(([key]) => key.includes(":exit:"));
  assert.equal(exitRequests.length, 2);
  for (const [, request] of exitRequests) {
    assert.equal(request.product, "PERPETUAL");
    assert.equal(request.reduceOnly, true);
  }
  assert.equal(exitRequests.find(([key]) => key.endsWith(":binance-long"))?.[1].side, "sell");
  assert.equal(exitRequests.find(([key]) => key.endsWith(":bybit-short"))?.[1].side, "buy");

  const reconciled = await handler.resume(input);
  assert.equal(reconciled.state, "COMPLETED");
  assert.equal(physicalSubmissions, 4);
  assert.deepEqual(reconciled.terminalEvidenceIds, completed.terminalEvidenceIds);
}

async function testPartialEntryStagesEveryMaterialExposure(): Promise<void> {
  const recoveries: DerivativeLiveRecoveryRequest[] = [];
  const port = createPort({
    async executeOrReconcile(input) {
      const fill = input.phase === "ENTRY" && input.legId === "bybit-short" ? 0.004 : input.request.quantity;
      return orderEvidence(input.request, input.idempotencyKey, input.phase, input.legId, fill, baseNow, true);
    },
    async stageRecovery(request) { recoveries.push(request); return `recovery:${request.entryLegId}`; },
  });
  const outcome = await new ParallelDerivativeLiveLifecycleHandler(port, "PARALLEL_TWO_LEG")
    .resume(resumeInput(baseNow + 500));
  assert.equal(outcome.state, "RECOVERY_REQUIRED");
  assert.deepEqual(recoveries.map((item) => ({leg: item.entryLegId, quantity: item.quantity, side: item.side,
    reduceOnly: item.reduceOnly, reason: item.reason})), [
    {leg: "binance-long", quantity: 0.01, side: "sell", reduceOnly: true, reason: "ENTRY_IMBALANCE"},
    {leg: "bybit-short", quantity: 0.004, side: "buy", reduceOnly: true, reason: "ENTRY_IMBALANCE"},
  ]);
}

async function testPartialSecondExitDoesNotRecoverClosedFirstLeg(): Promise<void> {
  const recoveries: DerivativeLiveRecoveryRequest[] = [];
  const port = createPort({
    async executeOrReconcile(input) {
      const fill = input.phase === "EXIT" && input.legId === "bybit-short" ? 0.004 : input.request.quantity;
      return orderEvidence(input.request, input.idempotencyKey, input.phase, input.legId, fill, baseNow, true);
    },
    evaluateExit: (input) => exitEvidence(input.planId, input.positionGroupEvidenceId, baseNow, "READY_TO_CLOSE"),
    async stageRecovery(request) { recoveries.push(request); return `recovery:${request.entryLegId}`; },
  });
  const outcome = await new ParallelDerivativeLiveLifecycleHandler(port, "PARALLEL_TWO_LEG")
    .resume(resumeInput(baseNow + 500));
  assert.equal(outcome.state, "RECOVERY_REQUIRED");
  assert.deepEqual(recoveries.map((item) => ({leg: item.entryLegId, quantity: item.quantity, reason: item.reason})), [
    {leg: "bybit-short", quantity: 0.006, reason: "EXIT_RESIDUAL"},
  ]);
}

function createPort(overrides: Partial<ParallelDerivativeLiveLifecyclePort>): ParallelDerivativeLiveLifecyclePort {
  return {
    getEntryAdmissionEvidence: (_planId, dispatchStartedAt) => admission(dispatchStartedAt),
    async executeOrReconcile() { throw new Error("Unexpected derivative execution fixture call."); },
    async captureOpenPosition() { return "derivative-position-group:stable"; },
    evaluateExit: (input) => exitEvidence(input.planId, input.positionGroupEvidenceId, baseNow, "HOLD"),
    async captureSettlement() { return "derivative-settlement:stable"; },
    async stageRecovery(_request) { throw new Error("Unexpected derivative recovery fixture call."); },
    now: () => baseNow,
    ...overrides,
  };
}

function admission(dispatchStartedAt: number): DerivativeEntryAdmissionEvidence {
  return {evidenceId: "derivative-admission:stable", planId: "central-plan:funding-live", generatedAt: dispatchStartedAt - 100,
    expiresAt: dispatchStartedAt + 100, legs: [
      {legId: "binance-long", product: "PERPETUAL", positionMode: "ONE_WAY", positionSide: "LONG",
        currentSignedPositionQuantity: 0, positionEvidenceId: "position:binance-flat", accountEvidenceId: "account:binance",
        authenticatedReadFresh: true, balanceOrMarginSufficient: true, marketRulesFresh: true, quoteAndDepthFresh: true,
        feeScheduleFresh: true, liquidationControlReady: true, reduceOnlyExitVerified: true},
      {legId: "bybit-short", product: "PERPETUAL", positionMode: "HEDGE", positionSide: "SHORT",
        currentSignedPositionQuantity: 0, positionEvidenceId: "position:bybit-flat", accountEvidenceId: "account:bybit",
        authenticatedReadFresh: true, balanceOrMarginSufficient: true, marketRulesFresh: true, quoteAndDepthFresh: true,
        feeScheduleFresh: true, liquidationControlReady: true, reduceOnlyExitVerified: true},
    ]};
}

function exitEvidence(planId: string, positionGroupEvidenceId: string, now: number,
  state: DerivativeExitEvaluationEvidence["state"]): DerivativeExitEvaluationEvidence {
  const ready = state === "READY_TO_CLOSE";
  return {evidenceId: `derivative-exit:${state.toLowerCase()}`, planId, positionGroupEvidenceId, state,
    generatedAt: now, expiresAt: now + 1_000, conditionMetric: ready ? 0 : null, conditionThreshold: ready ? 0 : null,
    blockers: ready ? [] : ["Funding settlement window has not completed."], legs: ready ? [
      {entryLegId: "binance-long", product: "PERPETUAL", exchange: "binance", market: "BTCUSDT", side: "SELL",
        quantity: 0.01, referencePrice: 49_900, positionMode: "ONE_WAY", positionSide: "LONG",
        currentSignedPositionQuantity: 0.01, positionEvidenceId: "position:binance-long", fullDepthVerified: true,
        feeScheduleFresh: true, fundingEvidenceIds: ["funding:binance"], reduceOnlyVerified: true},
      {entryLegId: "bybit-short", product: "PERPETUAL", exchange: "bybit", market: "BTCUSDT", side: "BUY",
        quantity: 0.01, referencePrice: 50_000, positionMode: "HEDGE", positionSide: "SHORT",
        currentSignedPositionQuantity: -0.01, positionEvidenceId: "position:bybit-short", fullDepthVerified: true,
        feeScheduleFresh: true, fundingEvidenceIds: ["funding:bybit"], reduceOnlyVerified: true},
    ] : []};
}

function orderEvidence(request: LiveExecutionRequest, idempotencyKey: string, phase: "ENTRY" | "EXIT", legId: string,
  filledQuantity: number, observedAt: number, submitted: boolean): DerivativeLifecycleOrderEvidence {
  const status = filledQuantity >= request.quantity ? "FILLED" as const : "PARTIALLY_FILLED" as const;
  const averageFillPrice = legId === "binance-long" ? (phase === "ENTRY" ? 50_000 : 49_900)
    : (phase === "ENTRY" ? 50_100 : 50_000);
  return {evidenceId: `order:${phase.toLowerCase()}:${legId}`, result: {success: status === "FILLED",
    exchange: request.exchange, product: request.product, market: request.market, side: request.side,
    reduceOnly: request.reduceOnly, positionMode: request.positionMode, positionSide: request.positionSide,
    orderId: `${phase.toLowerCase()}-${legId}`, clientOrderId: request.clientOrderId ?? null, status,
    requestedQuantity: request.quantity, filledQuantity, remainingQuantity: request.quantity - filledQuantity,
    requestedPrice: request.price ?? null, averageFillPrice, feeAmount: 0.01, cancelled: false, timedOut: false,
    startedAt: observedAt, completedAt: observedAt, executionTimeMs: 0, failureReason: null,
    reasons: [`Fixture reconciled ${idempotencyKey}.`]}, feeAsset: "USDT", feeAmount: 0.01,
    observedAt, orderSubmissionPerformed: submitted};
}

function resumeInput(expiry: number) {
  return {queueRecord: queueRecord(expiry), dispatchId: "central-live-dispatch:funding-live",
    idempotencyKey: "1234567890abcdef1234567890abcdef"};
}

function queueRecord(expiry: number): CentralLiveQueueRecord {
  return {version: "69.0", id: "central-live-queue:funding-live", admissionJournalId: "admission:funding-live",
    lifecycleHandlerId: "central-parallel-derivative-v74", actionAuthorityId: "operator:funding-live",
    actionAuthorityExpiresAt: expiry, approvedCapitalInr: 1_000, state: "DISPATCHING", queuedAt: baseNow - 1_000,
    updatedAt: baseNow, attempts: 1, leaseId: null, leasedBy: null, leaseExpiresAt: null,
    terminalEvidenceId: null, dispatchJournalId: "central-live-dispatch:funding-live", dispatchStartedAt: baseNow,
    executionStarted: true, orderSubmissionPerformed: false, plan: {version: "35.0", id: "central-plan:funding-live",
      strategyId: "funding-rate-arbitrage", signalId: "signal:funding-live", signalKind: "FUNDING_RATE_ARBITRAGE_SHADOW_OPPORTUNITY",
      routeFamily: "PERPETUAL_TWO_VENUE", pattern: "PARALLEL_TWO_LEG",
      settlementPolicy: {kind: "FUNDING_CAPTURE_THEN_EXIT", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR",
        notBefore: baseNow - 1, fundingTimestamps: [baseNow - 1], requiresFundingEvidence: true, forcedTimeExitAllowed: false},
      executionOwner: "CENTRAL_SHARED_ORCHESTRATOR", compilationState: "COMPILED_SHADOW", promotionState: "BLOCKED",
      generatedAt: baseNow - 1_000, expiresAt: expiry, legs: [
        {id: "binance-long", sequence: 1, exchange: "binance", product: "PERPETUAL", market: "BTCUSDT", side: "BUY",
          orderType: "MARKET", quantity: 0.01, referencePrice: 50_000, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
        {id: "bybit-short", sequence: 2, exchange: "bybit", product: "PERPETUAL", market: "BTCUSDT", side: "SELL",
          orderType: "MARKET", quantity: 0.01, referencePrice: 50_100, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
      ], modeledNetValue: 0.1, modeledNetValueUnit: "PERCENT_ONLY",
      executionReadinessBlockers: ["POSITION_EVIDENCE_MISSING", "MARGIN_EVIDENCE_MISSING", "LIQUIDATION_CONTROL_MISSING",
        "REDUCE_ONLY_UNVERIFIED", "DERIVATIVE_ADAPTER_MISSING"], sourceExecutionAuthorized: false,
      capitalReservationAllowed: false, riskApprovalGranted: false, executionHandoffAllowed: false,
      automaticExecutionAllowed: false, paperExecutionAllowed: false, liveExecutionAllowed: false,
      orderSubmissionAllowed: false}};
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
