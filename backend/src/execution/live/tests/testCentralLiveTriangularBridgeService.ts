import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {StrategySignal, TriangularArbitrageStrategySignal} from "../../../strategies/models/StrategySignal";
import {createTriangularArbitrageConfiguration} from "../../../strategies/triangular-arbitrage/TriangularArbitrageConfiguration";
import type {AclaCapitalLoopManager} from "../../../strategies/triangular-arbitrage/AclaCapitalLoopManager";
import type {TriangularArbitrageStrategyController} from "../../../strategies/triangular-arbitrage/TriangularArbitrageStrategyController";
import {
  CENTRAL_LIVE_ACTION_CONFIRMATION,
} from "../central/CentralLiveExecutionAdmissionService";
import {CentralLiveOperatorConfirmationService} from "../central/CentralLiveOperatorConfirmationService";
import {CentralLiveTriangularBridgeService} from "../central/CentralLiveTriangularBridgeService";
import {liveExecutionService} from "../LiveExecutionService";
import {exchangeCapabilityService} from "../../capabilities/services/ExchangeCapabilityService";
import {orderBookCache} from "../../../orderbook/cache/OrderBookCache";
import {replaceExchangeMarketFeeEvidence} from "../../../arbitrage/config/fees";
import type {LiveExecutionAdapter, LiveExecutionAdapterCapabilities, LiveExecutionAdapterReadiness} from "../contracts/LiveExecutionAdapter";
import type {LiveExecutionResult} from "../models/LiveExecutionResult";
import type {ExchangeCapabilityProvider} from "../../capabilities/providers/ExchangeCapabilityProvider";
import type {ExchangeMarketCapability} from "../../capabilities/models/ExchangeCapability";

const TEST_EXCHANGE = "central-live-triangular-bridge-test-exchange";

function capability(market: string, synchronizedAt: number): ExchangeMarketCapability {
  return {exchange: TEST_EXCHANGE, market, baseAsset: market.slice(0, 3), quoteAsset: market.slice(3),
    product: "spot", tradingEnabled: true, maintenanceMode: false,
    order: {supportedOrderTypes: ["market"], supportedTimeInForce: ["GTC"], supportsPostOnly: false,
      supportsClientOrderId: true, supportsOrderCancellation: true, supportsOrderStatusPolling: true},
    price: {minimumPrice: 0.000001, maximumPrice: null, priceStep: 0.000001, pricePrecision: 6},
    quantity: {minimumQuantity: 0.0001, maximumQuantity: 1_000, quantityStep: 0.0001, quantityPrecision: 4},
    notional: {minimumNotional: 1, maximumNotional: null}, fees: {makerFeeRate: 0.001, takerFeeRate: 0.001, feeAsset: null},
    sourceUpdatedAt: synchronizedAt, synchronizedAt};
}

function verifiedAdapter(): LiveExecutionAdapter {
  const readiness: LiveExecutionAdapterReadiness = {credentialsConfigured: true, authenticationVerified: true,
    exchangeApiReachable: true, verificationState: "VERIFIED", readOnlyVerificationFresh: true,
    lastVerifiedAt: Date.now(), lastVerificationAttemptAt: Date.now(), verificationExpiresAt: Date.now() + 60_000,
    verificationMethod: "SIGNED_BALANCE_READ", lastVerificationError: null};
  const capabilities: LiveExecutionAdapterCapabilities = {products: ["SPOT"], supportsMarketOrders: true,
    supportsLimitOrders: true, supportsPostOnly: false, supportsOrderStatus: true, supportsCancellation: true,
    supportsAmendKeepPriority: false, supportsReduceOnly: false};
  return {
    exchange: TEST_EXCHANGE,
    getCapabilities: () => capabilities,
    getReadiness: () => readiness,
    async execute(request): Promise<LiveExecutionResult> {
      const now = Date.now();
      return {success: true, exchange: TEST_EXCHANGE, market: request.market, side: request.side, orderId: `bridge-test-order:${now}:${Math.random()}`,
        clientOrderId: request.clientOrderId ?? null, status: "FILLED", requestedQuantity: request.quantity,
        filledQuantity: request.quantity, remainingQuantity: 0, requestedPrice: null, averageFillPrice: 1,
        feeAmount: request.quantity * 0.001, cancelled: false, timedOut: false, startedAt: now, completedAt: now,
        executionTimeMs: 1, failureReason: null, reasons: []};
    },
    async getOrderStatus() { throw new Error("Not used by this test."); },
    async cancelOrder() { throw new Error("Not used by this test."); },
  };
}

