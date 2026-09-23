import assert from "node:assert/strict";

import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";

import type {
  OrderBook,
} from "../../orderbook/models/OrderBook";

import {
  InrArbitrageScannerService,
  depthAtThreshold,
  evaluateRoute,
  type InrScannerConfig,
  type OpportunityWindow,
} from "../inr-arbitrage/InrArbitrageScannerService";

const CONFIG: InrScannerConfig = {
  minimumNetPercent: 3,
  nearMissNetPercent: 1,
  suspectGrossPercent: 25,
  windowGraceMs: 3_000,
  alertAfterMs: 2_000,
  maximumTickerAgeMs: 60_000,
  maximumBookAgeMs: {coindcx: 5_000, binance: 5_000, bybit: 5_000, coinswitch: 5_000, unocoin: 20_000},
  scanIntervalMs: 1_000,
};

let now = 1_000_000;

function quote(partial: Partial<ExecutableQuote> & Pick<ExecutableQuote, "exchange" | "market">): ExecutableQuote {
  return {
    lastPrice: null,
    bestBidPrice: null,
    bestBidQty: null,
    bestAskPrice: null,
    bestAskQty: null,
    spread: null,
    timestamp: now,
    source: "orderBook",
    executable: true,
    ...partial,
  };
}

function harness(options: {minimums?: Record<string, {minimumNotional: number | null; minimumQuantity: number | null}>; stored?: OpportunityWindow[]} = {}) {
  const quotes = new Map<string, ExecutableQuote>();
  const books = new Map<string, OrderBook>();
  const saved: OpportunityWindow[][] = [];
  const demand: string[] = [];
  const put = (value: ExecutableQuote) => quotes.set(`${value.exchange}|${value.market}`, {...value, timestamp: now});
  const book = (exchange: string, market: string, asks: Array<[number, number]>, bids: Array<[number, number]>) =>
    books.set(`${exchange}|${market}`, {
      exchange,
      market,
      timestamp: now,
      asks: asks.map(([price, quantity]) => ({price, quantity})),
      bids: bids.map(([price, quantity]) => ({price, quantity})),
    });

  const service = new InrArbitrageScannerService(
    {requestTemporarySubscription: (market) => (demand.push(market), true)},
    {
      getAllQuotes: () => [...quotes.values()],
      getTakerFeePercent: (exchange, market) =>
        exchange === "coindcx" && market.endsWith("INR") ? 0.59 : exchange === "unocoin" ? 0.4 : exchange === "coinswitch" ? 0.3 : 0.1,
      getBook: (exchange, market) => books.get(`${exchange}|${market}`) ?? null,
      getMinimums: (exchange, market) => options.minimums?.[`${exchange}|${market}`] ?? null,
      requestMinimums: () => undefined,
      loadWindows: () => options.stored ?? [],
      saveWindows: (windows) => saved.push(windows.map((window) => ({...window}))),
      now: () => now,
    },
    CONFIG,
  );

  return {service, put, book, saved, demand, quotes};
}

function testMath(): void {
  const evaluation = evaluateRoute({costInr: 100, proceedsInr: 105, feePercents: [0.59, 0.1, 0.59], withholdingPercents: [0, 1]});
  assert.ok(evaluation && Math.abs(evaluation.netEdgePercent - 3.72) < 1e-9);
  assert.equal(evaluation!.cashLockedPercent, 1, "TDS is a separate cash lock");

  // Asks 2@100, 5@101; bids 3@106, 10@103.5; 1% fees; >=3% net:
  // 2@100 vs 106 (5%) ok, 1@101 vs 106 (3.95%) ok, then 101 vs 103.5 (1.48%) stops.
  const depth = depthAtThreshold(
    [{price: 100, quantity: 2}, {price: 101, quantity: 5}],
    [{price: 106, quantity: 3}, {price: 103.5, quantity: 10}],
    1, 1, 1, 3,
  );
  assert.equal(depth.notionalInr, 301);
  assert.ok(depth.averageNetPercent !== null && depth.averageNetPercent > 3);
  assert.equal(depthAtThreshold([{price: 100, quantity: 1}], [{price: 102, quantity: 1}], 1, 1, 1, 3).notionalInr, 0);
}

