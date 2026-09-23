import assert from "node:assert/strict";

import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";

import {
  CoinDCXInrCrossCurrencyShadowService,
  evaluateInrRoute,
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

function makeService(quotes: Map<string, ExecutableQuote>, requested: string[]) {
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
      now: () => NOW,
    },
  );
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
testInrUsdtNominatesThenConfirms();
testInrInrBetweenCoinDCXAndUnoCoin();
console.log("testCoinDCXInrCrossCurrencyShadow: PASS");
