import assert
  from "node:assert/strict";

import type {
  ExecutableQuote,
} from "../../../core/models/ExecutableQuote";

import {
  CrossVenuePriceCredibilityService,
  evaluateExecutedPriceCredibility,
} from "../CrossVenuePriceCredibilityService";

function quote(
  exchange:
    string,

  market:
    string,

  bid:
    number,

  ask:
    number,

  timestamp:
    number,
): ExecutableQuote {
  return {
    exchange,
    market,
    lastPrice:
      (
        bid +
        ask
      ) /
      2,
    bestBidPrice:
      bid,
    bestBidQty:
      10_000,
    bestAskPrice:
      ask,
    bestAskQty:
      10_000,
    spread:
      ask -
      bid,
    timestamp,
    source:
      "orderBook",
    executable:
      true,
  };
}

function main(): void {
  const now =
    1_786_635_600_000;

  const vanryQuotes = [
    quote(
      "binance",
      "VANRYUSDT",
      0.001963,
      0.001966,
      now,
    ),
    quote(
      "bybit",
      "VANRYUSDT",
      0.001960,
      0.001971,
      now,
    ),
    quote(
      "coindcx",
      "VANRYUSDT",
      0.001450,
      0.001464,
      now,
    ),
  ];

  const vanryService =
    new CrossVenuePriceCredibilityService({
      getQuotes:
        () =>
          vanryQuotes,
    });

  const vanry =
    vanryService.evaluate({
      market:
        "VANRYUSDT",
      buyExchange:
        "coindcx",
      sellExchange:
        "binance",
      buyPrice:
        0.001464,
      sellPrice:
        0.001963,
      now,
    });

  assert.equal(
    vanry.acceptable,
    false,
  );
  assert.equal(
    vanry.freshVenueCount,
    3,
  );
  assert.ok(
    vanry.failureCodes.includes(
      "PRICE_RATIO_EXCEEDED",
    ),
  );
  assert.ok(
    vanry.failureCodes.includes(
      "BUY_VENUE_OUTLIER",
    ),
  );
  assert.ok(
    (
      vanry
        .buyDeviationFromMedianPercent ??
      0
    ) >
      20,
  );

  const normalQuotes = [
    quote(
      "binance",
      "BTCUSDT",
      100,
      100.1,
      now,
    ),
    quote(
      "bybit",
      "BTCUSDT",
      100.4,
      100.5,
      now,
    ),
    quote(
      "coindcx",
      "BTCUSDT",
      100.15,
      100.25,
      now,
    ),
  ];

  const normalService =
    new CrossVenuePriceCredibilityService({
      getQuotes:
        () =>
          normalQuotes,
    });

  const normal =
    normalService.evaluate({
      market:
        "BTCUSDT",
      buyExchange:
        "binance",
      sellExchange:
        "bybit",
      buyPrice:
        100.1,
      sellPrice:
        100.4,
      now,
    });

  assert.equal(
    normal.acceptable,
    true,
  );
  assert.equal(
    normal.failureCodes.length,
    0,
  );

  const subtleOutlierQuotes = [
    quote(
      "binance",
      "ETHUSDT",
      100,
      100.1,
      now,
    ),
    quote(
      "bybit",
      "ETHUSDT",
      99.9,
      100,
      now,
    ),
    quote(
      "coindcx",
      "ETHUSDT",
      96,
      96.1,
      now,
    ),
  ];

  const subtleOutlierService =
    new CrossVenuePriceCredibilityService({
      getQuotes:
        () =>
          subtleOutlierQuotes,
    });

  const subtleOutlier =
    subtleOutlierService.evaluate({
      market:
        "ETHUSDT",
      buyExchange:
        "coindcx",
      sellExchange:
        "bybit",
      buyPrice:
        96.1,
      sellPrice:
        99.9,
      now,
    });

  assert.equal(
    subtleOutlier
      .currentPriceRatio! <
      1.05,
    true,
  );
  assert.equal(
    subtleOutlier.acceptable,
    false,
  );
  assert.ok(
    subtleOutlier
      .failureCodes
      .includes(
        "BUY_VENUE_OUTLIER",
      ),
  );

  const staleRouteService =
    new CrossVenuePriceCredibilityService({
      getQuotes:
        () => [
          quote(
            "binance",
            "SOLUSDT",
            99.9,
            100,
            now -
              20_000,
          ),
          quote(
            "bybit",
            "SOLUSDT",
            100.2,
            100.3,
            now,
          ),
        ],
    });

  const staleRoute =
    staleRouteService.evaluate({
      market:
        "SOLUSDT",
      buyExchange:
        "binance",
      sellExchange:
        "bybit",
      buyPrice:
        100,
      sellPrice:
        100.2,
      now,
    });

  assert.equal(
    staleRoute.acceptable,
    false,
  );
  assert.ok(
    staleRoute.failureCodes.includes(
      "BUY_BOOK_UNAVAILABLE",
    ),
  );

  assert.deepEqual(
    evaluateExecutedPriceCredibility(
      100,
      104,
    ),
    {
      credible:
        true,
      priceRatio:
        1.04,
      maximumPriceRatio:
        1.05,
    },
  );

  const distortedFill =
    evaluateExecutedPriceCredibility(
      0.001464,
      0.001963,
    );

  assert.equal(
    distortedFill.credible,
    false,
  );
  assert.ok(
    (
      distortedFill.priceRatio ??
      0
    ) >
      1.3,
  );

  console.log(
    "CROSS-VENUE PRICE CREDIBILITY TEST PASSED.",
  );
}

main();
