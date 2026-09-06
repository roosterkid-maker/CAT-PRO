import {
  clearDynamicFeeEvidence,
  getExchangeFeeEvidence,
} from "../config/fees";

import {
  ZebPayFeeSynchronizationService,
} from "../services/ZebPayFeeSynchronizationService";

import type {
  ZebPayPublicMarketApi,
} from "../../exchanges/zebpay/ZebPayPublicApi";

import type {
  ZebPayMarket,
  ZebPayOrderBook,
  ZebPayTradePair,
} from "../../exchanges/zebpay/types";

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

class FixtureZebPayFeeApi
  implements ZebPayPublicMarketApi
{
  async getMarkets():
    Promise<ZebPayMarket[]> {
    throw new Error(
      "Market-ticker access is outside this fee-evidence fixture.",
    );
  }

  async getTradePairs():
    Promise<ZebPayTradePair[]> {
    return [
      {
        tradePairName:
          "BTC-INR",

        tradeVolumeCurrency:
          "BTC",

        tradeDenominationCurrency:
          "INR",

        makerFeePercent:
          "0.15",

        takerFeePercent:
          "0.25",

        isEnable:
          true,
      },

      {
        tradePairName:
          "ETH-USDT",

        tradeVolumeCurrency:
          "ETH",

        tradeDenominationCurrency:
          "USDT",

        makerFeePercent:
          0.1,

        takerFeePercent:
          0.2,

        isEnable:
          true,
      },

      {
        tradePairName:
          "XRP-INR",

        tradeVolumeCurrency:
          "XRP",

        tradeDenominationCurrency:
          "INR",

        makerFeePercent:
          0.15,

        takerFeePercent:
          0.25,

        isEnable:
          false,
      },
    ];
  }

  async getOrderBook():
    Promise<ZebPayOrderBook> {
    throw new Error(
      "Order-book access is outside this fee-evidence fixture.",
    );
  }
}

async function main():
  Promise<void> {
  clearDynamicFeeEvidence(
    "zebpay",
  );

  try {
    const synchronizedAt =
      Date.now();

    const service =
      new ZebPayFeeSynchronizationService({
        api:
          new FixtureZebPayFeeApi(),

        now:
          () =>
            synchronizedAt,

        scheduleTimers:
          false,

        evidenceTtlMs:
          60_000,
      });

    await service.synchronize();

    const btcInrEvidence =
      getExchangeFeeEvidence(
        "zebpay",
        "BTC_INR",
      );

    const ethUsdtEvidence =
      getExchangeFeeEvidence(
        "zebpay",
        "ETHUSDT",
      );

    const disabledEvidence =
      getExchangeFeeEvidence(
        "zebpay",
        "XRP_INR",
      );

    const status =
      service.getStatus();

    assertCondition(
      btcInrEvidence !== null &&
        btcInrEvidence.source ===
          "PUBLIC_API" &&
        btcInrEvidence.makerPercent ===
          0.15 &&
        btcInrEvidence.takerPercent ===
          0.25,
      "ZebPay BTC-INR fee evidence must preserve the published maker/taker rates.",
    );

    assertCondition(
      ethUsdtEvidence !== null &&
        ethUsdtEvidence.makerPercent ===
          0.1 &&
        ethUsdtEvidence.takerPercent ===
          0.2,
      "ZebPay ETH-USDT fee evidence must preserve numeric-typed fee fields.",
    );

    assertCondition(
      disabledEvidence ===
        null,
      "A disabled ZebPay trade pair must never contribute fee evidence.",
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
      "ZebPay fee synchronization status must report only the enabled fixture pairs.",
    );

    console.log(
      "ZEBPAY FEE EVIDENCE TEST PASSED.",
    );

    console.log(
      "No authenticated request or order was submitted.",
    );
  } finally {
    clearDynamicFeeEvidence(
      "zebpay",
    );
  }
}

void main().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      "[ZebPay Fee Evidence Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
