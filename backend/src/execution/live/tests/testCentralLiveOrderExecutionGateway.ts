import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {LiveExecutionAdapter} from "../contracts/LiveExecutionAdapter";
import {CentralLiveOrderExecutionGateway, type CentralPrivateFillOwnershipPort} from "../central/CentralLiveOrderExecutionGateway";
import type {OrderFillFeeEvidence} from "../evidence/OrderFillFeeEvidenceService";
import type {LiveExecutionRequest} from "../models/LiveExecutionRequest";
import type {LiveExecutionResult} from "../models/LiveExecutionResult";

const now = 1_780_700_000_000;

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-live-order-gateway-"));
  try {
    await testJournalBeforeIoAndRestartReconciliation(join(directory, "complete.jsonl"));
    await testUnknownSubmissionNeverRetries(join(directory, "uncertain.jsonl"));
    await testDisabledGatewayPerformsNoIo(join(directory, "disabled.jsonl"));
    await testPrivateFillIdentityBeforeIo(join(directory, "private-fill-identity.jsonl"));
    await testConfirmedPreAcceptRejectionDisposesOwnershipAndReplays(join(directory, "confirmed-reject.jsonl"),
      join(directory, "unconfirmed-failure.jsonl"));
    await testTimingObserverCannotChangeOutcome(join(directory, "timing-failure.jsonl"));
    console.log("CENTRAL LIVE ORDER EXECUTION GATEWAY TEST PASSED.");
    console.log("Journal-before-I/O, exact request hashing, restart reconciliation, authoritative fill-fee binding, and no automatic retry after unknown submission passed using fixtures; no external order occurred.");
  } finally { rmSync(directory, {recursive: true, force: true}); }
}

async function testTimingObserverCannotChangeOutcome(file: string): Promise<void> {
  const request: LiveExecutionRequest = {exchange: "binance", product: "SPOT", market: "ETHUSDT", side: "buy",
    orderType: "limit", quantity: 0.01, price: 3_000, clientOrderId: "timing-failure-isolation",
    cancelOnTimeout: false};
  const adapter = createAdapter({async execute(input) {
    return {...result(input), status: "OPEN", filledQuantity: 0, remainingQuantity: input.quantity,
      averageFillPrice: 0, feeAmount: 0};
  }});
  const gateway = new CentralLiveOrderExecutionGateway({enabled: true}, createRuntime(adapter),
    {async inspect() { return feeEvidence(); }}, file, null, {
      observeGatewayResult() { throw new Error("Fixture timing observer failed."); },
      recordObserverFailure() { throw new Error("Fixture timing failure counter failed."); },
    });
  const response = await gateway.executeOrReconcile({request,
    idempotencyKey: "dispatch:timing:failure-isolation", allowNewSubmission: true, now});
  assert.equal(response.state, "OPEN");
  assert.equal(response.record?.result?.status, "OPEN");
  assert.equal(response.record?.lastError, null);
}

async function testPrivateFillIdentityBeforeIo(file: string): Promise<void> {
  const sequence: string[] = [];
  let durableClientOrderId: string | null = null;
  const request: LiveExecutionRequest = {exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "buy",
    orderType: "limit", quantity: 0.001, price: 50_000, postOnly: true, cancelOnTimeout: false};
  const adapter = createAdapter({async execute(input) {
    sequence.push("exchange-io"); assert.equal(sequence[0], "private-binding");
    durableClientOrderId = input.clientOrderId ?? null;
    return {...result(input), status: "OPEN", filledQuantity: 0, remainingQuantity: input.quantity,
      averageFillPrice: 0, feeAmount: 0};
  }});
  const ownership = {registerBeforeIo(input: {readonly request: LiveExecutionRequest}) {
    sequence.push("private-binding"); assert.ok(input.request.clientOrderId); durableClientOrderId = input.request.clientOrderId ?? null;
  }, attachExchangeOrderId(input: {readonly exchangeOrderId: string}) {
    sequence.push("exchange-id-attached"); assert.equal(input.exchangeOrderId, "12345");
  }, recordConfirmedPreAcceptRejection() {
    throw new Error("Accepted order must not be terminalized as a confirmed rejection.");
  }};
  const gateway = new CentralLiveOrderExecutionGateway({enabled: true}, createRuntime(adapter),
    {async inspect() { return feeEvidence(); }}, file, ownership);
  const response = await gateway.executeOrReconcile({request, idempotencyKey: "dispatch:spot:private-fill:binance",
    allowNewSubmission: true, now});
  assert.equal(response.state, "OPEN");
  assert.deepEqual(sequence, ["private-binding", "exchange-io", "exchange-id-attached"]);
  assert.match(durableClientOrderId ?? "", /^cat-[a-f0-9]{28}$/u);
  assert.equal(response.record?.request.clientOrderId, durableClientOrderId);
}

