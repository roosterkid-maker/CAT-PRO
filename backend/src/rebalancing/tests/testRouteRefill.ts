import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import {planRouteRefills, type RefillTarget} from "../services/RouteInventoryRefillPlanner";
import {RouteRefillService} from "../services/RouteRefillService";
import type {StockBuyPort, StockBuyRequest, StockBuyResult} from "../services/StockBuyExecutor";
import type {RebalancingExecutionConfig} from "../execution/RebalancingExecutionConfig";
import type {RebalancingMoveOutcome} from "../execution/RebalancingExecutionService";
import type {RebalancingDecisionPlan} from "../services/RebalancingDecisionEngine";

const VENUES = ["binance", "bybit", "coindcx", "coinswitch", "unocoin"];

const TARGETS: RefillTarget[] = [
  {coin: "FLR", rank: 1, coinVenue: "coinswitch", coinNeedInr: 3_000, cashVenue: "bybit", cashAsset: "USDT", cashNeedInr: 3_000},
  {coin: "DASH", rank: 2, coinVenue: "binance", coinNeedInr: 4_500, cashVenue: "unocoin", cashAsset: "INR", cashNeedInr: 4_500},
  {coin: "SKY", rank: 3, coinVenue: "binance", coinNeedInr: 3_000, cashVenue: "unocoin", cashAsset: "INR", cashNeedInr: 3_000},
  {coin: "ONDO", rank: 4, coinVenue: "binance", coinNeedInr: 3_000, cashVenue: "bybit", cashAsset: "USDT", cashNeedInr: 2_000},
  {coin: "RAY", rank: 5, coinVenue: "binance", coinNeedInr: 2_000, cashVenue: "coinswitch", cashAsset: "INR", cashNeedInr: 2_000},
];

const HOLDINGS: Record<string, number> = {
  "coinswitch|FLR": 500,
  "bybit|FLR": 2_000,
  "bybit|USDT": 1_000,
  "binance|USDT": 6_000,
  "binance|DASH": 3_120,
  "unocoin|INR": 363,
  "binance|ONDO": 2_900,
  "coinswitch|INR": 1_900,
  "coinswitch|USDT": 0,
};

function plan(overrides: Partial<Parameters<typeof planRouteRefills>[0]> = {}) {
  return planRouteRefills({
    targets: TARGETS,
    venues: VENUES,
    holdingInr: (venue, asset) => HOLDINGS[`${venue}|${asset}`] ?? 0,
    priceInr: (asset) => ({FLR: 0.7, SKY: 7, DASH: 6_250} as Record<string, number>)[asset] ?? null,
    autoUsdtDestinations: ["bybit", "coindcx"],
    refillBelowShare: 0.5,
    sourceFloorInr: 500,
    minimumActionInr: 300,
    ...overrides,
  });
}

