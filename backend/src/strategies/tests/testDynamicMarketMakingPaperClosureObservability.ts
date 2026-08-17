import assert from "node:assert/strict";

import type {
  ExchangeBalanceSnapshot,
} from "../../trading/account/TradingAccountService";

import {
  createDynamicMarketMakingConfiguration,
} from "../dynamic-market-making/DynamicMarketMakingConfiguration";

import type {
  DynamicMarketMakingDiagnostics,
  DynamicMarketMakingSnapshot,
} from "../dynamic-market-making/DynamicMarketMakingEngine";

import {
  DynamicMarketMakingPaperClosureObservabilityService,
  type DynamicMarketMakingPaperClosurePort,
} from "../dynamic-market-making/DynamicMarketMakingPaperClosureObservabilityService";

const now = 1_800_000_000_000;
const configuration = createDynamicMarketMakingConfiguration({
  enabled: true,
  exchanges: ["binance"],
  markets: ["BTCUSDT"],
  targetQuoteNotional: 250,
  minimumSamples: 5,
  minimumPublicTradeSamples: 10,
  minimumEmpiricalFillProbabilityPercent: 1,
  minimumModeledNetCapturePercent: 0.05,
});

function diagnostics(stage: "INVENTORY_BLOCKED" | "TRADES_BLOCKED" | "QUALIFIED"): DynamicMarketMakingDiagnostics {
  const book = {
    bestBid: 99.9,
    bestAsk: 100.1,
    midPrice: 100,
    bookSpreadPercent: 0.2,
    bidDepthQuantity: 20,
    askDepthQuantity: 18,
    volatilitySampleCount: 8,
    minimumVolatilitySamples: 5,
  };
  const capability = {
    baseAsset: "BTC",
    quoteAsset: "USDT",
    postOnlySupported: true,
    capabilitySynchronizedAt: now - 100,
    priceStep: 0.1,
    quantityStep: 0.001,
    minimumNotional: 5,
    makerFeePercent: 0.02,
  };
  if (stage === "INVENTORY_BLOCKED") {
    return {book, capability, inventory: null, fillQuality: null, economics: null};
  }
  const inventory = {
    source: "AUTHENTICATED_EXCHANGE_BALANCE_SNAPSHOTS" as const,
    synchronizedAt: now - 100,
    ageMs: 100,
    baseAsset: "BTC",
    quoteAsset: "USDT",
    baseTotal: 2,
    quoteTotal: 20_000,
    baseAvailable: 2,
    quoteAvailable: 20_000,
    baseValueQuote: stage === "QUALIFIED" ? 200 : null,
    totalValueQuote: stage === "QUALIFIED" ? 20_200 : null,
    baseSharePercent: stage === "QUALIFIED" ? 0.990099 : null,
    targetBasePercent: 50,
    deviationPercent: stage === "QUALIFIED" ? -49.009901 : null,
    skewPercent: stage === "QUALIFIED" ? 0.24505 : null,
    unadjustedFairPrice: stage === "QUALIFIED" ? 100 : null,
    fairPrice: stage === "QUALIFIED" ? 100.24505 : null,
  };
  const fillQuality = {
    source: "EXCHANGE_PUBLIC_TRADE_TAPE" as const,
    sampleCount: stage === "QUALIFIED" ? 20 : 3,
    minimumSamples: 10,
    lookbackMs: 30_000,
    aggressorFlowImbalance: stage === "QUALIFIED" ? 0 : null,
    tradeFlowFairValueSkewPercent: stage === "QUALIFIED" ? 0 : null,
    adverseSelectionSpreadPercent: stage === "QUALIFIED" ? 0 : null,
    liquidityCoverageMultiple: stage === "QUALIFIED" ? 8 : null,
    minimumLiquidityCoverageMultiple: 2,
    liquiditySpreadPenaltyPercent: stage === "QUALIFIED" ? 0 : null,
    bidFillProbabilityPercent: stage === "QUALIFIED" ? 80 : null,
    askFillProbabilityPercent: stage === "QUALIFIED" ? 75 : null,
    minimumFillProbabilityPercent: 1,
    queuePositionKnown: false as const,
  };
  const economics = stage === "QUALIFIED" ? {
    bidQuotePrice: 99,
    askQuotePrice: 101,
    quoteQuantity: 2.49,
    targetQuoteQuantity: 2.49,
    adaptiveHalfSpreadPercent: 1,
    modeledGrossCapturePercent: 1.9951,
    makerRoundTripFeePercent: 0.04,
    safetyBufferPercent: 0.05,
    modeledNetCapturePercent: 1.9051,
    minimumModeledNetCapturePercent: 0.05,
    thresholdShortfallPercent: 0,
    marketRegime: "NORMAL" as const,
    realizedVolatilityPercent: 0.1,
    modeledCaptureGuaranteed: false as const,
  } : null;
  return {book, capability, inventory, fillQuality, economics};
}

