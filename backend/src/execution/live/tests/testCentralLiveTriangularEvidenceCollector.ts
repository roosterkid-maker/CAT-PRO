import assert from "node:assert/strict";
import type {CentralStrategyExecutionPlan} from "../../../strategies/models/CentralStrategyExecutionPlan";
import type {TriangularArbitrageStrategySignal} from "../../../strategies/models/StrategySignal";
import {createTriangularArbitrageConfiguration} from "../../../strategies/triangular-arbitrage/TriangularArbitrageConfiguration";
import type {AclaCapitalLoopManager} from "../../../strategies/triangular-arbitrage/AclaCapitalLoopManager";
import type {CentralPaperSoakAcceptanceService} from "../../../strategies/services/CentralPaperSoakAcceptanceService";
import {CentralLiveLifecycleHandlerRegistry} from "../central/CentralLiveLifecycleHandlerRegistry";
import {CentralLiveTriangularEvidenceCollector} from "../central/CentralLiveTriangularEvidenceCollector";
import {liveExecutionService} from "../LiveExecutionService";
import {exchangeCapabilityService} from "../../capabilities/services/ExchangeCapabilityService";
import {orderBookCache} from "../../../orderbook/cache/OrderBookCache";
import {replaceExchangeMarketFeeEvidence} from "../../../arbitrage/config/fees";
import type {LiveExecutionAdapter, LiveExecutionAdapterCapabilities, LiveExecutionAdapterReadiness} from "../contracts/LiveExecutionAdapter";
import type {ExchangeCapabilityProvider} from "../../capabilities/providers/ExchangeCapabilityProvider";
import type {ExchangeMarketCapability} from "../../capabilities/models/ExchangeCapability";

const now = 1_781_000_000_000;
const TEST_EXCHANGE = "central-live-triangular-test-exchange";

function verifiedAdapter(): LiveExecutionAdapter {
  const readiness: LiveExecutionAdapterReadiness = {credentialsConfigured: true, authenticationVerified: true,
    exchangeApiReachable: true, verificationState: "VERIFIED", readOnlyVerificationFresh: true,
    lastVerifiedAt: now, lastVerificationAttemptAt: now, verificationExpiresAt: now + 60_000,
    verificationMethod: "SIGNED_BALANCE_READ", lastVerificationError: null};
  const capabilities: LiveExecutionAdapterCapabilities = {products: ["SPOT"], supportsMarketOrders: true,
    supportsLimitOrders: true, supportsPostOnly: false, supportsOrderStatus: true, supportsCancellation: true,
    supportsAmendKeepPriority: false, supportsReduceOnly: false};
  return {
    exchange: TEST_EXCHANGE,
    getCapabilities: () => capabilities,
    getReadiness: () => readiness,
    execute: () => { throw new Error("Not used by the evidence collector test."); },
    getOrderStatus: () => { throw new Error("Not used by the evidence collector test."); },
    cancelOrder: () => { throw new Error("Not used by the evidence collector test."); },
  };
}

function capability(market: string): ExchangeMarketCapability {
  return {exchange: TEST_EXCHANGE, market, baseAsset: market.slice(0, 3), quoteAsset: market.slice(3),
    product: "spot", tradingEnabled: true, maintenanceMode: false,
    order: {supportedOrderTypes: ["market"], supportedTimeInForce: ["GTC"], supportsPostOnly: false,
      supportsClientOrderId: true, supportsOrderCancellation: true, supportsOrderStatusPolling: true},
    price: {minimumPrice: 0.000001, maximumPrice: null, priceStep: 0.000001, pricePrecision: 6},
    quantity: {minimumQuantity: 0.0001, maximumQuantity: 1_000, quantityStep: 0.0001, quantityPrecision: 4},
    notional: {minimumNotional: 1, maximumNotional: null}, fees: {makerFeeRate: 0.001, takerFeeRate: 0.001, feeAsset: null},
    sourceUpdatedAt: now, synchronizedAt: now};
}

