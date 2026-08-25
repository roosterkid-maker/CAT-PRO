import assert from "node:assert/strict";
import type {ArbitrageOpportunity} from "../../../arbitrage/models/ArbitrageOpportunity";
import type {ExchangeMarketCapability} from "../../../execution/capabilities/models/ExchangeCapability";
import type {OrderBook} from "../../../orderbook/models/OrderBook";
import type {
  ExchangeBalanceSynchronizationReport,
  ExchangeBalanceSynchronizationStatus,
} from "../../account/ExchangeBalanceSynchronizationService";
import type {ExchangeBalanceSnapshot} from "../../account/TradingAccountService";
import {crossExchangeExecutableQuantityNormalizer} from "../CrossExchangeExecutableQuantityNormalizer";
import {StrategyOnePaperStressGate} from "../AutomatedPaperTradingService";
import {StrategyOneFundedRouteService} from "../StrategyOneFundedRouteService";

const NOW = 1_900_000_000_000;

function main(): void {
  const balances = new Map<string, ExchangeBalanceSnapshot>();
  let synchronizationStatus: ExchangeBalanceSynchronizationStatus = "SYNCHRONIZED";
  const capabilities = new Map([
    ["coindcx", capability("coindcx")],
    ["coinswitch", capability("coinswitch")],
  ]);
  const service = new StrategyOneFundedRouteService({
    getCapability: (exchange) => capabilities.get(exchange) ?? null,
    getBalance: (exchange, asset) => balances.get(`${exchange}:${asset}`) ?? null,
    getSynchronizationReport: () => synchronizationReport(synchronizationStatus),
    convertInrToAsset: (_asset, capitalInr) => ({targetQuantity: capitalInr}),
    getTakerFeePercent: () => 0.1,
    normalizeQuantity: (request) => crossExchangeExecutableQuantityNormalizer.normalize(request),
  });

  setBalance(balances, "coindcx", "USDT", 2_000);
  setBalance(balances, "coinswitch", "BTC", 20);

  const fullyFunded = service.evaluate({
    opportunity: opportunity("fully-funded", 20),
    requestedCapitalInr: 1_000,
    now: NOW,
  });
  assert.equal(fullyFunded.state, "FUNDED");
  assert.equal(fullyFunded.capitalQuantity, 10);
  assert.equal(fullyFunded.executableQuantity, 10);
  assert.equal(fullyFunded.buyFunding.asset, "USDT");
  assert.equal(fullyFunded.sellFunding.asset, "BTC");
  assert.equal(fullyFunded.buyFunding.sufficient, true);
  assert.equal(fullyFunded.sellFunding.sufficient, true);
  assert.equal(fullyFunded.quantityNeverIncreased, true);

  const depthReduced = service.evaluate({
    opportunity: opportunity("depth-reduced", 4.57),
    requestedCapitalInr: 1_000,
    now: NOW,
  });
  assert.equal(depthReduced.state, "REDUCED");
  assert.equal(depthReduced.depthQuantity, 4.57);
  assert.equal(depthReduced.executableQuantity, 4.5);
  assert.ok((depthReduced.reductionPercent ?? 0) > 50);

  setBalance(balances, "coindcx", "USDT", 550.55);
  setBalance(balances, "coinswitch", "BTC", 8);
  const balanceReduced = service.evaluate({
    opportunity: opportunity("balance-reduced", 20),
    requestedCapitalInr: 1_000,
    now: NOW,
  });
  assert.equal(balanceReduced.state, "REDUCED");
  assert.equal(balanceReduced.executableQuantity, 5.5);
  assert.equal(balanceReduced.buyFunding.sufficient, true);
  assert.ok((balanceReduced.estimatedExecutableCapitalInr ?? 0) < 1_000);

  setBalance(balances, "coinswitch", "BTC", 0);
  const unfunded = service.evaluate({
    opportunity: opportunity("unfunded", 20),
    requestedCapitalInr: 1_000,
    now: NOW,
  });
  assert.equal(unfunded.state, "BLOCKED");
  assert.equal(unfunded.executableQuantity, null);
  assert.match(unfunded.blockers.join(" "), /no positive two-leg funded quantity/i);

  const isolatedPaper = service.evaluate({
    opportunity: opportunity("isolated-paper", 20),
    requestedCapitalInr: 1_000,
    fundingBoundary: "ISOLATED_PAPER",
    now: NOW,
  });
  assert.equal(isolatedPaper.state, "FUNDED");
  assert.equal(isolatedPaper.executableQuantity, 10);
  assert.equal(isolatedPaper.fundingBoundary, "ISOLATED_PAPER");
  assert.equal(isolatedPaper.authenticatedBalancesRequired, false);
  assert.equal(isolatedPaper.isolatedPaperCapital, true);
  assert.equal(isolatedPaper.buyFunding.synchronizationStatus, "NOT_REQUIRED_PAPER");
  assert.equal(isolatedPaper.sellFunding.synchronizationStatus, "NOT_REQUIRED_PAPER");
  assert.equal(isolatedPaper.liveExecutionAllowed, false);
  assert.equal(isolatedPaper.orderSubmissionAllowed, false);

  capabilities.set("coinswitch", {
    ...capability("coinswitch"),
    quantity: {
      ...capability("coinswitch").quantity,
      quantityStep: null,
      quantityPrecision: null,
    },
  });

  const isolatedPaperWithUnpublishedVenueIncrement = service.evaluate({
    opportunity: opportunity("isolated-paper-unpublished-increment", 20),
    requestedCapitalInr: 1_000,
    fundingBoundary: "ISOLATED_PAPER",
    now: NOW,
  });
  assert.equal(isolatedPaperWithUnpublishedVenueIncrement.state, "FUNDED");
  assert.equal(isolatedPaperWithUnpublishedVenueIncrement.executableQuantity, 10);
  assert.equal(
    isolatedPaperWithUnpublishedVenueIncrement.quantityNormalization?.paperOnlyFallbackUsed,
    true,
  );
  assert.equal(
    isolatedPaperWithUnpublishedVenueIncrement.quantityNormalization?.liveOrderSafe,
    false,
  );

  setBalance(balances, "coindcx", "USDT", 2_000);
  setBalance(balances, "coinswitch", "BTC", 20);
  const liveReadinessWithUnpublishedVenueIncrement = service.evaluate({
    opportunity: opportunity("live-unpublished-increment", 20),
    requestedCapitalInr: 1_000,
    now: NOW,
  });
  assert.equal(liveReadinessWithUnpublishedVenueIncrement.state, "BLOCKED");
  assert.match(
    liveReadinessWithUnpublishedVenueIncrement.blockers.join(" "),
    /increment\/precision evidence is unavailable/i,
  );

  capabilities.set("coinswitch", capability("coinswitch"));

  setBalance(balances, "coinswitch", "BTC", 20, NOW - 15_001);
  const stale = service.evaluate({
    opportunity: opportunity("stale", 20),
    requestedCapitalInr: 1_000,
    now: NOW,
  });
  assert.equal(stale.state, "BLOCKED");
  assert.match(stale.blockers.join(" "), /balance is stale/i);

  setBalance(balances, "coinswitch", "BTC", 20);
  synchronizationStatus = "FAILED";
  const failedRead = service.evaluate({
    opportunity: opportunity("failed-read", 20),
    requestedCapitalInr: 1_000,
    now: NOW,
  });
  assert.equal(failedRead.state, "BLOCKED");
  assert.match(failedRead.blockers.join(" "), /synchronization is FAILED/i);

  synchronizationStatus = "SYNCHRONIZED";
  setBalance(balances, "coindcx", "USDT", 50.05);
  setBalance(balances, "coinswitch", "BTC", 0.5);
  capabilities.set("coindcx", capability("coindcx", 1));
  capabilities.set("coinswitch", capability("coinswitch", 1));
  const belowRules = service.evaluate({
    opportunity: opportunity("below-rules", 20),
    requestedCapitalInr: 1_000,
    now: NOW,
  });
  assert.equal(belowRules.state, "BLOCKED");
  assert.match(belowRules.blockers.join(" "), /below minimum/i);

  assert.equal(belowRules.authenticatedBalancesRequired, true);
  assert.equal(belowRules.isolatedPaperCapital, false);
  assert.equal(belowRules.staleBalanceAllowed, false);
  assert.equal(belowRules.liveExecutionAllowed, false);
  assert.equal(belowRules.orderSubmissionAllowed, false);

  const cushionBalances = new Map<string, ExchangeBalanceSnapshot>();
  const cushionCapabilities = new Map([
    ["coindcx", {
      ...capability("coindcx"),
      quantity: {
        ...capability("coindcx").quantity,
        maximumQuantity: 1_000,
        quantityStep: 0.01,
        quantityPrecision: 2,
      },
      notional: {minimumNotional: 5, maximumNotional: null},
    }],
    ["coinswitch", {
      ...capability("coinswitch"),
      quantity: {
        ...capability("coinswitch").quantity,
        maximumQuantity: 1_000,
        quantityStep: 1,
        quantityPrecision: 0,
      },
      notional: {minimumNotional: 5, maximumNotional: null},
    }],
  ]);
  const cushionService = new StrategyOneFundedRouteService({
    getCapability: (exchange) => cushionCapabilities.get(exchange) ?? null,
    getBalance: (exchange, asset) =>
      cushionBalances.get(`${exchange}:${asset}`) ?? null,
    getSynchronizationReport: () => synchronizationReport("SYNCHRONIZED"),
    convertInrToAsset: (_asset, capitalInr) => ({
      targetQuantity: capitalInr / 99.88,
    }),
    getTakerFeePercent: () => 0.1,
    normalizeQuantity: (request) =>
      crossExchangeExecutableQuantityNormalizer.normalize(request),
  });
  setBalance(cushionBalances, "coindcx", "USDT", 11.97);
  setBalance(cushionBalances, "coinswitch", "BTC", 130);
  const sandLike = opportunity("minimum-order-cushion", 120);
  const cushionFunded = cushionService.evaluate({
    opportunity: {
      ...sandLike,
      pair: {
        ...sandLike.pair,
        buy: {...sandLike.pair.buy, bestAskPrice: 0.04233},
        sell: {...sandLike.pair.sell, bestBidPrice: 0.04274},
      },
      buyPrice: 0.04233,
      sellPrice: 0.04274,
      buyAvailableQty: 1_827,
      sellAvailableQty: 120,
      executableQty: 120,
      availableExecutableQty: 120,
    },
    requestedCapitalInr: 500,
    maximumCapitalPerLegInr: 505,
    allowSingleIncrementMinimumOrderRoundUp: true,
    now: NOW,
  });
  assert.equal(
    cushionFunded.state,
    "FUNDED",
    `Bounded cushion should fund: ${JSON.stringify(cushionFunded.blockers)}`,
  );
  assert.equal(cushionFunded.executableQuantity, 119);
  assert.equal(cushionFunded.minimumOrderCushionUsed, true);
  assert.equal(cushionFunded.quantityNeverIncreased, false);
  assert.ok((cushionFunded.estimatedBuyRequirementInr ?? 0) > 500);
  assert.ok((cushionFunded.estimatedBuyRequirementInr ?? Number.POSITIVE_INFINITY) <= 505);
  assert.equal(cushionFunded.buyFunding.sufficient, true);
  assert.equal(cushionFunded.sellFunding.sufficient, true);

  testFinalPaperStressGate();

  console.log("STRATEGY #1 FUNDED ROUTE SERVICE TEST PASSED.");
  console.log("Capital, depth, fee reserve, fresh two-leg balances, market rules and post-stress economics bounded quantity without enabling LIVE orders.");
}

