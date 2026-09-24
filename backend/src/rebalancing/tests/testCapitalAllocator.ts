import assert from "node:assert/strict";
import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import {allocateCapital, cashPool, type AllocationCandidate, type CapitalAllocation} from "../services/CapitalAllocator";
import {RouteRefillService} from "../services/RouteRefillService";
import type {StockBuyPort, StockBuyRequest, StockBuyResult, StockSellRequest} from "../services/StockBuyExecutor";
import type {RebalancingExecutionConfig} from "../execution/RebalancingExecutionConfig";
import {buildLiveSignal, ingestWindows} from "../../strategies/inr-arbitrage/CoinStudyService";
import type {OpportunityWindow} from "../../strategies/inr-arbitrage/InrArbitrageScannerService";

function candidate(overrides: Partial<AllocationCandidate>): AllocationCandidate {
  return {
    coin: "X",
    weight: 0.5,
    coinVenue: "binance",
    coinVenueQuote: "USDT",
    cashVenue: "unocoin",
    cashAsset: "INR",
    perTradeInr: 1_500,
    maximumTrades: 5,
    expectedDailyProfitInr: 100,
    studyRank: null,
    ...overrides,
  };
}

function testAllocator(): void {
  const coins = [
    candidate({coin: "GRAM", weight: 0.6}),
    candidate({coin: "FET", weight: 0.35}),
    candidate({coin: "LINK", weight: 0.05}),
  ];

  // ₹6,000 buys two full trades (coin + cash side each): the two strongest
  // coins get one each; LINK gets nothing rather than a sliver.
  const small = allocateCapital({budgetInr: 6_000, candidates: coins});
  assert.deepEqual(small.coins.map((coin) => [coin.coin, coin.trades]), [["GRAM", 1], ["FET", 1]]);
  assert.deepEqual(small.unfunded, ["LINK"]);
  assert.equal(small.coins[0]!.coinNeedInr, 1_500);
  assert.equal(small.coins[0]!.cashNeedInr, 1_500);
  assert.equal(small.allocatedInr, 6_000);

  // More capital: the same rule hands out more trades, strongest first,
  // and funds more coins; nobody exceeds the per-coin maximum.
  const large = allocateCapital({budgetInr: 60_000, candidates: coins});
  const trades = Object.fromEntries(large.coins.map((coin) => [coin.coin, coin.trades]));
  assert.equal(trades.GRAM, 5);
  assert.ok(trades.FET >= 3 && trades.FET <= 5);
  assert.ok((trades.LINK ?? 0) >= 1, "with enough capital the weakest coin is funded too");
  assert.ok(large.allocatedInr <= 60_000);

  // Budget below one full trade: nothing is allocated.
  assert.equal(allocateCapital({budgetInr: 2_999, candidates: coins}).coins.length, 0);

  // Money only counts where it can reach: SKY needs UnoCoin INR (empty), so
  // the USDT pool goes to FET and GRAM even though SKY is the strongest.
  const pooled = allocateCapital({
    budgetInr: 20_000,
    poolCapacityInr: {"unocoin:INR": 10, USDT: 12_000},
    candidates: [
      candidate({coin: "SKY", weight: 0.6, cashVenue: "unocoin", cashAsset: "INR"}),
      candidate({coin: "FET", weight: 0.25, coinVenue: "bybit", cashVenue: "binance", cashAsset: "USDT"}),
      candidate({coin: "GRAM", weight: 0.15, coinVenue: "coinswitch", coinVenueQuote: "INR", cashVenue: "binance", cashAsset: "USDT", coinHeldInr: 3_000}),
    ],
  });
  assert.deepEqual(pooled.unfunded, ["SKY"]);
  assert.equal(pooled.unfundedBy?.SKY, "unocoin:INR");
  // GRAM's ₹3,000 of stock already covers its first two coin sides, so
  // those trades draw only cash; nothing spends more USDT than the pool has.
  const pooledTrades = Object.fromEntries(pooled.coins.map((coin) => [coin.coin, coin.trades]));
  assert.ok(pooledTrades.FET >= 1 && pooledTrades.GRAM >= 2, JSON.stringify(pooledTrades));
  const usdtUsed = pooled.coins.reduce((sum, coin) => sum + coin.cashNeedInr + coin.coinNeedInr, 0) - 3_000;
  assert.ok(usdtUsed <= 12_000, String(usdtUsed));

  // Cash pools: USDT moves between Binance and Bybit; INR stays put.
  assert.equal(cashPool("bybit", "USDT"), cashPool("binance", "USDT"));
  assert.notEqual(cashPool("coindcx", "USDT"), "USDT", "no API withdraws CoinDCX USDT");
  assert.notEqual(cashPool("coindcx", "INR"), cashPool("coinswitch", "INR"));
}

