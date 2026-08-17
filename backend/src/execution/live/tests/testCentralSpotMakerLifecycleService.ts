import assert from "node:assert/strict";

import type {LiveExecutionAdapterCapabilities} from "../contracts/LiveExecutionAdapter";
import type {LiveExecutionRequest} from "../models/LiveExecutionRequest";
import type {LiveExecutionResult} from "../models/LiveExecutionResult";
import {
  CENTRAL_SPOT_MAKER_REQUIRED_CONFIRMATION,
  CentralSpotMakerLifecycleService,
  type CentralSpotMakerLifecyclePort,
  type CentralSpotMakerRecoveryRequest,
} from "../maker/CentralSpotMakerLifecycleService";
import type {CentralStrategyExecutionPlan} from "../../../strategies/models/CentralStrategyExecutionPlan";

const now = 1_780_300_000_000;
const spotCapabilities: LiveExecutionAdapterCapabilities = {
  products: ["SPOT"],
  supportsMarketOrders: true,
  supportsLimitOrders: true,
  supportsPostOnly: true,
  supportsOrderStatus: true,
  supportsCancellation: true,
  supportsAmendKeepPriority: false,
  supportsReduceOnly: false,
};

async function main(): Promise<void> {
  await testPartialFillCancelReplaceAndExactHedges();
  await testHedgeFailureStagesExactRecovery();
  await testAuthorityFailsBeforeSubmission();
  console.log("CENTRAL SPOT MAKER LIFECYCLE TEST PASSED.");
  console.log("Bounded post-only cancel/replace, cancel-race fill capture, exact incremental hedges, recovery staging, and fresh action authority were proven with isolated adapters; no external order occurred.");
}

async function testPartialFillCancelReplaceAndExactHedges(): Promise<void> {
  const makerRequests: LiveExecutionRequest[] = [];
  const hedgeRequests: LiveExecutionRequest[] = [];
  let reads = 0;
  const port = createPort({
    async submit(request) {
      if (request.postOnly) {
        makerRequests.push(request);
        return makerRequests.length === 1
          ? result(request, "OPEN", "maker-1", 0)
          : result(request, "FILLED", "maker-2", request.quantity);
      }
      hedgeRequests.push(request);
      return result(request, "FILLED", `hedge-${hedgeRequests.length}`, request.quantity);
    },
    async read(_exchange, _orderId, _market) {
      reads += 1;
      return result(makerRequests[0] as LiveExecutionRequest, "OPEN", "maker-1", 0.4);
    },
    async cancel() {
      return result(makerRequests[0] as LiveExecutionRequest, "CANCELLED", "maker-1", 0.5);
    },
  });

  const lifecycle = new CentralSpotMakerLifecycleService(port);
  const output = await lifecycle.run(plan(), authority(), policy());
  assert.equal(output.state, "COMPLETED_HEDGED");
  assert.equal(output.makerFilledQuantity, 1);
  assert.equal(output.hedgeFilledQuantity, 1);
  assert.equal(output.replacements, 1);
  assert.equal(reads, 2);
  assert.deepEqual(hedgeRequests.map((item) => Number(item.quantity.toFixed(12))), [0.4, 0.1, 0.5]);
  assert.equal(makerRequests[0]?.postOnly, true);
  assert.equal(makerRequests[1]?.quantity, 0.5);
  assert.equal(makerRequests[1]?.price, 99.5);
  assert.equal(output.recoveryIntentIds.length, 0);
  assert.equal(output.orderSubmissionPerformed, true);
  assert.ok(Object.isFrozen(output));
}

async function testHedgeFailureStagesExactRecovery(): Promise<void> {
  const recovery: CentralSpotMakerRecoveryRequest[] = [];
  const makerRequest = new Array<LiveExecutionRequest>();
  const port = createPort({
    async submit(request) {
      if (request.postOnly) {
        makerRequest.push(request);
        return result(request, "OPEN", "maker-partial", 0.4);
      }
      return result(request, "PARTIALLY_FILLED", "hedge-partial", 0.2);
    },
    async read() {
      throw new Error("Read must not occur after hedge failure.");
    },
    async cancel() {
      throw new Error("Cancel must not occur after hedge failure.");
    },
    async stageRecovery(request) {
      recovery.push(request);
      return "recovery-1";
    },
  });

  const output = await new CentralSpotMakerLifecycleService(port).run(plan(), authority(), policy());
  assert.equal(makerRequest.length, 1);
  assert.equal(output.state, "RECOVERY_REQUIRED");
  assert.equal(output.makerFilledQuantity, 0.4);
  assert.equal(output.hedgeFilledQuantity, 0.2);
  assert.equal(recovery[0]?.quantity, 0.2);
  assert.equal(recovery[0]?.reason, "HEDGE_PARTIAL_FILL");
  assert.deepEqual(output.recoveryIntentIds, ["recovery-1"]);
}

