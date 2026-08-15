import assert from "node:assert/strict";
import type {DerivativeDepthEvidence} from "../../derivatives/models/DerivativeDepthEvidence";
import type {DerivativeMarketDataSnapshot, DerivativeMarketEvidence} from "../../derivatives/models/DerivativeMarketEvidence";
import type {DerivativeMarketDataSnapshotListener} from "../../derivatives/services/DerivativeMarketDataService";
import {DerivativeFeeEvidenceService} from "../../derivatives/services/DerivativeFeeEvidenceService";
import {StatisticalArbitrageEngine} from "../statistical-arbitrage/StatisticalArbitrageEngine";
import {
  StatisticalArbitrageStrategyController,
  type StatisticalArbitrageMarketSource,
  type StatisticalPairDiscoverySource,
} from "../statistical-arbitrage/StatisticalArbitrageStrategyController";
import type {StatisticalArbitragePair} from "../statistical-arbitrage/StatisticalArbitrageConfiguration";
import type {StatisticalPairDiscoverySnapshot} from "../statistical-arbitrage/StatisticalPairDiscoveryService";

class Source implements StatisticalArbitrageMarketSource {
  private listener: DerivativeMarketDataSnapshotListener | null = null;
  constructor(private value: DerivativeMarketDataSnapshot) {}
  getSnapshot(): DerivativeMarketDataSnapshot { return structuredClone(this.value); }
  subscribe(listener: DerivativeMarketDataSnapshotListener): () => void { this.listener = listener; return () => { if (this.listener === listener) this.listener = null; }; }
  emit(value: DerivativeMarketDataSnapshot): void { this.value = value; this.listener?.(structuredClone(value)); }
}

class ConfirmedPromotionDiscovery implements StatisticalPairDiscoverySource {
  private latest: StatisticalPairDiscoverySnapshot | null = null;
  constructor(private readonly eligible: boolean) {}
  evaluate(_snapshot: DerivativeMarketDataSnapshot, pairs: readonly StatisticalArbitragePair[] = [], now = Date.now()): StatisticalPairDiscoverySnapshot {
    this.latest = {generatedAt: now, selectedPairs: structuredClone(pairs),
      signalEligiblePairs: this.eligible ? structuredClone(pairs) : []} as unknown as StatisticalPairDiscoverySnapshot;
    return this.getSnapshot()!;
  }
  getSnapshot(): StatisticalPairDiscoverySnapshot | null { return this.latest ? structuredClone(this.latest) : null; }
}

function market(symbol: string, mid: number, now: number): DerivativeMarketEvidence {
  const baseAsset = symbol.startsWith("BTC") ? "BTC" : "ETH";
  return {exchange: "binance", market: symbol, baseAsset, quoteAsset: "USDT", settleAsset: "USDT",
    product: "LINEAR_PERPETUAL", tradingEnabled: true, bidPrice: mid - 0.05, bidQuantity: 100,
    askPrice: mid + 0.05, askQuantity: 100, markPrice: mid, indexPrice: mid, fundingRate: 0.0001,
    nextFundingTime: now + 3_600_000, fundingIntervalMinutes: 480, openInterest: 100_000,
    rules: {priceStep: 0.01, quantityStep: 0.001, minimumQuantity: 0.001,
      maximumMarketQuantity: 10_000, minimumNotional: 5, maximumLeverage: 10},
    sourceTimestamp: now, observedAt: now,
    sources: {instrument: "PUBLIC_REST", ticker: "PUBLIC_REST", position: "NO_DATA", margin: "NO_DATA", liquidation: "NO_DATA"},
    execution: {derivativeAdapterRegistered: false, authenticatedReadVerified: false, reduceOnlyVerified: false,
      orderSubmissionAllowed: false, liveExecutionAllowed: false}};
}

function snapshot(leftMid: number, rightMid: number, now: number): DerivativeMarketDataSnapshot {
  return {generatedAt: now, version: "26.0", mode: "PUBLIC_READ_ONLY_DERIVATIVES_FOUNDATION",
    freshnessThresholdMs: 15_000,
    summary: {providers: 1, readyProviders: 1, markets: 2, freshMarkets: 2, exchanges: 1,
      positionEvidenceMarkets: 0, marginEvidenceMarkets: 0, derivativeExecutionAdapters: 0},
    providers: [], markets: [market("BTCUSDT", leftMid, now), market("ETHUSDT", rightMid, now)],
    safety: {publicReadOnly: true, topOfBookOnly: true, fullDepthAvailable: false,
      positionStateAvailable: false, marginStateAvailable: false, liquidationControlAvailable: false,
      reduceOnlyVerified: false, paperExecutionAllowed: false, liveExecutionAllowed: false,
      orderSubmissionAllowed: false}};
}

function depth(marketName: string, now: number): DerivativeDepthEvidence {
  const mid = marketName === "BTCUSDT" ? 130 : 55;
  return {exchange: "binance", market: marketName, product: "LINEAR_PERPETUAL",
    bids: [{price: mid - 0.05, quantity: 100}, {price: mid - 0.10, quantity: 100}],
    asks: [{price: mid + 0.05, quantity: 100}, {price: mid + 0.10, quantity: 100}],
    sourceTimestamp: now, observedAt: now, source: "PUBLIC_REST_FULL_DEPTH",
    executionAuthorized: false, orderSubmissionAllowed: false};
}