async function seedRealSingletonsForFullyReadyLegs(): Promise<void> {
  liveExecutionService.register(verifiedAdapter());
  const synchronizedAt = Date.now();
  const markets = ["BTCUSD", "ETHBTC", "ETHUSD"];
  const provider: ExchangeCapabilityProvider = {
    exchange: TEST_EXCHANGE,
    async getCapabilities() { return markets.map((market) => capability(market, synchronizedAt)); },
    async getCapability(market: string) { return capability(market, synchronizedAt); },
    isSynchronized: () => true,
    getLastSynchronizationTime: () => synchronizedAt,
    invalidateCache: () => {},
  };
  exchangeCapabilityService.registerProvider(provider);
  for (const market of markets) {
    await exchangeCapabilityService.getCapability({exchange: TEST_EXCHANGE, market, product: "spot"});
    orderBookCache.set({exchange: TEST_EXCHANGE, market, bids: [{price: 1, quantity: 1_000}],
      asks: [{price: 1.001, quantity: 1_000}], timestamp: Date.now()});
  }
  replaceExchangeMarketFeeEvidence(TEST_EXCHANGE, markets.map((market) => ({
    exchange: TEST_EXCHANGE, market, makerPercent: 0.1, takerPercent: 0.1,
    source: "PUBLIC_API" as const, synchronizedAt: Date.now(), expiresAt: Date.now() + 3_600_000,
  })));
}

