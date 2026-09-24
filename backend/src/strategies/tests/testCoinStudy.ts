import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import {
  buildCoinStudyReport,
  CoinStudyService,
  ingestWindows,
  istHour,
} from "../inr-arbitrage/CoinStudyService";
import type {OpportunityWindow} from "../inr-arbitrage/InrArbitrageScannerService";

const NOW = 1_790_236_800_000; // 2026-09-24 ~13:30 IST

let sequence = 0;
function window(overrides: Partial<OpportunityWindow>): OpportunityWindow {
  sequence += 1;
  const startedAt = overrides.startedAt ?? NOW - 3_600_000;
  const durationMs = overrides.durationMs ?? 60_000;
  return {
    id: `w-${sequence}`,
    routeKey: "r",
    kind: "INR_USDT",
    coin: "FLR",
    buyVenue: "bybit",
    buyMarket: "FLRUSDT",
    sellVenue: "coinswitch",
    sellMarket: "FLR_INR",
    startedAt,
    lastSeenAt: startedAt + durationMs,
    endedAt: startedAt + durationMs,
    durationMs,
    scans: 10,
    peakNetPercent: 4,
    lastNetPercent: 3,
    peakDepthInr: 3_000,
    minimumOrderInr: 150,
    tdsVerified: true,
    alertedAt: null,
    ...overrides,
  };
}

function freshState() {
  return {schemaVersion: "1.0" as const, firstWindowAt: null, lastIngestedEndedAt: 0, boundaryIds: [] as string[], days: {}};
}

function testAggregationAndRanking(): void {
  const state = freshState();
  const windows = [
    // FLR: long, one-way, deep.
    ...Array.from({length: 10}, (_, i) => window({startedAt: NOW - 3_600_000 + i * 120_000, durationMs: 60_000})),
    // SKY: two-way between unocoin and binance.
    window({coin: "SKY", buyVenue: "unocoin", buyMarket: "SKY_INR", sellVenue: "binance", sellMarket: "SKYUSDT", durationMs: 300_000, peakNetPercent: 2, peakDepthInr: 2_000}),
    window({coin: "SKY", buyVenue: "binance", buyMarket: "SKYUSDT", sellVenue: "unocoin", sellMarket: "SKY_INR", durationMs: 120_000, peakNetPercent: 1.5, peakDepthInr: 2_000}),
    // A one-scan fluke still counts one scan interval but never makes the core.
    window({coin: "FLUKE", durationMs: 0, peakNetPercent: 9, peakDepthInr: 100}),
  ];
  assert.equal(ingestWindows(state, windows), 13);
  assert.equal(ingestWindows(state, windows), 0, "re-feeding the same windows adds nothing");
  const later = window({coin: "FLR", startedAt: NOW - 60_000, durationMs: 30_000});
  assert.equal(ingestWindows(state, [...windows, later]), 1, "only the newly closed window is added");

  const holdings: Record<string, number> = {"coinswitch|FLR": 3_300, "bybit|USDT": 2_500};
  const report = buildCoinStudyReport(state, {
    now: NOW,
    tradeSizeInr: 1_500,
    holding: (venue, asset) => holdings[`${venue}|${asset}`] ?? 0,
  });

  assert.equal(report.totals.coins, 3);
  assert.equal(report.coins[0].coin, "FLR", "most edge-minutes x net x depth ranks first");
  assert.ok(Math.abs(report.coins[0].edgeMinutes - 10.5) < 1e-9);
  assert.equal(report.coins[0].directions[0].sellVenue, "coinswitch");
  assert.equal(report.coins[0].twoWay, false);
  assert.deepEqual(report.coreBasket, ["FLR", "SKY"], "a one-scan fluke is not core");

  const flr = report.coins[0];
  assert.equal(flr.placement.trades, 5, "top-3 one-way core coin: 5 trades of stock");
  assert.equal(flr.placement.coin.venue, "coinswitch", "hold the coin where it is SOLD");
  assert.equal(flr.placement.cash.venue, "bybit", "hold cash where it is BOUGHT");
  assert.equal(flr.placement.cash.asset, "USDT");
  assert.equal(flr.placement.coin.needInr, 7_500);
  assert.equal(flr.placement.coin.haveInr, 3_300);
  assert.equal(flr.peakHoursIst[0], istHour(NOW - 3_600_000));

  const sky = report.coins.find((coin) => coin.coin === "SKY")!;
  assert.equal(sky.twoWay, true, "a reverse direction with >= 20% of the time");
  assert.equal(sky.placement.trades, 4, "two-way coins rebalance themselves: one trade less");
  assert.equal(sky.placement.coin.needInr, 4 * 1_500);
  assert.ok(Math.abs(sky.averageNetPercent - (2 * 300 + 1.5 * 120) / 420) < 1e-9, "time-weighted net");

  const fluke = report.coins.find((coin) => coin.coin === "FLUKE")!;
  assert.equal(fluke.core, false);
  assert.equal(fluke.placement.trades, 0);
  assert.ok(Math.abs(fluke.edgeMinutes - 1 / 60) < 1e-9);

  assert.equal(report.dataSufficient, false, "about an hour of data is not enough to trust");
}

function testRetentionAndPersistence(): void {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-coin-study-"));
  try {
    const file = join(directory, "study.jsonl");
    const old = window({coin: "OLD", startedAt: NOW - 10 * 86_400_000});
    const recent = window({coin: "FLR"});
    let feed: OpportunityWindow[] = [old, recent];
    const service = new CoinStudyService(() => feed, file, () => NOW);
    const report = service.getReport(1_500, () => null);
    assert.deepEqual(report.coins.map((coin) => coin.coin), ["FLR"], "the report covers the last 7 days only");
    assert.equal(report.coins[0].placement.coin.haveInr, null, "unknown holdings stay unknown");

    // A restart keeps the aggregates and does not double count.
    const restarted = new CoinStudyService(() => feed, file, () => NOW);
    assert.equal(restarted.getReport(1_500, () => null).coins[0].windows, 1);
    feed = [...feed, window({coin: "FLR", startedAt: NOW - 30_000, durationMs: 10_000})];
    assert.equal(restarted.getReport(1_500, () => null).coins[0].windows, 2);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
}

testAggregationAndRanking();
testRetentionAndPersistence();
console.log("Coin study passed: durable idempotent aggregation, 7-day ranking by edge-minutes x net x depth, core basket without flukes, two-way detection, and placement (coin on the sell venue, cash on the buy venue) against holdings.");