function testLiveSignal(): void {
  const now = 1_790_290_000_000;
  let sequence = 0;
  const window = (overrides: Partial<OpportunityWindow>): OpportunityWindow => {
    sequence += 1;
    const startedAt = overrides.startedAt ?? now - 3_600_000;
    const durationMs = overrides.durationMs ?? 60_000;
    return {
      id: `w-${sequence}`, routeKey: "r", kind: "INR_USDT", coin: "GRAM",
      buyVenue: "binance", buyMarket: "GRAMUSDT", sellVenue: "coinswitch", sellMarket: "GRAM_INR",
      startedAt, lastSeenAt: startedAt + durationMs, endedAt: startedAt + durationMs, durationMs, scans: 5,
      peakNetPercent: 2, lastNetPercent: 2, peakDepthInr: 3_000, minimumOrderInr: 100, tdsVerified: true, alertedAt: null,
      ...overrides,
    };
  };
  const state = {schemaVersion: "1.0" as const, firstWindowAt: null, lastIngestedEndedAt: 0, boundaryIds: [] as string[], days: {}};
  ingestWindows(state, [
    window({startedAt: now - 3_600_000}),
    window({startedAt: now - 2 * 3_600_000}),
    window({coin: "LINK", buyVenue: "unocoin", buyMarket: "LINK_INR", sellVenue: "binance", sellMarket: "LINKUSDT", startedAt: now - 10 * 3_600_000}),
  ]);
  const signal = buildLiveSignal(state, {now, hours: 6, tradeSizeInr: 1_500});
  assert.deepEqual(signal.map((coin) => coin.coin), ["GRAM"], "LINK's edge was 10 h ago: outside the 6 h window");
  const gram = signal[0]!;
  assert.equal(gram.main.sellVenue, "coinswitch");
  assert.equal(gram.main.buyQuote, "USDT");
  assert.ok(Math.abs(gram.edgeMinutes - 2) < 1e-9);
  // Two 1-minute windows in 6 h repeat as 1.4 trades at 2% on ₹1,500 ->
  // ₹42 in 6 h -> ₹168/day (under the 10-trade daily cap of ₹300).
  assert.ok(Math.abs(gram.expectedDailyProfitInr - 168) < 1e-6, String(gram.expectedDailyProfitInr));

  // A flickering book (hundreds of windows in minutes) is not hundreds of trades.
  const flicker = {schemaVersion: "1.0" as const, firstWindowAt: null, lastIngestedEndedAt: 0, boundaryIds: [] as string[], days: {}};
  ingestWindows(flicker, Array.from({length: 500}, (_, index) => window({coin: "SKY", startedAt: now - 3_600_000 + index * 1_000, durationMs: 1_000})));
  const sky = buildLiveSignal(flicker, {now, hours: 6, tradeSizeInr: 1_500})[0]!;
  assert.ok(sky.expectedDailyProfitInr <= 10 * 0.02 * 1_500 + 1e-9, String(sky.expectedDailyProfitInr));
}

function config(): RebalancingExecutionConfig {
  return {
    enabled: true,
    sameExchangeEnabled: false,
    crossExchangeEnabled: true,
    maximumPerTransferUsdt: 25,
    maximumPerDaySameExchangeUsdt: 60,
    maximumPerDayCrossExchangeUsdt: 150,
    withdrawalWhitelist: [],
  };
}

class FakeStockPort implements StockBuyPort {
  readonly buys: StockBuyRequest[] = [];
  readonly sells: StockSellRequest[] = [];
  async buy(request: StockBuyRequest): Promise<StockBuyResult> {
    this.buys.push(request);
    return {status: "FILLED", spentInr: request.amountInr, filledQuantity: 1, averagePrice: 1, orderId: `b-${this.buys.length}`, detail: "bought"};
  }
  async sell(request: StockSellRequest): Promise<StockBuyResult> {
    this.sells.push(request);
    return {status: "FILLED", spentInr: request.amountInr, filledQuantity: 1, averagePrice: 1, orderId: `s-${this.sells.length}`, detail: "sold"};
  }
}

