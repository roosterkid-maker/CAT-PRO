import assert from "node:assert/strict";
import type {CentralLiveQueueRecord} from "../central/CentralLiveExecutionQueueService";
import {PassiveMakerThenHedgeLiveLifecycleHandler, type PassiveMakerHedgeAdmissionEvidence,
  type PassiveMakerHedgeOrderEvidence, type PassiveMakerHedgeRecoveryRequest,
  type PassiveMakerThenHedgeLiveLifecyclePort} from "../handlers/PassiveMakerThenHedgeLiveLifecycleHandler";
import type {LiveExecutionRequest} from "../models/LiveExecutionRequest";
import type {LiveExecutionResult} from "../models/LiveExecutionResult";

const baseNow = 1_780_500_000_000;

async function main(): Promise<void> {
  await testCancelRaceFillIsHedgedExactlyAndResumeIsIdempotent();
  await testPartialHedgeStagesOnlyActualResidual();
  await testNoMakerFillNeverSubmitsHedge();
  console.log("PASSIVE MAKER-THEN-HEDGE LIVE LIFECYCLE TEST PASSED.");
  console.log("Post-only maker reads, cancel-race fills, fee-adjusted risk hedge, expired-authority reconciliation, residual recovery and no-fill isolation passed using deterministic fixtures; no external order occurred.");
}

async function testCancelRaceFillIsHedgedExactlyAndResumeIsIdempotent(): Promise<void> {
  let clock = baseNow; let physicalSubmissions = 0; const current = new Map<string, PassiveMakerHedgeOrderEvidence>();
  const requests = new Map<string, LiveExecutionRequest>(); const settlementKeys = new Set<string>();
  const port = createPort({
    now: () => clock,
    async submitOrReconcile(input) {
      const phase = input.request.orderType === "limit" ? "maker" : "hedge"; const existing = current.get(phase);
      if (existing) return existing;
      assert.equal(input.allowNewSubmission, true); physicalSubmissions += 1; requests.set(phase, input.request);
      const evidence = phase === "maker"
        ? orderEvidence(input.request, input.admissionEvidenceId, "maker-1", "OPEN", 0, 0, [], `maker:submit`, clock, true)
        : orderEvidence(input.request, input.admissionEvidenceId, "hedge-1", "FILLED", input.request.quantity, 100,
          [{asset: "USDT", amount: 0.02}], `hedge:fill`, clock, true);
      current.set(phase, evidence); return evidence;
    },
    async readOrReconcile(input) {
      assert.equal(input.orderId, "maker-1"); const request = required(requests, "maker");
      const evidence = orderEvidence(request, input.admissionEvidenceId, input.orderId, "PARTIALLY_FILLED", 0.04, 99,
        [{asset: "BTC", amount: 0.00004}], "maker:partial", clock, false);
      current.set("maker", evidence); return evidence;
    },
    async cancelOrReconcile(input) {
      assert.equal(input.orderId, "maker-1"); const request = required(requests, "maker");
      const evidence = orderEvidence(request, input.admissionEvidenceId, input.orderId, "CANCELLED", 0.05, 99,
        [{asset: "BTC", amount: 0.00005}], "maker:cancel-race", clock, false);
      current.set("maker", evidence); return evidence;
    },
    async captureSettlement(input) { settlementKeys.add(input.idempotencyKey); return "settlement:maker-hedge:stable"; },
  });
  const handler = new PassiveMakerThenHedgeLiveLifecycleHandler(port, 1); const input = resumeInput(baseNow + 100);
  const first = await handler.resume(input); clock = baseNow + 1_000; const resumed = await handler.resume(input);
  assert.equal(first.state, "COMPLETED"); assert.equal(physicalSubmissions, 2);
  assert.equal(required(requests, "hedge").quantity, 0.04995);
  assert.deepEqual(resumed.terminalEvidenceIds, first.terminalEvidenceIds);
  assert.equal(settlementKeys.size, 1);
}

