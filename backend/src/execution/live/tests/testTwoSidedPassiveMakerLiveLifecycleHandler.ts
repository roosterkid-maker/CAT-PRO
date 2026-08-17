import assert from "node:assert/strict";
import type {CentralLiveQueueRecord} from "../central/CentralLiveExecutionQueueService";
import {
  TwoSidedPassiveMakerLiveLifecycleHandler,
  type TwoSidedInventoryRecoveryRequest,
  type TwoSidedOrderExecutionEvidence,
  type TwoSidedPassiveMakerLiveLifecyclePort,
  type TwoSidedQuoteCycleEvidence,
} from "../handlers/TwoSidedPassiveMakerLiveLifecycleHandler";
import type {LiveExecutionRequest} from "../models/LiveExecutionRequest";
import type {LiveExecutionResult} from "../models/LiveExecutionResult";

const baseNow = 1_780_400_000_000;

async function main(): Promise<void> {
  await testPartialBidSettlementAndExpiredResumeAreIdempotent();
  await testAskCancelRaceStagesExcessUnpairedInventory();
  console.log("TWO-SIDED PASSIVE MAKER LIVE LIFECYCLE TEST PASSED.");
  console.log("Paired post-only submission, fill-triggered sibling cancellation, exact fee/inventory settlement, cancel-race recovery, and expired-authority reconciliation with stable keys passed using fixtures; no external order occurred.");
}

async function testPartialBidSettlementAndExpiredResumeAreIdempotent(): Promise<void> {
  let clock = baseNow;
  let physicalSubmissions = 0;
  const requests = new Map<string, LiveExecutionRequest>();
  const settlements: Array<{baseDelta: number; quoteDelta: number}> = [];
  const port = createPort({
    now: () => clock,
    getQuoteCycleEvidence: () => quoteEvidence(clock, 0.1),
    async submitOrReconcile(input) {
      const orderId = input.request.side === "buy" ? "bid-order-1" : "ask-order-1";
      const existing = requests.get(orderId);
      if (!existing) {
        assert.equal(input.allowNewSubmission, true);
        requests.set(orderId, input.request);
        physicalSubmissions += 1;
      } else {
        assert.equal(input.allowNewSubmission, false);
      }
      return orderEvidence(input.request, input.quoteEvidenceId, orderId, "OPEN", 0, 0, "USDT", 0,
        `submitted:${orderId}`, clock);
    },
    async readOrReconcile(input) {
      const request = requireRequest(requests, input.orderId);
      return input.orderId.startsWith("bid-")
        ? orderEvidence(request, input.quoteEvidenceId, input.orderId, "PARTIALLY_FILLED", 0.04, 99, "BTC", 0.00004,
          `read:${input.orderId}`, clock)
        : orderEvidence(request, input.quoteEvidenceId, input.orderId, "OPEN", 0, 0, "USDT", 0,
          `read:${input.orderId}`, clock);
    },
    async cancelOrReconcile(input) {
      const request = requireRequest(requests, input.orderId);
      return input.orderId.startsWith("bid-")
        ? orderEvidence(request, input.quoteEvidenceId, input.orderId, "CANCELLED", 0.04, 99, "BTC", 0.00004,
          `cancelled:${input.orderId}`, clock)
        : orderEvidence(request, input.quoteEvidenceId, input.orderId, "CANCELLED", 0, 0, "USDT", 0,
          `cancelled:${input.orderId}`, clock);
    },
    async captureSettlement(input) {
      settlements.push({baseDelta: input.baseDelta, quoteDelta: input.quoteDelta});
      return "two-sided-settlement:stable";
    },
  });
  const handler = new TwoSidedPassiveMakerLiveLifecycleHandler(port, {maximumQuoteCycles: 1, maximumStatusReadsPerCycle: 1});
  const input = resumeInput(baseNow + 100);
  const first = await handler.resume(input);
  clock = baseNow + 1_000;
  const resumedAfterAuthorityExpiry = await handler.resume(input);
  assert.equal(first.state, "COMPLETED");
  assert.equal(first.orderSubmissionPerformed, true);
  assert.equal(physicalSubmissions, 2);
  assert.deepEqual(first.terminalEvidenceIds, ["cancelled:bid-order-1", "cancelled:ask-order-1", "two-sided-settlement:stable"]);
  assert.deepEqual(resumedAfterAuthorityExpiry.terminalEvidenceIds, first.terminalEvidenceIds);
  assert.deepEqual(settlements.map((item) => ({baseDelta: round(item.baseDelta), quoteDelta: round(item.quoteDelta)})), [
    {baseDelta: 0.03996, quoteDelta: -3.96}, {baseDelta: 0.03996, quoteDelta: -3.96},
  ]);
}

