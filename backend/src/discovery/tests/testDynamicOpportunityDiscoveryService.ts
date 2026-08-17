import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";

import {
  DynamicOpportunityDiscoveryService,
} from "../services/DynamicOpportunityDiscoveryService";

function assertCondition(
  condition: boolean,
  message: string,
): asserts condition {
  if (
    !condition
  ) {
    throw new Error(
      message,
    );
  }
}

function quote(
  input: {
    exchange: string;
    market: string;
    bid: number;
    ask: number;
    timestamp: number;
    executable?: boolean;
  },
): ExecutableQuote {
  return {
    exchange:
      input.exchange,
    market:
      input.market,
    lastPrice:
      (
        input.bid +
        input.ask
      ) /
      2,
    bestBidPrice:
      input.bid,
    bestBidQty:
      10,
    bestAskPrice:
      input.ask,
    bestAskQty:
      12,
    spread:
      input.ask -
      input.bid,
    timestamp:
      input.timestamp,
    source:
      "orderBook",
    executable:
      input.executable ??
      true,
  };
}

function main(): void {
  const now =
    1_800_000_000_000;

  const quotes:
    ExecutableQuote[] = [
    quote({
      exchange:
        "binance",
      market:
        "BTCUSDT",
      bid:
        49_990,
      ask:
        50_000,
      timestamp:
        now - 100,
    }),
    quote({
      exchange:
        "bybit",
      market:
        "btc_usdt",
      bid:
        50_100,
      ask:
        50_110,
      timestamp:
        now - 120,
    }),
    quote({
      exchange:
        "binance",
      market:
        "ETHBTC",
      bid:
        0.04,
      ask:
        0.0401,
      timestamp:
        now - 90,
    }),
    quote({
      exchange:
        "binance",
      market:
        "ETH-USDT",
      bid:
        2_010,
      ask:
        2_011,
      timestamp:
        now - 80,
    }),
    quote({
      exchange:
        "coindcx",
      market:
        "STALEUSDT",
      bid:
        10,
      ask:
        11,
      timestamp:
        now - 20_000,
    }),
    quote({
      exchange:
        "coindcx",
      market:
        "NOQUOTEIDENTITY",
      bid:
        10,
      ask:
        11,
      timestamp:
        now - 100,
    }),
  ];

  const service =
    new DynamicOpportunityDiscoveryService({
      getQuotes:
        () =>
          structuredClone(
            quotes,
          ),
      isFresh:
        (
          candidate,
          evaluatedAt,
        ) =>
          evaluatedAt -
            candidate.timestamp <=
          5_000,
    });

  const snapshot =
    service.getSnapshot(
      now,
    );

  assertCondition(
    snapshot.summary.cachedQuotes === 6 &&
    snapshot.summary.freshExecutableBooks === 4 &&
    snapshot.summary.rejectedQuotes === 2 &&
    snapshot.summary.exchanges === 2 &&
    snapshot.summary.normalizedSpotMarkets === 3 &&
    snapshot.summary.sharedSpotMarkets === 1,
    "Shared discovery must admit only fresh executable parseable spot books.",
  );

  const profitableDirection =
    snapshot.crossExchangeRoutes.find(
      (route) =>
        route.market ===
          "BTCUSDT" &&
        route.buyExchange ===
          "binance" &&
        route.sellExchange ===
          "bybit",
    );

  assertCondition(
    snapshot.crossExchangeRoutes.length === 2 &&
    profitableDirection !==
      undefined &&
    profitableDirection.grossSpreadPercent ===
      0.2 &&
    !profitableDirection.economicallyQualified &&
    !profitableDirection.executionAuthorized,
    "Discovery must expose both cross-exchange directions without claiming downstream economic qualification.",
  );

  const triangular =
    snapshot.triangularPaths.find(
      (path) =>
        path.exchange ===
          "binance" &&
        new Set(
          path.assets,
        ).has(
          "BTC",
        ) &&
        new Set(
          path.assets,
        ).has(
          "ETH",
        ) &&
        new Set(
          path.assets,
        ).has(
          "USDT",
        ),
    );

  assertCondition(
    triangular !==
      undefined &&
    triangular.legs.length === 3 &&
    !triangular.feesApplied &&
    !triangular.marketRulesApplied &&
    !triangular.economicallyQualified &&
    !triangular.executionAuthorized,
    "A real three-market conversion topology must be discovered without becoming a profit or execution claim.",
  );

  assertCondition(
    !snapshot.safety.marketCacheMutationAllowed &&
    !snapshot.safety.freshnessThresholdMutationAllowed &&
    !snapshot.safety.capitalMutationAllowed &&
    !snapshot.safety.paperExecutionAllowed &&
    !snapshot.safety.liveExecutionAllowed &&
    !snapshot.safety.orderSubmissionAllowed,
    "Shared discovery must remain read-only and execution isolated.",
  );

  console.log(
    "DYNAMIC OPPORTUNITY DISCOVERY TEST PASSED.",
  );

  console.log(
    "No threshold, cache, capital, PAPER/LIVE, or exchange-order mutation occurred.",
  );
}

main();
