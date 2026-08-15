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

class RecoveryFixtureApi
  implements UnoCoinPublicMarketApi
{
  pairReads =
    0;

  tickerReads =
    0;

  async getPairs():
    Promise<UnoCoinPair[]> {
    this.pairReads +=
      1;

    return [
      {
        ticker_id:
          "BTC_INR",

        base:
          "INR",

        target:
          "BTC",
      },
    ];
  }

  async getTickers():
    Promise<UnoCoinTicker[]> {
    this.tickerReads +=
      1;

    return [
      {
        ticker_id:
          "BTC_INR",

        base_currency:
          "INR",

        target_currency:
          "BTC",

        last_price:
          "6400000",
      },
    ];
  }

  async getBaseCoinSettings():
    Promise<UnoCoinBaseCoinSettings> {
    return {};
  }

  async getOrderBook(
    tickerId: string,
  ): Promise<UnoCoinOrderBook> {
    return {
      ticker_id:
        tickerId,

      bids: [
        [
          "6399000",
          "0.01",
        ],
      ],

      asks: [
        [
          "6401000",
          "0.01",
        ],
      ],
    };
  }
}

async function main():
  Promise<void> {
  const api =
    new RecoveryFixtureApi();

  let now =
    1_700_000_000_000;

  const adapter =
    new UnoCoinAdapter({
      api,
      now:
        () =>
          now,
      scheduleTimers:
        false,
    });

  await adapter.connect();

  assertCondition(
    adapter.isConnected(),
    "Initial UnoCoin public-feed evidence must be connected.",
  );

  now +=
    3 *
      60 *
      1_000 +
    1;

  assertCondition(
    !adapter.isConnected(),
    "UnoCoin public-feed evidence must become stale after the bounded freshness window.",
  );

  await adapter.connect();

  assertCondition(
    adapter.isConnected() &&
      api.pairReads ===
        2 &&
      api.tickerReads ===
        2,
    "A stale UnoCoin adapter must reload public catalog evidence and reconnect cleanly.",
  );

  await adapter.disconnect();

  console.log(
    "UNOCOIN STALE CONNECTION RECOVERY TEST PASSED.",
  );

  console.log(
    "No authenticated request or order was submitted.",
  );
}

void main().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      "[UnoCoin Stale Connection Recovery Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