const nullPort = {executeCrossExchangeMoves: async () => []};

async function testStockSells(directory: string): Promise<void> {
  const now = 1_790_300_000_000;
  let holdings: Record<string, number> = {"coinswitch|FLR": 8_000, "coinswitch|INR": 1_200, "binance|USDT": 3_000};
  let gramProfit = 200;
  let sellEnabled = true;
  const allocation = (): CapitalAllocation => allocateCapital({
    budgetInr: 12_000,
    candidates: [candidate({coin: "GRAM", weight: 1, coinVenue: "coinswitch", coinVenueQuote: "INR", cashVenue: "binance", cashAsset: "USDT", perTradeInr: 1_200, maximumTrades: 2, expectedDailyProfitInr: gramProfit})],
  });
  const valuation = () => ({
    usdtInr: 100,
    quantity: (venue: string, asset: string) => (holdings[`${venue}|${asset}`] ?? 0) / 10,
    holdingInr: (venue: string, asset: string) => holdings[`${venue}|${asset}`] ?? 0,
    priceInr: () => 10,
    assets: (venue: string) => Object.keys(holdings).filter((key) => key.startsWith(`${venue}|`)).map((key) => key.split("|")[1]!),
  });
  const service = (name: string, port: FakeStockPort) => new RouteRefillService({
    getTargets: () => [],
    getAllocation: () => allocation(),
    getValuation: valuation,
    getConfig: config,
    getTradeSizeInr: () => 1_500,
    getAutoBuyConfig: () => ({enabled: false, dailyCapInr: 10_000, cashFloorInr: 1_000}),
    getAutoSellConfig: () => ({enabled: sellEnabled, dailyCapInr: 5_000}),
    getBuyPort: async () => port,
  }, join(directory, `${name}.jsonl`));

  // Idle FLR (no longer allocated) is sold for CoinSwitch INR, which GRAM's
  // stock needs: GRAM is ₹2,400 short and CoinSwitch already holds ₹1,200,
  // so only ₹1,200 is sold, not the whole ₹8,000.
  const port = new FakeStockPort();
  const refill = service("sell", port);
  const plan = refill.getPlan(now);
  assert.equal(plan.allocation?.coins[0]?.coin, "GRAM");
  assert.equal(plan.allocation?.coins[0]?.trades, 2);
  const results = await refill.executeAuto(nullPort, now);
  assert.equal(port.sells.length, 1);
  assert.deepEqual({venue: port.sells[0]!.venue, coin: port.sells[0]!.coin, quote: port.sells[0]!.quote, amountInr: port.sells[0]!.amountInr},
    {venue: "coinswitch", coin: "FLR", quote: "INR", amountInr: 1_200});
  assert.equal(results.find((item) => item.kind === "STOCK_SELL")?.status, "SELL_FILLED");
  assert.equal(refill.getPlan(now).automation.autoSell.spentTodayInr, 1_200);

  // The switch must earn 2x its cost in a day: ₹1,200 costs ≈₹14, so a coin
  // earning ₹20/day does not justify it.
  gramProfit = 20;
  const weakPort = new FakeStockPort();
  const weak = service("weak", weakPort);
  await weak.executeAuto(nullPort, now);
  assert.equal(weakPort.sells.length, 0);
  assert.match(weak.getPlan(now).automation.autoSell.lastSkip?.reason ?? "", /under 2x the cost/u);
  gramProfit = 200;

  // Freed cash must land where it is needed: FLR on Bybit would turn into
  // USDT, but only CoinSwitch INR is short... unless USDT is short too.
  holdings = {"bybit|FLR": 8_000, "coinswitch|INR": 1_200, "binance|USDT": 3_000, "coinswitch|GRAM": 0};
  const nowherePort = new FakeStockPort();
  const nowhere = service("nowhere", nowherePort);
  await nowhere.executeAuto(nullPort, now);
  assert.equal(nowherePort.sells.length, 0);
  assert.match(nowhere.getPlan(now).automation.autoSell.lastSkip?.reason ?? "", /would not reach/u);

  // Surplus core stock is kept up to 1.25x its allocation, and stock the
  // manager itself bought is held 24 h.
  holdings = {"coinswitch|GRAM": 2_900, "coinswitch|FLR": 0, "binance|USDT": 100, "coinswitch|INR": 1_200};
  const corePort = new FakeStockPort();
  const core = service("core", corePort);
  await core.executeAuto(nullPort, now);
  assert.equal(corePort.sells.length, 0, "₹2,900 of GRAM is under 1.25x its ₹2,400 allocation");

  // Switched off: nothing is sold.
  holdings = {"coinswitch|FLR": 8_000, "coinswitch|INR": 1_200, "binance|USDT": 3_000};
  sellEnabled = false;
  const offPort = new FakeStockPort();
  const off = service("off", offPort);
  await off.executeAuto(nullPort, now);
  assert.equal(offPort.sells.length, 0);
  sellEnabled = true;

  // A coin with opportunity that is only waiting for capital (SKY needs
  // UnoCoin INR, which only a deposit brings) keeps its stock: it is not idle.
  const waitingPort = new FakeStockPort();
  holdings = {"binance|SKY": 5_000, "coinswitch|INR": 1_200, "binance|USDT": 0};
  const waiting = new RouteRefillService({
    getTargets: () => [],
    getAllocation: () => allocateCapital({
      budgetInr: 20_000,
      poolCapacityInr: {"unocoin:INR": 0, USDT: 0, "coinswitch:INR": 6_000},
      candidates: [
        candidate({coin: "SKY", weight: 0.7, coinVenue: "binance", cashVenue: "unocoin", cashAsset: "INR"}),
        candidate({coin: "GRAM", weight: 0.3, coinVenue: "coinswitch", coinVenueQuote: "INR", cashVenue: "coinswitch", cashAsset: "INR", perTradeInr: 1_200, expectedDailyProfitInr: 500}),
      ],
    }),
    getValuation: valuation,
    getConfig: config,
    getTradeSizeInr: () => 1_500,
    getAutoBuyConfig: () => ({enabled: false, dailyCapInr: 10_000, cashFloorInr: 1_000}),
    getAutoSellConfig: () => ({enabled: true, dailyCapInr: 5_000}),
    getBuyPort: async () => waitingPort,
  }, join(directory, "waiting.jsonl"));
  assert.deepEqual(waiting.getPlan(now).allocation?.unfunded, ["SKY"]);
  await waiting.executeAuto(nullPort, now);
  assert.equal(waitingPort.sells.length, 0, "SKY stock waits for UnoCoin INR; it is never sold as idle");

  // Daily sell cap: after ₹5,000 of sells, nothing more today.
  const capPort = new FakeStockPort();
  const capped = service("cap", capPort);
  holdings = {"coinswitch|FLR": 8_000, "coinswitch|INR": 0, "binance|USDT": 0};
  await capped.executeAuto(nullPort, now);
  await capped.executeAuto(nullPort, now + 3 * 60_000);
  assert.ok(capPort.sells.reduce((sum, sell) => sum + sell.amountInr, 0) <= 5_000);
}