function triangularSignal(id: string): TriangularArbitrageStrategySignal {
  const now = Date.now();
  const leg = (market: string, fromAsset: string, toAsset: string, action: "BUY_BASE" | "SELL_BASE") => ({
    market, fromAsset, toAsset, action, inputQuantity: 100, tradedInputQuantity: 100, outputBeforeFee: 100.5,
    feePercent: 0.1, feeAmount: 0.1, outputAfterFee: 100.4, feeAsset: toAsset, averageFillPrice: 1, topOfBookPrice: 1,
    depthSlippagePercent: 0, roundingDustInputQuantity: 0, consumedDepthLevels: 1, orderBookTimestamp: now,
    orderBookAgeMs: 0, topOfBookMaximumInput: 1_000, capabilitySynchronizedAt: now,
    executionPolicy: "FOK_OR_IOC_LIMIT_FUTURE_ONLY" as const,
  });
  return {
    id, strategyId: "triangular-arbitrage", kind: "TRIANGULAR_ARBITRAGE_SHADOW_PATH",
    evidenceStatus: "AVAILABLE", source: "DynamicOpportunityDiscovery", sourceSnapshotGeneratedAt: now,
    generatedAt: now, observedAt: now, expiresAt: now + 60_000, executionAuthorized: false,
    automaticExecutionAllowed: false,
    evidence: {
      pathId: `path:${id}`, exchange: TEST_EXCHANGE, startAsset: "USDT",
      assets: ["USDT", "BTC", "ETH", "USDT"], initialInputQuantity: 100, finalOutputQuantity: 101,
      expectedNetProfitQuantity: 1, expectedNetProfitPercent: 1, netProfitQuantity: 1, netProfitPercent: 1,
      stressNetProfitQuantity: 0.5, stressNetProfitPercent: 0.5, absoluteNetProfitInr: 85,
      tdsCapitalLockInr: 1, reserveDragPercent: 0.05, maximumBookSkewMs: 50, minimumNetProfitPercent: 0.25,
      referenceGrossMultiplier: 1.01, computedNetMultiplier: 1.005,
      legs: [
        leg("BTCUSD", "USDT", "BTC", "BUY_BASE"),
        leg("ETHBTC", "BTC", "ETH", "SELL_BASE"),
        leg("ETHUSD", "ETH", "USDT", "SELL_BASE"),
      ],
      feesApplied: true, marketRulesApplied: true, topOfBookDepthApplied: true, fullDepthVwapApplied: true,
      stressTestApplied: true, tdsTreatedAsCapitalLock: true, lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR",
      capitalOwner: "ACLA_STRATEGY_SCOPED_SUBLEDGER",
    },
  };
}

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-central-live-bridge-"));
  try {
    await seedRealSingletonsForFullyReadyLegs();
    const configuration = createTriangularArbitrageConfiguration({
      enabled: true, allowedExchanges: [TEST_EXCHANGE], allowedStartingAssets: ["USDT"], minimumNetProfitPercent: 0.25,
      capitalPool: {totalAllocationInr: 1_000, activeCycleCapitalInr: 850, recoveryReserveInr: 100, feeTdsDustReserveInr: 50},
      startAssetInrValues: {USDT: 85},
    });

    let listener: ((signal: StrategySignal) => void) | null = null;
    let unsubscribeCalls = 0;
    const controller: Pick<TriangularArbitrageStrategyController, "subscribeToSignals" | "getConfiguration"> = {
      subscribeToSignals(handler) { listener = handler; return () => { unsubscribeCalls += 1; listener = null; }; },
      getConfiguration: () => configuration,
    };
    function emit(signal: StrategySignal): void {
      if (!listener) throw new Error("No listener is currently subscribed.");
      listener(signal);
    }
    const capitalLoopManager: Pick<AclaCapitalLoopManager, "getReport"> = {
      getReport: () => ({pool: {activeFreeInr: 10_000}} as never),
    };
    const confirmations = new CentralLiveOperatorConfirmationService(30_000, join(directory, "arms.jsonl"));

    const bridge = new CentralLiveTriangularBridgeService(controller, confirmations, capitalLoopManager);
    assert.equal(bridge.isRunning(), false);
    bridge.start();
    assert.equal(bridge.isRunning(), true);
    assert.ok(listener, "start() must subscribe to the real controller's signal stream.");

    // This process has no real closed/posted PAPER cycle for
    // triangular-arbitrage (that pipeline is exercised separately in
    // testCentralPaperTriangularCycleAccounting.ts), so the real
    // CentralPaperSoakAcceptanceService the evidence collector reads will
    // always report NO_DATA here - the candidate can never legitimately
    // reach `ready: true` in this test process. That is itself the
    // property this test locks in: real soak evidence cannot be
    // conjured cheaply, not even from inside a test, so an operator arm
    // must never be able to substitute for it.
    emit(triangularSignal("bridge-test-signal-unarmed"));
    const unarmedDiagnostics = bridge.getDiagnostics();
    assert.ok(unarmedDiagnostics.latestCandidate, "The bridge must record every compiled signal as a candidate, even one that will not qualify.");
    assert.equal(unarmedDiagnostics.latestCandidate?.ready, false);
    assert.equal(unarmedDiagnostics.recentOutcomes.length, 0,
      "An unqualified opportunity with no operator arm present must remain a read-only candidate - it must never be intaken or dispatched.");

    confirmations.arm("triangular-arbitrage", CENTRAL_LIVE_ACTION_CONFIRMATION);
    emit(triangularSignal("bridge-test-signal-armed-but-unqualified"));
    const armedButUnqualifiedDiagnostics = bridge.getDiagnostics();
    assert.equal(armedButUnqualifiedDiagnostics.recentOutcomes.length, 0,
      "A real operator arm must never substitute for a missing real evidence check (here: PAPER soak) - an unqualified plan must stay uninitaken even while armed.");
    assert.equal(confirmations.getStatus("triangular-arbitrage").currentlyArmed, true,
      "The arm must remain available, unconsumed, when the candidate it could have authorized never qualified - it was never claimed, so it is not spent.");

    bridge.stop();
    assert.equal(bridge.isRunning(), false);
    assert.equal(unsubscribeCalls, 1);
    assert.equal(listener, null, "stop() must actually unsubscribe from the real controller, not merely flip a flag.");

    console.log("CENTRAL LIVE TRIANGULAR BRIDGE SERVICE TEST PASSED.");
    console.log("A compiled candidate stayed read-only both with no arm and with an arm present but real evidence (PAPER soak) still unmet, the unclaimed arm remained available rather than being silently spent, and stop() genuinely unsubscribed from the controller; no order was ever placed and no evidence check was ever bypassed by an operator arm.");
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