function testRealOpportunityWindowAndAlert(): void {
  const h = harness({minimums: {"coindcx|ABCINR": {minimumNotional: 100, minimumQuantity: null}}});
  // UnoCoin sells ABC at 100 INR; CoinDCX bids 105: 5% gross, 4.01% net.
  h.put(quote({exchange: "unocoin", market: "ABC_INR", bestBidPrice: 99, bestAskPrice: 100, bestBidQty: 50, bestAskQty: 50}));
  h.put(quote({exchange: "coindcx", market: "ABCINR", bestBidPrice: 105, bestAskPrice: 106, bestBidQty: 50, bestAskQty: 50}));
  h.book("unocoin", "ABC_INR", [[100, 50]], [[99, 50]]);
  h.book("coindcx", "ABCINR", [[106, 50]], [[105, 50]]);

  h.service.scan();
  let report = h.service.getReport();
  assert.equal(report.opportunities.length, 1);
  const opportunity = report.opportunities[0];
  assert.equal(opportunity.kind, "INR_INR");
  assert.equal(opportunity.buyVenue, "unocoin");
  assert.equal(opportunity.sellVenue, "coindcx");
  assert.equal(opportunity.evidence, "BOOK");
  assert.equal(opportunity.qualifies, true);
  assert.ok(Math.abs(opportunity.netEdgePercent - (5 - 0.4 - 0.59)) < 1e-9);
  assert.equal(opportunity.depthAtThresholdInr, 5_000, "50 coins x Rs 100 clear 3% net");
  assert.equal(opportunity.minimumOrderInr, 100);
  assert.equal(opportunity.tdsVerified, false, "UnoCoin TDS unverified");
  assert.equal(report.activeWindows.length, 1);
  assert.equal(report.activeWindows[0].alertedAt, null, "no alert before the alert delay");

  now += 2_000;
  h.service.scan();
  report = h.service.getReport();
  assert.ok(report.activeWindows[0].alertedAt !== null, "alert after lasting >= 2s");
  assert.equal(report.alerts.length, 1);

  // Edge disappears; within grace the window stays open, after grace it closes.
  h.put(quote({exchange: "coindcx", market: "ABCINR", bestBidPrice: 100.5, bestAskPrice: 101, bestBidQty: 50, bestAskQty: 50}));
  h.book("coindcx", "ABCINR", [[101, 50]], [[100.5, 50]]);
  now += 1_000;
  h.service.scan();
  assert.equal(h.service.getReport().activeWindows.length, 1, "grace keeps a single missed scan open");
  now += 5_000;
  h.service.scan();
  report = h.service.getReport();
  assert.equal(report.activeWindows.length, 0);
  assert.equal(report.recentWindows.length, 1);
  assert.equal(report.recentWindows[0].durationMs, 2_000);
  assert.equal(report.coinPersistence[0].coin, "ABC");
  assert.equal(report.coinPersistence[0].longestMs, 2_000);

  // Closed windows are checkpointed and restored on restart.
  h.service.stop();
  assert.ok(h.saved.length > 0);
  const restored = harness({stored: h.saved[h.saved.length - 1]});
  assert.equal(restored.service.getReport().recentWindows.length, 1);
}