async function testConfirmedPreAcceptRejectionDisposesOwnershipAndReplays(
  confirmedFile: string, unconfirmedFile: string,
): Promise<void> {
  const request: LiveExecutionRequest = {exchange: "binance", product: "SPOT", market: "TUTUSDT", side: "sell",
    orderType: "limit", timeInForce: "FOK", quantity: 138, price: 0.03572,
    clientOrderId: "confirmed-reject-client", cancelOnTimeout: false};
  const adapter = createAdapter({async execute(input) { return failedResult(input,
    "Binance POST /api/v3/order failed: status=400, code=-1111, message=Parameter 'price' has too much precision."); }});
  const initialOwnership = rejectionOwnership();
  const gateway = new CentralLiveOrderExecutionGateway({enabled: true}, createRuntime(adapter),
    {async inspect() { return feeEvidence(); }}, confirmedFile, initialOwnership.port);
  const response = await gateway.executeOrReconcile({request,
    idempotencyKey: "recovery:confirmed-reject:binance", allowNewSubmission: true, now});

  assert.equal(response.state, "READY");
  assert.equal(response.record?.state, "FEE_RECONCILED");
  assert.equal(initialOwnership.registrations.length, 1);
  assert.equal(initialOwnership.rejections.length, 1);
  assert.equal(initialOwnership.rejections[0]?.lifecycleOrderId, response.record?.id);
  assert.equal(initialOwnership.rejections[0]?.exchangeHttpStatus, 400);
  assert.equal(initialOwnership.rejections[0]?.exchangeCode, "-1111");
  assert.match(initialOwnership.rejections[0]?.evidenceDigest ?? "", /^[a-f0-9]{64}$/u);

  const restoredOwnership = rejectionOwnership();
  new CentralLiveOrderExecutionGateway({enabled: true}, createRuntime(adapter),
    {async inspect() { return feeEvidence(); }}, confirmedFile, restoredOwnership.port);
  assert.equal(restoredOwnership.registrations.length, 0);
  assert.equal(restoredOwnership.rejections.length, 1);
  assert.deepEqual(restoredOwnership.rejections[0], initialOwnership.rejections[0]);

  const unconfirmedOwnership = rejectionOwnership();
  const unconfirmedAdapter = createAdapter({async execute(input) { return failedResult(input,
    "Binance POST /api/v3/order failed: status=500, code=-1000, message=Unknown server error."); }});
  const unconfirmed = new CentralLiveOrderExecutionGateway({enabled: true}, createRuntime(unconfirmedAdapter),
    {async inspect() { return feeEvidence(); }}, unconfirmedFile, unconfirmedOwnership.port);
  await unconfirmed.executeOrReconcile({request: {...request, clientOrderId: "unconfirmed-failure-client"},
    idempotencyKey: "recovery:unconfirmed-failure:binance", allowNewSubmission: true, now});
  assert.equal(unconfirmedOwnership.registrations.length, 1);
  assert.equal(unconfirmedOwnership.rejections.length, 0);
}

function rejectionOwnership(): {
  readonly port: CentralPrivateFillOwnershipPort;
  readonly registrations: Array<{readonly lifecycleOrderId: string}>;
  readonly rejections: Array<{readonly lifecycleOrderId: string; readonly exchangeHttpStatus: number;
    readonly exchangeCode: string; readonly evidenceDigest: string; readonly capturedAt: number}>;
} {
  const registrations: Array<{readonly lifecycleOrderId: string}> = [];
  const rejections: Array<{readonly lifecycleOrderId: string; readonly exchangeHttpStatus: number;
    readonly exchangeCode: string; readonly evidenceDigest: string; readonly capturedAt: number}> = [];
  const port: CentralPrivateFillOwnershipPort = {
    registerBeforeIo(input) { registrations.push({lifecycleOrderId: input.lifecycleOrderId}); },
    attachExchangeOrderId() { throw new Error("Confirmed reject fixture must not receive an exchange order ID."); },
    recordConfirmedPreAcceptRejection(input) { rejections.push({...input}); },
  };
  return {port, registrations, rejections};
}

