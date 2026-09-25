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
  const book = (market: string) => {
    const quote = quotes.get(market);
    return quote && quote.bestBidPrice !== null && quote.bestAskPrice !== null ? {bid: quote.bestBidPrice, ask: quote.bestAskPrice} : null;
  };
  put("USDTINR", 99.9, 99.92);
  put("ALEXINR", 0.44125, 0.45235);
  put("ALEXUSDT", 0.004475, 0.004478);
  put("ZECINR", 159_836, 160_690); // 0.5% spread: no room, not tracked
  put("ZECUSDT", 1_598.03, 1_598.04);
  let trades: PublicTrade[] = [{price: 0.44, quantity: 100, at: now - 60_000, buyerMaker: true}];
  const service = new InExchangeMakerShadowService({
    listInrMarkets: () => ["ALEXINR", "ZECINR", "USDTINR"],
    getInrBook: (market) => book(market),
    getHedgeBook: (coin) => {
      const hedge = book(`${coin}USDT`);
      return hedge ? {...hedge, venue: "coindcx"} : null;
    },
    getConversion: () => book("USDTINR"),
    inrFeePercent: () => 0.59,
    hedgeFeePercent: () => 0.2006,
    fetchMarketDetails: async () => new Map([["ALEXINR", {pair: "I-ALEX_INR", tick: 0.00001, minimumNotional: 100, active: true}]]),
    fetchTrades: async (coin) => (coin === "ALEX" ? trades : []),
    fetchVolumes: async () => new Map([["ALEXINR", 37_006], ["ZECINR", 29_335_195]]),
    now: () => now,
  }, {maximumInventoryInr: 2_000}, join(directory, "ixm.jsonl"));

  await service.tradeCycle(); // loads tick sizes and volumes
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

  // Inventory limit: after a second buy the net position (~INR 3,000) is past
  // the INR 2,000 limit, so the bid stops; the ask keeps quoting.
  service.quoteCycle();
  now += 2_000;
  trades = [...trades, {price: 0.44125, quantity: 5_000, at: now - 500, buyerMaker: true}];
  await service.tradeCycle();
  service.quoteCycle();
  report = service.getReport();
  assert.equal(report.totals.fills, 2);
  assert.equal(report.tracked[0]?.quote?.bid, null, "bid paused past the inventory limit");
  assert.ok((report.coins[0]?.netQuantity ?? 0) > 0);
  assert.equal(report.safety.orderSubmissionAllowed, false);
  service.stop();
}

async function testPolledVenue(directory: string): Promise<void> {
  // UnoCoin: INR books are polled (only the busiest, with a hedge), the
  // hedge is another exchange's USDT book.
  const now = 1_790_000_000_000;
  const refreshed: string[][] = [];
  const books = new Map<string, {bid: number; ask: number}>();
  const service = new InExchangeMakerShadowService({
    listInrMarkets: () => ["SKYINR", "LINKINR", "QUIETINR", "NOHEDGEINR"],
    getInrBook: (market) => books.get(market) ?? null,
    getHedgeBook: (coin) => (coin === "SKY" ? {bid: 0.0727, ask: 0.0728, venue: "binance/bybit"} : coin === "LINK" || coin === "QUIET" ? {bid: 13.3, ask: 13.31, venue: "binance"} : null),
    getConversion: () => ({bid: 99.9, ask: 99.92}),
    inrFeePercent: () => 0.4,
    hedgeFeePercent: () => 0.1,
    fetchMarketDetails: async () => new Map(),
    fetchTrades: async () => [],
    fetchVolumes: async () => new Map([["SKYINR", 90_000], ["LINKINR", 40_000], ["QUIETINR", 500], ["NOHEDGEINR", 500_000]]),
    refreshBooks: async (markets) => {
      refreshed.push([...markets]);
      books.set("SKYINR", {bid: 6.9, ask: 7.4});
    },
    now: () => now,
  }, {venue: "unocoin"}, join(directory, "ixm-uno.jsonl"));
  await service.tradeCycle();
  assert.deepEqual(refreshed[0], ["SKYINR", "LINKINR"], "busiest books with a hedge, quiet and unhedged skipped");
  service.quoteCycle();
  const report = service.getReport();
  assert.equal(report.venue, "unocoin");
  assert.equal(report.tracked[0]?.coin, "SKY");
  assert.equal(report.tracked[0]?.quote?.hedgeVenue, "binance/bybit");
  service.stop();
}

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-ixm-"));
  try {
    testQuotes();
    testFill();
    await testService(directory);
    await testPolledVenue(directory);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
  console.log("In-exchange maker shadow passed: INR-book quotes one tick inside the spread within the fee-and-edge bound from the USDT book, fills only against real trades through our standing price, hedged at the USDT book, never sent.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
