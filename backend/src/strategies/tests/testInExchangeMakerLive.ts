import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import type {InrRouteExecuteInput, InrRouteSession} from "../../execution/live/inr-routes/InrRouteSessionExecutor";
import {
  InExchangeMakerLiveEngine,
  IXM_HALT_RELEASE_CONFIRMATION,
  IXM_LIVE_CONFIRMATION,
  loadIxmLiveConfig,
  type IxmLiveConfig,
} from "../in-exchange-maker/InExchangeMakerLiveEngine";

const NOW = 1_790_320_000_000;

function testConfig(): void {
  // Off unless the mode, the phrase and the LIVE-only runtime all agree.
  assert.equal(loadIxmLiveConfig({}, true).mode, "off");
  assert.equal(loadIxmLiveConfig({CAT_PRO_IXM_MODE: "live"}, true).mode, "off");
  assert.equal(loadIxmLiveConfig({CAT_PRO_IXM_MODE: "live", CAT_PRO_IXM_LIVE_CONFIRMATION: IXM_LIVE_CONFIRMATION}, false).mode, "off");
  const live = loadIxmLiveConfig({
    CAT_PRO_IXM_MODE: "live", CAT_PRO_IXM_LIVE_CONFIRMATION: IXM_LIVE_CONFIRMATION, CAT_PRO_IXM_COINS: "rwa, WAXP,bad coin,QI,A,B,C",
    CAT_PRO_IXM_ORDER_LIFE_MS: "60000", CAT_PRO_IXM_QUOTE_INR: "10",
  }, true);
  assert.equal(live.mode, "live");
  assert.deepEqual(live.coins, ["RWA", "WAXP", "QI", "A", "B"], "valid symbols, at most five");
  assert.equal(live.primaryTimeoutMs, 10_000, "CoinDCX's audited contract caps a GTC order at 10 s");
  assert.equal(live.quoteInr, 150, "floored at the INR minimum order");
}

function session(state: InrRouteSession["state"], filled: number, realized: number | null, residual = 0): InrRouteSession {
  return {
    schemaVersion: "1.0", sessionId: `s-${state}`, route: {} as never, plan: {} as never, primarySide: "buy", state,
    startedAt: NOW, updatedAt: NOW,
    primary: filled > 0 ? {idempotencyKey: "p", venue: "coindcx", market: "RWAINR", side: "buy", requestedQuantity: 3_100, limitPrice: 0.19227,
      filledQuantity: filled, averagePrice: 0.19227, orderId: "o1", status: "FILLED", bufferPercent: null, reasons: []} : null,
    hedges: filled > 0 ? [{idempotencyKey: "h", venue: "coindcx", market: "RWAUSDT", side: "sell", requestedQuantity: filled, limitPrice: 0.00195,
      filledQuantity: filled - residual, averagePrice: 0.001952, orderId: "o2", status: "FILLED", bufferPercent: 0.15, reasons: []}] : [],
    hedgedQuantity: filled - residual, residualQuantity: residual, residualInr: 0, realizedNetInr: realized, reasons: state === "RECOVERY_REQUIRED" ? ["unhedged"] : [],
  };
}