async function testJournalBeforeIoAndRestartReconciliation(file: string): Promise<void> {
  let submissions = 0; let reads = 0; const request = orderRequest();
  const adapter = createAdapter({async execute(input) { submissions += 1; return result(input); },
    async getOrderStatus() { reads += 1; return result(request); }});
  const runtime = createRuntime(adapter);
  const feePort = {async inspect() { return feeEvidence(); }};
  const gateway = new CentralLiveOrderExecutionGateway({enabled: true}, runtime, feePort, file);
  const first = await gateway.executeOrReconcile({request, idempotencyKey: "dispatch:funding:entry:binance", allowNewSubmission: true, now});
  assert.equal(first.state, "READY"); assert.equal(submissions, 1);
  assert.equal(first.record?.state, "FEE_RECONCILED");
  assert.equal(first.record?.feeEvidence?.fees[0]?.amount, 0.2);

  const restored = new CentralLiveOrderExecutionGateway({enabled: true}, runtime, feePort, file);
  const second = await restored.executeOrReconcile({request, idempotencyKey: "dispatch:funding:entry:binance",
    allowNewSubmission: true, now: now + 100});
  assert.equal(second.state, "READY"); assert.equal(submissions, 1); assert.equal(reads, 1);
  assert.equal(second.record?.id, first.record?.id);
  await assert.rejects(() => restored.executeOrReconcile({request: {...request, quantity: 0.02},
    idempotencyKey: "dispatch:funding:entry:binance", allowNewSubmission: true, now: now + 200}), /request hash changed/u);
}

async function testUnknownSubmissionNeverRetries(file: string): Promise<void> {
  let submissions = 0;
  const adapter = createAdapter({async execute() { submissions += 1; throw new Error("Fixture lost response after possible acceptance."); }});
  const runtime = createRuntime(adapter); const feePort = {async inspect() { return feeEvidence(); }};
  const firstGateway = new CentralLiveOrderExecutionGateway({enabled: true}, runtime, feePort, file);
  const first = await firstGateway.executeOrReconcile({request: orderRequest(),
    idempotencyKey: "dispatch:uncertain:entry:binance", allowNewSubmission: true, now});
  assert.equal(first.state, "UNCERTAIN_SUBMISSION"); assert.equal(submissions, 1);
  const restored = new CentralLiveOrderExecutionGateway({enabled: true}, runtime, feePort, file);
  const resumed = await restored.executeOrReconcile({request: orderRequest(),
    idempotencyKey: "dispatch:uncertain:entry:binance", allowNewSubmission: true, now: now + 100});
  assert.equal(resumed.state, "UNCERTAIN_SUBMISSION"); assert.equal(submissions, 1);
  assert.equal(resumed.record?.state, "SUBMISSION_UNCERTAIN");
}

async function testDisabledGatewayPerformsNoIo(file: string): Promise<void> {
  let submissions = 0; const adapter = createAdapter({async execute(input) { submissions += 1; return result(input); }});
  const gateway = new CentralLiveOrderExecutionGateway({enabled: false}, createRuntime(adapter),
    {async inspect() { return feeEvidence(); }}, file);
  const blocked = await gateway.executeOrReconcile({request: orderRequest(),
    idempotencyKey: "dispatch:disabled:entry:binance", allowNewSubmission: true, now});
  assert.equal(blocked.state, "BLOCKED"); assert.equal(blocked.record, null); assert.equal(submissions, 0);
  assert.equal(gateway.getDiagnostics(now).records, 0);
}

