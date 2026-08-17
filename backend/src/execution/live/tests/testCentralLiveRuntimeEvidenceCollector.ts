import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {CentralStrategyExecutionPlan} from "../../../strategies/models/CentralStrategyExecutionPlan";
import {CentralLiveLifecycleEvidenceStore} from "../central/CentralLiveLifecycleEvidenceStore";
import {CentralLiveRuntimeEvidenceCollector} from "../evidence/CentralLiveRuntimeEvidenceCollector";

const now = 1_780_600_000_000;

function main(): void {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-runtime-evidence-"));
  try {
    const store = new CentralLiveLifecycleEvidenceStore(join(directory, "evidence.jsonl"));
    const collector = new CentralLiveRuntimeEvidenceCollector(store);
    const passive = collector.sealPassiveMakerAdmission(passivePlan(), {generatedAt: now - 100, expiresAt: now + 5_000,
      baseAsset: "BTC", quoteAsset: "USDT", makerPrice: 99, makerQuantity: 0.1, bestBid: 99, bestAsk: 100,
      marketRulesFresh: true, feeScheduleFresh: true, authenticatedInventoryFresh: true,
      maximumBaseFeeQuantity: 0.001, maximumQuoteFeeQuantity: 1, thirdAssetFeeBalanceVerified: false,
      baseQuantityTolerance: 0.000001, maximumUnpairedBaseExposure: 0.001}, now);
    assert.ok(passive.evidenceId.startsWith("central-live-runtime:"));
    assert.throws(() => collector.sealPassiveMakerAdmission(passivePlan(), {...passive, makerPrice: 101}, now),
      /non-marketable|exact/u);

    const sequential = collector.sealSequentialSizing(trianglePlan(), "triangle-1", {fromAsset: "USDT", toAsset: "BTC",
      generatedAt: now - 100, expiresAt: now + 5_000, availableInputQuantity: 1_000, requestedBaseQuantity: 0.02,
      maximumExpectedInputQuantity: 1_000, allowedInputDustQuantity: 0.01, marketRulesVerified: true, quoteFresh: true,
      feeScheduleFresh: true, thirdAssetFeeBalanceVerified: false}, now);
    assert.equal(sequential.legId, "triangle-1");
    assert.ok(store.getCurrent("SEQUENTIAL_SIZING", trianglePlan().id, null,
      "sizing:triangle-1:USDT:BTC:1000", now));

    const quote = collector.sealTwoSidedQuote(dynamicPlan(), 0, 0, {cycle: 1, exchange: "binance", market: "BTCUSDT",
      baseAsset: "BTC", quoteAsset: "USDT", generatedAt: now - 100, expiresAt: now + 5_000, bidPrice: 99,
      askPrice: 101, bidQuantity: 0.1, askQuantity: 0.1, bestBid: 99, bestAsk: 101,
      inventoryEvidenceId: "inventory:authenticated:1", inventoryBaseTotal: 1, inventoryBaseAvailable: 1,
      inventoryQuoteAvailable: 10_000, minimumBaseInventory: 0.5, maximumBaseInventory: 1.5,
      maximumUnpairedBaseExposure: 0.1, maximumBaseFeeQuantity: 0.001, maximumQuoteFeeQuantity: 1,
      baseQuantityTolerance: 0.000001, marketRulesVerified: true, authenticatedInventoryFresh: true, quoteFresh: true,
      feeScheduleFresh: true, empiricalFillEvidenceFresh: true, thirdAssetFeeBalanceVerified: false}, now);
    assert.equal(quote.cycle, 1);

    const entry = collector.sealDerivativeEntry(derivativePlan(), {generatedAt: now - 100, expiresAt: now + 5_000, legs: [
      {legId: "spot", product: "SPOT", positionMode: null, positionSide: null, currentSignedPositionQuantity: null,
        positionEvidenceId: null, accountEvidenceId: "spot-account:1", authenticatedReadFresh: true,
        balanceOrMarginSufficient: true, marketRulesFresh: true, quoteAndDepthFresh: true, feeScheduleFresh: true,
        liquidationControlReady: false, reduceOnlyExitVerified: false},
      {legId: "perp", product: "PERPETUAL", positionMode: "ONE_WAY", positionSide: "SHORT",
        currentSignedPositionQuantity: 0, positionEvidenceId: "position:flat:1", accountEvidenceId: "margin:1",
        authenticatedReadFresh: true, balanceOrMarginSufficient: true, marketRulesFresh: true, quoteAndDepthFresh: true,
        feeScheduleFresh: true, liquidationControlReady: true, reduceOnlyExitVerified: true},
    ]}, now);
    assert.equal(entry.legs.length, 2);

    const exit = collector.sealDerivativeExit(derivativePlan(), "dispatch:basis:1", "position-group:basis:1",
      {state: "READY_TO_CLOSE", generatedAt: now - 50, expiresAt: now + 5_000, conditionMetric: 0.1,
        conditionThreshold: 0.2, blockers: [], legs: [
          {entryLegId: "spot", product: "SPOT", exchange: "binance", market: "BTCUSDT", side: "SELL", quantity: 0.1,
            referencePrice: 100, positionMode: null, positionSide: null, currentSignedPositionQuantity: 0.1,
            positionEvidenceId: "spot-position:1", fullDepthVerified: true, feeScheduleFresh: true,
            fundingEvidenceIds: [], reduceOnlyVerified: false},
          {entryLegId: "perp", product: "PERPETUAL", exchange: "bybit", market: "BTCUSDT", side: "BUY", quantity: 0.1,
            referencePrice: 100, positionMode: "ONE_WAY", positionSide: "SHORT", currentSignedPositionQuantity: -0.1,
            positionEvidenceId: "perp-position:1", fullDepthVerified: true, feeScheduleFresh: true,
            fundingEvidenceIds: ["funding:settled:1"], reduceOnlyVerified: true},
        ]}, now);
    assert.equal(exit.state, "READY_TO_CLOSE");
    assert.throws(() => collector.sealDerivativeExit(derivativePlan(), "dispatch:basis:2", "position-group:basis:2",
      {...exit, conditionMetric: 0.3}, now), /settlement condition/u);
    assert.equal(collector.getDiagnostics(now).safety.orderSubmissionAllowed, false);
    assert.ok(store.getDiagnostics(now).records >= 5);
    console.log("CENTRAL LIVE RUNTIME EVIDENCE COLLECTOR TEST PASSED.");
    console.log("Exact maker, sequential, two-sided, derivative entry and derivative exit observations were plan-bound and durably sealed; stale/mismatched evidence failed closed and no exchange, capital, queue, authority or order action occurred.");
  } finally { rmSync(directory, {recursive: true, force: true}); }
}