async function testAskCancelRaceStagesExcessUnpairedInventory(): Promise<void> {
  const requests = new Map<string, LiveExecutionRequest>();
  const recoveries: TwoSidedInventoryRecoveryRequest[] = [];
  const port = createPort({
    getQuoteCycleEvidence: () => quoteEvidence(baseNow, 0.05),
    async submitOrReconcile(input) {
      const orderId = input.request.side === "buy" ? "bid-race" : "ask-race";
      requests.set(orderId, input.request);
      return orderEvidence(input.request, input.quoteEvidenceId, orderId, "OPEN", 0, 0, "USDT", 0,
        `submitted:${orderId}`, baseNow);
    },
    async readOrReconcile(input) {
      return orderEvidence(requireRequest(requests, input.orderId), input.quoteEvidenceId, input.orderId, "OPEN", 0, 0,
        "USDT", 0, `read:${input.orderId}`, baseNow);
    },
    async cancelOrReconcile(input) {
      const request = requireRequest(requests, input.orderId);
      return input.orderId === "ask-race"
        ? orderEvidence(request, input.quoteEvidenceId, input.orderId, "CANCELLED", 0.1, 101, "USDT", 0.1,
          `cancelled:${input.orderId}`, baseNow)
        : orderEvidence(request, input.quoteEvidenceId, input.orderId, "CANCELLED", 0, 0, "USDT", 0,
          `cancelled:${input.orderId}`, baseNow);
    },
    async stageRecovery(request) { recoveries.push(request); return "recovery:ask-cancel-race"; },
  });
  const outcome = await new TwoSidedPassiveMakerLiveLifecycleHandler(port, {
    maximumQuoteCycles: 1, maximumStatusReadsPerCycle: 1,
  }).resume(resumeInput(baseNow + 10_000));
  assert.equal(outcome.state, "RECOVERY_REQUIRED");
  assert.deepEqual(outcome.recoveryIntentIds, ["recovery:ask-cancel-race"]);
  assert.equal(recoveries.length, 1);
  assert.equal(recoveries[0]?.side, "buy");
  assert.equal(round(recoveries[0]?.quantity ?? 0), 0.05);
  assert.equal(recoveries[0]?.reason, "UNPAIRED_FILL_LIMIT_BREACH");
}

function createPort(overrides: Partial<TwoSidedPassiveMakerLiveLifecyclePort>): TwoSidedPassiveMakerLiveLifecyclePort {
  return {
    getQuoteCycleEvidence: () => null,
    async submitOrReconcile() { throw new Error("Unexpected two-sided submit."); },
    async readOrReconcile() { throw new Error("Unexpected two-sided read."); },
    async cancelOrReconcile() { throw new Error("Unexpected two-sided cancel."); },
    async captureSettlement() { return "two-sided-settlement:fixture"; },
    async stageRecovery(_request: TwoSidedInventoryRecoveryRequest) { throw new Error("Unexpected two-sided recovery."); },
    now: () => baseNow,
    ...overrides,
  };
}

function quoteEvidence(now: number, maximumUnpairedBaseExposure: number): TwoSidedQuoteCycleEvidence {
  return {evidenceId: "two-sided-quote:1", planId: "central-plan:dynamic-mm-1", cycle: 1, exchange: "binance",
    market: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT", generatedAt: now - 1, expiresAt: now + 5_000,
    bidPrice: 99, askPrice: 101, bidQuantity: 0.1, askQuantity: 0.1, bestBid: 99, bestAsk: 101,
    inventoryEvidenceId: `inventory:${now}`, inventoryBaseTotal: 1, inventoryBaseAvailable: 1,
    inventoryQuoteAvailable: 1_000, minimumBaseInventory: 0.5, maximumBaseInventory: 1.5,
    maximumUnpairedBaseExposure, maximumBaseFeeQuantity: 0.001, maximumQuoteFeeQuantity: 1,
    baseQuantityTolerance: 0.000001, marketRulesVerified: true, authenticatedInventoryFresh: true,
    quoteFresh: true, feeScheduleFresh: true, empiricalFillEvidenceFresh: true, thirdAssetFeeBalanceVerified: false};
}