function createRuntime(adapter: LiveExecutionAdapter) {
  return {getAdapter: () => adapter, getExchangeStatus: () => ({exchange: "binance", adapterRegistered: true,
    capabilities: adapter.getCapabilities(), credentialsConfigured: true, authenticationVerified: true,
    exchangeApiReachable: true, verificationState: "VERIFIED" as const, readOnlyVerificationFresh: true,
    lastVerifiedAt: now - 100, lastVerificationAttemptAt: now - 100, verificationExpiresAt: now + 10_000,
    verificationMethod: "SIGNED_BALANCE_READ" as const, lastVerificationError: null, liveExecutionEnabled: false as const,
    adapterConnected: false})};
}

function createAdapter(overrides: Partial<LiveExecutionAdapter>): LiveExecutionAdapter {
  return {exchange: "binance", getCapabilities: () => ({products: ["SPOT", "PERPETUAL"], supportsMarketOrders: true,
    supportsLimitOrders: true, supportsPostOnly: true, supportsOrderStatus: true, supportsCancellation: true,
    supportsAmendKeepPriority: false, supportsReduceOnly: true}),
  async execute(input) { return result(input); }, async getOrderStatus() { return result(orderRequest()); },
  async cancelOrder() { return {...result(orderRequest()), status: "CANCELLED", success: false, cancelled: true}; },
  getReadiness: () => ({credentialsConfigured: true, authenticationVerified: true, exchangeApiReachable: true,
    verificationState: "VERIFIED", readOnlyVerificationFresh: true, lastVerifiedAt: now - 100,
    lastVerificationAttemptAt: now - 100, verificationExpiresAt: now + 10_000,
    verificationMethod: "SIGNED_BALANCE_READ", lastVerificationError: null}), ...overrides};
}

function orderRequest(): LiveExecutionRequest {
  return {exchange: "binance", product: "PERPETUAL", market: "BTCUSDT", side: "buy", orderType: "market",
    quantity: 0.01, clientOrderId: "funding-entry-binance", cancelOnTimeout: false,
    reduceOnly: false, positionMode: "ONE_WAY", positionSide: "LONG"};
}

function result(request: LiveExecutionRequest): LiveExecutionResult {
  return {success: true, exchange: request.exchange, product: request.product, reduceOnly: request.reduceOnly,
    positionMode: request.positionMode, positionSide: request.positionSide, market: request.market, side: request.side,
    orderId: "12345", clientOrderId: request.clientOrderId ?? null, status: "FILLED", requestedQuantity: request.quantity,
    filledQuantity: request.quantity, remainingQuantity: 0, requestedPrice: null, averageFillPrice: 50_000,
    feeAmount: 0, cancelled: false, timedOut: false, startedAt: now, completedAt: now,
    executionTimeMs: 0, failureReason: null, reasons: []};
}

function failedResult(request: LiveExecutionRequest, failureReason: string): LiveExecutionResult {
  return {success: false, exchange: request.exchange, product: request.product, market: request.market,
    side: request.side, orderId: null, clientOrderId: request.clientOrderId ?? null, status: "FAILED",
    requestedQuantity: request.quantity, filledQuantity: 0, remainingQuantity: request.quantity,
    requestedPrice: request.price ?? null, averageFillPrice: 0, feeAmount: 0, cancelled: false, timedOut: false,
    startedAt: now, completedAt: now + 1, executionTimeMs: 1, failureReason,
    reasons: ["Fixture exchange rejection."]};
}

function feeEvidence(): OrderFillFeeEvidence {
  return {version: "75.0", id: "fill-fee:fixture", exchange: "binance", product: "PERPETUAL", market: "BTCUSDT",
    orderId: "12345", generatedAt: now, expectedFilledQuantity: 0.01, observedFilledQuantity: 0.01,
    observedQuoteQuantity: 500, averageFillPrice: 50_000, fills: [{executionId: "trade-1", orderId: "12345",
      exchange: "binance", product: "PERPETUAL", market: "BTCUSDT", price: 50_000, quantity: 0.01,
      quoteQuantity: 500, feeAsset: "USDT", feeAmount: 0.2, maker: false, executedAt: now,
      additionalFeeMetadataPresent: false}], fees: [{asset: "USDT", amount: 0.2}], withholdings: [],
    quoteAsset: "USDT", totalFeeQuoteAmount: 0.2, totalWithholdingQuoteAmount: 0,
    totalCashDeductionQuoteAmount: 0.2, withholdingEvidenceComplete: true, complete: true, blockers: [],
    source: "BINANCE_USDM_ACCOUNT_TRADES"};
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