async function testMinimumHold(directory: string): Promise<void> {
  const now = 1_790_300_000_000;
  // The manager buys LINK stock on Binance ...
  let holdings: Record<string, number> = {"binance|USDT": 5_000, "unocoin|INR": 3_000};
  let linkNeed = 2;
  const allocation = () => allocateCapital({
    budgetInr: 30_000,
    candidates: [
      candidate({coin: "LINK", weight: 0.5, coinVenue: "binance", coinVenueQuote: "USDT", cashVenue: "unocoin", cashAsset: "INR", maximumTrades: linkNeed}),
      candidate({coin: "FET", weight: 0.5, coinVenue: "bybit", coinVenueQuote: "USDT", cashVenue: "coindcx", cashAsset: "USDT", maximumTrades: 2, expectedDailyProfitInr: 500}),
    ],
  });
  const port = new FakeStockPort();
  const service = new RouteRefillService({
    getTargets: () => [],
    getAllocation: () => allocation(),
    getValuation: () => ({
      usdtInr: 100,
      quantity: (venue: string, asset: string) => (holdings[`${venue}|${asset}`] ?? 0) / 10,
      holdingInr: (venue: string, asset: string) => holdings[`${venue}|${asset}`] ?? 0,
      priceInr: () => 10,
      assets: (venue: string) => Object.keys(holdings).filter((key) => key.startsWith(`${venue}|`)).map((key) => key.split("|")[1]!),
    }),
    getConfig: config,
    getTradeSizeInr: () => 1_500,
    getAutoBuyConfig: () => ({enabled: true, dailyCapInr: 10_000, cashFloorInr: 1_000}),
    getAutoSellConfig: () => ({enabled: true, dailyCapInr: 5_000}),
    getBuyPort: async () => port,
  }, join(directory, "hold.jsonl"));
  await service.executeAuto(nullPort, now);
  assert.equal(port.buys.find((buy) => buy.coin === "LINK")?.venue, "binance");

  // ... then LINK drops out of the allocation an hour later: its stock is
  // idle, and FET is short of USDT, but it was bought < 24 h ago.
  holdings = {"binance|LINK": 3_000, "binance|USDT": 0, "unocoin|INR": 3_000};
  linkNeed = 0;
  await service.executeAuto(nullPort, now + 3_600_000);
  assert.equal(port.sells.length, 0);
  assert.match(service.getPlan(now + 3_600_000).automation.autoSell.lastSkip?.reason ?? "", /minimum hold 24 h/u);

  // After the hold it may be sold for the USDT FET needs.
  await service.executeAuto(nullPort, now + 25 * 3_600_000);
  assert.equal(port.sells[0]?.coin, "LINK");
  assert.equal(port.sells[0]?.quote, "USDT");

  // A buy recorded before the hold was tracked (only in the history) still holds.
  const legacyFile = join(directory, "legacy.jsonl");
  writeFileSync(legacyFile, `${JSON.stringify({storeVersion: 1, sequence: 1, writtenAt: now - 3_600_000, payload: {
    schemaVersion: "1.0",
    lastTopUpAt: {},
    history: [{at: now - 3_600_000, actionId: "BUY_COIN|FET|bybit", toVenue: "bybit", amountUsdt: 0, status: "BUY_FILLED",
      kind: "STOCK_BUY", coin: "FET", spentInr: 3_950, detail: "bought", referenceId: "o-1"}],
  }})}\n`);
  holdings = {"bybit|FET": 6_000, "binance|USDT": 0, "unocoin|INR": 3_000};
  const legacyPort = new FakeStockPort();
  const legacy = new RouteRefillService({
    getTargets: () => [],
    getAllocation: () => allocateCapital({
      budgetInr: 30_000,
      candidates: [candidate({coin: "FET", weight: 1, coinVenue: "bybit", coinVenueQuote: "USDT", cashVenue: "binance", cashAsset: "USDT", maximumTrades: 1, expectedDailyProfitInr: 500})],
    }),
    getValuation: () => ({
      usdtInr: 100,
      quantity: (venue: string, asset: string) => (holdings[`${venue}|${asset}`] ?? 0) / 10,
      holdingInr: (venue: string, asset: string) => holdings[`${venue}|${asset}`] ?? 0,
      priceInr: () => 10,
      assets: (venue: string) => Object.keys(holdings).filter((key) => key.startsWith(`${venue}|`)).map((key) => key.split("|")[1]!),
    }),
    getConfig: config,
    getTradeSizeInr: () => 1_500,
    getAutoBuyConfig: () => ({enabled: false, dailyCapInr: 10_000, cashFloorInr: 1_000}),
    getAutoSellConfig: () => ({enabled: true, dailyCapInr: 5_000}),
    getBuyPort: async () => legacyPort,
  }, legacyFile);
  await legacy.executeAuto(nullPort, now);
  assert.equal(legacyPort.sells.length, 0, "surplus FET bought an hour ago is held");
  assert.match(legacy.getPlan(now).automation.autoSell.lastSkip?.reason ?? "", /minimum hold 24 h/u);
}

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-allocator-"));
  try {
    testAllocator();
    testLiveSignal();
    await testStockSells(directory);
    await testMinimumHold(directory);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
  console.log("Capital allocator passed: whole trades to the strongest coins first, nothing below one full trade, scales with capital; live signal is a smoothed 6 h window; stock sells free only needed cash, earn 2x their cost, respect the 24 h hold, the daily cap and the switch.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
