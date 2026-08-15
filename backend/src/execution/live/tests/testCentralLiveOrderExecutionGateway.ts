import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {LiveExecutionAdapter} from "../contracts/LiveExecutionAdapter";
import {CentralLiveOrderExecutionGateway} from "../central/CentralLiveOrderExecutionGateway";
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
    console.log("CENTRAL LIVE ORDER EXECUTION GATEWAY TEST PASSED.");
    console.log("Journal-before-I/O, exact request hashing, restart reconciliation, authoritative fill-fee binding, and no automatic retry after unknown submission passed using fixtures; no external order occurred.");
  } finally { rmSync(directory, {recursive: true, force: true}); }
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

function feeEvidence(): OrderFillFeeEvidence {
  return {version: "75.0", id: "fill-fee:fixture", exchange: "binance", product: "PERPETUAL", market: "BTCUSDT",
    orderId: "12345", generatedAt: now, expectedFilledQuantity: 0.01, observedFilledQuantity: 0.01,
    observedQuoteQuantity: 500, averageFillPrice: 50_000, fills: [{executionId: "trade-1", orderId: "12345",
      exchange: "binance", product: "PERPETUAL", market: "BTCUSDT", price: 50_000, quantity: 0.01,
      quoteQuantity: 500, feeAsset: "USDT", feeAmount: 0.2, maker: false, executedAt: now,
      additionalFeeMetadataPresent: false}], fees: [{asset: "USDT", amount: 0.2}], complete: true, blockers: [],
    source: "BINANCE_USDM_ACCOUNT_TRADES"};
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