async function seedRealSingletonsForFullyReadyLegs(): Promise<void> {
  liveExecutionService.register(verifiedAdapter());
  const markets = ["BTCUSD", "ETHBTC", "ETHUSD"];
  const provider: ExchangeCapabilityProvider = {
    exchange: TEST_EXCHANGE,
    async getCapabilities() { return markets.map(capability); },
    async getCapability(market: string) { return capability(market); },
    isSynchronized: () => true,
    getLastSynchronizationTime: () => now,
    invalidateCache: () => {},
  };
  exchangeCapabilityService.registerProvider(provider);
  for (const market of markets) {
    await exchangeCapabilityService.getCapability({exchange: TEST_EXCHANGE, market, product: "spot"});
    orderBookCache.set({exchange: TEST_EXCHANGE, market, bids: [{price: 1, quantity: 1_000}],
      asks: [{price: 1.001, quantity: 1_000}], timestamp: now});
  }
  // getExchangeFeeEvidence's dynamic-evidence freshness check compares
  // expiresAt against the real wall-clock Date.now(), never the synthetic
  // `now` used elsewhere in this test - so this expiry must be anchored to
  // the real clock or it is silently treated as already-expired evidence.
  const realNow = Date.now();
  replaceExchangeMarketFeeEvidence(TEST_EXCHANGE, markets.map((market) => ({
    exchange: TEST_EXCHANGE, market, makerPercent: 0.1, takerPercent: 0.1,
    source: "PUBLIC_API" as const, synchronizedAt: realNow, expiresAt: realNow + 3_600_000,
  })));
}