function testFinalPaperStressGate(): void {
  const books = new Map<string, OrderBook>();
  const gate = new StrategyOnePaperStressGate({
    getOrderBook: (exchange, market) => books.get(`${exchange}:${market}`) ?? null,
    getTakerFeePercent: () => 0.1,
    getMaximumQuoteAgeMs: () => 2_000,
    getMaximumPairSkewMs: () => 500,
  });

  books.set(
    "coindcx:BTCUSDT",
    orderBook("coindcx", NOW, [[99.9, 20]], [[100, 5], [100.1, 5]]),
  );
  books.set(
    "coinswitch:BTCUSDT",
    orderBook("coinswitch", NOW, [[101.2, 5], [101.1, 5]], [[101.3, 20]]),
  );

  const passed = gate.evaluate({
    opportunity: opportunity("stress-passed", 20),
    quantity: 10,
    now: NOW,
  });
  assert.equal(passed.status, "PASSED");
  assert.equal(passed.buyVwap, 100.05);
  assert.equal(passed.sellVwap, 101.15);
  assert.equal(passed.buyLimitPrice, 100.1);
  assert.equal(passed.sellLimitPrice, 101.1);
  assert.equal(passed.minimumNetProfitPercent, 0.3);
  assert.ok((passed.postStressNetProfitPercent ?? 0) > 0.3);
  assert.equal(passed.paperOnly, true);
  assert.equal(passed.liveExecutionAllowed, false);
  assert.equal(passed.orderSubmissionAllowed, false);

  books.set(
    "coinswitch:BTCUSDT",
    orderBook("coinswitch", NOW, [[100.6, 5], [100.5, 5]], [[100.7, 20]]),
  );
  const belowMinimum = gate.evaluate({
    opportunity: opportunity("stress-below-minimum", 20),
    quantity: 10,
    now: NOW,
  });
  assert.equal(belowMinimum.status, "BLOCKED");
  assert.match(belowMinimum.reasons.join(" "), /below minimum 0\.3000%/i);

  books.set(
    "coinswitch:BTCUSDT",
    orderBook("coinswitch", NOW, [[101.2, 4], [101.1, 4]], [[101.3, 20]]),
  );
  const partialSell = gate.evaluate({
    opportunity: opportunity("stress-partial-sell", 20),
    quantity: 10,
    now: NOW,
  });
  assert.equal(partialSell.status, "BLOCKED");
  assert.match(partialSell.reasons.join(" "), /SELL depth is partial/i);

  books.set(
    "coinswitch:BTCUSDT",
    orderBook("coinswitch", NOW - 2_001, [[101.2, 10]], [[101.3, 20]]),
  );
  const staleSell = gate.evaluate({
    opportunity: opportunity("stress-stale-sell", 20),
    quantity: 10,
    now: NOW,
  });
  assert.equal(staleSell.status, "BLOCKED");
  assert.match(staleSell.reasons.join(" "), /SELL book is stale/i);

  books.set(
    "binance:BTCUSDT",
    orderBook("binance", NOW - 191, [[99.9, 20]], [[100, 20]]),
  );
  books.set(
    "bybit:BTCUSDT",
    orderBook("bybit", NOW - 191, [[101.2, 20]], [[101.3, 20]]),
  );
  const basePilot = opportunity("pilot-stale", 20);
  const pilotStale = gate.evaluate({
    opportunity: {
      ...basePilot,
      pair: {
        market: "BTCUSDT",
        buy: {...basePilot.pair.buy, exchange: "binance"},
        sell: {...basePilot.pair.sell, exchange: "bybit"},
      },
    },
    quantity: 10,
    now: NOW,
  });
  assert.equal(pilotStale.status, "BLOCKED");
  assert.match(pilotStale.reasons.join(" "), /maximum 190 ms/i,
    "Exact Binance/Bybit PAPER last-look must reserve dispatch headroom inside the immutable 250 ms ceiling.");
}

