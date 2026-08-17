import {
  UnoCoinCapabilityProvider,
} from "../../../execution/capabilities/providers/unocoin/UnoCoinCapabilityProvider";

import {
  orderBookService,
} from "../../../orderbook/services/OrderBookService";

import {
  marketCache,
} from "../../../services/cache.service";

import type {
  NormalizedTicker,
} from "../../coindcx/types";

import {
  UnoCoinAdapter,
} from "../UnoCoinAdapter";

import type {
  UnoCoinPublicMarketApi,
} from "../UnoCoinPublicApi";

import type {
  UnoCoinBaseCoinSettings,
  UnoCoinOrderBook,
  UnoCoinPair,
  UnoCoinTicker,
} from "../types";

function assertCondition(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

class FixtureUnoCoinPublicApi
  implements UnoCoinPublicMarketApi
{
  readonly requestedBooks:
    string[] = [];

  failNextBookRead =
    false;

  private readonly pairs:
    UnoCoinPair[] = [
    {
      ticker_id:
        "BTC_USDT",

      base:
        "USDT",

      target:
        "BTC",
    },

    {
      ticker_id:
        "BAD_USDT",

      base:
        "USDT",

      target:
        "BAD",
    },
  ];

  private readonly tickers:
    UnoCoinTicker[] = [
    {
      ticker_id:
        "BTC_USDT",

      base_currency:
        "USDT",

      target_currency:
        "BTC",

      last_price:
        "101",

      bid:
        "100",

      ask:
        "102",
    },

    {
      ticker_id:
        "BAD_USDT",

      base_currency:
        "USDT",

      target_currency:
        "BAD",

      last_price:
        "50",

      bid:
        "51",

      ask:
        "49",
    },
  ];

  async getPairs():
    Promise<UnoCoinPair[]> {
    return structuredClone(
      this.pairs,
    );
  }

  async getTickers():
    Promise<UnoCoinTicker[]> {
    return structuredClone(
      this.tickers,
    );
  }

  async getBaseCoinSettings():
    Promise<UnoCoinBaseCoinSettings> {
    return {
      USDT: {
        maker_fee:
          "0.2",

        taker_fee:
          "0.3",

        tax:
          "0",

        min_bid_amount:
          "5",

        min_ask_amount:
          "5",

        max_bid_amount:
          "55000",

        max_ask_amount:
          "55000",

        min_volume:
          "0",
      },
    };
  }

  async getOrderBook(
    tickerId: string,
  ): Promise<UnoCoinOrderBook> {
    this.requestedBooks.push(
      tickerId,
    );

    if (
      this.failNextBookRead
    ) {
      this.failNextBookRead =
        false;

      throw new Error(
        "fixture transient timeout",
      );
    }

    if (
      tickerId ===
        "BAD_USDT"
    ) {
      return {
        ticker_id:
          tickerId,

        timestamp:
          1_700_000_000,

        bids: [
          [
            "51",
            "2",
          ],
        ],

        asks: [
          [
            "49",
            "3",
          ],
        ],
      };
    }

    return {
      ticker_id:
        tickerId,

      timestamp:
        1_700_000_000,

      bids: [
        [
          "100",
          "1.5",
        ],

        [
          "99",
          "2",
        ],
      ],

      asks: [
        [
          "102",
          "1.25",
        ],

        [
          "103",
          "3",
        ],
      ],
    };
  }
}

async function main():
  Promise<void> {
  const fixtureApi =
    new FixtureUnoCoinPublicApi();

  const now =
    1_700_000_100_000;

  marketCache.clear();

  orderBookService.clear();

  const adapter =
    new UnoCoinAdapter({
      api:
        fixtureApi,

      now:
        () =>
          now,

      scheduleTimers:
        false,
    });

  const publishedTickers:
    NormalizedTicker[] = [];

  adapter.onTicker(
    (ticker) => {
      publishedTickers.push(
        ticker,
      );
    },
  );

  await adapter.connect();

  const tickerOnly =
    marketCache.get(
      "unocoin",
      "BTC_USDT",
    );

  assertCondition(
    adapter.isConnected() &&
      tickerOnly !==
        undefined &&
      !tickerOnly.executable &&
      tickerOnly.bestBidQty ===
        null &&
      tickerOnly.bestAskQty ===
        null,
    "UnoCoin ticker-only data must remain non-executable.",
  );

  await adapter.subscribe([
    "BAD_USDT",
    "BTCUSDT",
    "MISSING_USDT",
  ]);

  const executableBooks =
    marketCache
      .getExecutableByExchange(
        "unocoin",
      );

  const diagnostics =
    adapter.getDiagnostics();

  assertCondition(
    executableBooks.length ===
      1 &&
      executableBooks[0]
        ?.market ===
        "BTCUSDT" &&
      orderBookService.has(
        "unocoin",
        "BTCUSDT",
      ) &&
      !orderBookService.has(
        "unocoin",
        "BADUSDT",
      ) &&
      diagnostics.validBooksPublished ===
        1 &&
      diagnostics.rejectedBooks ===
        1 &&
      fixtureApi.requestedBooks.length ===
        2 &&
      fixtureApi.requestedBooks[0] ===
        "BAD_USDT" &&
      fixtureApi.requestedBooks[1] ===
        "BTC_USDT",
    "Only a non-empty, non-crossed UnoCoin depth snapshot may become executable.",
  );

  assertCondition(
    publishedTickers.some(
      (ticker) =>
        ticker.market ===
          "BTCUSDT" &&
        ticker.bestBidQty ===
          1.5 &&
        ticker.bestAskQty ===
          1.25,
    ),
    "Validated UnoCoin depth must publish quantity-bearing top-of-book evidence.",
  );

  fixtureApi.failNextBookRead =
    true;

  await adapter.subscribe([
    "BTC_USDT",
  ]);

  const afterTransientFailure =
    adapter.getDiagnostics();

  assertCondition(
    marketCache.get(
      "unocoin",
      "BTCUSDT",
    )?.executable ===
      true &&
      orderBookService.has(
        "unocoin",
        "BTCUSDT",
      ) &&
      afterTransientFailure
        .transientFailuresRetained ===
        1 &&
      afterTransientFailure
        .activeQuarantinedMarkets ===
        0,
    "One transient UnoCoin transport failure must retain the last fresh executable book and must not quarantine the market.",
  );

  const capabilityProvider =
    new UnoCoinCapabilityProvider(
      fixtureApi,
    );

  const capabilities =
    await capabilityProvider
      .getCapabilities({
        forceRefresh:
          true,
      });

  const btcCapability =
    capabilities.find(
      (capability) =>
        capability.market ===
        "BTC_USDT",
    );

  assertCondition(
    btcCapability !==
      undefined &&
      btcCapability.baseAsset ===
        "BTC" &&
      btcCapability.quoteAsset ===
        "USDT" &&
      btcCapability.order
        .supportedOrderTypes
        .includes(
          "limit",
        ) &&
      btcCapability.fees
        .makerFeeRate ===
        0.002 &&
      btcCapability.fees
        .takerFeeRate ===
        0.003 &&
      btcCapability.notional
        .minimumNotional ===
        5 &&
      btcCapability.notional
        .maximumNotional ===
        55_000 &&
      btcCapability.price
        .priceStep ===
        null &&
      btcCapability.price
        .pricePrecision ===
        8 &&
      btcCapability.quantity
        .quantityStep ===
        null &&
      btcCapability.quantity
        .quantityPrecision ===
        8,
    "UnoCoin capabilities must use public quote-currency fee/notional evidence and the documented eight-decimal order representation without inventing tick or lot steps.",
  );

  await adapter.disconnect();

  assertCondition(
    !adapter.isConnected() &&
      marketCache
        .getExecutableByExchange(
          "unocoin",
        ).length ===
        0,
    "UnoCoin disconnect must invalidate executable market data.",
  );

  console.log(
    "UNOCOIN PUBLIC INTEGRATION TEST PASSED.",
  );

  console.log(
    "No authenticated request or order was submitted.",
  );
}

void main().catch(
  (error: unknown) => {
    console.error(
      "[UnoCoin Public Integration Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
