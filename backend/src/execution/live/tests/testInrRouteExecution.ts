import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import {LiveTradingInterlock} from "../LiveTradingInterlock";
import {loadInrRouteExecutionPolicy, type InrRouteExecutionPolicy} from "../inr-routes/InrRouteExecutionPolicy";
import {commonStep, planInrRoute, type InrRoutePlanInput} from "../inr-routes/InrRoutePlanner";
import {
  uuidClientOrderId,
  InrRouteSessionExecutor,
  type InrRouteExecuteInput,
  type InrRouteGatewayPort,
} from "../inr-routes/InrRouteSessionExecutor";
import {
  INR_ROUTE_HALT_RELEASE_CONFIRMATION,
  InrRouteLiveRunner,
  type InrRouteRunnerDependencies,
} from "../inr-routes/InrRouteLiveRunner";
import type {LiveExecutionRequest} from "../models/LiveExecutionRequest";
import type {ScannedRoute} from "../../../strategies/inr-arbitrage/InrArbitrageScannerService";
import type {ExchangeMarketCapability} from "../../capabilities/models/ExchangeCapability";

const NOW = 1_790_000_000_000;

/* ------------------------------------------------------------ planner */

function planInput(overrides: Partial<InrRoutePlanInput> = {}): InrRoutePlanInput {
  return {
    asks: [{price: 100, quantity: 5}, {price: 101, quantity: 5}],
    bids: [{price: 1.2, quantity: 10}],
    buyToInr: 1,
    sellToInr: 90,
    feesPercent: 0.5,
    buyFeePercent: 0.2,
    minimumNetPercent: 1,
    buyRules: {quantityStep: 0.1, minimumQuantity: null, minimumNotional: 100},
    sellRules: {quantityStep: 0.01, minimumQuantity: null, minimumNotional: 5},
    buyQuoteAvailable: 5_000,
    sellBaseAvailable: 20,
    minimumCapitalInr: 600,
    targetCapitalInr: 1_500,
    maximumCapitalInr: 1_500,
    ...overrides,
  };
}

function testPlanner(): void {
  const depthBound = planInrRoute(planInput());
  assert.ok(depthBound.ok, JSON.stringify(depthBound));
  if (depthBound.ok) {
    assert.equal(depthBound.plan.quantity, 10, "depth (asks exhausted) bounds the size");
    assert.equal(depthBound.plan.buyLimitPrice, 101, "limit crosses the deepest level needed");
    assert.equal(depthBound.plan.sellLimitPrice, 1.2);
    assert.ok(Math.abs(depthBound.plan.buyAveragePrice - 100.5) < 1e-9);
    assert.ok(Math.abs(depthBound.plan.expectedNetPercent - ((108 - 100.5) / 100.5 * 100 - 0.5)) < 1e-9);
  }

  const cashBound = planInrRoute(planInput({buyQuoteAvailable: 700}));
  assert.ok(cashBound.ok, JSON.stringify(cashBound));
  if (cashBound.ok) {
    assert.ok(cashBound.plan.quantity * cashBound.plan.buyLimitPrice * 1.002 <= 700, "buy cash plus fee fits the balance");
    assert.ok(cashBound.plan.notionalInr >= 600);
  }

  const capBound = planInrRoute(planInput({
    asks: [{price: 100, quantity: 50}],
    bids: [{price: 1.2, quantity: 50}],
    sellBaseAvailable: 50,
    buyQuoteAvailable: 100_000,
  }));
  assert.ok(capBound.ok);
  if (capBound.ok) {
    assert.equal(capBound.plan.quantity, 15, "₹1,500 target at ₹100");
    assert.ok(capBound.plan.notionalInr <= 1_500 + 1e-9);
  }

  const floor = planInrRoute(planInput({buyQuoteAvailable: 500}));
  assert.ok(!floor.ok && floor.reason.startsWith("BELOW_CAPITAL_FLOOR"), JSON.stringify(floor));

  const noInventory = planInrRoute(planInput({sellBaseAvailable: 0}));
  assert.ok(!noInventory.ok && noInventory.reason.startsWith("NO_SELL_INVENTORY"), JSON.stringify(noInventory));

  const edgeGone = planInrRoute(planInput({bids: [{price: 1.12, quantity: 10}]}));
  assert.ok(!edgeGone.ok && edgeGone.reason.startsWith("EDGE_GONE"), JSON.stringify(edgeGone));

  const steps = planInrRoute(planInput({sellRules: {quantityStep: 0.3, minimumQuantity: null, minimumNotional: null}, buyRules: {quantityStep: 0.2, minimumQuantity: null, minimumNotional: null}}));
  assert.ok(!steps.ok && steps.reason.startsWith("LOT_STEP_INCOMPATIBLE"));
  assert.equal(commonStep(0.1, 0.01), 0.1);
  assert.equal(commonStep(1, 0.001), 1);

  const minimum = planInrRoute(planInput({sellRules: {quantityStep: 0.01, minimumQuantity: null, minimumNotional: 50}}));
  assert.ok(!minimum.ok && minimum.reason.startsWith("BELOW_MINIMUM_ORDER"), JSON.stringify(minimum));
}