function orderEvidence(request: LiveExecutionRequest, quoteEvidenceId: string, orderId: string,
  status: LiveExecutionResult["status"], filledQuantity: number, averageFillPrice: number, feeAsset: string,
  feeAmount: number, evidenceId: string, observedAt: number): TwoSidedOrderExecutionEvidence {
  return {evidenceId, quoteEvidenceId, result: {success: status === "FILLED", exchange: request.exchange,
    market: request.market, side: request.side, orderId, clientOrderId: request.clientOrderId ?? null, status,
    requestedQuantity: request.quantity, filledQuantity, remainingQuantity: Math.max(0, request.quantity - filledQuantity),
    requestedPrice: request.price ?? null, averageFillPrice, feeAmount, cancelled: status === "CANCELLED", timedOut: false,
    startedAt: observedAt, completedAt: observedAt, executionTimeMs: 0, failureReason: null, reasons: []},
  feeAsset, feeAmount, feeQuoteValue: null, feeValuationEvidenceId: null, observedAt,
  orderSubmissionPerformed: evidenceId.startsWith("submitted:")};
}

function resumeInput(expiry: number) {
  return {queueRecord: queueRecord(expiry), dispatchId: "central-live-dispatch:dynamic-mm-1",
    idempotencyKey: "0123456789abcdef0123456789abcdef"};
}

function queueRecord(expiry: number): CentralLiveQueueRecord {
  return {version: "69.0", id: "central-live-queue:dynamic-mm-1", admissionJournalId: "admission:dynamic-mm-1",
    lifecycleHandlerId: "central-two-sided-passive-maker-v72", actionAuthorityId: "operator:dynamic-mm-1",
    actionAuthorityExpiresAt: expiry, approvedCapitalInr: 1_000, state: "DISPATCHING", queuedAt: baseNow - 2_000,
    updatedAt: baseNow - 1_000, attempts: 1, leaseId: null, leasedBy: null, leaseExpiresAt: null,
    terminalEvidenceId: null, dispatchJournalId: "central-live-dispatch:dynamic-mm-1", dispatchStartedAt: baseNow - 1_000, executionStarted: true,
    orderSubmissionPerformed: false, plan: {version: "35.0", id: "central-plan:dynamic-mm-1",
      strategyId: "dynamic-market-making", signalId: "dynamic-mm-signal-1",
      signalKind: "DYNAMIC_MARKET_MAKING_SHADOW_QUOTE_PLAN", routeFamily: "SPOT_MARKET_MAKING",
      pattern: "TWO_SIDED_PASSIVE_MAKER", settlementPolicy: {kind: "TWO_SIDED_PASSIVE_FILL_CYCLE",
        lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR", requiresEveryPassiveFillEvidence: true},
      executionOwner: "CENTRAL_SHARED_ORCHESTRATOR", compilationState: "COMPILED_SHADOW", promotionState: "BLOCKED",
      generatedAt: baseNow - 2_000, expiresAt: expiry,
      legs: [
        {id: "dynamic-bid", sequence: 1, exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "BUY",
          orderType: "LIMIT_POST_ONLY", quantity: 0.1, referencePrice: 99, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
        {id: "dynamic-ask", sequence: 2, exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "SELL",
          orderType: "LIMIT_POST_ONLY", quantity: 0.1, referencePrice: 101, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
      ], modeledNetValue: 0.2, modeledNetValueUnit: "PERCENT_ONLY",
      executionReadinessBlockers: ["QUEUE_POSITION_UNKNOWN", "POST_ONLY_EXECUTION_UNVERIFIED"],
      sourceExecutionAuthorized: false, capitalReservationAllowed: false, riskApprovalGranted: false,
      executionHandoffAllowed: false, automaticExecutionAllowed: false, paperExecutionAllowed: false,
      liveExecutionAllowed: false, orderSubmissionAllowed: false}};
}

function requireRequest(requests: ReadonlyMap<string, LiveExecutionRequest>, orderId: string): LiveExecutionRequest {
  const request = requests.get(orderId); if (!request) throw new Error(`Missing fixture request: ${orderId}`); return request;
}
function round(value: number): number { return Number(value.toFixed(12)); }

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
