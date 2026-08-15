import {
  CoinSwitchAdapter,
} from "../CoinSwitchAdapter";

import {
  CoinSwitchCapabilityProvider,
} from "../../../execution/capabilities/providers/coinswitch/CoinSwitchCapabilityProvider";

import {
  orderBookService,
} from "../../../orderbook/services/OrderBookService";

import {
  canonicalizeCoinSwitchMarket,
  normalizeCoinSwitchOrderBook,
  normalizeCoinSwitchSymbol,
  normalizeCoinSwitchTicker,
} from "../normalize";

import type {
  CoinSwitchPublicMarketApi,
} from "../CoinSwitchPublicApi";

import type {
  CoinSwitchMarketDescriptor,
  CoinSwitchTicker,
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

class FixtureCoinSwitchPublicApi
  implements CoinSwitchPublicMarketApi
{
  async getServerTime():
    Promise<number> {
    return Date.now();
  }

  async getTickers(
    venue:
      "coinswitchx" |
      "c2c1",
  ): Promise<
    Record<string, CoinSwitchTicker>
  > {
    if (
      venue ===
      "coinswitchx"
    ) {
      return {
        "BTC/INR": {
          symbol:
            "BTC/INR",

          lastPrice:
            "7000000",

          bidPrice:
            "6999000",

          askPrice:
            "7001000",
        },

        "INVALID/USDT": {
          symbol:
            "INVALID/USDT",

          lastPrice:
            "10",

          bidPrice:
            "9",

          askPrice:
            "11",
        },
      };
    }

    return {
      "BTC/USDT": {
        symbol:
          "BTC/USDT",

        lastPrice:
          "81000",

        bidPrice:
          "80999",

        askPrice:
          "81001",
      },
    };
  }
}

function createDescriptor():
  CoinSwitchMarketDescriptor {
  return {
    venue:
      "c2c1",

    symbol:
      "BTC/USDT",

    market:
      "BTC_USDT",

    canonicalMarket:
      "BTCUSDT",

    baseAsset:
      "BTC",

    quoteAsset:
      "USDT",

    ticker: {
      symbol:
        "BTC/USDT",

      lastPrice:
        "81000",
    },
  };
}

async function main():
  Promise<void> {
  const now =
    Date.now();

  assertCondition(
    normalizeCoinSwitchSymbol(
      "btcusdt",
    ) ===
      "BTC/USDT" &&
      normalizeCoinSwitchSymbol(
        "eth_inr",
      ) ===
        "ETH/INR" &&
      canonicalizeCoinSwitchMarket(
        "SOLUSDT",
      ) ===
        "SOLUSDT",
    "CoinSwitch symbols must normalize both compact shared-universe and delimited catalog forms.",
  );

  const normalizedTicker =
    normalizeCoinSwitchTicker(
      "c2c1",
      "BTC/USDT",
      {
        symbol:
          "BTC/USDT",

        lastPrice:
          "81000",

        bidPrice:
          "80999",

        askPrice:
          "81001",
      },
      now,
    );

  assertCondition(
    normalizedTicker !==
      null &&
      normalizedTicker.ticker
        .market ===
        "BTC_USDT" &&
      normalizedTicker.ticker
        .bestBidQty ===
        null &&
      normalizedTicker.ticker
        .bestAskQty ===
        null,
    "CoinSwitch REST ticker-only data must remain quantity-free and non-executable.",
  );

  const descriptor =
    createDescriptor();

  const validBook =
    normalizeCoinSwitchOrderBook(
      {
        s:
          "BTC/USDT",

        timestamp:
          now +
          1_000,

        bids: [
          [
            "80999",
            "0.5",
          ],
        ],

        asks: [
          [
            "81001",
            "0.4",
          ],
        ],
      },
      descriptor,
      now,
    );

  const staleBook =
    normalizeCoinSwitchOrderBook(
      {
        s:
          "BTC/USDT",

        timestamp:
          now -
          20_000,

        bids: [
          [
            "80999",
            "0.5",
          ],
        ],

        asks: [
          [
            "81001",
            "0.4",
          ],
        ],
      },
      descriptor,
      now,
    );

  const crossedBook =
    normalizeCoinSwitchOrderBook(
      {
        s:
          "BTC/USDT",

        timestamp:
          now,

        bids: [
          [
            "81002",
            "0.5",
          ],
        ],

        asks: [
          [
            "81001",
            "0.4",
          ],
        ],
      },
      descriptor,
      now,
    );

  const mismatchedBook =
    normalizeCoinSwitchOrderBook(
      {
        s:
          "ETH/USDT",

        timestamp:
          now,

        bids: [
          [
            "4000",
            "1",
          ],
        ],

        asks: [
          [
            "4001",
            "1",
          ],
        ],
      },
      descriptor,
      now,
    );

  assertCondition(
    validBook !==
      null &&
      validBook.timestamp ===
        now &&
      validBook.sourceTimestamp ===
        now +
          1_000 &&
      validBook.bids[0]
        ?.quantity ===
        0.5 &&
      validBook.asks[0]
        ?.quantity ===
        0.4 &&
      staleBook ===
        null &&
      crossedBook ===
        null &&
      mismatchedBook ===
        null,
    "Only fresh, matching, non-empty, non-crossed CoinSwitch full-depth snapshots may normalize.",
  );

  const stickyAdapter =
    new CoinSwitchAdapter({
      now:
        () => now,

      scheduleTimers:
        false,
    });

  const stickyInternals =
    stickyAdapter as unknown as {
      subscribedMarkets:
        Map<
          string,
          CoinSwitchMarketDescriptor
        >;
    };

  stickyInternals
    .subscribedMarkets
    .set(
      descriptor.canonicalMarket,
      descriptor,
    );

  orderBookService.replace({
    exchange:
      "coinswitch",

    market:
      descriptor.market,

    bids: [
      {
        price:
          80_999,

        quantity:
          0.5,
      },
    ],

    asks: [
      {
        price:
          81_001,

        quantity:
          0.4,
      },
    ],

    timestamp:
      now,
  });

  assertCondition(
    stickyAdapter
      .getFreshSubscribedMarkets()
      .join(
        ",",
      ) ===
      descriptor.market,
    "A current quantity-bearing CoinSwitch subscription must remain eligible for sticky reconciliation.",
  );

  orderBookService.remove(
    "coinswitch",
    descriptor.market,
  );

  assertCondition(
    stickyAdapter
      .getFreshSubscribedMarkets()
      .length ===
      0,
    "A missing CoinSwitch book must remain replaceable rather than sticky.",
  );

  const provider =
    new CoinSwitchCapabilityProvider(
      new FixtureCoinSwitchPublicApi(),
    );

  const capabilities =
    await provider.getCapabilities({
      forceRefresh:
        true,
    });

  const btcInr =
    capabilities.find(
      (capability) =>
        capability.market ===
        "BTC_INR",
    );

  const btcUsdt =
    capabilities.find(
      (capability) =>
        capability.market ===
        "BTC_USDT",
    );

  assertCondition(
    capabilities.length ===
      2 &&
      btcInr !==
        undefined &&
      btcUsdt !==
        undefined &&
      btcUsdt.order
        .supportedOrderTypes
        .length ===
        1 &&
      btcUsdt.order
        .supportedOrderTypes[0] ===
        "limit" &&
      btcUsdt.order
        .supportsClientOrderId &&
      btcUsdt.price
        .priceStep ===
        null &&
      btcUsdt.quantity
        .quantityStep ===
        null &&
      btcUsdt.notional
        .minimumNotional ===
        null &&
      btcUsdt.fees
        .takerFeeRate ===
        null,
    "CoinSwitch capabilities must remain LIMIT-only and must not invent signed precision, notional, or fee data.",
  );

  console.log(
    "COINSWITCH PUBLIC INTEGRATION TEST PASSED.",
  );

  console.log(
    "No authenticated request or order was submitted.",
  );
}

void main().catch(
  (error: unknown) => {
    console.error(
      "[CoinSwitch Public Integration Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