function opportunity(id: string, depth: number): ArbitrageOpportunity {
  return {
    id,
    pair: {
      market: "BTCUSDT",
      buy: {
        exchange: "coindcx", market: "BTCUSDT", lastPrice: 100,
        bestBidPrice: 99, bestBidQty: depth, bestAskPrice: 100, bestAskQty: depth,
        spread: 1, timestamp: NOW, source: "orderBook", executable: true,
      },
      sell: {
        exchange: "coinswitch", market: "BTCUSDT", lastPrice: 102,
        bestBidPrice: 102, bestBidQty: depth, bestAskPrice: 103, bestAskQty: depth,
        spread: 1, timestamp: NOW, source: "orderBook", executable: true,
      },
    },
    buyPrice: 100,
    sellPrice: 102,
    buyAvailableQty: depth,
    sellAvailableQty: depth,
    requestedCapitalInr: 1_000,
    quoteAsset: "USDT",
    requestedQuoteCapital: 1_000,
    requiredQty: 10,
    availableExecutableQty: depth,
    executableQty: depth,
    liquidityScore: 100,
    enoughLiquidity: true,
    freshnessScore: 100,
    feeScore: 100,
    spreadScore: 100,
    decision: "EXECUTE",
    analysisSummary: [],
    rawSpread: 2,
    rawSpreadPercent: 2,
    estimatedFees: 0.2,
    netProfit: 1.8,
    netProfitPercent: 1.8,
    usedLastPriceFallback: false,
    quotesAreFresh: true,
    score: 100,
    timestamp: NOW,
  };
}

