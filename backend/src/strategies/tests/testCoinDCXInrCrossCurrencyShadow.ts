import assert from "node:assert/strict";

import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";

import type {
  OrderBook,
} from "../../orderbook/models/OrderBook";

import {
  CoinDCXInrCrossCurrencyShadowService,
  averageFillPrice,
  evaluateInrRoute,
  profitableDepthInr,
} from "../inr-cross-currency/CoinDCXInrCrossCurrencyShadowService";

const NOW = 1_000_000;

function quote(partial: Partial<ExecutableQuote> & Pick<ExecutableQuote, "exchange" | "market">): ExecutableQuote {
  return {
    lastPrice: null,
    bestBidPrice: null,
    bestBidQty: null,
    bestAskPrice: null,
    bestAskQty: null,
    spread: null,
    timestamp: NOW,
    source: "orderBook",
    executable: true,
    ...partial,
  };
}

function testMath(): void {
  const result = evaluateInrRoute({
    costInr: 100,
    proceedsInr: 105,
    feePercents: [0.59, 0.1, 0.59],
    withholdingPercents: [0, 1],
  });
  assert.ok(result);
  assert.ok(Math.abs(result.grossEdgePercent - 5) < 1e-9);
  assert.ok(Math.abs(result.feesPercent - 1.28) < 1e-9);
  assert.ok(Math.abs(result.netEdgePercent - 3.72) < 1e-9);
  assert.equal(result.cashLockedPercent, 1, "TDS is reported as a cash lock, not netted");

  assert.equal(evaluateInrRoute({costInr: 0, proceedsInr: 1, feePercents: [], withholdingPercents: []}), null);
  assert.equal(evaluateInrRoute({costInr: 1, proceedsInr: 1, feePercents: [Number.NaN], withholdingPercents: []}), null);
}

function makeService(quotes: Map<string, ExecutableQuote>, requested: string[], books = new Map<string, OrderBook>()) {
  return new CoinDCXInrCrossCurrencyShadowService(
    {
      requestTemporarySubscription: (market) => {
        requested.push(market);
        return true;
      },
    },
    {
      getAllQuotes: () => [...quotes.values()],
      getQuote: (exchange, market) => quotes.get(`${exchange}|${market}`),
      getTakerFeePercent: (exchange, market) =>
        exchange === "coindcx" && market.endsWith("INR") ? 0.59 : exchange === "unocoin" ? 0.4 : 0.1,
      getBook: (exchange, market) => books.get(`${exchange}|${market}`) ?? null,
      getTargetLegInr: () => 600,
      now: () => NOW,
    },
  );
}

function testAverageFillPrice(): void {
  const levels = [{price: 10, quantity: 2}, {price: 11, quantity: 2}];
  assert.equal(averageFillPrice(levels, 2), 10);
  assert.equal(averageFillPrice(levels, 4), 10.5);
  assert.equal(averageFillPrice(levels, 5), null, "insufficient depth");

  // 2@100 vs bids 2@103 then 5@100.5, 1% fees: first 2 units clear (3%-1%),
  // then 100.5/100 = 0.5% < 1% stops the walk.
  assert.equal(profitableDepthInr([{price: 100, quantity: 2}, {price: 101, quantity: 5}], [{price: 103, quantity: 2}, {price: 100.5, quantity: 5}], 1, 1, 1), 200);
  assert.equal(profitableDepthInr([{price: 100, quantity: 2}], [{price: 100.5, quantity: 2}], 1, 1, 1), 0);
}

function testSizedEdgeWalksDepth(): void {
  const quotes = new Map<string, ExecutableQuote>();
  const books = new Map<string, OrderBook>();
  const put = (value: ExecutableQuote) => quotes.set(`${value.exchange}|${value.market}`, value);

  // Top of book shows a 3% gap, but only 1 coin (Rs 200) sits at the best
  // UnoCoin ask; a Rs 600 leg (3 coins) must walk up to 210.
  put(quote({exchange: "unocoin", market: "NEAR_INR", bestBidPrice: 199, bestAskPrice: 200, bestBidQty: 1, bestAskQty: 1}));
  put(quote({exchange: "coindcx", market: "NEARINR", bestBidPrice: 206, bestAskPrice: 207, bestBidQty: 50, bestAskQty: 50}));
  books.set("unocoin|NEAR_INR", {exchange: "unocoin", market: "NEAR_INR", timestamp: NOW,
    asks: [{price: 200, quantity: 1}, {price: 210, quantity: 5}], bids: [{price: 199, quantity: 5}]});
  books.set("coindcx|NEARINR", {exchange: "coindcx", market: "NEARINR", timestamp: NOW,
    asks: [{price: 207, quantity: 50}], bids: [{price: 206, quantity: 50}]});

  const service = makeService(quotes, [], books);
  service.scan();
  const route = service.getReport().routes.find((item) => item.kind === "INR_INR" && item.buyVenue === "unocoin")!;
  assert.ok(route.netEdgePercent > 0, "top-of-book edge looks positive");
  assert.equal(route.targetLegInr, 600);
  // 3 coins: 1@200 + 2@210 = avg 206.67 -> gross ~-0.32%, net negative.
  assert.ok(route.sizedNetEdgePercent !== null && route.sizedNetEdgePercent < 0, `sized edge ${route.sizedNetEdgePercent}`);
  assert.ok(route.profitableDepthInr !== null && Math.abs(route.profitableDepthInr - 200) < 1e-6, `profitable depth ${route.profitableDepthInr}`);

  // Only the 1 coin at 200 clears fees against the 206 bid; the 210 level does not.
  // A stale book is not trusted for sizing.
  books.set("coindcx|NEARINR", {...books.get("coindcx|NEARINR")!, timestamp: NOW - 6_000});
  service.scan();
  const stale = service.getReport().routes.find((item) => item.kind === "INR_INR" && item.buyVenue === "unocoin")!;
  assert.equal(stale.sizedNetEdgePercent, null);
}