async function testPartialHedgeStagesOnlyActualResidual(): Promise<void> {
  const recoveries: PassiveMakerHedgeRecoveryRequest[] = [];
  const port = createPort({
    async submitOrReconcile(input) {
      return input.request.orderType === "limit"
        ? orderEvidence(input.request, input.admissionEvidenceId, "maker-filled", "FILLED", 0.05, 99,
          [{asset: "BTC", amount: 0.00005}], "maker:filled", baseNow, true)
        : orderEvidence(input.request, input.admissionEvidenceId, "hedge-partial", "CANCELLED", 0.04, 100,
          [{asset: "USDT", amount: 0.01}], "hedge:partial", baseNow, true);
    },
    async stageRecovery(input) { recoveries.push(input); return "recovery:hedge-residual"; },
  });
  const result = await new PassiveMakerThenHedgeLiveLifecycleHandler(port).resume(resumeInput(baseNow + 1_000));
  assert.equal(result.state, "RECOVERY_REQUIRED"); assert.deepEqual(result.recoveryIntentIds, ["recovery:hedge-residual"]);
  assert.equal(recoveries.length, 1); assert.equal(recoveries[0]?.side, "sell");
  assert.equal(round(recoveries[0]?.quantity ?? 0), 0.00995); assert.equal(recoveries[0]?.reason, "HEDGE_RESIDUAL");
}

async function testNoMakerFillNeverSubmitsHedge(): Promise<void> {
  let submissions = 0; let hedgeSubmitted = false; const makerRequest: {value: LiveExecutionRequest | null} = {value: null};
  const port = createPort({
    async submitOrReconcile(input) {
      submissions += 1; if (input.request.orderType === "market") hedgeSubmitted = true; makerRequest.value = input.request;
      return orderEvidence(input.request, input.admissionEvidenceId, "maker-empty", "OPEN", 0, 0, [], "maker:open", baseNow, true);
    },
    async readOrReconcile(input) { return orderEvidence(requiredValue(makerRequest.value), input.admissionEvidenceId,
      input.orderId, "OPEN", 0, 0, [], "maker:read-empty", baseNow, false); },
    async cancelOrReconcile(input) { return orderEvidence(requiredValue(makerRequest.value), input.admissionEvidenceId,
      input.orderId, "CANCELLED", 0, 0, [], "maker:cancel-empty", baseNow, false); },
  });
  const result = await new PassiveMakerThenHedgeLiveLifecycleHandler(port, 1).resume(resumeInput(baseNow + 1_000));
  assert.equal(result.state, "REJECTED"); assert.equal(submissions, 1); assert.equal(hedgeSubmitted, false);
}

function createPort(overrides: Partial<PassiveMakerThenHedgeLiveLifecyclePort>): PassiveMakerThenHedgeLiveLifecyclePort {
  return {getAdmissionEvidence: () => admission(), async submitOrReconcile() { throw new Error("Unexpected submit."); },
    async readOrReconcile() { throw new Error("Unexpected read."); }, async cancelOrReconcile() { throw new Error("Unexpected cancel."); },
    async captureSettlement() { return "settlement:fixture"; },
    async stageRecovery() { throw new Error("Unexpected recovery."); }, now: () => baseNow, ...overrides};
}

function admission(): PassiveMakerHedgeAdmissionEvidence {
  return {evidenceId: "admission:maker-hedge", planId: "central-plan:maker-hedge", generatedAt: baseNow - 1_000,
    expiresAt: baseNow + 10_000, baseAsset: "BTC", quoteAsset: "USDT", makerPrice: 99, makerQuantity: 0.1,
    bestBid: 99, bestAsk: 100, marketRulesFresh: true, feeScheduleFresh: true, authenticatedInventoryFresh: true,
    maximumBaseFeeQuantity: 0.001, maximumQuoteFeeQuantity: 1, thirdAssetFeeBalanceVerified: false,
    baseQuantityTolerance: 0.000001, maximumUnpairedBaseExposure: 0.0001};
}