function testPlanner(): void {
  const result = plan();
  const byId = new Map(result.actions.map((action) => [action.id, action]));

  const flr = byId.get("MOVE_COIN|FLR|bybit>coinswitch");
  assert.ok(flr, JSON.stringify(result.actions.map((a) => a.id)));
  assert.equal(flr.mode, "MANUAL", "Bybit has no withdrawal client: manual");
  assert.equal(flr.amountInr, 2_000, "bounded by what the source holds");
  assert.ok(Math.abs((flr.quantity ?? 0) - 2_000 / 0.7) < 1e-9);

  const usdt = byId.get("MOVE_USDT|binance>bybit");
  assert.ok(usdt);
  assert.equal(usdt.mode, "AUTO", "Binance to a whitelisted exchange is automatic");
  assert.equal(usdt.amountInr, 4_000, "FLR and ONDO targets on Bybit USDT add up: 5,000 - 1,000");
  assert.deepEqual([...usdt.coins].sort(), ["FLR", "ONDO"]);

  const inr = byId.get("DEPOSIT_INR|unocoin");
  assert.ok(inr);
  assert.equal(inr.mode, "MANUAL");
  assert.equal(inr.amountInr, 7_500 - 363, "DASH and SKY share UnoCoin INR");

  assert.equal(result.actions.some((action) => action.coins.includes("DASH") && action.kind === "MOVE_COIN"), false,
    "DASH on Binance is above half of target: no action");
  assert.equal(byId.get("BUY_COIN|RAY|binance")?.mode, "MANUAL", "no RAY anywhere: buy it on its sell venue");
  assert.equal(result.actions.some((action) => action.coins.includes("ONDO") && action.kind !== "MOVE_USDT"), false, "ONDO on Binance is above half of target");
  const binanceCoins = result.actions.filter((action) => action.toVenue === "binance");
  assert.ok(binanceCoins.some((action) => action.id === "BUY_COIN|SKY|binance"), "nobody else holds SKY: buy it");
  assert.equal(result.actions.some((action) => action.id === "DEPOSIT_INR|coinswitch"), false, "CoinSwitch INR is 95% of target");

  // Destination not whitelisted, or automation off: the same move is manual.
  const offline = plan({autoUsdtDestinations: []});
  assert.equal(offline.actions.find((action) => action.id === "MOVE_USDT|binance>bybit")?.mode, "MANUAL");

  // Nothing to move from: add USDT manually.
  const dry = plan({holdingInr: (venue, asset) => (asset === "USDT" ? 0 : HOLDINGS[`${venue}|${asset}`] ?? 0)});
  assert.equal(dry.actions.find((action) => action.id === "DEPOSIT_USDT|bybit")?.mode, "MANUAL");
}

class FakePort {
  readonly moves: number[] = [];
  constructor(private readonly status: RebalancingMoveOutcome["status"] = "EXECUTED") {}
  async executeCrossExchangeMoves(planValue: RebalancingDecisionPlan): Promise<readonly RebalancingMoveOutcome[]> {
    return planValue.desiredMoves.map((move) => {
      this.moves.push(move.amountUsdt);
      return {kind: "CROSS_EXCHANGE", exchange: "binance", destinationExchange: "bybit", amountUsdt: move.amountUsdt, status: this.status, detail: "fake", referenceId: this.status === "EXECUTED" ? "w-1" : null};
    });
  }
}

function config(overrides: Partial<RebalancingExecutionConfig> = {}): RebalancingExecutionConfig {
  return {
    enabled: true,
    sameExchangeEnabled: false,
    crossExchangeEnabled: true,
    maximumPerTransferUsdt: 25,
    maximumPerDaySameExchangeUsdt: 60,
    maximumPerDayCrossExchangeUsdt: 150,
    withdrawalWhitelist: [{exchange: "bybit", asset: "USDT", network: "BSC", address: "0xabc", addressTag: null}],
    ...overrides,
  } as RebalancingExecutionConfig;
}