/* ----------------------------------------------------------- executor */

type Outcome =
  | {kind: "fill"; filled: number; price: number}
  | {kind: "uncertain"}
  | {kind: "throw"};

class FakeGateway implements InrRouteGatewayPort {
  readonly sent: LiveExecutionRequest[] = [];
  rejectValidation: string | null = null;
  constructor(private readonly outcomes: Record<string, Outcome>) {}

  validateNewSubmission(request: LiveExecutionRequest): void {
    if (this.rejectValidation && request.exchange === this.rejectValidation) throw new Error(`${request.exchange} rejects this order shape`);
  }

  async executeOrReconcile(input: {readonly request: LiveExecutionRequest; readonly idempotencyKey: string}) {
    this.sent.push(input.request);
    const leg = input.idempotencyKey.split(":").at(-1) as string;
    const outcome = this.outcomes[leg] ?? {kind: "fill", filled: 0, price: 0};
    if (outcome.kind === "throw") throw new Error("socket hang up");
    if (outcome.kind === "uncertain") {
      return {state: "UNCERTAIN_SUBMISSION" as const, record: null, reasons: ["no order id"]};
    }
    return {
      state: "READY" as const,
      record: {
        result: {
          status: outcome.filled >= input.request.quantity ? "FILLED" : "CANCELLED",
          filledQuantity: outcome.filled,
          averageFillPrice: outcome.price,
          orderId: `order-${leg}`,
        },
      },
      reasons: [],
    } as never;
  }

  async cancelOrReconcile(): Promise<never> {
    throw new Error("not expected");
  }
}

const ROUTE = {
  routeKey: "INR_USDT|X|coindcx|XINR|bybit|XUSDT",
  kind: "INR_USDT",
  coin: "X",
  buyVenue: "coindcx",
  buyMarket: "XINR",
  sellVenue: "bybit",
  sellMarket: "XUSDT",
  buyVenueMarket: "XINR",
  sellVenueMarket: "XUSDT",
  buyToInr: 1,
  sellToInr: 90,
  feesPercent: 0.5,
};

function executeInput(overrides: Partial<InrRouteExecuteInput> = {}): InrRouteExecuteInput {
  return {
    route: ROUTE,
    plan: {
      quantity: 10,
      buyLimitPrice: 101,
      sellLimitPrice: 1.2,
      buyAveragePrice: 100.5,
      sellAveragePrice: 1.2,
      notionalInr: 1_005,
      expectedNetPercent: 6.96,
      expectedNetInr: 70,
    },
    primaryTimeoutMs: 2_500,
    hedgeBufferPercents: [0.15, 0.5, 1],
    dustToleranceInr: 150,
    hedgeRules: {quantityStep: 0.01, minimumQuantity: null, minimumNotional: 1, priceStep: 0.0001},
    getHedgeLevels: () => [{price: 1.2, quantity: 100}],
    ...overrides,
  };
}