function harness(directory: string, name: string, overrides: {
  quote?: {bid: number | null; ask: number | null} | null;
  bestAsk?: number;
  bestBid?: number;
  balances?: Record<string, number>;
  outcome?: InrRouteSession;
  otherHalt?: boolean;
  config?: Partial<IxmLiveConfig>;
  bookAgeMs?: number;
  rest?: boolean;
} = {}) {
  let now = NOW;
  const calls: InrRouteExecuteInput[] = [];
  const published: (string | null)[] = [];
  const config: IxmLiveConfig = {mode: "live", coins: ["RWA"], quoteInr: 600, maximumInventoryInr: 2_000, dailyLossLimitInr: 200, primaryTimeoutMs: 8_000, ...overrides.config};
  const quote = overrides.quote === undefined ? {bid: 0.19227, ask: 0.20149} : overrides.quote;
  const book = (market: string) => ({
    exchange: "coindcx", market, timestamp: now - (overrides.bookAgeMs ?? 100),
    bids: [{price: market === "RWAINR" ? overrides.bestBid ?? 0.19226 : 0.001951, quantity: 10_000}],
    asks: [{price: market === "RWAINR" ? overrides.bestAsk ?? 0.2015 : 0.001953, quantity: 10_000}],
  });
  const fetched: string[] = [];
  const engine = new InExchangeMakerLiveEngine(config, {
    getQuote: () => (quote ? {at: now - 200, ...quote, usdtBid: 0.001951, usdtAsk: 0.001953, usdtInrBid: 100, usdtInrAsk: 100.02} : null),
    getBook: book,
    fetchBook: overrides.rest ? async (market) => { fetched.push(market); return {...book(market), timestamp: now}; } : undefined,
    getRules: () => ({quantityStep: 1, priceStep: 0.00001, minimumQuantity: null, minimumNotional: 1}),
    getBalance: (asset) => (overrides.balances ?? {INR: 5_000, RWA: 10_000, USDT: 50})[asset] ?? 0,
    execute: async (input) => {
      calls.push(input);
      return overrides.outcome ?? session("NO_FILL", 0, null);
    },
    inrFeePercent: () => 0.59,
    usdtFeePercent: () => 0.2,
    otherExposureHalted: () => overrides.otherHalt ?? false,
    publishHalt: (reason) => published.push(reason),
    now: () => now,
    sleep: async () => undefined,
  }, join(directory, `${name}.jsonl`));
  return {engine, calls, published, fetched, advance: (ms: number) => { now += ms; }};
}

