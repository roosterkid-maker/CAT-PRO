import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import type {ArbitrageOpportunity} from "../../models/ArbitrageOpportunity";
import type {OpportunitySnapshot} from "../../services/OpportunityService";
import type {AuthenticatedPrivateFill, PrivateFillOrderBinding} from "../../../execution/live/fills/AuthenticatedPrivateFillEventOwner";
import {StrategyOneExecutionTimingEvidenceService} from "../StrategyOneExecutionTimingEvidenceService";

const NOW = 1_780_800_000_000;

function opportunity(id: string, market = "BTCUSDT", buy = "binance", sell = "bybit",
  timestamp = NOW): ArbitrageOpportunity {
  return {id, pair: {market, buy: {exchange: buy, market, lastPrice: 100, bestBidPrice: 99,
    bestBidQty: 10, bestAskPrice: 100, bestAskQty: 10, spread: 1, timestamp: timestamp - 20,
    source: "orderBook", executable: true}, sell: {exchange: sell, market, lastPrice: 102,
    bestBidPrice: 102, bestBidQty: 10, bestAskPrice: 103, bestAskQty: 10, spread: 1,
    timestamp: timestamp - 15, source: "orderBook", executable: true}}, buyPrice: 100,
    sellPrice: 102, buyAvailableQty: 10, sellAvailableQty: 10, requiredQty: 1,
    availableExecutableQty: 10, executableQty: 1, liquidityScore: 100, enoughLiquidity: true,
    freshnessScore: 100, feeScore: 100, spreadScore: 100, decision: "EXECUTE",
    analysisSummary: [], rawSpread: 2, rawSpreadPercent: 2, estimatedFees: 0.2,
    netProfit: 1.8, netProfitPercent: 1.8, usedLastPriceFallback: false,
    quotesAreFresh: true, score: 100, timestamp};
}

function snapshot(generatedAt: number, item: ArbitrageOpportunity): OpportunitySnapshot {
  return {generatedAt, opportunities: [item]};
}

function binding(venue: "binance" | "bybit", market = "BTCUSDT"): PrivateFillOrderBinding {
  return {lifecycleOrderId: `lifecycle-${venue}`, venue, accountFingerprint: "a".repeat(64),
    product: "SPOT", market, side: venue === "binance" ? "buy" : "sell", requestedQuantity: 1,
    clientOrderId: `client-${venue}`, exchangeOrderId: `order-${venue}`, registeredAt: NOW};
}

function fill(venue: "binance" | "bybit", executedAt: number, sequence: number): AuthenticatedPrivateFill {
  return {kind: "FILL", venue, product: "SPOT", market: "BTCUSDT", orderId: `order-${venue}`,
    clientOrderId: `client-${venue}`, side: venue === "binance" ? "buy" : "sell",
    executionId: `execution-${venue}-${sequence}`, price: 100, quantity: 0.5, quoteQuantity: 50,
    fees: [{asset: "USDT", amount: 0.01, kind: "TRADING"}], maker: false, executedAt,
    sourceEventAt: executedAt + 1, reportedCumulativeQuantity: sequence * 0.5,
    reportedRemainingQuantity: Math.max(0, 1 - sequence * 0.5),
    reportedStatus: sequence === 2 ? "FILLED" : "PARTIALLY_FILLED"};
}

function capturePipeline(service: StrategyOneExecutionTimingEvidenceService, generatedAt: number): void {
  const item = opportunity(`op-${generatedAt}`, "BTCUSDT", "binance", "bybit", generatedAt);
  const value = snapshot(generatedAt, item);
  service.observePaperStage(value, "PIPELINE_START", generatedAt + 5);
  service.observePaperStage(value, "QUEUE_READY", generatedAt + 7);
  service.observePaperStage(value, "EXECUTION_START", generatedAt + 9);
  service.observePaperStage(value, "EXECUTION_COMPLETE", generatedAt + 13);
}