async function testAuthorityFailsBeforeSubmission(): Promise<void> {
  let submissions = 0;
  const port = createPort({
    async submit(request) {
      submissions += 1;
      return result(request, "FILLED", "unexpected", request.quantity);
    },
  });
  await assert.rejects(
    new CentralSpotMakerLifecycleService(port).run(
      plan(),
      {...authority(), compileTimeGateEnabled: false},
      policy(),
    ),
    /gate is disabled/u,
  );
  assert.equal(submissions, 0);
}

function createPort(overrides: Partial<CentralSpotMakerLifecyclePort>): CentralSpotMakerLifecyclePort {
  return {
    getCapabilities: () => spotCapabilities,
    async submit() { throw new Error("Unexpected submit."); },
    async read() { throw new Error("Unexpected read."); },
    async cancel() { throw new Error("Unexpected cancel."); },
    getReplacementEvidence: ({replacementNumber}) => ({
      evidenceId: `replacement-${replacementNumber}`,
      price: 99.5,
      observedAt: now,
      expiresAt: now + 10_000,
    }),
    async stageRecovery() { return "unexpected-recovery"; },
    now: () => now,
    ...overrides,
  };
}

function policy() {
  return {maximumReprices: 1, maximumStatusReadsPerOrder: 2, orderTimeoutMs: 2_000, pollingIntervalMs: 100};
}

function authority() {
  return {
    compileTimeGateEnabled: true,
    confirmation: CENTRAL_SPOT_MAKER_REQUIRED_CONFIRMATION,
    operatorActionId: "operator-action-1",
    planId: "central-plan:maker-1",
    confirmedAt: now - 1_000,
    expiresAt: now + 10_000,
  };
}

function plan(): CentralStrategyExecutionPlan {
  return {
    version: "35.0",
    id: "central-plan:maker-1",
    strategyId: "cross-exchange-market-making",
    signalId: "signal:maker-1",
    signalKind: "XEMM_SAFE_MAKER_PRICE",
    routeFamily: "SPOT_MARKET_MAKING",
    pattern: "PASSIVE_MAKER_THEN_HEDGE",
    settlementPolicy: {kind: "PASSIVE_FILL_THEN_HEDGE_CYCLE", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR", requiresPassiveFillEvidence: true},
    executionOwner: "CENTRAL_SHARED_ORCHESTRATOR",
    compilationState: "COMPILED_SHADOW",
    promotionState: "BLOCKED",
    generatedAt: now - 2_000,
    expiresAt: now + 10_000,
    legs: [
      {id: "maker-leg", sequence: 1, exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "BUY", orderType: "LIMIT_POST_ONLY", quantity: 1, referencePrice: 100, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
      {id: "hedge-leg", sequence: 2, exchange: "bybit", product: "SPOT", market: "BTCUSDT", side: "SELL", orderType: "MARKET", quantity: 1, referencePrice: 100.5, reduceOnly: false, dependency: "PASSIVE_FILL_TRIGGER", evidenceOnly: true},
    ],
    modeledNetValue: 0.5,
    modeledNetValueUnit: "QUOTE",
    executionReadinessBlockers: [],
    sourceExecutionAuthorized: false,
    capitalReservationAllowed: false,
    riskApprovalGranted: false,
    executionHandoffAllowed: false,
    automaticExecutionAllowed: false,
    paperExecutionAllowed: false,
    liveExecutionAllowed: false,
    orderSubmissionAllowed: false,
  };
}

function result(request: LiveExecutionRequest, status: LiveExecutionResult["status"], orderId: string, filledQuantity: number): LiveExecutionResult {
  return {
    success: status === "FILLED",
    exchange: request.exchange,
    market: request.market.toUpperCase(),
    side: request.side,
    orderId,
    clientOrderId: request.clientOrderId ?? null,
    status,
    requestedQuantity: request.quantity,
    filledQuantity,
    remainingQuantity: Math.max(0, request.quantity - filledQuantity),
    requestedPrice: request.price ?? null,
    averageFillPrice: request.price ?? 100,
    feeAmount: 0,
    cancelled: status === "CANCELLED",
    timedOut: false,
    startedAt: now,
    completedAt: now,
    executionTimeMs: 0,
    failureReason: null,
    reasons: [],
  };
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