function base(id: string, strategyId: CentralStrategyExecutionPlan["strategyId"], pattern: CentralStrategyExecutionPlan["pattern"]): Omit<CentralStrategyExecutionPlan, "routeFamily" | "settlementPolicy" | "legs"> {
  return {version: "35.0", id, strategyId, signalId: `signal:${id}`, signalKind: strategyId === "cross-exchange-market-making"
    ? "XEMM_SAFE_MAKER_PRICE" : strategyId === "triangular-arbitrage" ? "TRIANGULAR_ARBITRAGE_SHADOW_PATH"
      : strategyId === "dynamic-market-making" ? "DYNAMIC_MARKET_MAKING_SHADOW_QUOTE_PLAN" : "SPOT_PERPETUAL_BASIS_SHADOW_OPPORTUNITY",
  pattern, executionOwner: "CENTRAL_SHARED_ORCHESTRATOR", compilationState: "COMPILED_SHADOW", promotionState: "BLOCKED",
  generatedAt: now - 1_000, expiresAt: now + 20_000, modeledNetValue: 1, modeledNetValueUnit: "QUOTE",
  executionReadinessBlockers: [], sourceExecutionAuthorized: false, capitalReservationAllowed: false, riskApprovalGranted: false,
  executionHandoffAllowed: false, automaticExecutionAllowed: false, paperExecutionAllowed: false,
  liveExecutionAllowed: false, orderSubmissionAllowed: false};
}
function passivePlan(): CentralStrategyExecutionPlan { return {...base("plan:passive", "cross-exchange-market-making", "PASSIVE_MAKER_THEN_HEDGE"),
  routeFamily: "SPOT_TWO_VENUE", settlementPolicy: {kind: "PASSIVE_FILL_THEN_HEDGE_CYCLE", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR", requiresPassiveFillEvidence: true}, legs: [
    {id: "maker", sequence: 1, exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "BUY", orderType: "LIMIT_POST_ONLY", quantity: 0.1, referencePrice: 99, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
    {id: "hedge", sequence: 2, exchange: "bybit", product: "SPOT", market: "BTCUSDT", side: "SELL", orderType: "MARKET", quantity: 0.1, referencePrice: 100, reduceOnly: false, dependency: "PASSIVE_FILL_TRIGGER", evidenceOnly: true}]}; }
function trianglePlan(): CentralStrategyExecutionPlan { return {...base("plan:triangle", "triangular-arbitrage", "SEQUENTIAL_THREE_LEG"),
  routeFamily: "SPOT_TRIANGULAR", settlementPolicy: {kind: "IMMEDIATE_CONVERSION_CYCLE", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR", startAsset: "USDT", initialQuantity: 1_000, modeledFinalQuantity: 1_001, flows: [
    {legId: "triangle-1", fromAsset: "USDT", toAsset: "BTC"}, {legId: "triangle-2", fromAsset: "BTC", toAsset: "ETH"}, {legId: "triangle-3", fromAsset: "ETH", toAsset: "USDT"}]}, legs: [
    {id: "triangle-1", sequence: 1, exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "BUY", orderType: "MARKET", quantity: 0.02, referencePrice: 50_000, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
    {id: "triangle-2", sequence: 2, exchange: "binance", product: "SPOT", market: "ETHBTC", side: "BUY", orderType: "MARKET", quantity: 0.3, referencePrice: 0.06, reduceOnly: false, dependency: "AFTER_PREVIOUS", evidenceOnly: true},
    {id: "triangle-3", sequence: 3, exchange: "binance", product: "SPOT", market: "ETHUSDT", side: "SELL", orderType: "MARKET", quantity: 0.3, referencePrice: 3_000, reduceOnly: false, dependency: "AFTER_PREVIOUS", evidenceOnly: true}]}; }
function dynamicPlan(): CentralStrategyExecutionPlan { return {...base("plan:dynamic", "dynamic-market-making", "TWO_SIDED_PASSIVE_MAKER"),
  routeFamily: "SPOT_MARKET_MAKING", settlementPolicy: {kind: "TWO_SIDED_PASSIVE_FILL_CYCLE", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR", requiresEveryPassiveFillEvidence: true}, legs: [
    {id: "bid", sequence: 1, exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "BUY", orderType: "LIMIT_POST_ONLY", quantity: 0.1, referencePrice: 99, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
    {id: "ask", sequence: 2, exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "SELL", orderType: "LIMIT_POST_ONLY", quantity: 0.1, referencePrice: 101, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true}]}; }
function derivativePlan(): CentralStrategyExecutionPlan { return {...base("plan:basis", "spot-perpetual-basis-arbitrage", "PARALLEL_TWO_LEG"),
  routeFamily: "SPOT_PERPETUAL", settlementPolicy: {kind: "BASIS_CONVERGENCE", lifecycleOwner: "CENTRAL_SHARED_ORCHESTRATOR", entryBasisPercent: 1, closeAtOrBelowAbsoluteBasisPercent: 0.2, fundingTimestamps: [now - 1_000], requiresFundingEvidence: true, forcedTimeExitAllowed: false}, legs: [
    {id: "spot", sequence: 1, exchange: "binance", product: "SPOT", market: "BTCUSDT", side: "BUY", orderType: "MARKET", quantity: 0.1, referencePrice: 99, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true},
    {id: "perp", sequence: 2, exchange: "bybit", product: "PERPETUAL", market: "BTCUSDT", side: "SELL", orderType: "MARKET", quantity: 0.1, referencePrice: 101, reduceOnly: false, dependency: "PARALLEL", evidenceOnly: true}]}; }

main();