function testInrUsdtNominatesThenConfirms(): void {
  const quotes = new Map<string, ExecutableQuote>();
  const put = (value: ExecutableQuote) => quotes.set(`${value.exchange}|${value.market}`, value);
  const requested: string[] = [];

  put(quote({exchange: "coindcx", market: "USDTINR", bestBidPrice: 99.5, bestAskPrice: 99.6, bestBidQty: 500, bestAskQty: 500}));
  put(quote({exchange: "coindcx", market: "ABCINR", lastPrice: 97, executable: false, source: "ticker"}));
  put(quote({exchange: "binance", market: "ABCUSDT", bestBidPrice: 1.0, bestAskPrice: 1.001, bestBidQty: 1_000, bestAskQty: 1_000}));
  put(quote({exchange: "coindcx", market: "ZZZINR", lastPrice: 5, executable: false, source: "ticker"}));

  const service = makeService(quotes, requested);
  service.scan();
  let report = service.getReport();
  assert.deepEqual(requested, ["ABCINR"], "a ticker edge above the threshold opens a CoinDCX demand book");
  assert.equal(report.coverage.venues.coindcx.pairedWithUsdtVenue, 1);
  assert.equal(report.routes.every((route) => !route.confirmed), true, "ticker-only routes are never confirmed");

  put(quote({exchange: "coindcx", market: "ABCINR", lastPrice: 97, bestBidPrice: 96.9, bestAskPrice: 97, bestBidQty: 50, bestAskQty: 50}));
  service.scan();
  report = service.getReport();
  const best = report.routes[0];
  assert.equal(best.confirmed, true);
  assert.equal(best.kind, "INR_USDT");
  assert.equal(best.buyVenue, "coindcx");
  assert.equal(best.sellVenue, "binance");
  assert.ok(best.netEdgePercent > 1, `confirmed net edge ${best.netEdgePercent}`);
  assert.equal(best.tdsVerified, true);
  assert.equal(report.recentConfirmed.length, 1);
  assert.equal(requested.length, 1, "an already-executable book is not re-requested");
  assert.equal(report.safety.orderSubmissionAllowed, false);

  put(quote({exchange: "coindcx", market: "USDTINR", lastPrice: 99.5, executable: false, source: "ticker"}));
  service.scan();
  report = service.getReport();
  assert.equal(report.conversion.executable, false);
  assert.equal(report.routes.some((route) => route.kind === "INR_USDT"), false, "no INR_USDT pricing without a USDTINR book");
}

function testInrInrBetweenCoinDCXAndUnoCoin(): void {
  const quotes = new Map<string, ExecutableQuote>();
  const put = (value: ExecutableQuote) => quotes.set(`${value.exchange}|${value.market}`, value);
  const requested: string[] = [];

  // UnoCoin polled book 12s old (inside its 20s ceiling), 3% below CoinDCX.
  put(quote({exchange: "unocoin", market: "NEAR_INR", bestBidPrice: 199, bestAskPrice: 200, bestBidQty: 20, bestAskQty: 20, timestamp: NOW - 12_000}));
  put(quote({exchange: "coindcx", market: "NEARINR", bestBidPrice: 206, bestAskPrice: 207, bestBidQty: 30, bestAskQty: 30}));

  const service = makeService(quotes, requested);
  service.scan();
  let report = service.getReport();
  assert.equal(report.coverage.inrInrPairs, 1);
  const route = report.routes[0];
  assert.equal(route.kind, "INR_INR");
  assert.equal(route.buyVenue, "unocoin");
  assert.equal(route.sellVenue, "coindcx");
  assert.equal(route.confirmed, true);
  assert.equal(route.usdtInrRate, null);
  assert.ok(Math.abs(route.grossEdgePercent - 3) < 1e-9);
  assert.ok(Math.abs(route.netEdgePercent - (3 - 0.4 - 0.59)) < 1e-9);
  assert.equal(route.tdsVerified, false, "UnoCoin withholding is unverified and must be flagged");
  assert.equal(requested.length, 0, "confirmed routes never open demand books");

  // A stale UnoCoin book (beyond 20s) falls back to ticker evidence: not confirmed.
  put(quote({exchange: "unocoin", market: "NEAR_INR", lastPrice: 200, bestBidPrice: 199, bestAskPrice: 200, bestBidQty: 20, bestAskQty: 20, timestamp: NOW - 25_000}));
  service.scan();
  report = service.getReport();
  assert.equal(report.routes.filter((item) => item.kind === "INR_INR").every((item) => !item.confirmed), true);
}

testMath();
testAverageFillPrice();
testSizedEdgeWalksDepth();
testInrUsdtNominatesThenConfirms();
testInrInrBetweenCoinDCXAndUnoCoin();
console.log("testCoinDCXInrCrossCurrencyShadow: PASS");