function triangularPlan(): CentralStrategyExecutionPlan {
  return {
    version: "35.0", id: "central-plan:evidence-collector-test", strategyId: "triangular-arbitrage",
    signalId: "signal:evidence-collector-test", signalKind: "TRIANGULAR_ARBITRAGE_SHADOW_PATH",
    routeFamily: "SPOT_TRIANGULAR", pattern: "SEQUENTIAL_THREE_LEG",
    settlementPolicy: {kind: "IMMEDIATE_CONVERSION_CYCLE", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR",
      startAsset: "USDT", initialQuantity: 100, modeledFinalQuantity: 101, flows: [
        {legId: "leg-1", fromAsset: "USDT", toAsset: "BTC"},
        {legId: "leg-2", fromAsset: "BTC", toAsset: "ETH"},
        {legId: "leg-3", fromAsset: "ETH", toAsset: "USDT"},
      ]},
    executionOwner: "CENTRAL_SHARED_ORCHESTRATOR", compilationState: "COMPILED_SHADOW", promotionState: "BLOCKED",
    generatedAt: now - 1_000, expiresAt: now + 60_000,
    legs: [
      {id: "leg-1", sequence: 1, exchange: TEST_EXCHANGE, product: "SPOT", market: "BTCUSD", side: "BUY", orderType: "MARKET",
        quantity: 100, referencePrice: 1, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
      {id: "leg-2", sequence: 2, exchange: TEST_EXCHANGE, product: "SPOT", market: "ETHBTC", side: "SELL", orderType: "MARKET",
        quantity: 100, referencePrice: 1, reduceOnly: false, dependency: "AFTER_PREVIOUS", evidenceOnly: true},
      {id: "leg-3", sequence: 3, exchange: TEST_EXCHANGE, product: "SPOT", market: "ETHUSD", side: "SELL", orderType: "MARKET",
        quantity: 100, referencePrice: 1, reduceOnly: false, dependency: "AFTER_PREVIOUS", evidenceOnly: true},
    ], modeledNetValue: 1, modeledNetValueUnit: "START_ASSET", executionReadinessBlockers: ["SEQUENTIAL_LEG_FAILURE_RECOVERY_REQUIRED"],
    sourceExecutionAuthorized: false, capitalReservationAllowed: false, riskApprovalGranted: false, executionHandoffAllowed: false,
    automaticExecutionAllowed: false, paperExecutionAllowed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false,
  } as const;
}

function triangularSignal(overrides: Partial<TriangularArbitrageStrategySignal["evidence"]> = {}): TriangularArbitrageStrategySignal {
  const leg = (market: string, fromAsset: string, toAsset: string, action: "BUY_BASE" | "SELL_BASE") => ({
    market, fromAsset, toAsset, action, inputQuantity: 100, tradedInputQuantity: 100, outputBeforeFee: 100.5,
    feePercent: 0.1, feeAmount: 0.1, outputAfterFee: 100.4, feeAsset: toAsset, averageFillPrice: 1, topOfBookPrice: 1,
    depthSlippagePercent: 0, roundingDustInputQuantity: 0, consumedDepthLevels: 1, orderBookTimestamp: now,
    orderBookAgeMs: 0, topOfBookMaximumInput: 1_000, capabilitySynchronizedAt: now,
    executionPolicy: "FOK_OR_IOC_LIMIT_FUTURE_ONLY" as const,
  });
  return {
    id: "signal:evidence-collector-test", strategyId: "triangular-arbitrage", kind: "TRIANGULAR_ARBITRAGE_SHADOW_PATH",
    evidenceStatus: "AVAILABLE", source: "DynamicOpportunityDiscovery", sourceSnapshotGeneratedAt: now - 1_000,
    generatedAt: now - 1_000, observedAt: now - 1_000, expiresAt: now + 60_000, executionAuthorized: false,
    automaticExecutionAllowed: false,
    evidence: {
      pathId: "path:evidence-collector-test", exchange: TEST_EXCHANGE, startAsset: "USDT",
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
      ...overrides,
    },
  };
}

async function main(): Promise<void> {
  await seedRealSingletonsForFullyReadyLegs();
  const configuration = createTriangularArbitrageConfiguration({
    enabled: true, allowedExchanges: [TEST_EXCHANGE], allowedStartingAssets: ["USDT"], minimumNetProfitPercent: 0.25,
    capitalPool: {totalAllocationInr: 1_000, activeCycleCapitalInr: 850, recoveryReserveInr: 100, feeTdsDustReserveInr: 50},
    startAssetInrValues: {USDT: 85},
  });
  const plan = triangularPlan();
  const signal = triangularSignal();

  const acceptedSoak: Pick<CentralPaperSoakAcceptanceService, "getReport"> = {
    getReport: () => ({strategies: [{strategyId: "triangular-arbitrage", state: "SOAK_ACCEPTED", closedCycles: 1, consecutivePasses: 1}]} as never),
  };
  const rejectedSoak: Pick<CentralPaperSoakAcceptanceService, "getReport"> = {
    getReport: () => ({strategies: [{strategyId: "triangular-arbitrage", state: "SOAK_IN_PROGRESS", closedCycles: 0, consecutivePasses: 0}]} as never),
  };
  const ampleCapital: Pick<AclaCapitalLoopManager, "getReport"> = {getReport: () => ({pool: {activeFreeInr: 10_000}} as never)};
  const noCapital: Pick<AclaCapitalLoopManager, "getReport"> = {getReport: () => ({pool: {activeFreeInr: 0}} as never)};
  const registeredRegistry = new CentralLiveLifecycleHandlerRegistry();
  registeredRegistry.register({id: "central-sequential-three-leg-v71", pattern: "SEQUENTIAL_THREE_LEG",
    resume: () => { throw new Error("Not used by this test."); }} as never);
  const emptyRegistry = new CentralLiveLifecycleHandlerRegistry();

  const acceptingCollector = new CentralLiveTriangularEvidenceCollector(ampleCapital, acceptedSoak, registeredRegistry);
  const accepted = acceptingCollector.collect(plan, signal, configuration, now);
  assert.equal(accepted.ok, true, `Expected full evidence acceptance with every real dependency seeded ready; got: ${accepted.ok ? "" : accepted.reasons.join(" | ")}`);
  if (accepted.ok) {
    assert.equal(accepted.evidence.planId, plan.id);
    assert.equal(accepted.evidence.paperSoak.state, "SOAK_ACCEPTED");
    assert.equal(accepted.evidence.capital.approved, true);
    assert.equal(accepted.evidence.capital.reservationMutationPerformed, false);
    assert.equal(accepted.evidence.risk.approved, true);
    assert.ok(accepted.evidence.risk.score >= 70 && accepted.evidence.risk.score <= 100,
      "The admission gate itself requires a risk score in [70,100]; the collector must never emit an out-of-band score for an approved risk.");
    assert.equal(accepted.evidence.legs.length, 3);
    assert.ok(accepted.evidence.legs.every((leg) => leg.adapterRegistered && leg.authenticatedReadFresh &&
      leg.orderTypeSupported && leg.marketRulesFresh && leg.feeEvidenceFresh && leg.quoteFresh));
    assert.equal(accepted.evidence.controls.lifecycleHandlerRegistered, true);
    assert.equal(accepted.evidence.controls.lifecycleHandlerId, "central-sequential-three-leg-v71");
    assert.equal(accepted.evidence.expiresAt, plan.expiresAt);
  }

  const wrongLineage = acceptingCollector.collect(plan, {...signal, id: "signal:different"}, configuration, now);
  assert.equal(wrongLineage.ok, false);
  if (!wrongLineage.ok) assert.ok(wrongLineage.reasons.some((reason) => reason.includes("lineage")));

  const soakBlockedCollector = new CentralLiveTriangularEvidenceCollector(ampleCapital, rejectedSoak, registeredRegistry);
  const soakBlocked = soakBlockedCollector.collect(plan, signal, configuration, now);
  assert.equal(soakBlocked.ok, false);
  if (!soakBlocked.ok) assert.ok(soakBlocked.reasons.some((reason) => reason.includes("PAPER soak is not yet accepted")));

  const capitalBlockedCollector = new CentralLiveTriangularEvidenceCollector(noCapital, acceptedSoak, registeredRegistry);
  const capitalBlocked = capitalBlockedCollector.collect(plan, signal, configuration, now);
  assert.equal(capitalBlocked.ok, false);
  if (!capitalBlocked.ok) assert.ok(capitalBlocked.reasons.some((reason) => reason.includes("does not currently cover")));

  const belowRiskBar = acceptingCollector.collect(plan, triangularSignal({stressNetProfitPercent: 0.1}), configuration, now);
  assert.equal(belowRiskBar.ok, false,
    "A stress net profit below the configured minimumNetProfitPercent must block on risk, never on some unrelated gate.");
  if (!belowRiskBar.ok) assert.ok(belowRiskBar.reasons.some((reason) => reason.includes("risk bar")));

  const overTdsBudget = acceptingCollector.collect(plan, triangularSignal({tdsCapitalLockInr: 1_000}), configuration, now);
  assert.equal(overTdsBudget.ok, false, "A TDS capital lock exceeding the configured dust reserve must block on risk.");

  const unregisteredHandlerCollector = new CentralLiveTriangularEvidenceCollector(ampleCapital, acceptedSoak, emptyRegistry);
  const unregisteredHandler = unregisteredHandlerCollector.collect(plan, signal, configuration, now);
  assert.equal(unregisteredHandler.ok, false);
  if (!unregisteredHandler.ok) assert.ok(unregisteredHandler.reasons.some((reason) => reason.includes("not registered")));

  const unknownExchangePlan = {...plan, legs: plan.legs.map((leg) => ({...leg, exchange: "no-such-exchange"}))};
  const noAdapterResult = acceptingCollector.collect(unknownExchangePlan as CentralStrategyExecutionPlan,
    triangularSignal({exchange: "no-such-exchange"}), configuration, now);
  assert.equal(noAdapterResult.ok, false, "A leg on an exchange with no registered LIVE adapter must fail closed, never assume readiness.");
  if (!noAdapterResult.ok) assert.ok(noAdapterResult.reasons.some((reason) => reason.includes("adapterRegistered=false")));

  const wrongStrategyPlan = {...plan, strategyId: "cross-exchange-market-making"} as unknown as CentralStrategyExecutionPlan;
  const wrongStrategy = acceptingCollector.collect(wrongStrategyPlan, signal, configuration, now);
  assert.equal(wrongStrategy.ok, false);

  console.log("CENTRAL LIVE TRIANGULAR EVIDENCE COLLECTOR TEST PASSED.");
  console.log("Every real gate (paper soak, capital, signal-derived risk, per-exchange leg readiness, lifecycle handler registration, signal/plan lineage) was independently exercised for both acceptance and rejection with real seeded singletons; no PAPER, LIVE, capital or order action occurred.");
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
