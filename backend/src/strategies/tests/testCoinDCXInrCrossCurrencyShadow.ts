import assert from "node:assert/strict";

import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";

import {
  CoinDCXInrCrossCurrencyShadowService,
  evaluateInrCrossRoute,
} from "../inr-cross-currency/CoinDCXInrCrossCurrencyShadowService";

function quote(partial: Partial<ExecutableQuote> & Pick<ExecutableQuote, "exchange" | "market">): ExecutableQuote {
  return {
    lastPrice: null,
    bestBidPrice: null,
    bestBidQty: null,
    bestAskPrice: null,
    bestAskQty: null,
    spread: null,
    timestamp: 1_000_000,
    source: "orderBook",
    executable: true,
    ...partial,
  };
}

function testMath(): void {
  // Buy X at 100 INR, sell at 1.05 USDT, USDT worth 100 INR: 5% gross.
  const buyInr = evaluateInrCrossRoute({
    direction: "BUY_INR_SELL_USDT",
    inrPrice: 100,
    usdtPrice: 1.05,
    usdtInrRate: 100,
    inrTakerFeePercent: 0.59,
    usdtTakerFeePercent: 0.1,
    conversionTakerFeePercent: 0.59,
    inrWithholdingPercent: 0,
    usdtWithholdingPercent: 0,
  });
  assert.ok(buyInr);
  assert.ok(Math.abs(buyInr.grossEdgePercent - 5) < 1e-9);
  assert.ok(Math.abs(buyInr.feesPercent - 1.28) < 1e-9);
  assert.ok(Math.abs(buyInr.netEdgePercent - 3.72) < 1e-9);

  // Reverse direction: buy at 1 USDT (=100 INR), sell for 102 INR: 2% gross.
  // TDS is reported as a cash lock, never subtracted from the edge.
  const sellInr = evaluateInrCrossRoute({
    direction: "BUY_USDT_SELL_INR",
    inrPrice: 102,
    usdtPrice: 1,
    usdtInrRate: 100,
    inrTakerFeePercent: 0.59,
    usdtTakerFeePercent: 0.1,
    conversionTakerFeePercent: 0.59,
    inrWithholdingPercent: 1,
    usdtWithholdingPercent: 0,
  });
  assert.ok(sellInr);
  assert.ok(Math.abs(sellInr.grossEdgePercent - 2) < 1e-9);
  assert.ok(Math.abs(sellInr.netEdgePercent - 0.72) < 1e-9);
  assert.equal(sellInr.cashLockedPercent, 1);

  assert.equal(
    evaluateInrCrossRoute({
      direction: "BUY_INR_SELL_USDT",
      inrPrice: 0,
      usdtPrice: 1,
      usdtInrRate: 100,
      inrTakerFeePercent: 0,
      usdtTakerFeePercent: 0,
      conversionTakerFeePercent: 0,
      inrWithholdingPercent: 0,
      usdtWithholdingPercent: 0,
    }),
    null,
    "non-positive prices are rejected",
  );
}

function testServiceNominatesThenConfirms(): void {
  const now = 1_000_000;
  const quotes = new Map<string, ExecutableQuote>();
  const put = (value: ExecutableQuote) => quotes.set(`${value.exchange}|${value.market}`, value);

  put(quote({exchange: "coindcx", market: "USDTINR", bestBidPrice: 99.5, bestAskPrice: 99.6, bestBidQty: 500, bestAskQty: 500}));
  // Ticker-only INR quote showing a ~3% edge versus Binance.
  put(quote({exchange: "coindcx", market: "ABCINR", lastPrice: 97, executable: false, source: "ticker"}));
  put(quote({exchange: "binance", market: "ABCUSDT", bestBidPrice: 1.0, bestAskPrice: 1.001, bestBidQty: 1_000, bestAskQty: 1_000}));
  // Coin with no USDT counterpart is ignored.
  put(quote({exchange: "coindcx", market: "ZZZINR", lastPrice: 5, executable: false, source: "ticker"}));

  const requested: string[] = [];
  const service = new CoinDCXInrCrossCurrencyShadowService(
    {
      requestTemporarySubscription: (market) => {
        requested.push(market);
        return true;
      },
    },
    {
      getAllQuotes: () => [...quotes.values()],
      getQuote: (exchange, market) => quotes.get(`${exchange}|${market}`),
      getTakerFeePercent: (exchange, market) => (exchange === "coindcx" && market.endsWith("INR") ? 0.59 : 0.1),
      now: () => now,
    },
  );

  service.scan();
  let report = service.getReport();
  assert.deepEqual(requested, ["ABCINR"], "a ticker edge above the nomination threshold opens a demand book");
  assert.equal(report.coverage.pairedWithUsdtVenue, 1);
  assert.equal(report.routes.every((route) => !route.confirmed), true, "ticker-only routes are never confirmed");
  assert.equal(report.recentConfirmed.length, 0);

  // The demand book arrives and reproduces the edge.
  put(quote({exchange: "coindcx", market: "ABCINR", lastPrice: 97, bestBidPrice: 96.9, bestAskPrice: 97, bestBidQty: 50, bestAskQty: 50}));
  service.scan();
  report = service.getReport();
  const best = report.routes[0];
  assert.equal(best.confirmed, true);
  assert.equal(best.direction, "BUY_INR_SELL_USDT");
  assert.equal(best.usdtVenue, "binance");
  assert.ok(best.netEdgePercent > 1, `confirmed net edge ${best.netEdgePercent}`);
  assert.ok(best.topOfBookDepthInr !== null && best.topOfBookDepthInr > 0);
  assert.equal(report.recentConfirmed.length, 1);
  assert.equal(requested.length, 1, "an already-executable book is not re-requested");
  assert.equal(report.safety.orderSubmissionAllowed, false);

  // Without an executable USDTINR book nothing is evaluated at all.
  put(quote({exchange: "coindcx", market: "USDTINR", lastPrice: 99.5, executable: false, source: "ticker"}));
  service.scan();
  report = service.getReport();
  assert.equal(report.conversion.executable, false);
  assert.equal(report.routes.length, 0);
}

testMath();
testServiceNominatesThenConfirms();
console.log("testCoinDCXInrCrossCurrencyShadow: PASS");
