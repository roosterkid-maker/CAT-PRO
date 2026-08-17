import {
  clearDynamicFeeEvidence,
  getExchangeFeeEvidence,
} from "../config/fees";

import {
  UnoCoinFeeSynchronizationService,
} from "../services/UnoCoinFeeSynchronizationService";

import type {
  UnoCoinPublicMarketApi,
} from "../../exchanges/unocoin/UnoCoinPublicApi";

import type {
  UnoCoinBaseCoinSettings,
  UnoCoinOrderBook,
  UnoCoinPair,
  UnoCoinTicker,
} from "../../exchanges/unocoin/types";

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

class FixtureUnoCoinFeeApi
  implements UnoCoinPublicMarketApi
{
  async getPairs():
    Promise<UnoCoinPair[]> {
    return [
      {
        ticker_id:
          "BTC_INR",

        base:
          "INR",

        target:
          "BTC",
      },

      {
        ticker_id:
          "BTC_USDT",

        base:
          "USDT",

        target:
          "BTC",
      },
    ];
  }

  async getBaseCoinSettings():
    Promise<UnoCoinBaseCoinSettings> {
    return {
      INR: {
        maker_fee:
          "0.2",

        taker_fee:
          "0.3",

        tax:
          "18",

        min_bid_amount:
          "100",

        min_ask_amount:
          "100",

        max_bid_amount:
          "8000000",

        max_ask_amount:
          "8000000",
      },

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
      },
    };
  }

  async getTickers():
    Promise<UnoCoinTicker[]> {
    throw new Error(
      "Ticker access is outside this fee-evidence fixture.",
    );
  }

  async getOrderBook():
    Promise<UnoCoinOrderBook> {
    throw new Error(
      "Order-book access is outside this fee-evidence fixture.",
    );
  }
}

async function main():
  Promise<void> {
  clearDynamicFeeEvidence(
    "unocoin",
  );

  try {
    const synchronizedAt =
      Date.now();

    const service =
      new UnoCoinFeeSynchronizationService({
        api:
          new FixtureUnoCoinFeeApi(),

        now:
          () =>
            synchronizedAt,

        scheduleTimers:
          false,

        evidenceTtlMs:
          60_000,
      });

    await service.synchronize();

    const inrEvidence =
      getExchangeFeeEvidence(
        "unocoin",
        "BTC_INR",
      );

    const usdtEvidence =
      getExchangeFeeEvidence(
        "unocoin",
        "BTCUSDT",
      );

    const missingEvidence =
      getExchangeFeeEvidence(
        "unocoin",
        "ETH_BTC",
      );

    const status =
      service.getStatus();

    assertCondition(
      inrEvidence !== null &&
        inrEvidence.source ===
          "PUBLIC_API" &&
        inrEvidence.makerPercent ===
          0.236 &&
        inrEvidence.takerPercent ===
          0.354,
      "UnoCoin INR fee evidence must include the published 18% tax component.",
    );

    assertCondition(
      usdtEvidence !== null &&
        usdtEvidence.makerPercent ===
          0.2 &&
        usdtEvidence.takerPercent ===
          0.3,
      "UnoCoin USDT fee evidence must preserve the published zero-tax rates.",
    );

    assertCondition(
      missingEvidence ===
        null,
      "An UnoCoin market without synchronized evidence must remain fee-blocked.",
    );

    assertCondition(
      status.synchronized &&
        status.marketCount ===
          2 &&
        status.lastError ===
          null &&
        status.expiresAt ===
          synchronizedAt +
            60_000,
      "UnoCoin fee synchronization status must report only verified fixture evidence.",
    );

    console.log(
      "UNOCOIN FEE EVIDENCE TEST PASSED.",
    );

    console.log(
      "No authenticated request or order was submitted.",
    );
  } finally {
    clearDynamicFeeEvidence(
      "unocoin",
    );
  }
}

void main().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      "[UnoCoin Fee Evidence Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