async function testAutoExecution(directory: string): Promise<void> {
  const valuation = {
    usdtInr: 100,
    quantity: () => 0,
    holdingInr: (venue: string, asset: string) => HOLDINGS[`${venue}|${asset}`] ?? 0,
    priceInr: () => null,
  };
  const service = (name: string, configValue = config()) =>
    new RouteRefillService({
      getTargets: () => TARGETS,
      getValuation: () => valuation,
      getConfig: () => configValue,
      getTradeSizeInr: () => 1_500,
    }, join(directory, `${name}.jsonl`));
  const now = 1_790_000_000_000;

  const port = new FakePort();
  const refill = service("auto");
  const first = await refill.executeAuto(port, now);
  assert.equal(first.find((item) => item.toVenue === "bybit")?.status, "EXECUTED");
  assert.deepEqual(port.moves, [25], "₹4,000 is 40 USDT, clamped to the 25 USDT per-transfer cap");

  const soon = await refill.executeAuto(port, now + 5 * 60_000);
  assert.equal(soon.find((item) => item.toVenue === "bybit")?.status, "SKIPPED_COOLDOWN", "no second top-up while the first is in flight");
  assert.deepEqual(port.moves, [25]);

  // The cooldown survives a restart.
  const restarted = service("auto");
  assert.equal((await restarted.executeAuto(port, now + 10 * 60_000)).find((item) => item.toVenue === "bybit")?.status, "SKIPPED_COOLDOWN");
  const later = await restarted.executeAuto(port, now + 31 * 60_000);
  assert.equal(later.find((item) => item.toVenue === "bybit")?.status, "EXECUTED");
  assert.deepEqual(port.moves, [25, 25]);
  assert.equal(restarted.getPlan(now + 31 * 60_000).recentExecutions.length, 2);

  // Master switch off: nothing is attempted and every move is manual.
  const offPort = new FakePort();
  const off = service("off", config({enabled: false}));
  assert.deepEqual(await off.executeAuto(offPort, now), []);
  assert.equal(offPort.moves.length, 0);
  assert.equal(off.getPlan(now).actions.every((action) => action.mode === "MANUAL"), true);

  // A cap rejection is recorded and does not start the cooldown.
  const rejecting = new FakePort("SKIPPED_CAP_REJECTED");
  const capped = service("capped");
  assert.equal((await capped.executeAuto(rejecting, now)).find((item) => item.toVenue === "bybit")?.status, "SKIPPED_CAP_REJECTED");
  assert.equal(capped.getPlan(now).automation.lastTopUpAt.bybit, undefined);

  // A refused withdrawal (Binance Travel Rule) backs off for hours instead of
  // retrying - and spending cap - every cycle.
  class RefusingPort extends FakePort {
    async executeCrossExchangeMoves(planValue: RebalancingDecisionPlan): Promise<readonly RebalancingMoveOutcome[]> {
      return planValue.desiredMoves.map((move) => {
        this.moves.push(move.amountUsdt);
        return {kind: "CROSS_EXCHANGE" as const, exchange: "binance" as const, destinationExchange: "bybit" as const, amountUsdt: move.amountUsdt, status: "FAILED" as const,
          detail: "Binance POST /sapi/v1/capital/withdraw/apply failed: status=400, code=-4104, message=... travel rule restrictions", referenceId: null};
      });
    }
  }
  const refusing = new RefusingPort();
  const travel = service("travel");
  assert.equal((await travel.executeAuto(refusing, now)).find((item) => item.toVenue === "bybit")?.status, "FAILED");
  assert.equal((await travel.executeAuto(refusing, now + 3 * 60_000)).find((item) => item.toVenue === "bybit")?.status, "SKIPPED_BACKOFF");
  assert.equal((await travel.executeAuto(refusing, now + 5 * 3_600_000)).find((item) => item.toVenue === "bybit")?.status, "SKIPPED_BACKOFF");
  assert.deepEqual(refusing.moves, [25], "one attempt, then paused");
  assert.match(travel.getPlan(now).automation.blocked.bybit?.reason ?? "", /Travel Rule/u);
  assert.equal((await travel.executeAuto(refusing, now + 6 * 3_600_000 + 1)).find((item) => item.toVenue === "bybit")?.status, "FAILED", "tried again after 6 h");

  // Too small to be worth a withdrawal fee.
  const tiny = new RouteRefillService({
    getTargets: () => [{coin: "ONDO", rank: 1, coinVenue: "binance", coinNeedInr: 0, cashVenue: "bybit", cashAsset: "USDT", cashNeedInr: 1_600}],
    getValuation: () => ({...valuation, holdingInr: (venue: string, asset: string) => (venue === "bybit" && asset === "USDT" ? 700 : asset === "USDT" ? 6_000 : 0)}),
    getConfig: () => config(),
    getTradeSizeInr: () => 1_500,
  }, join(directory, "tiny.jsonl"));
  const tinyPort = new FakePort();
  assert.equal((await tiny.executeAuto(tinyPort, now)).find((item) => item.toVenue === "bybit")?.status, "SKIPPED_TOO_SMALL");
  assert.equal(tinyPort.moves.length, 0);
}