async function testAttempts(directory: string): Promise<void> {
  // A bid: INR leg first on RWA/INR at the maker price, hedged on RWA/USDT.
  const bid = harness(directory, "bid");
  assert.equal(await bid.engine.attempt("RWA", "BUY"), "NO_FILL");
  const input = bid.calls[0]!;
  assert.equal(input.route.buyMarket, "RWAINR");
  assert.equal(input.route.sellMarket, "RWAUSDT");
  assert.equal(input.plan.buyLimitPrice, 0.19227);
  assert.equal(input.plan.quantity, Math.floor(600 / 0.19227));
  assert.equal(input.primaryTimeoutMs, 8_000);
  // An ask mirrors it: INR leg sells on RWA/INR, hedge buys on RWA/USDT.
  assert.equal(await bid.engine.attempt("RWA", "SELL"), "NO_FILL");
  assert.equal(bid.calls[1]!.route.sellMarket, "RWAINR");
  assert.equal(bid.calls[1]!.plan.buyLimitPrice, 0.001953, "the ask's hedge buys at the fresh USDT ask");
  assert.equal(bid.calls[1]!.plan.sellLimitPrice, 0.20149);

  // Never crosses the book, never trades without funds or stock.
  const cross = harness(directory, "cross", {bestAsk: 0.19227});
  assert.match(await cross.engine.attempt("RWA", "BUY"), /^(WOULD_CROSS|NO_EDGE)/u);
  const poor = harness(directory, "poor", {balances: {INR: 100, RWA: 0, USDT: 0}});
  assert.match(await poor.engine.attempt("RWA", "BUY"), /^NO_FUNDS/u);
  assert.match(await poor.engine.attempt("RWA", "SELL"), /^NO_STOCK/u);
  assert.equal(cross.calls.length + poor.calls.length, 0, "no order on a blocked attempt");
  const quiet = harness(directory, "quiet", {quote: null});
  assert.match(await quiet.engine.attempt("RWA", "BUY"), /^NO_QUOTE/u);
  // A quiet stream: stale streamed books fall back to fresh REST snapshots.
  const stale = harness(directory, "stale", {bookAgeMs: 5_000});
  assert.match(await stale.engine.attempt("RWA", "BUY"), /^BOOK_STALE/u);
  const rest = harness(directory, "rest", {bookAgeMs: 5_000, rest: true});
  assert.equal(await rest.engine.attempt("RWA", "BUY"), "NO_FILL");
  assert.deepEqual(rest.fetched, ["RWAINR", "RWAUSDT"]);
  assert.equal(rest.calls[0]!.plan.buyLimitPrice, 0.19227, "re-priced one tick inside the fresh book");
  // Prices follow the fresh book, not the shadow's older quote.
  const moved = harness(directory, "moved", {quote: {bid: 0.1, ask: 0.3}});
  assert.equal(await moved.engine.attempt("RWA", "BUY"), "NO_FILL");
  assert.equal(moved.calls[0]!.plan.buyLimitPrice, 0.19227);
  const paused = harness(directory, "paused", {otherHalt: true});
  assert.match(await paused.engine.attempt("RWA", "BUY"), /^PAUSED/u);

  // An exchange rejection is not a quiet no-fill: it backs off.
  const refused = session("NO_FILL", 0, null);
  const rejected = harness(directory, "rejected", {outcome: {...refused, primary: {idempotencyKey: "p", venue: "coindcx", market: "RWAINR", side: "buy", requestedQuantity: 3_100,
    limitPrice: 0.19227, filledQuantity: 0, averagePrice: null, orderId: null, status: "FAILED", bufferPercent: null, reasons: ["Price should be within 0.19760 and 0.21840"]}}});
  assert.match(await rejected.engine.attempt("RWA", "BUY"), /^REJECTED: Price should be within/u);
  assert.equal(rejected.engine.getDiagnostics().haltedReason, null);

  // A clean fill is recorded with its realized P&L.
  const filled = harness(directory, "filled", {outcome: session("COMPLETED", 3_100, 4.2)});
  assert.equal(await filled.engine.attempt("RWA", "BUY"), "COMPLETED");
  let diagnostics = filled.engine.getDiagnostics();
  assert.equal(diagnostics.recentFills.length, 1);
  assert.equal(diagnostics.realizedTodayInr, 4.2);
  assert.equal(diagnostics.haltedReason, null);
  assert.equal(filled.published.length, 0);

  // Anything but a clean end halts every worker and publishes the halt.
  const broken = harness(directory, "broken", {outcome: session("RECOVERY_REQUIRED", 3_100, null, 3_100)});
  assert.equal(await broken.engine.attempt("RWA", "BUY"), "RECOVERY_REQUIRED");
  diagnostics = broken.engine.getDiagnostics();
  assert.match(diagnostics.haltedReason ?? "", /^IXM RECOVERY_REQUIRED/u);
  assert.match(broken.published[0] ?? "", /^IXM RECOVERY_REQUIRED/u);
  assert.equal(diagnostics.inventory.RWA, 3_100, "the unhedged residual is the open position");
  assert.match(await broken.engine.attempt("RWA", "SELL"), /^HALTED/u);
  assert.equal(broken.engine.releaseHalt("yes"), false);
  assert.equal(broken.engine.releaseHalt(IXM_HALT_RELEASE_CONFIRMATION), true);
  assert.equal(broken.published.at(-1), null);
  // The open position now blocks more buys past the inventory limit (3,100 x 0.19 ~ INR 596 < 2,000: still allowed).
  assert.equal(await broken.engine.attempt("RWA", "BUY"), "RECOVERY_REQUIRED");

  // Daily loss stop: halts IXM (not the other runners) and lifts at IST midnight.
  const losing = harness(directory, "losing", {outcome: session("COMPLETED", 3_100, -250)});
  await losing.engine.attempt("RWA", "BUY");
  assert.match(losing.engine.getDiagnostics().haltedReason ?? "", /^IXM_DAILY_LOSS\[/u);
  assert.equal(losing.published.length, 0, "a loss stop is not an exposure halt");
  assert.match(await losing.engine.attempt("RWA", "BUY"), /^HALTED/u);
  losing.advance(24 * 3_600_000);
  assert.equal(losing.engine.getDiagnostics().haltedReason, null);

  // Off: start() runs no worker.
  const off = harness(directory, "off", {config: {mode: "off"}});
  off.engine.start();
  assert.equal(off.engine.getDiagnostics().running, false);
}

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-ixm-live-"));
  try {
    testConfig();
    await testAttempts(directory);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
  console.log("In-exchange maker live passed: off unless mode, phrase and LIVE runtime agree; bid and ask as audited INR-route sessions on CoinDCX INR then USDT; never crossing, funded, inventory-capped; clean fills recorded; any other end halts all workers until released; IXM daily loss stop lifts at IST midnight.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