function main(): void {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-v106-timing-"));
  const filePath = join(directory, "timing.jsonl");
  try {
    const service = new StrategyOneExecutionTimingEvidenceService({filePath, maximumRoutes: 2,
      maximumSamplesPerMetric: 2, maximumOpportunitiesPerSnapshot: 4, persistenceIntervalMs: 60_000,
      maximumPersistedSnapshots: 2, minimumRouteSampleIntervalMs: 1, minimumPublicSamples: 2,
      minimumPrivateFillSamplesPerVenue: 2, minimumObservationSpanMs: 1_000,
      minimumAdvisoryBookAgeMs: 25, maximumAdvisoryBookAgeMs: 250, advisorySafetyMarginMs: 10});
    service.start();
    capturePipeline(service, NOW);
    capturePipeline(service, NOW + 1_000);

    for (const venue of ["binance", "bybit"] as const) {
      service.observePrivateEvent({source: "WEBSOCKET", binding: binding(venue),
        event: fill(venue, NOW + 100, 1), receivedAt: NOW + 104});
      service.observePrivateEvent({source: "WEBSOCKET", binding: binding(venue),
        event: fill(venue, NOW + 1_100, 2), receivedAt: NOW + 1_106});
      service.observePrivateEvent({source: "REST_BACKFILL", binding: binding(venue),
        event: fill(venue, NOW - 10_000, 3), receivedAt: NOW + 1_200});
    }

    const report = service.getReport(NOW + 1_500);
    assert.equal(report.routesRetained, 1);
    assert.equal(report.routes[0]?.paperSnapshots, 2);
    assert.equal(report.routes[0]?.metrics.buyQuoteAgeMs.sampleCount, 2);
    assert.equal(report.routes[0]?.metrics.buyQuoteAgeMs.retainedSamples, 2);
    assert.equal(report.routes[0]?.calibration.publicTimingReady, true);
    assert.equal(report.routes[0]?.calibration.privateFillTimingReady, true);
    assert.equal(report.routes[0]?.calibration.advisoryMaximumBookAgeMs, 25);
    assert.equal(report.routes[0]?.calibration.automaticallyApplied, false);
    assert.equal(report.routes[0]?.calibration.state, "CALIBRATION_REVIEW_REQUIRED");
    assert.equal(report.venues.find((item) => item.venue === "binance")?.privateFillEvents, 2,
      "REST backfill must not contaminate WebSocket transport calibration.");

    service.stop();
    const restored = new StrategyOneExecutionTimingEvidenceService({filePath, maximumRoutes: 2,
      maximumSamplesPerMetric: 2, maximumOpportunitiesPerSnapshot: 4, persistenceIntervalMs: 60_000,
      maximumPersistedSnapshots: 2, minimumRouteSampleIntervalMs: 1, minimumPublicSamples: 2,
      minimumPrivateFillSamplesPerVenue: 2, minimumObservationSpanMs: 1_000});
    const restoredReport = restored.getReport(NOW + 2_000);
    assert.equal(restoredReport.routes[0]?.paperSnapshots, 2);
    assert.equal(restoredReport.venues.find((item) => item.venue === "bybit")?.privateFillEvents, 2);

    capturePipeline(restored, NOW + 2_000);
    const second = opportunity("route-two", "ETHUSDT", "bybit", "binance", NOW + 2_000);
    restored.observePaperStage(snapshot(NOW + 2_000, second), "PIPELINE_START", NOW + 2_005);
    const third = opportunity("route-three", "SOLUSDT", "binance", "bybit", NOW + 3_000);
    restored.observePaperStage(snapshot(NOW + 3_000, third), "PIPELINE_START", NOW + 3_005);
    assert.equal(restored.getReport(NOW + 3_100).routesRetained, 2,
      "Route evidence must evict the least recently observed route at its hard capacity.");

    console.log("V106 STRATEGY #1 EXECUTION TIMING EVIDENCE TEST PASSED.");
    console.log("Bounded route timing, WebSocket-only fill latency, advisory-only TTL calibration and restart restoration passed; no exchange I/O occurred.");
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
}

main();