/* Bybit as a USDT source (to Binance) and the Funding -> Unified sweep. */
async function testBybitSource(directory: string): Promise<void> {
  const targets: RefillTarget[] = [
    {coin: "LINK", rank: 1, coinVenue: "bybit", coinNeedInr: 0, cashVenue: "binance", cashAsset: "USDT", cashNeedInr: 2_500},
  ];
  const holdings: Record<string, number> = {"binance|USDT": 1_000, "bybit|USDT": 4_400};
  const valuation = {
    usdtInr: 100,
    quantity: () => 0,
    holdingInr: (venue: string, asset: string) => holdings[`${venue}|${asset}`] ?? 0,
    priceInr: () => null,
  };
  const whitelist = [
    {exchange: "bybit" as const, asset: "USDT", network: "BSC", address: "0xabc", addressTag: null},
    {exchange: "binance" as const, asset: "USDT", network: "BSC", address: "0xdef", addressTag: null},
  ];
  const withBybit = config({withdrawalWhitelist: whitelist, bybitWithdrawEnabled: true, bybitFundingSweepEnabled: true, bybitTravelRuleBeneficiaryName: "Holder"});
  const service = (name: string, configValue: RebalancingExecutionConfig) => new RouteRefillService({
    getTargets: () => targets,
    getValuation: () => valuation,
    getConfig: () => configValue,
    getTradeSizeInr: () => 1_500,
  }, join(directory, `${name}.jsonl`));
  const now = 1_790_000_000_000;

  // Planner: the move from Bybit is AUTO only when Bybit withdrawals are on.
  const moveFor = (configValue: RebalancingExecutionConfig) =>
    service(`plan-${Math.random()}`, configValue).getPlan(now).actions.find((action) => action.kind === "MOVE_USDT");
  assert.equal(moveFor(withBybit)?.fromVenue, "bybit");
  assert.equal(moveFor(withBybit)?.mode, "AUTO");
  assert.equal(moveFor(config({withdrawalWhitelist: whitelist}))?.mode, "MANUAL");
  assert.equal(moveFor({...withBybit, bybitTravelRuleBeneficiaryName: null})?.mode, "MANUAL", "no KYC name: manual");

  const calls: {destination: string; amount: number}[] = [];
  let sweeps = 0;
  const port = {
    executeCrossExchangeMoves: async () => {
      throw new Error("the Binance path must not be used for a Bybit-sourced move");
    },
    executeBybitWithdrawal: async (destination: string, amountUsdt: number): Promise<RebalancingMoveOutcome> => {
      calls.push({destination, amount: amountUsdt});
      return {kind: "CROSS_EXCHANGE", exchange: "bybit", destinationExchange: "binance", amountUsdt, status: "EXECUTED", detail: "ok", referenceId: "bybit:w-1"};
    },
    sweepBybitFundingToUnified: async (): Promise<readonly RebalancingMoveOutcome[]> => {
      sweeps += 1;
      return sweeps === 1
        ? [{kind: "SAME_EXCHANGE", exchange: "bybit", destinationExchange: null, amountUsdt: 23.39, status: "EXECUTED", detail: "Moved 23.39 USDT", referenceId: "t-1"}]
        : [];
    },
  };
  const refill = service("bybit-auto", withBybit);
  const results = await refill.executeAuto(port, now);
  // Bybit surplus: 4,400 - 500 floor = ₹3,900; deficit ₹1,500 -> 15 USDT.
  assert.deepEqual(calls, [{destination: "binance", amount: 15}]);
  assert.equal(results.find((item) => item.kind === "FUNDING_SWEEP")?.status, "EXECUTED");
  assert.equal(results.find((item) => item.actionId.startsWith("MOVE_USDT|bybit>binance"))?.status, "EXECUTED");
  assert.equal((await refill.executeAuto(port, now + 60_000)).find((item) => item.toVenue === "binance")?.status, "SKIPPED_COOLDOWN");
  assert.equal(calls.length, 1);

  // A Travel Rule refusal from Bybit pauses that destination for hours.
  const refusing = {
    ...port,
    executeBybitWithdrawal: async (_destination: string, amountUsdt: number): Promise<RebalancingMoveOutcome> =>
      ({kind: "CROSS_EXCHANGE", exchange: "bybit", destinationExchange: "binance", amountUsdt, status: "FAILED", detail: "retCode=131002 beneficiary required", referenceId: null}),
  };
  const refused = service("bybit-refused", withBybit);
  await refused.executeAuto(refusing, now);
  const block = refused.getPlan(now).automation.blocked.binance;
  assert.ok(block && block.until === now + 6 * 3_600_000);
  assert.match(block.reason, /Bybit refused/u);

  // A failing sweep backs off instead of retrying every cycle.
  let failingSweeps = 0;
  const failingSweep = {
    ...port,
    sweepBybitFundingToUnified: async (): Promise<readonly RebalancingMoveOutcome[]> => {
      failingSweeps += 1;
      throw new Error("network");
    },
  };
  const sweeper = service("sweep-fail", withBybit);
  await sweeper.executeAuto(failingSweep, now);
  await sweeper.executeAuto(failingSweep, now + 3 * 60_000);
  assert.equal(failingSweeps, 1);
}

