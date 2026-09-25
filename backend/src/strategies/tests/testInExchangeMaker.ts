import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import type {ExecutableQuote} from "../../core/models/ExecutableQuote";
import {
  computeMakerQuotes,
  InExchangeMakerShadowService,
  simulateFill,
  tickFromPrice,
  type PublicTrade,
} from "../in-exchange-maker/InExchangeMakerShadowService";

/* Real CoinDCX ALEX books, 2026-09-25: INR 0.44125 / 0.45235, USDT 0.004475 / 0.004478, USDT/INR 99.90 / 99.92. */
const ALEX = {
  inrBid: 0.44125, inrAsk: 0.45235, usdtBid: 0.004475, usdtAsk: 0.004478, usdtInrBid: 99.9, usdtInrAsk: 99.92,
  inrFeePercent: 0.59, usdtFeePercent: 0.2006, targetEdgePercent: 0.3, tick: 0.00001,
};

function testQuotes(): void {
  const quotes = computeMakerQuotes(ALEX);
  // Bid one tick inside the spread, under the fee-and-edge bound.
  assert.equal(quotes.bid, 0.44126);
  assert.ok(quotes.maximumBid > 0.44126 && quotes.maximumBid < 0.4425, String(quotes.maximumBid));
  // Ask: 0.45234 would undercut the bound (~0.45232 + rounding): allowed only when above it.
  assert.ok(quotes.ask === null || quotes.ask >= quotes.minimumAsk - 1e-12);
  // A tight INR book (no room for fees) gets no quote at all.
  const tight = computeMakerQuotes({...ALEX, inrBid: 0.4469, inrAsk: 0.4471});
  assert.deepEqual([tight.bid, tight.ask], [null, null]);
  assert.equal(tickFromPrice(0.44), 0.00001);
  assert.equal(tickFromPrice(1_598), 0.1);
}

function testFill(): void {
  const standing = {at: 1_000, bid: 0.4413, ask: null, usdtBid: 0.004475, usdtAsk: 0.004478, usdtInrBid: 99.9, usdtInrAsk: 99.92};
  // A seller hits the bid at or below our price: we buy, hedge by selling on USDT.
  const fill = simulateFill({coin: "ALEX", trade: {price: 0.44125, quantity: 5_000, at: 1_500, buyerMaker: true}, quote: standing,
    quoteSizeInr: 1_500, inrFeePercent: 0.59, usdtFeePercent: 0.2006});
  assert.ok(fill);
  assert.equal(fill.side, "BUY");
  assert.ok(Math.abs(fill.quantity - 1_500 / 0.4413) < 1e-6, "capped at our quote size");
  assert.ok(fill.edgePercent > 0.2 && fill.edgePercent < 0.6, String(fill.edgePercent));
  // A buyer-aggressor trade never fills a bid; nor does a trade above our bid.
  assert.equal(simulateFill({coin: "ALEX", trade: {price: 0.44125, quantity: 10, at: 1_500, buyerMaker: false}, quote: standing,
    quoteSizeInr: 1_500, inrFeePercent: 0.59, usdtFeePercent: 0.2}), null);
  assert.equal(simulateFill({coin: "ALEX", trade: {price: 0.4414, quantity: 10, at: 1_500, buyerMaker: true}, quote: standing,
    quoteSizeInr: 1_500, inrFeePercent: 0.59, usdtFeePercent: 0.2}), null);
}

async function testService(directory: string): Promise<void> {
  let now = 1_790_000_000_000;
  const quotes = new Map<string, ExecutableQuote>();
  const put = (market: string, bid: number, ask: number) =>
    quotes.set(market, {exchange: "coindcx", market, lastPrice: bid, bestBidPrice: bid, bestBidQty: null, bestAskPrice: ask, bestAskQty: null,
      spread: ask - bid, timestamp: now, source: "bookTicker", executable: false});
  put("USDTINR", 99.9, 99.92);
  put("ALEXINR", 0.44125, 0.45235);
  put("ALEXUSDT", 0.004475, 0.004478);
  put("ZECINR", 159_836, 160_690); // 0.5% spread: no room, not tracked
  put("ZECUSDT", 1_598.03, 1_598.04);
  let trades: PublicTrade[] = [{price: 0.44, quantity: 100, at: now - 60_000, buyerMaker: true}];
  const service = new InExchangeMakerShadowService({
    getQuote: (market) => quotes.get(market),
    listInrMarkets: () => ["ALEXINR", "ZECINR", "USDTINR"],
    fetchMarketDetails: async () => new Map([["ALEXINR", {pair: "I-ALEX_INR", tick: 0.00001, minimumNotional: 100, active: true}]]),
    fetchTrades: async (pair) => (pair === "I-ALEX_INR" ? trades : []),
    getFeePercent: (market) => (market.endsWith("INR") ? 0.59 : 0.2006),
    now: () => now,
  }, undefined, join(directory, "ixm.jsonl"));

  await service.tradeCycle(); // loads tick sizes
  service.quoteCycle();
  let report = service.getReport();
  assert.deepEqual(report.tracked.map((coin) => coin.coin), ["ALEX"]);
  assert.equal(report.tracked[0]?.quote?.bid, 0.44126);

  // The old trade (before we quoted) is ignored; a new seller hit fills us.
  now += 2_000;
  trades = [...trades, {price: 0.44125, quantity: 5_000, at: now - 500, buyerMaker: true}];
  await service.tradeCycle();
  report = service.getReport();
  assert.equal(report.totals.fills, 1);
  assert.equal(report.coins[0]?.coin, "ALEX");
  assert.ok(report.totals.edgeInr > 0);
  // The same trade is not counted twice.
  await service.tradeCycle();
  assert.equal(service.getReport().totals.fills, 1);
  assert.equal(report.safety.orderSubmissionAllowed, false);
  service.stop();
}

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-ixm-"));
  try {
    testQuotes();
    testFill();
    await testService(directory);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
  console.log("In-exchange maker shadow passed: INR-book quotes one tick inside the spread within the fee-and-edge bound from the USDT book, fills only against real trades through our standing price, hedged at the USDT book, never sent.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
