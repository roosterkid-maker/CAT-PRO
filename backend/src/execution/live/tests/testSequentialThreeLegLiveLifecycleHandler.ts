import assert from "node:assert/strict";
import type {LiveExecutionRequest} from "../models/LiveExecutionRequest";
import type {LiveExecutionResult} from "../models/LiveExecutionResult";
import type {CentralLiveQueueRecord} from "../central/CentralLiveExecutionQueueService";
import {
  SequentialThreeLegLiveLifecycleHandler,
  type SequentialLegExecutionEvidence,
  type SequentialThreeLegLiveLifecyclePort,
  type SequentialThreeLegRecoveryRequest,
} from "../handlers/SequentialThreeLegLiveLifecycleHandler";

const now = 1_780_300_000_000;

async function main(): Promise<void> {
  await testActualOutputPropagationAndIdempotentResume();
  await testPartialSecondLegStagesEveryIntermediateResidual();
  console.log("SEQUENTIAL THREE-LEG LIVE LIFECYCLE TEST PASSED.");
  console.log("Actual fill/fee output propagated into each next leg, retained start asset settled correctly, same-key resume was idempotent, and partial intermediate exposure stopped execution and entered shared recovery; fixtures only, no external order occurred.");
}

async function testActualOutputPropagationAndIdempotentResume(): Promise<void> {
  const submitted = new Map<string, SequentialLegExecutionEvidence>();
  const availableByLeg: number[] = [];
  let physicalSubmissions = 0;
  const port = createPort({
    getSizingEvidence(input) {
      availableByLeg.push(input.availableInputQuantity);
      const values = input.leg.sequence === 1
        ? {requested: 0.01, maximumInput: 500, dust: 0.01}
        : input.leg.sequence === 2
          ? {requested: 0.00999, maximumInput: 0.00999, dust: 0.00000001}
          : {requested: 0.1497, maximumInput: 0.1497, dust: 0.00000001};
      return sizing(input, values.requested, values.maximumInput, values.dust);
    },
    async executeOrReconcile(input) {
      const existing = submitted.get(input.idempotencyKey);
      if (existing) return existing;
      physicalSubmissions += 1;
      const sequence = physicalSubmissions;
      const price = sequence === 1 ? 50_000 : sequence === 2 ? 15 : 3_400;
      const feeAsset = sequence === 1 ? "BTC" : sequence === 2 ? "ETH" : "USDT";
      const feeAmount = sequence === 1 ? 0.00001 : sequence === 2 ? 0.00015 : 0.5;
      const evidence = execution(input.request, input.sizingEvidenceId, `order-${sequence}`, "FILLED",
        input.request.quantity, price, feeAsset, feeAmount);
      submitted.set(input.idempotencyKey, evidence);
      return evidence;
    },
  });
  const handler = new SequentialThreeLegLiveLifecycleHandler(port);
  const input = resumeInput();
  const first = await handler.resume(input);
  const second = await handler.resume(input);
  assert.equal(first.state, "COMPLETED");
  assert.equal(first.orderSubmissionPerformed, true);
  assert.equal(first.terminalEvidenceIds.length, 4);
  assert.equal(physicalSubmissions, 3);
  assert.deepEqual(availableByLeg.slice(0, 3).map(round), [1000, 0.00999, 0.1497]);
  assert.deepEqual(availableByLeg.slice(3).map(round), [1000, 0.00999, 0.1497]);
  assert.deepEqual(second.terminalEvidenceIds, first.terminalEvidenceIds);
  assert.ok(first.reasons[0]?.includes("1008.48 USDT"));
}

async function testPartialSecondLegStagesEveryIntermediateResidual(): Promise<void> {
  const recoveries = new Map<string, string>();
  const executedLegs: string[] = [];
  const port = createPort({
    getSizingEvidence(input) {
      const values = input.leg.sequence === 1
        ? {requested: 0.01, maximumInput: 500}
        : {requested: 0.00999, maximumInput: 0.00999};
      return sizing(input, values.requested, values.maximumInput, 0.00000001);
    },
    async executeOrReconcile(input) {
      executedLegs.push(input.legId);
      if (input.legId === "triangle-leg-1") {
        return execution(input.request, input.sizingEvidenceId, "partial-order-1", "FILLED", 0.01, 50_000, "BTC", 0.00001);
      }
      return execution(input.request, input.sizingEvidenceId, "partial-order-2", "PARTIALLY_FILLED", 0.005, 15, "ETH", 0.00005);
    },
    async stageRecovery(request) {
      const key = `${request.sourceLegId}:${request.asset}`;
      const id = recoveries.get(key) ?? `recovery:${key}`;
      recoveries.set(key, id);
      return id;
    },
  });
  const outcome = await new SequentialThreeLegLiveLifecycleHandler(port).resume(resumeInput());
  assert.equal(outcome.state, "RECOVERY_REQUIRED");
  assert.deepEqual(executedLegs, ["triangle-leg-1", "triangle-leg-2"]);
  assert.equal(outcome.recoveryIntentIds.length, 2);
  assert.ok([...recoveries.keys()].includes("triangle-leg-2:BTC"));
  assert.ok([...recoveries.keys()].includes("triangle-leg-2:ETH"));
}

