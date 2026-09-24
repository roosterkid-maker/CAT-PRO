import assert from "node:assert/strict";

import {allocateCapital, buildVenuePlan, type AllocationCandidate} from "../services/CapitalAllocator";
import {
  legSizeForBudget,
  publishDynamicLegSize,
  resetDynamicLegSizeForTests,
} from "../../execution/live/inr-routes/InrDynamicLegSize";
import {loadInrRouteExecutionPolicy} from "../../execution/live/inr-routes/InrRouteExecutionPolicy";

function testLegSize(): void {
  // Small capital keeps the configured leg; the leg grows so the budget
  // always covers 8 full trades (coin + cash side each), up to the cap.
  assert.equal(legSizeForBudget(23_724, 1_500, 5_000), 1_500);
  assert.equal(legSizeForBudget(30_000, 1_500, 5_000), 1_800);
  assert.equal(legSizeForBudget(60_000, 1_500, 5_000), 3_700);
  assert.equal(legSizeForBudget(500_000, 1_500, 5_000), 5_000);
  assert.equal(legSizeForBudget(0, 1_500, 5_000), 1_500);

  // The INR executor reads the published leg only when dynamic legs are on,
  // never below the configured leg, never above the dynamic cap, and falls
  // back to the configured leg when the publication is stale or missing.
  const environment = {CAT_PRO_LIVE_TRADE_CAPITAL_INR: "1500", CAT_PRO_INR_DYNAMIC_LEG_ENABLED: "true", CAT_PRO_INR_DYNAMIC_LEG_MAX_INR: "4000"};
  resetDynamicLegSizeForTests();
  assert.equal(loadInrRouteExecutionPolicy(environment).targetCapitalPerLegInr, 1_500, "nothing published yet");
  publishDynamicLegSize({legInr: 3_000, budgetInr: 48_000, at: Date.now()});
  const scaled = loadInrRouteExecutionPolicy(environment);
  assert.equal(scaled.targetCapitalPerLegInr, 3_000);
  assert.equal(scaled.maximumCapitalPerLegInr, 3_000);
  publishDynamicLegSize({legInr: 9_000, budgetInr: 500_000, at: Date.now()});
  assert.equal(loadInrRouteExecutionPolicy(environment).targetCapitalPerLegInr, 4_000, "hard cap");
  assert.equal(loadInrRouteExecutionPolicy({CAT_PRO_LIVE_TRADE_CAPITAL_INR: "1500"}).targetCapitalPerLegInr, 1_500, "dynamic legs off");
  publishDynamicLegSize({legInr: 3_000, budgetInr: 48_000, at: Date.now() - 16 * 60_000});
  assert.equal(loadInrRouteExecutionPolicy(environment).targetCapitalPerLegInr, 1_500, "stale publication");
  resetDynamicLegSizeForTests();
}

function candidate(overrides: Partial<AllocationCandidate>): AllocationCandidate {
  return {
    coin: "X", weight: 0.5, coinVenue: "binance", coinVenueQuote: "USDT", cashVenue: "unocoin", cashAsset: "INR",
    perTradeInr: 1_500, maximumTrades: 5, expectedDailyProfitInr: 100, studyRank: null, ...overrides,
  };
}

function testVenuePlan(): void {
  // Ideal split of ₹24,000: whichever coins are core, the plan speaks in
  // exchanges and cash, not coins.
  const ideal = allocateCapital({
    budgetInr: 24_000,
    candidates: [
      candidate({coin: "SKY", weight: 0.5}),
      candidate({coin: "DASH", weight: 0.3}),
      candidate({coin: "FET", weight: 0.2, coinVenue: "bybit", cashVenue: "binance", cashAsset: "USDT"}),
    ],
  });
  const holdings: Record<string, number> = {
    "unocoin|INR": 11, "unocoin|DASH": 1_800,
    "binance|USDT": 1_000, "binance|LINK": 5_400, "bybit|FET": 3_900, "bybit|USDT": 500,
    "coindcx|FLR": 4_500, "coinswitch|INR": 3_000,
  };
  const plan = buildVenuePlan({
    ideal,
    holdingInr: (venue, asset) => holdings[`${venue}|${asset}`] ?? 0,
    assets: (venue) => Object.keys(holdings).filter((key) => key.startsWith(`${venue}|`)).map((key) => key.split("|")[1]!),
  });
  const row = (key: string) => plan.rows.find((item) => item.key === key)!;

  // UnoCoin is where the route cash is bought with: short by nearly all of it.
  const uno = row("unocoin");
  assert.equal(uno.fundWith, "INR");
  assert.ok(uno.cashTargetInr > 0 && uno.stockTargetInr === 0);
  assert.equal(uno.haveInr, 11, "DASH on UnoCoin belongs on Binance: not counted here");
  assert.ok(uno.gapInr > 5_000);

  // Binance + Bybit hold stock and USDT as one USDT row; idle LINK counts
  // (the manager can sell it), so this row holds more than its share.
  const usdt = row("binance+bybit");
  assert.equal(usdt.fundWith, "USDT");
  assert.equal(usdt.haveInr, 1_000 + 5_400 + 3_900 + 500);
  assert.equal(usdt.targetInr, usdt.cashTargetInr + usdt.stockTargetInr);

  // Every rupee of the ideal split lands in some row.
  const totalTarget = plan.rows.reduce((sum, item) => sum + item.targetInr, 0);
  assert.ok(Math.abs(totalTarget - ideal.allocatedInr) <= plan.rows.length);

  // Coin names appear only for stock on the wrong exchange.
  assert.deepEqual(plan.misplaced.map((item) => [item.coin, item.venue, item.toVenue]), [["DASH", "unocoin", "binance"]]);
}

testLegSize();
testVenuePlan();
console.log("Venue plan passed: per-leg size grows with capital within the cap and falls back safely; the plan tells how much cash each exchange should hold for all current opportunities, naming coins only for stock on the wrong exchange.");