function capability(exchange: string, minimumQuantity = 0.1): ExchangeMarketCapability {
  return {
    exchange,
    market: "BTCUSDT",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    product: "spot",
    tradingEnabled: true,
    maintenanceMode: false,
    order: {
      supportedOrderTypes: ["limit"],
      supportedTimeInForce: [],
      supportsPostOnly: false,
      supportsClientOrderId: true,
      supportsOrderCancellation: true,
      supportsOrderStatusPolling: true,
    },
    price: {minimumPrice: 0.01, maximumPrice: null, priceStep: 0.01, pricePrecision: 2},
    quantity: {
      minimumQuantity,
      maximumQuantity: 100,
      quantityStep: 0.1,
      quantityPrecision: 1,
    },
    notional: {minimumNotional: 1, maximumNotional: null},
    fees: {makerFeeRate: 0.001, takerFeeRate: 0.001, feeAsset: "USDT"},
    sourceUpdatedAt: NOW,
    synchronizedAt: NOW,
  };
}

function orderBook(
  exchange: string,
  timestamp: number,
  bids: readonly (readonly [number, number])[],
  asks: readonly (readonly [number, number])[],
): OrderBook {
  return {
    exchange,
    market: "BTCUSDT",
    bids: bids.map(([price, quantity]) => ({price, quantity})),
    asks: asks.map(([price, quantity]) => ({price, quantity})),
    timestamp,
  };
}

function setBalance(
  balances: Map<string, ExchangeBalanceSnapshot>,
  exchange: string,
  asset: string,
  availableBalance: number,
  synchronizedAt = NOW,
): void {
  balances.set(`${exchange}:${asset}`, {
    exchange,
    asset,
    availableBalance,
    lockedBalance: 0,
    totalBalance: availableBalance,
    synchronizedAt,
  });
}

function synchronizationReport(
  status: ExchangeBalanceSynchronizationStatus,
): ExchangeBalanceSynchronizationReport {
  return {
    startedAt: NOW - 10,
    completedAt: NOW,
    successfulExchanges: status === "SYNCHRONIZED" ? 2 : 0,
    failedExchanges: status === "FAILED" ? 2 : 0,
    skippedExchanges: status === "NOT_CONFIGURED" ? 2 : 0,
    totalSynchronizedBalances: status === "SYNCHRONIZED" ? 2 : 0,
    results: ["coindcx", "coinswitch"].map((exchange) => ({
      exchange: exchange as "coindcx" | "coinswitch",
      status,
      synchronizedAt: status === "SYNCHRONIZED" ? NOW : null,
      synchronizedBalances: status === "SYNCHRONIZED" ? 1 : 0,
      reasons: [],
    })),
  };
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