function testGatesAndEvidence(): void {
  // Depth below the venue minimum: shown as a near miss, not an opportunity.
  const thin = harness({minimums: {"coindcx|THNINR": {minimumNotional: 1_000, minimumQuantity: null}}});
  thin.put(quote({exchange: "unocoin", market: "THN_INR", bestBidPrice: 9.9, bestAskPrice: 10, bestBidQty: 5, bestAskQty: 5}));
  thin.put(quote({exchange: "coindcx", market: "THNINR", bestBidPrice: 10.6, bestAskPrice: 10.7, bestBidQty: 500, bestAskQty: 500}));
  thin.book("unocoin", "THN_INR", [[10, 5]], [[9.9, 5]]);
  thin.book("coindcx", "THNINR", [[10.7, 500]], [[10.6, 500]]);
  thin.service.scan();
  let report = thin.service.getReport();
  assert.equal(report.opportunities.length, 0, "Rs 50 depth cannot cover a Rs 1000 minimum");
  assert.equal(report.nearMisses[0].coin, "THN");
  assert.equal(report.nearMisses[0].minimumOrderInr, 1_000);

  // Suspect gross (> 25%) is never an opportunity.
  const suspect = harness();
  suspect.put(quote({exchange: "unocoin", market: "SUS_INR", bestBidPrice: 49, bestAskPrice: 50, bestBidQty: 100, bestAskQty: 100}));
  suspect.put(quote({exchange: "coindcx", market: "SUSINR", bestBidPrice: 100, bestAskPrice: 101, bestBidQty: 100, bestAskQty: 100}));
  suspect.service.scan();
  report = suspect.service.getReport();
  assert.equal(report.opportunities.length, 0);
  assert.equal(report.nearMisses.find((route) => route.coin === "SUS")?.suspect, true);

  // CoinSwitch INR quote without quantities is QUOTE evidence: a hint that
  // gets nominated for CoinSwitch depth, never an opportunity.
  const hint = harness();
  hint.put(quote({exchange: "coinswitch", market: "HNT_INR", bestBidPrice: 104, bestAskPrice: 104.2, executable: false, source: "bookTicker"}));
  hint.put(quote({exchange: "coindcx", market: "HNTINR", bestBidPrice: 99, bestAskPrice: 100, bestBidQty: 100, bestAskQty: 100}));
  hint.service.scan();
  report = hint.service.getReport();
  assert.equal(report.opportunities.length, 0);
  const hinted = report.nearMisses.find((route) => route.coin === "HNT" && route.sellVenue === "coinswitch")!;
  assert.equal(hinted.evidence, "QUOTE");
  assert.deepEqual(hint.service.getDepthNominations("coinswitch"), ["HNTINR"]);

  // UnoCoin copying last into bid == ask is not a two-sided quote.
  const flat = harness();
  flat.put(quote({exchange: "unocoin", market: "FLT_INR", lastPrice: 10, bestBidPrice: 10, bestAskPrice: 10, executable: false, source: "bookTicker"}));
  flat.put(quote({exchange: "coindcx", market: "FLTINR", bestBidPrice: 11, bestAskPrice: 11.1, bestBidQty: 100, bestAskQty: 100}));
  flat.service.scan();
  assert.equal(flat.service.getReport().nearMisses.find((route) => route.coin === "FLT")?.evidence, "TICKER");
}

function testInrUsdtWithConversionFallback(): void {
  const h = harness();
  // Only a CoinSwitch USDT/INR quote (no quantities) exists: QUOTE evidence.
  h.put(quote({exchange: "coinswitch", market: "USDT_INR", bestBidPrice: 99.7, bestAskPrice: 99.9, executable: false, source: "bookTicker"}));
  h.put(quote({exchange: "coindcx", market: "XYZINR", bestBidPrice: 95, bestAskPrice: 95.5, bestBidQty: 100, bestAskQty: 100}));
  h.put(quote({exchange: "binance", market: "XYZUSDT", bestBidPrice: 1.0, bestAskPrice: 1.001, bestBidQty: 1_000, bestAskQty: 1_000}));
  h.service.scan();
  const report = h.service.getReport();
  const route = report.nearMisses.find((item) => item.kind === "INR_USDT" && item.buyVenue === "coindcx")!;
  assert.ok(route, "INR_USDT priced with the fallback conversion quote");
  assert.equal(route.conversionVenue, "coinswitch");
  assert.equal(route.evidence, "QUOTE", "weakest leg (conversion quote) sets the evidence");
  assert.equal(route.usdtInrRate, 99.7);
  assert.equal(report.conversion[0].evidence, "QUOTE");
  assert.deepEqual(h.demand.includes("XYZINR"), false, "a BOOK INR leg is not re-requested");
  assert.equal(report.safety.orderSubmissionAllowed, false);
}

testMath();
testRealOpportunityWindowAndAlert();
testGatesAndEvidence();
testInrUsdtWithConversionFallback();
console.log("testInrArbitrageScanner: PASS");