async function main(): Promise<void> {
  const now = Date.now();
  const left = [100, 102.1, 104.15, 106.15, 108.1, 130];
  const right = [50, 51, 52, 53, 54, 55];
  const fees = new DerivativeFeeEvidenceService([{exchange: "binance", makerPercent: 0.005, takerPercent: 0.01}], now);
  const engine = new StatisticalArbitrageEngine({
    getDerivativeDepth: (_exchange, marketName, evaluationNow) => depth(marketName, evaluationNow),
    getDerivativeFee: (exchange) => fees.get(exchange),
  });
  const source = new Source(snapshot(left[0]!, right[0]!, now));
  const controller = new StatisticalArbitrageStrategyController({
    enabled: true, pairs: [{pairId: "binance-btc-eth", exchange: "binance", leftMarket: "BTCUSDT", rightMarket: "ETHUSDT"}],
    targetQuoteNotional: 100, minimumBaselineSamples: 5, maximumSamples: 20,
    entryZScoreThreshold: 2, minimumAbsoluteReturnCorrelation: 0.8,
    minimumHedgeBeta: 0.25, maximumHedgeBeta: 4, minimumModeledNetPercent: 0.1,
    safetyBufferPercent: 0.02, maximumEvidenceAgeMs: 10_000,
    maximumEvidenceSkewMs: 1_000, signalTtlMs: 5_000,
  }, source, engine, new ConfirmedPromotionDiscovery(true));
  controller.start();
  assert.equal(controller.getSignals().length, 0);
  for (let index = 1; index < left.length; index += 1) {
    source.emit(snapshot(left[index]!, right[index]!, now + index * 1_000));
  }
  const finalTime = now + 5_000;
  const signals = controller.getSignals(finalTime);
  assert.equal(signals.length, 1, JSON.stringify(controller.getStatisticalSnapshot(), null, 2));
  const signal = signals[0];
  assert.equal(signal?.kind, "STATISTICAL_ARBITRAGE_SHADOW_PAIR");
  if (signal?.kind !== "STATISTICAL_ARBITRAGE_SHADOW_PAIR") throw new Error("Expected statistical-arbitrage SHADOW signal.");
  assert.equal(signal.evidence.direction, "SHORT_LEFT_LONG_RIGHT");
  assert.equal(signal.evidence.baselineSampleCount, 5);
  assert.equal(signal.evidence.baselineExcludesCurrentObservation, true);
  assert.ok(signal.evidence.zScore > 2);
  assert.ok(signal.evidence.returnCorrelation >= 0.8);
  assert.equal(signal.evidence.cointegrationVerified, false);
  assert.equal(signal.evidence.modeledReversionGuaranteed, false);
  assert.equal(signal.evidence.correlationImpliesCausation, false);
  assert.equal(signal.evidence.fullDepthApplied, true);
  assert.equal(signal.executionAuthorized, false);

  const gatedSource = new Source(snapshot(left[0]!, right[0]!, now));
  const gatedEngine = new StatisticalArbitrageEngine({
    getDerivativeDepth: (_exchange, marketName, evaluationNow) => depth(marketName, evaluationNow),
    getDerivativeFee: (exchange) => fees.get(exchange),
  });
  const gatedController = new StatisticalArbitrageStrategyController(controller.getConfiguration(), gatedSource,
    gatedEngine, new ConfirmedPromotionDiscovery(false));
  gatedController.start();
  for (let index = 1; index < left.length; index += 1) {
    gatedSource.emit(snapshot(left[index]!, right[index]!, now + index * 1_000));
  }
  assert.equal(gatedController.getStatisticalSnapshot()?.qualifiedPairs, 1,
    "The engine fixture must qualify before the promotion gate is tested.");
  assert.equal(gatedController.getSignals(finalTime).length, 0,
    "An engine-qualified pair must not emit a signal before persistent research promotion.");
  const gatedDiagnostics = gatedController.getDiagnosticEvidence() as {signalPromotionGate: {totalFiltered: number}};
  assert.ok(gatedDiagnostics.signalPromotionGate.totalFiltered > 0);
  gatedController.stop();

  const noFeeEngine = new StatisticalArbitrageEngine({
    getDerivativeDepth: (_exchange, marketName, evaluationNow) => depth(marketName, evaluationNow),
    getDerivativeFee: () => null,
  });
  let noFeeResult = noFeeEngine.evaluate(snapshot(left[0]!, right[0]!, now), controller.getConfiguration(), now);
  for (let index = 1; index < left.length; index += 1) {
    noFeeResult = noFeeEngine.evaluate(snapshot(left[index]!, right[index]!, now + index * 1_000), controller.getConfiguration(), now + index * 1_000);
  }
  assert.ok(noFeeResult.assessments[0]?.blockers.includes("DERIVATIVE_FEE_EVIDENCE_MISSING"));

  const disabled = new StatisticalArbitrageStrategyController(); disabled.start();
  assert.equal(disabled.isRunning(), false); assert.equal(disabled.getSignals().length, 0);
  controller.stop();
  console.log("STATISTICAL ARBITRAGE FOUNDATION TEST PASSED.");
  console.log("Out-of-sample z-score, hedge beta and return correlation used explicit costs and full depth; cointegration and mean reversion were not claimed and no PAPER, LIVE or order action occurred.");
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
