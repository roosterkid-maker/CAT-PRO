import {
  clearDynamicFeeEvidence,
  getExchangeFeeEvidence,
} from "../config/fees";

import {
  ZebPayFeeSynchronizationService,
  type ZebPayAuthenticatedFeeSource,
} from "../services/ZebPayFeeSynchronizationService";

import type {
  ZebPayPublicMarketApi,
} from "../../exchanges/zebpay/ZebPayPublicApi";

import type {
  ZebPayMarket,
  ZebPayOrderBook,
  ZebPayTradePair,
} from "../../exchanges/zebpay/types";

import type {
  ZebPayAccountFeeEvidence,
  ZebPayFeeSide,
} from "../../exchanges/zebpay/api/ZebPayAccountApi";

import type {
  ZebPayCredentials,
  ZebPayCredentialSource,
} from "../../exchanges/zebpay/api/ZebPayCredentialsProvider";

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

class FixtureZebPayCredentialSource
  implements ZebPayCredentialSource
{
  constructor(
    private readonly configured: boolean,
  ) {}

  getCredentials():
    ZebPayCredentials {
    if (!this.configured) {
      throw new Error(
        "Fixture ZebPay credentials are not configured.",
      );
    }

    return {
      apiKey:
        "fixture-key",

      apiSecret:
        "fixture-secret",
    };
  }

  isConfigured():
    boolean {
    return this.configured;
  }
}

class FixtureZebPayAccountFeeApi
  implements ZebPayAuthenticatedFeeSource
{
  constructor(
    private readonly result:
      | ZebPayAccountFeeEvidence
      | "FAIL",
  ) {}

  async getTradeFees(
    market: string,
    side: ZebPayFeeSide,
  ): Promise<ZebPayAccountFeeEvidence> {
    if (this.result === "FAIL") {
      throw new Error(
        "Simulated ZebPay authenticated fee endpoint failure.",
      );
    }

    return {
      ...this.result,
      market,
      side,
    };
  }
}

function accountFeeFixture():
  ZebPayAccountFeeEvidence {
  return {
    market:
      "BTC-INR",

    side:
      "sell",

    customerLevel:
      "LEVEL_2",

    makerPercent:
      0.1,

    takerPercent:
      0.15,

    gstPercent:
      18,

    tdsPercent:
      1,

    effectiveMakerPercent:
      0.118,

    effectiveTakerPercent:
      0.177,
  };
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

  try {
    const synchronizedAt =
      Date.now();

    const overrideService =
      new ZebPayFeeSynchronizationService({
        api:
          new FixtureZebPayFeeApi(),

        accountApi:
          new FixtureZebPayAccountFeeApi(
            accountFeeFixture(),
          ),

        credentialsSource:
          new FixtureZebPayCredentialSource(
            true,
          ),

        now:
          () =>
            synchronizedAt,

        scheduleTimers:
          false,

        evidenceTtlMs:
          60_000,
      });

    await overrideService.synchronize();

    const overriddenBtcInr =
      getExchangeFeeEvidence(
        "zebpay",
        "BTC_INR",
      );

    const overriddenEthUsdt =
      getExchangeFeeEvidence(
        "zebpay",
        "ETHUSDT",
      );

    assertCondition(
      overriddenBtcInr !== null &&
        overriddenBtcInr.source ===
          "ACCOUNT_API" &&
        overriddenBtcInr.makerPercent ===
          0.118 &&
        overriddenBtcInr.takerPercent ===
          0.177,
      "A configured authenticated ZebPay key must override the published rate with the account's effective tier.",
    );

    assertCondition(
      overriddenEthUsdt !== null &&
        overriddenEthUsdt.source ===
          "ACCOUNT_API" &&
        overriddenEthUsdt.takerPercent ===
          0.177,
      "The account-tier override must apply uniformly across every synchronized market, not just the reference pair.",
    );

    assertCondition(
      overrideService
        .getStatus()
        .source ===
        "ACCOUNT_API",
      "Synchronization status must report ACCOUNT_API once the authenticated override succeeds.",
    );

    console.log(
      "ZEBPAY AUTHENTICATED ACCOUNT-TIER OVERRIDE TEST PASSED.",
    );
  } finally {
    clearDynamicFeeEvidence(
      "zebpay",
    );
  }

  try {
    const synchronizedAt =
      Date.now();

    const failingOverrideService =
      new ZebPayFeeSynchronizationService({
        api:
          new FixtureZebPayFeeApi(),

        accountApi:
          new FixtureZebPayAccountFeeApi(
            "FAIL",
          ),

        credentialsSource:
          new FixtureZebPayCredentialSource(
            true,
          ),

        now:
          () =>
            synchronizedAt,

        scheduleTimers:
          false,

        evidenceTtlMs:
          60_000,
      });

    await failingOverrideService.synchronize();

    const fallbackEvidence =
      getExchangeFeeEvidence(
        "zebpay",
        "BTC_INR",
      );

    assertCondition(
      fallbackEvidence !== null &&
        fallbackEvidence.source ===
          "PUBLIC_API" &&
        fallbackEvidence.makerPercent ===
          0.15,
      "A failed authenticated read must fall back to the public trade-pair rate rather than losing evidence entirely.",
    );

    assertCondition(
      failingOverrideService
        .getStatus()
        .synchronized &&
        failingOverrideService
          .getStatus()
          .source ===
          "PUBLIC_API" &&
        failingOverrideService
          .getStatus()
          .lastError ===
          null,
      "A failed authenticated read must not surface as a synchronization failure - the public rates are still valid evidence.",
    );

    console.log(
      "ZEBPAY AUTHENTICATED OVERRIDE FAILURE FALLBACK TEST PASSED.",
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