/* Capital manager buys core stock itself: daily cap, cash floor, backoffs. */
async function testAutoStockBuy(directory: string): Promise<void> {
  const now = 1_790_000_000_000;
  const targets: RefillTarget[] = [
    {coin: "LINK", rank: 1, coinVenue: "binance", coinNeedInr: 7_500, cashVenue: "unocoin", cashAsset: "INR", cashNeedInr: 0, coinVenueQuote: "USDT"},
    {coin: "GRAM", rank: 2, coinVenue: "coinswitch", coinNeedInr: 2_400, cashVenue: "bybit", cashAsset: "USDT", cashNeedInr: 0, coinVenueQuote: "INR"},
  ];
  const holdings: Record<string, number> = {"binance|USDT": 6_000, "coinswitch|INR": 1_500};

  // Planner: with auto-buy on, BUY_COIN is AUTO and carries its quote.
  const planned = planRouteRefills({
    targets,
    venues: VENUES,
    holdingInr: (venue, asset) => holdings[`${venue}|${asset}`] ?? 0,
    priceInr: () => null,
    autoUsdtDestinations: [],
    autoBuyVenues: ["binance", "coinswitch"],
    refillBelowShare: 0.5,
    sourceFloorInr: 500,
    minimumActionInr: 300,
  });
  const link = planned.actions.find((action) => action.id === "BUY_COIN|LINK|binance");
  assert.equal(link?.mode, "AUTO");
  assert.equal(link?.buyQuote, "USDT");

  class FakeBuy implements StockBuyPort {
    readonly requests: StockBuyRequest[] = [];
    constructor(private readonly outcome: (request: StockBuyRequest) => StockBuyResult) {}
    async buy(request: StockBuyRequest): Promise<StockBuyResult> {
      this.requests.push(request);
      return this.outcome(request);
    }
  }
  const valuation = {usdtInr: 100, quantity: () => 0, holdingInr: (venue: string, asset: string) => holdings[`${venue}|${asset}`] ?? 0, priceInr: () => null};
  const service = (name: string, port: StockBuyPort, enabled = true) => new RouteRefillService({
    getTargets: () => targets,
    getValuation: () => valuation,
    getConfig: () => config(),
    getTradeSizeInr: () => 1_500,
    getAutoBuyConfig: () => ({enabled, dailyCapInr: 5_000, cashFloorInr: 1_000}),
    getBuyPort: async () => port,
  }, join(directory, `${name}.jsonl`));

  const filled = new FakeBuy((request) => ({status: "FILLED", spentInr: request.amountInr, filledQuantity: 1, averagePrice: 1, orderId: "o", detail: "ok"}));
  const buyer = service("buy", filled);
  const first = await buyer.executeAuto(new FakePort(), now);
  const buys = first.filter((item) => item.kind === "STOCK_BUY");
  // LINK: min(7,500 target, 5,000 cap, 6,000 - 1,000 floor) = 5,000; GRAM: cap exhausted.
  assert.deepEqual(filled.requests.map((request) => [request.coin, request.venue, request.quote, request.amountInr]), [["LINK", "binance", "USDT", 5_000]]);
  assert.equal(buys[0]?.status, "BUY_FILLED");
  assert.equal(buyer.getPlan(now).automation.autoBuy.spentTodayInr, 5_000);
  await buyer.executeAuto(new FakePort(), now + 60_000);
  assert.equal(filled.requests.length, 1, "daily cap reached: no more buys today");

  // Cash floor: CoinSwitch has 1,500 INR, keeps 1,000 -> at most 500.
  const floorPort = new FakeBuy((request) => ({status: "FILLED", spentInr: request.amountInr, filledQuantity: 1, averagePrice: 1, orderId: "o", detail: "ok"}));
  const floored = service("floor", floorPort);
  holdings["binance|USDT"] = 900;
  await floored.executeAuto(new FakePort(), now);
  assert.deepEqual(floorPort.requests.map((request) => [request.coin, request.amountInr]), [["GRAM", 500]], "LINK skipped (Binance below floor); GRAM limited by the floor");
  holdings["binance|USDT"] = 6_000;

  // Unknown outcome: counts in full against the cap and pauses that coin for hours.
  const unknownPort = new FakeBuy((request) => ({status: "UNKNOWN", spentInr: request.amountInr, filledQuantity: 0, averagePrice: null, orderId: null, detail: "lost"}));
  const unsure = service("unknown", unknownPort);
  await unsure.executeAuto(new FakePort(), now);
  assert.equal(unsure.getPlan(now).automation.autoBuy.spentTodayInr, 5_000);
  assert.ok(unsure.getPlan(now).automation.autoBuy.paused["binance|LINK"]);

  // No fill: short pause, nothing spent.
  const emptyPort = new FakeBuy(() => ({status: "NO_FILL", spentInr: 0, filledQuantity: 0, averagePrice: null, orderId: "o", detail: "no fill"}));
  const empty = service("empty", emptyPort);
  await empty.executeAuto(new FakePort(), now);
  await empty.executeAuto(new FakePort(), now + 5 * 60_000);
  assert.equal(emptyPort.requests.filter((request) => request.coin === "LINK").length, 1, "paused after a no-fill");
  assert.equal(empty.getPlan(now).automation.autoBuy.spentTodayInr, 0);

  // Switched off: nothing is bought and BUY_COIN stays manual.
  const offPort = new FakeBuy(() => { throw new Error("must not buy"); });
  const off = service("off", offPort, false);
  await off.executeAuto(new FakePort(), now);
  assert.equal(offPort.requests.length, 0);
  assert.equal(off.getPlan(now).actions.find((action) => action.kind === "BUY_COIN")?.mode, "MANUAL");
}

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-route-refill-"));
  try {
    testPlanner();
    await testAutoExecution(directory);
    await testAutoStockBuy(directory);
    await testBybitSource(directory);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
  console.log("Route refill passed: targets aggregate per venue/asset, coin moves back from where it piled up, INR deposits and coin buys stay manual, Binance and Bybit USDT to whitelisted venues is automatic within caps, cooldown and minimum size; Bybit Funding is swept to Unified.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