async function testExecutor(directory: string): Promise<void> {
  let file = 0;
  const executor = (gateway: FakeGateway) =>
    new InrRouteSessionExecutor(gateway, join(directory, `sessions-${file++}.jsonl`), () => NOW);

  // Full fill, full hedge.
  const complete = new FakeGateway({primary: {kind: "fill", filled: 10, price: 100.5}, hedge1: {kind: "fill", filled: 10, price: 1.199}});
  const done = await executor(complete).execute(executeInput());
  assert.equal(done.state, "COMPLETED");
  assert.equal(complete.sent.length, 2);
  assert.equal(complete.sent[0].exchange, "coindcx", "the INR venue leg goes first");
  assert.equal(complete.sent[0].timeInForce, "GTC");
  assert.equal(complete.sent[0].cancelOnTimeout, true);
  assert.equal(complete.sent[1].exchange, "bybit");
  assert.equal(complete.sent[1].side, "sell");
  assert.equal(complete.sent[1].timeInForce, "IOC", "hedge is IOC on the liquid venue");
  assert.equal(complete.sent[1].price, 1.1982, "hedge limit = fresh bid less 0.15%, floored to the tick");
  assert.ok((done.realizedNetInr ?? 0) > 0);

  // No primary fill: nothing else is sent.
  const none = new FakeGateway({primary: {kind: "fill", filled: 0, price: 0}});
  const noFill = await executor(none).execute(executeInput());
  assert.equal(noFill.state, "NO_FILL");
  assert.equal(none.sent.length, 1);

  // Partial IOC hedges: the remainder is re-hedged with a wider buffer.
  const partial = new FakeGateway({
    primary: {kind: "fill", filled: 10, price: 100.5},
    hedge1: {kind: "fill", filled: 6, price: 1.199},
    hedge2: {kind: "fill", filled: 4, price: 1.195},
  });
  const hedgedInTwo = await executor(partial).execute(executeInput());
  assert.equal(hedgedInTwo.state, "COMPLETED");
  assert.equal(partial.sent[2].quantity, 4, "second hedge covers exactly the remainder");
  assert.equal(partial.sent[2].price, 1.194, "second hedge uses the 0.5% buffer");

  // Hedges never fill: known unhedged exposure.
  const stuck = new FakeGateway({primary: {kind: "fill", filled: 10, price: 100.5}});
  const recovery = await executor(stuck).execute(executeInput());
  assert.equal(recovery.state, "RECOVERY_REQUIRED");
  assert.equal(recovery.residualQuantity, 10);
  assert.equal(stuck.sent.length, 4, "primary plus three bounded hedge attempts");

  // Unknown primary outcome: no hedge is guessed.
  const uncertain = new FakeGateway({primary: {kind: "uncertain"}});
  const exposure = await executor(uncertain).execute(executeInput());
  assert.equal(exposure.state, "POSSIBLE_EXPOSURE");
  assert.equal(uncertain.sent.length, 1);

  // Unknown hedge outcome stops further hedging.
  const hedgeThrows = new FakeGateway({primary: {kind: "fill", filled: 10, price: 100.5}, hedge1: {kind: "throw"}});
  const hedgeExposure = await executor(hedgeThrows).execute(executeInput());
  assert.equal(hedgeExposure.state, "POSSIBLE_EXPOSURE");
  assert.equal(hedgeThrows.sent.length, 2);

  // Remainder below the hedge lot step and dust tolerance.
  const dust = new FakeGateway({primary: {kind: "fill", filled: 10.005, price: 100.5}, hedge1: {kind: "fill", filled: 10, price: 1.199}});
  const dusty = await executor(dust).execute(executeInput({plan: {...executeInput().plan, quantity: 10.005}}));
  assert.equal(dusty.state, "DUST_RESIDUAL");
  assert.ok(dusty.residualInr < 150);

  // CoinSwitch INR primary: plain limit (no time-in-force), UUID client ID,
  // venue spelling, slower polls; then an IOC hedge on Bybit.
  const coinswitch = new FakeGateway({primary: {kind: "fill", filled: 10, price: 108.5}, hedge1: {kind: "fill", filled: 10, price: 1.19}});
  const csSession = await executor(coinswitch).execute(executeInput({
    route: {...ROUTE, routeKey: "cs", buyVenue: "bybit", buyMarket: "XUSDT", buyVenueMarket: "XUSDT", sellVenue: "coinswitch", sellMarket: "XINR", sellVenueMarket: "X_INR", buyToInr: 90, sellToInr: 1},
    plan: {...executeInput().plan, buyLimitPrice: 1.19, sellLimitPrice: 108.5},
  }));
  assert.equal(csSession.state, "COMPLETED");
  assert.equal(coinswitch.sent[0].exchange, "coinswitch", "the INR leg goes first");
  assert.equal(coinswitch.sent[0].side, "sell");
  assert.equal(coinswitch.sent[0].market, "X_INR");
  assert.equal("timeInForce" in coinswitch.sent[0], false, "CoinSwitch rejects any time-in-force");
  assert.match(coinswitch.sent[0].clientOrderId ?? "", /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
  assert.equal(coinswitch.sent[0].pollingIntervalMs, 500);
  assert.equal(coinswitch.sent[0].cancelOnTimeout, true);
  assert.equal(coinswitch.sent[1].exchange, "bybit");
  assert.equal(coinswitch.sent[1].side, "buy");
  assert.equal(coinswitch.sent[1].timeInForce, "IOC");
  assert.equal(uuidClientOrderId("a:primary"), uuidClientOrderId("a:primary"), "stable per idempotency key");
  assert.notEqual(uuidClientOrderId("a:primary"), uuidClientOrderId("a:hedge1"));

  // A venue with no order contract never gets an order.
  const unknownVenue = new FakeGateway({});
  const noContract = await executor(unknownVenue).execute(executeInput({route: {...ROUTE, buyVenue: "unocoin"}}));
  assert.equal(noContract.state, "NO_FILL");
  assert.equal(unknownVenue.sent.length, 0);

  // Either leg's shape rejected locally: nothing is sent.
  const rejects = new FakeGateway({});
  rejects.rejectValidation = "bybit";
  const rejected = await executor(rejects).execute(executeInput());
  assert.equal(rejected.state, "NO_FILL");
  assert.match(rejected.reasons.join(" "), /PRE_DISPATCH_REJECTED/u);
  assert.equal(rejects.sent.length, 0);
}

/* ------------------------------------------------------------- runner */

function scannedRoute(overrides: Partial<ScannedRoute> = {}): ScannedRoute {
  return {
    routeKey: "INR_USDT|X|coindcx|XINR|bybit|XUSDT",
    kind: "INR_USDT",
    coin: "X",
    buyVenue: "coindcx",
    buyMarket: "XINR",
    sellVenue: "bybit",
    sellMarket: "XUSDT",
    buyVenueMarket: "XINR",
    sellVenueMarket: "XUSDT",
    conversionVenue: "coindcx",
    usdtInrRate: 90,
    evidence: "BOOK",
    buyEvidence: "BOOK",
    sellEvidence: "BOOK",
    buyPriceInr: 100,
    sellPriceInr: 108,
    grossEdgePercent: 8,
    feesPercent: 0.5,
    netEdgePercent: 7.5,
    cashLockedPercent: 0,
    tdsVerified: true,
    depthAtThresholdInr: 1_005,
    averageNetAtDepthPercent: 7,
    minimumOrderInr: 100,
    marketsTradable: true,
    suspect: false,
    qualifies: true,
    observedAt: NOW,
    ...overrides,
  };
}

function capability(market: string, step: number, minimumNotional: number): ExchangeMarketCapability {
  return {
    exchange: "x",
    market,
    baseAsset: "X",
    quoteAsset: market.endsWith("INR") ? "INR" : "USDT",
    product: "spot",
    tradingEnabled: true,
    maintenanceMode: false,
    order: {} as ExchangeMarketCapability["order"],
    price: {minimumPrice: null, maximumPrice: null, priceStep: 0.0001, pricePrecision: null},
    quantity: {minimumQuantity: null, maximumQuantity: null, quantityStep: step, quantityPrecision: null},
    notional: {minimumNotional, maximumNotional: null},
    fees: {makerFeeRate: null, takerFeeRate: null, feeAsset: null},
    sourceUpdatedAt: NOW,
    synchronizedAt: NOW,
  };
}

function policy(mode: InrRouteExecutionPolicy["mode"]): InrRouteExecutionPolicy {
  return {...loadInrRouteExecutionPolicy({CAT_PRO_LIVE_TRADE_CAPITAL_INR: "1500"}), mode, inrVenues: ["coindcx"]};
}

function runnerFixture(directory: string, name: string, overrides: Partial<InrRouteRunnerDependencies> & {gateway?: FakeGateway} = {}) {
  let clock = NOW;
  let balanceSyncedAt = NOW - 1_000;
  const interlock = overrides.interlock ?? new LiveTradingInterlock();
  const gateway = overrides.gateway ?? new FakeGateway({});
  const executor = new InrRouteSessionExecutor(gateway, join(directory, `${name}-sessions.jsonl`), () => clock);
  const dependencies: Partial<InrRouteRunnerDependencies> = {
    getPolicy: () => policy("shadow"),
    getQualifiedRoutes: () => [scannedRoute()],
    getAllRoutes: () => [scannedRoute()],
    refreshBook: async () => undefined,
    getBook: (venue: string) =>
      venue === "coindcx"
        ? {exchange: venue, market: "XINR", bids: [{price: 99, quantity: 10}], asks: [{price: 100, quantity: 5}, {price: 101, quantity: 5}], timestamp: clock - 200}
        : {exchange: venue, market: "XUSDT", bids: [{price: 1.2, quantity: 100}], asks: [{price: 1.21, quantity: 100}], timestamp: clock - 200},
    getCapability: (venue, market) => capability(market, venue === "coindcx" ? 0.1 : 0.01, venue === "coindcx" ? 100 : 1),
    getBalance: (_venue, asset) => ({available: asset === "INR" ? 5_000 : 20, synchronizedAt: balanceSyncedAt}),
    getTakerFeePercent: () => 0.2,
    getDailyRealizedNetInr: async () => 0,
    getDailyLossLimitInr: () => 500,
    getVenueOrderReadiness: () => ({ready: true, detail: "fixture"}),
    now: () => clock,
    ...overrides,
    interlock,
  };
  const runner = new InrRouteLiveRunner(executor, dependencies, join(directory, `${name}-runner.jsonl`));
  return {
    runner,
    gateway,
    interlock,
    executor,
    advance: (ms: number) => { clock += ms; },
    resyncBalances: () => { balanceSyncedAt = clock; },
  };
}

async function testRunner(directory: string): Promise<void> {
  // Shadow: plans from fresh books and balances, sends nothing.
  const shadow = runnerFixture(directory, "shadow");
  await shadow.runner.tick();
  const shadowAttempt = shadow.runner.getDiagnostics().recentAttempts[0];
  assert.equal(shadowAttempt?.status, "SHADOW", JSON.stringify(shadowAttempt));
  assert.equal(shadowAttempt?.plan?.quantity, 10);
  assert.equal(shadow.gateway.sent.length, 0);

  // CoinSwitch INR route: the polled book is refreshed at action time with
  // the venue's own spelling before planning.
  const refreshed: string[] = [];
  let csBookAt = NOW - 10_000;
  const cs = runnerFixture(directory, "coinswitch", {
    getPolicy: () => ({...policy("shadow"), inrVenues: ["coindcx", "coinswitch"]}),
    getQualifiedRoutes: () => [scannedRoute({
      routeKey: "INR_USDT|X|bybit:XUSDT>coinswitch:XINR",
      buyVenue: "bybit", buyMarket: "XUSDT", buyVenueMarket: "XUSDT",
      sellVenue: "coinswitch", sellMarket: "XINR", sellVenueMarket: "X_INR",
    })],
    refreshBook: async (venue, market) => {
      refreshed.push(`${venue}:${market}`);
      if (venue === "coinswitch") csBookAt = NOW - 100;
    },
    getBook: (venue, market) =>
      venue === "coinswitch"
        ? {exchange: venue, market, bids: [{price: 110, quantity: 10}], asks: [{price: 111, quantity: 10}], timestamp: csBookAt}
        : {exchange: venue, market, bids: [{price: 1.19, quantity: 100}], asks: [{price: 1.2, quantity: 100}], timestamp: NOW - 100},
    getCapability: (venue, market) => capability(market, venue === "coinswitch" ? 0.1 : 0.01, venue === "coinswitch" ? 100 : 1),
    getBalance: (venue, asset) => ({available: venue === "bybit" ? (asset === "USDT" ? 50 : 0) : 20, synchronizedAt: NOW - 1_000}),
  });
  await cs.runner.tick();
  assert.ok(refreshed.includes("coinswitch:X_INR"), JSON.stringify(refreshed));
  const csAttempt = cs.runner.getDiagnostics().recentAttempts[0];
  assert.equal(csAttempt?.status, "SHADOW", JSON.stringify(csAttempt));

  // Off: nothing at all.
  const off = runnerFixture(directory, "off", {getPolicy: () => policy("off")});
  await off.runner.tick();
  assert.equal(off.runner.getDiagnostics().recentAttempts.length, 0);

  // A route whose INR venue is not enabled is ignored.
  const other = runnerFixture(directory, "other", {getQualifiedRoutes: () => [scannedRoute({buyVenue: "coinswitch", routeKey: "cs"})]});
  await other.runner.tick();
  assert.equal(other.runner.getDiagnostics().recentAttempts.length, 0);

  // Stale book blocks before planning.
  const stale = runnerFixture(directory, "stale", {
    getBook: (venue, market) => ({exchange: venue, market, bids: [{price: 1.2, quantity: 100}], asks: [{price: 100, quantity: 5}], timestamp: NOW - 10_000}),
  });
  await stale.runner.tick();
  assert.match(stale.runner.getDiagnostics().recentAttempts[0]?.reason ?? "", /^BOOK_STALE/u);

  // Another runner holds the interlock: no attempt.
  const held = runnerFixture(directory, "held");
  held.interlock.tryAcquire("strategy-one");
  await held.runner.tick();
  assert.equal(held.runner.getDiagnostics().recentAttempts.length, 0);

  // Live: completes, then refuses to trade on balances older than the trade.
  const live = runnerFixture(directory, "live", {
    getPolicy: () => ({...policy("live"), routeCooldownMs: 5_000}),
    gateway: new FakeGateway({primary: {kind: "fill", filled: 10, price: 100.5}, hedge1: {kind: "fill", filled: 10, price: 1.199}}),
  });
  await live.runner.tick();
  assert.equal(live.runner.getDiagnostics().recentAttempts[0]?.status, "COMPLETED");
  assert.ok(live.runner.getDiagnostics().realizedNetInrToday > 0);
  live.advance(6_000);
  await live.runner.tick();
  assert.match(live.runner.getDiagnostics().recentAttempts[0]?.reason ?? "", /^BALANCE_NOT_RESYNCED/u);
  live.resyncBalances();
  live.advance(20_000);
  await live.runner.tick();
  assert.notEqual(live.runner.getDiagnostics().recentAttempts[0]?.reason?.split(":")[0], "BALANCE_NOT_RESYNCED");

  // Live: unhedged exposure halts this runner and Strategy #1 via the interlock.
  const stuck = runnerFixture(directory, "stuck", {
    getPolicy: () => policy("live"),
    gateway: new FakeGateway({primary: {kind: "fill", filled: 10, price: 100.5}}),
  });
  await stuck.runner.tick();
  const halted = stuck.runner.getDiagnostics();
  assert.equal(halted.halted, true);
  assert.match(halted.haltedReason ?? "", /^RECOVERY_REQUIRED/u);
  assert.equal(stuck.interlock.tryAcquire("strategy-one"), false, "exposure blocks every runner");
  assert.throws(() => stuck.runner.releaseHalt("yes"));
  assert.equal(stuck.runner.releaseHalt(INR_ROUTE_HALT_RELEASE_CONFIRMATION), true);
  assert.equal(stuck.interlock.tryAcquire("strategy-one"), true);

  // Daily loss stop.
  const loss = runnerFixture(directory, "loss", {getDailyRealizedNetInr: async () => -500});
  await loss.runner.tick();
  assert.match(loss.runner.getDiagnostics().haltedReason ?? "", /^DAILY_LOSS_LIMIT\[/u);

  // Restart with a session interrupted mid-attempt stays halted.
  const crashed = runnerFixture(directory, "crash");
  (crashed.executor as unknown as {sessions: unknown[]}).sessions.push({sessionId: "inr-crash", state: "HEDGING", updatedAt: NOW});
  const restarted = new InrRouteLiveRunner(crashed.executor, {interlock: new LiveTradingInterlock(), now: () => NOW, getPolicy: () => policy("live")}, join(directory, "crash-runner-2.jsonl"));
  assert.match(restarted.getDiagnostics().haltedReason ?? "", /interrupted mid-attempt/u);
}

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "cat-pro-inr-routes-"));
  try {
    testPlanner();
    await testExecutor(directory);
    await testRunner(directory);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
  console.log(
    "INR route execution passed: fresh-book sizing within cash, inventory, depth and the ₹1,500 cap; INR leg first then bounded IOC hedges of the exact fill; unknown outcomes and unhedged remainders halt every runner; shadow sends nothing.",
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