function createPort(overrides: Partial<SequentialThreeLegLiveLifecyclePort>): SequentialThreeLegLiveLifecyclePort {
  return {
    getSizingEvidence() { return null; },
    async executeOrReconcile() { throw new Error("Unexpected sequential execution."); },
    async stageRecovery(_request: SequentialThreeLegRecoveryRequest) { throw new Error("Unexpected sequential recovery."); },
    async captureSettlement() { return "triangular-live-settlement:fixture"; },
    now: () => now,
    ...overrides,
  };
}

function sizing(input: Parameters<SequentialThreeLegLiveLifecyclePort["getSizingEvidence"]>[0], requestedBaseQuantity: number,
  maximumExpectedInputQuantity: number, allowedInputDustQuantity: number) {
  return {evidenceId: `sizing:${input.leg.id}:${round(input.availableInputQuantity)}`, planId: input.planId, legId: input.leg.id,
    fromAsset: input.fromAsset, toAsset: input.toAsset, generatedAt: now - 10, expiresAt: now + 10_000,
    availableInputQuantity: input.availableInputQuantity, requestedBaseQuantity, maximumExpectedInputQuantity, allowedInputDustQuantity,
    marketRulesVerified: true, quoteFresh: true, feeScheduleFresh: true, thirdAssetFeeBalanceVerified: false};
}

function execution(request: LiveExecutionRequest, sizingEvidenceId: string, orderId: string, status: LiveExecutionResult["status"],
  filledQuantity: number, averageFillPrice: number, feeAsset: string, feeAmount: number): SequentialLegExecutionEvidence {
  return {
    terminalEvidenceId: `terminal:${orderId}`,
    sizingEvidenceId,
    result: {success: status === "FILLED", exchange: request.exchange, market: request.market, side: request.side, orderId,
      clientOrderId: request.clientOrderId ?? null, status, requestedQuantity: request.quantity, filledQuantity,
      remainingQuantity: Math.max(0, request.quantity - filledQuantity), requestedPrice: null, averageFillPrice, feeAmount,
      cancelled: false, timedOut: false, startedAt: now, completedAt: now, executionTimeMs: 0, failureReason: null, reasons: []},
    feeAsset,
    feeAmount,
    feeStartAssetValue: null,
    feeValuationEvidenceId: null,
    observedAt: now,
    orderSubmissionPerformed: true,
  };
}

function resumeInput() {
  return {queueRecord: queueRecord(), dispatchId: "central-live-dispatch:triangle", idempotencyKey: "abcdef0123456789abcdef0123456789"};
}

function queueRecord(): CentralLiveQueueRecord {
  const plan = {
    version: "35.0", id: "central-plan:triangle-live", strategyId: "triangular-arbitrage", signalId: "triangle-signal",
    signalKind: "TRIANGULAR_ARBITRAGE_SHADOW_PATH", routeFamily: "SPOT_TRIANGULAR", pattern: "SEQUENTIAL_THREE_LEG",
    settlementPolicy: {kind: "IMMEDIATE_CONVERSION_CYCLE", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR", startAsset: "USDT",
      initialQuantity: 1000, modeledFinalQuantity: 1008.48, flows: [
        {legId: "triangle-leg-1", fromAsset: "USDT", toAsset: "BTC"},
        {legId: "triangle-leg-2", fromAsset: "BTC", toAsset: "ETH"},
        {legId: "triangle-leg-3", fromAsset: "ETH", toAsset: "USDT"},
      ]},
    executionOwner: "CENTRAL_SHARED_ORCHESTRATOR", compilationState: "COMPILED_SHADOW", promotionState: "BLOCKED",
    generatedAt: now - 1_000, expiresAt: now + 60_000,
    legs: [
      {id: "triangle-leg-1", sequence: 1, exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "BUY", orderType: "MARKET", quantity: 0.01, referencePrice: 50_000, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
      {id: "triangle-leg-2", sequence: 2, exchange: "binance", product: "SPOT", market: "BTCETH", side: "SELL", orderType: "MARKET", quantity: 0.00999, referencePrice: 15, reduceOnly: false, dependency: "AFTER_PREVIOUS", evidenceOnly: true},
      {id: "triangle-leg-3", sequence: 3, exchange: "binance", product: "SPOT", market: "ETHUSDT", side: "SELL", orderType: "MARKET", quantity: 0.1497, referencePrice: 3_400, reduceOnly: false, dependency: "AFTER_PREVIOUS", evidenceOnly: true},
    ], modeledNetValue: 8.48, modeledNetValueUnit: "START_ASSET", executionReadinessBlockers: ["SEQUENTIAL_LEG_FAILURE_RECOVERY_REQUIRED"],
    sourceExecutionAuthorized: false, capitalReservationAllowed: false, riskApprovalGranted: false, executionHandoffAllowed: false,
    automaticExecutionAllowed: false, paperExecutionAllowed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false,
  } as const;
  return {version: "69.0", id: "central-live-queue:triangle", plan, admissionJournalId: "admission-journal:triangle",
    lifecycleHandlerId: "central-sequential-three-leg-v71", actionAuthorityId: "operator-action:triangle",
    actionAuthorityExpiresAt: now + 30_000, approvedCapitalInr: 1000, state: "DISPATCHING", queuedAt: now - 500,
    updatedAt: now - 100, attempts: 1, leaseId: null, leasedBy: null, leaseExpiresAt: null,
    terminalEvidenceId: null, dispatchJournalId: "central-live-dispatch:triangle", dispatchStartedAt: now - 100,
    executionStarted: true, orderSubmissionPerformed: false};
}

function round(value: number): number { return Number(value.toFixed(12)); }

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