function snapshot(stage: "INVENTORY_BLOCKED" | "TRADES_BLOCKED" | "QUALIFIED"): DynamicMarketMakingSnapshot {
  const qualified = stage === "QUALIFIED";
  return {
    generatedAt: now - 10,
    evaluatedMarkets: 1,
    qualifiedMarkets: qualified ? 1 : 0,
    blockedMarkets: qualified ? 0 : 1,
    assessments: [{
      id: `binance:BTCUSDT:${now - 10}`,
      exchange: "binance",
      market: "BTCUSDT",
      status: qualified ? "QUALIFIED" : "BLOCKED",
      blockers: stage === "INVENTORY_BLOCKED"
        ? ["INVENTORY_EVIDENCE_MISSING"]
        : stage === "TRADES_BLOCKED" ? ["PUBLIC_TRADE_EVIDENCE_INSUFFICIENT"] : [],
      diagnostics: diagnostics(stage),
      evidence: null,
      executionAuthorized: false,
      automaticExecutionAllowed: false,
    }],
    safety: {
      inventoryEvidenceAvailable: qualified,
      inventoryAdjustmentApplied: qualified,
      queuePositionKnown: false,
      fillProbabilityKnown: qualified,
      modeledCaptureGuaranteed: false,
      shadowOnly: true,
      paperExecutionAllowed: false,
      liveExecutionAllowed: false,
      orderSubmissionAllowed: false,
    },
  };
}

function main(): void {
  let currentSignals = 0;
  let currentSnapshot = snapshot("INVENTORY_BLOCKED");
  let balances: ExchangeBalanceSnapshot[] = [];
  let admissions: ReturnType<DynamicMarketMakingPaperClosurePort["getAdmissions"]> = [];
  let intake: ReturnType<DynamicMarketMakingPaperClosurePort["getIntake"]> = [];
  const port: DynamicMarketMakingPaperClosurePort = {
    getConfiguration: () => configuration,
    getRuntime: () => ({running: true, currentSignalCount: currentSignals,
      totalSignalsObserved: currentSignals, lastSignalObservedAt: currentSignals > 0 ? now - 100 : null}),
    getSnapshot: () => structuredClone(currentSnapshot),
    getBalances: () => structuredClone(balances),
    getAdmissions: () => admissions,
    getIntake: () => intake,
    getQueue: () => [],
  };
  const service = new DynamicMarketMakingPaperClosureObservabilityService(port, 1_000);

  const inventoryBlocked = service.getReport(now);
  assert.equal(inventoryBlocked.version, "72.0");
  assert.equal(inventoryBlocked.state, "INVENTORY_EVIDENCE_BLOCKED");
  assert.equal(inventoryBlocked.funnel.bookReadyMarkets, 1);
  assert.equal(inventoryBlocked.funnel.capabilityReadyMarkets, 1);
  assert.equal(inventoryBlocked.funnel.inventoryReadyMarkets, 0);
  assert.equal(inventoryBlocked.inventoryEvidence.synchronizedBalances, 0);
  assert.equal(inventoryBlocked.routes.marketReadiness.length, 1);
  assert.equal(inventoryBlocked.routes.mostAdvancedRoute?.diagnostics.capability?.postOnlySupported, true);

  currentSnapshot = snapshot("TRADES_BLOCKED");
  balances = [{exchange: "binance", asset: "BTC", availableBalance: 2, lockedBalance: 0,
    totalBalance: 2, synchronizedAt: now - 100},
  {exchange: "binance", asset: "USDT", availableBalance: 20_000, lockedBalance: 0,
    totalBalance: 20_000, synchronizedAt: now - 100}];
  const tradesBlocked = service.getReport(now);
  assert.equal(tradesBlocked.state, "WAITING_FOR_EMPIRICAL_FILL");
  assert.equal(tradesBlocked.funnel.inventoryReadyMarkets, 1);
  assert.equal(tradesBlocked.funnel.publicTradeReadyMarkets, 0);
  assert.equal(tradesBlocked.inventoryEvidence.freshBalances, 2);
  assert.equal(tradesBlocked.routes.mostAdvancedRoute?.diagnostics.fillQuality?.sampleCount, 3);

  currentSignals = 1;
  currentSnapshot = snapshot("QUALIFIED");
  admissions = [{generatedAt: now - 100, strategyId: configuration.strategyId,
    decision: "SHADOW_SIGNAL_ADMITTED", plan: {id: "dynamic-maker-plan"}}];
  intake = [{generatedAt: now - 50, strategyId: configuration.strategyId,
    planId: "dynamic-maker-plan", state: "BLOCKED", blockers: ["PAPER_ADAPTER_UNAVAILABLE"]}];
  const paperBlocked = service.getReport(now);
  assert.equal(paperBlocked.state, "PAPER_BLOCKED");
  assert.equal(paperBlocked.funnel.fillProbabilityReadyMarkets, 1);
  assert.equal(paperBlocked.funnel.economicallyEvaluableMarkets, 1);
  assert.equal(paperBlocked.routes.bestFillRoute?.diagnostics.fillQuality?.askFillProbabilityPercent, 75);
  assert.equal(paperBlocked.routes.bestNetRoute?.diagnostics.economics?.modeledNetCapturePercent, 1.9051);
  assert.equal(paperBlocked.lineage.plansAdmitted, 1);
  assert.deepEqual(paperBlocked.lineage.latestPlanIntakeBlockers, ["PAPER_ADAPTER_UNAVAILABLE"]);
  assert.equal(paperBlocked.safety.fillProbabilityInferred, false);
  assert.equal(paperBlocked.safety.modeledCaptureGuaranteed, false);
  assert.equal(paperBlocked.safety.balanceInferenceAllowed, false);
  assert.equal(paperBlocked.safety.profitabilityThresholdMutated, false);
  assert.equal(paperBlocked.safety.liveExecutionAllowed, false);
  assert.equal(paperBlocked.safety.orderSubmissionAllowed, false);

  console.log("DYNAMIC MARKET-MAKING PAPER CLOSURE OBSERVABILITY TEST PASSED.");
  console.log("Book, post-only capability, authenticated inventory, public trade fill quality, modeled capture and central lineage remained read-only; no queue position, balance, signal, PAPER, LIVE or order action was invented.");
}

main();
