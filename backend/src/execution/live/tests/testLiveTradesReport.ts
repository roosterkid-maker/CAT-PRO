import assert from "node:assert/strict";

import {buildLiveTradesReport} from "../history/LiveTradesReport";
import type {ArbitragePnLRecord} from "../history/ArbitragePnLReport";
import type {InrRouteSession} from "../inr-routes/InrRouteSessionExecutor";

const NOW = 1_790_000_000_000;

function record(overrides: Partial<ArbitragePnLRecord>): ArbitragePnLRecord {
  return {
    opportunityId: "opp-1",
    market: "ZROUSDT",
    buyExchange: "bybit",
    sellExchange: "coindcx",
    status: "COMPLETED",
    matchedQuantity: 10,
    buyAveragePrice: 1.5,
    sellAveragePrice: 1.53,
    grossProfit: 0.3,
    totalFees: 0.05,
    netProfit: 0.25,
    netProfitPercent: 1.6667,
    recoveryRequired: false,
    completedAt: NOW - 5_000,
    ...overrides,
  };
}

function fill(side: "buy" | "sell", venue: string, filled: number, price: number) {
  return {
    idempotencyKey: `${venue}-${side}`, venue, market: "X", side, requestedQuantity: filled,
    limitPrice: price, filledQuantity: filled, averagePrice: price, orderId: "o", status: "FILLED",
    bufferPercent: null, reasons: [],
  };
}

function session(overrides: Partial<InrRouteSession>): InrRouteSession {
  return {
    schemaVersion: "1.0",
    sessionId: "inr-1",
    route: {
      routeKey: "INR_USDT|FLR|bybit:FLRUSDT>coinswitch:FLRINR", kind: "INR_USDT", coin: "FLR",
      buyVenue: "bybit", buyMarket: "FLRUSDT", sellVenue: "coinswitch", sellMarket: "FLRINR",
      buyVenueMarket: "FLRUSDT", sellVenueMarket: "FLR_INR", buyToInr: 100, sellToInr: 1, feesPercent: 0.6,
    },
    plan: {quantity: 2_000, buyLimitPrice: 0.007, sellLimitPrice: 0.73, buyAveragePrice: 0.007, sellAveragePrice: 0.73, notionalInr: 1_400, expectedNetPercent: 3.7, expectedNetInr: 52},
    primarySide: "sell",
    state: "COMPLETED",
    startedAt: NOW - 3_000,
    updatedAt: NOW - 1_000,
    primary: fill("sell", "coinswitch", 2_000, 0.73),
    hedges: [fill("buy", "bybit", 1_200, 0.007), fill("buy", "bybit", 800, 0.00701)],
    hedgedQuantity: 2_000,
    residualQuantity: 0,
    residualInr: 0,
    realizedNetInr: 50,
    reasons: [],
    ...overrides,
  };
}

const report = buildLiveTradesReport({
  strategyOne: [record({}), record({opportunityId: "opp-2", status: "NOT_FILLED", completedAt: NOW})],
  inrSessions: [
    session({}),
    session({sessionId: "inr-nofill", state: "NO_FILL", updatedAt: NOW}),
    session({sessionId: "inr-stuck", state: "RECOVERY_REQUIRED", hedges: [], hedgedQuantity: 0, residualQuantity: 2_000, realizedNetInr: 0, updatedAt: NOW - 500}),
  ],
  usdtInrRate: 100,
  limit: 60,
  now: NOW,
});

assert.equal(report.trades.length, 3, "attempts that filled nothing are not trades");
assert.deepEqual(report.trades.map((trade) => trade.id), ["inr:inr-stuck", "inr:inr-1", "s1:opp-1"], "newest first");

const inr = report.trades[1];
assert.equal(inr.route, "INR_USDT");
assert.equal(inr.buy.venue, "bybit");
assert.equal(inr.sell.venue, "coinswitch");
assert.equal(inr.sell.market, "FLR_INR");
assert.equal(inr.buy.quantity, 2_000, "hedge fills aggregate into the buy leg");
assert.ok(Math.abs((inr.buy.averagePrice ?? 0) - (1_200 * 0.007 + 800 * 0.00701) / 2_000) < 1e-12);
assert.equal(inr.sell.averagePrice, 0.73);
assert.equal(inr.matchedQuantity, 2_000);
assert.equal(inr.netInr, 50);
assert.ok(inr.netPercent !== null && inr.netPercent > 3.5 && inr.netPercent < 3.6);

const stuck = report.trades[0];
assert.equal(stuck.status, "RECOVERY_REQUIRED");
assert.equal(stuck.residualQuantity, 2_000);
assert.equal(stuck.buy.quantity, null, "the unfilled leg shows no fill");

const usdt = report.trades[2];
assert.equal(usdt.route, "USDT_USDT");
assert.equal(usdt.coin, "ZRO");
assert.equal(usdt.netInr, 25, "USDT net converted at the USDT/INR rate");
assert.equal(usdt.notionalInr, 1_500);

assert.equal(report.totals.completed, 2);
assert.equal(report.totals.needingAttention, 1);
assert.equal(report.totals.netInr, 75);

console.log("Live trades report passed: both legs per trade across USDT and INR routes, unfilled attempts excluded, unhedged remainders flagged.");