function orderEvidence(request: LiveExecutionRequest, admissionEvidenceId: string, orderId: string,
  status: LiveExecutionResult["status"], filledQuantity: number, averageFillPrice: number,
  fees: readonly {asset: string; amount: number}[], evidenceId: string, observedAt: number,
  orderSubmissionPerformed: boolean): PassiveMakerHedgeOrderEvidence {
  return {evidenceId, admissionEvidenceId, result: {success: status === "FILLED", exchange: request.exchange,
    product: "SPOT", market: request.market, side: request.side, orderId, clientOrderId: request.clientOrderId ?? null,
    status, requestedQuantity: request.quantity, filledQuantity, remainingQuantity: Math.max(0, request.quantity - filledQuantity),
    requestedPrice: request.price ?? null, averageFillPrice, feeAmount: fees.reduce((sum, item) => sum + item.amount, 0),
    cancelled: status === "CANCELLED", timedOut: status === "TIMED_OUT", startedAt: observedAt, completedAt: observedAt,
    executionTimeMs: 0, failureReason: null, reasons: []}, fees: fees.map((item) => ({...item, quoteValue: null,
      valuationEvidenceId: null})), observedAt, orderSubmissionPerformed};
}

function resumeInput(expiry: number) { return {queueRecord: queueRecord(expiry), dispatchId: "dispatch:maker-hedge",
  idempotencyKey: "0123456789abcdef0123456789abcdef"}; }
function queueRecord(expiry: number): CentralLiveQueueRecord {
  return {version: "69.0", id: "queue:maker-hedge", admissionJournalId: "admission-journal:maker-hedge",
    lifecycleHandlerId: "central-passive-maker-hedge-v80", actionAuthorityId: "operator:maker-hedge",
    actionAuthorityExpiresAt: expiry, approvedCapitalInr: 1_000, state: "DISPATCHING", queuedAt: baseNow - 2_000,
    updatedAt: baseNow - 1_000, attempts: 1, leaseId: null, leasedBy: null, leaseExpiresAt: null,
    terminalEvidenceId: null, dispatchJournalId: "dispatch:maker-hedge", dispatchStartedAt: baseNow - 500,
    executionStarted: true, orderSubmissionPerformed: false, plan: {version: "35.0", id: "central-plan:maker-hedge",
      strategyId: "cross-exchange-market-making", signalId: "signal:maker-hedge", signalKind: "XEMM_SAFE_MAKER_PRICE",
      routeFamily: "SPOT_MARKET_MAKING", pattern: "PASSIVE_MAKER_THEN_HEDGE",
      settlementPolicy: {kind: "PASSIVE_FILL_THEN_HEDGE_CYCLE", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR",
        requiresPassiveFillEvidence: true}, executionOwner: "CENTRAL_SHARED_ORCHESTRATOR", compilationState: "COMPILED_SHADOW",
      promotionState: "BLOCKED", generatedAt: baseNow - 2_000, expiresAt: expiry, legs: [
        {id: "maker", sequence: 1, exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "BUY",
          orderType: "LIMIT_POST_ONLY", quantity: 0.1, referencePrice: 99, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
        {id: "hedge", sequence: 2, exchange: "bybit", product: "SPOT", market: "BTCUSDT", side: "SELL",
          orderType: "MARKET", quantity: 0.1, referencePrice: 100, reduceOnly: false, dependency: "PASSIVE_FILL_TRIGGER", evidenceOnly: true},
      ], modeledNetValue: 0.1, modeledNetValueUnit: "QUOTE", executionReadinessBlockers: [], sourceExecutionAuthorized: false,
      capitalReservationAllowed: false, riskApprovalGranted: false, executionHandoffAllowed: false,
      automaticExecutionAllowed: false, paperExecutionAllowed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false}};
}

function required(map: ReadonlyMap<string, LiveExecutionRequest>, key: string): LiveExecutionRequest {
  const value = map.get(key); if (!value) throw new Error(`Missing request: ${key}`); return value;
}
function requiredValue<T>(value: T | null): T { if (value === null) throw new Error("Missing fixture value."); return value; }
function round(value: number): number { return Number(value.toFixed(12)); }

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
