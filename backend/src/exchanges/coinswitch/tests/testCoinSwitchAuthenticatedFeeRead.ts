import {
  createPrivateKey,
  createPublicKey,
  verify,
} from "node:crypto";

import {
  clearDynamicFeeEvidence,
  getExchangeFeeEvidence,
} from "../../../arbitrage/config/fees";

import {
  CoinSwitchFeeSynchronizationService,
} from "../../../arbitrage/services/CoinSwitchFeeSynchronizationService";

import {
  executionAdapterVerificationService,
} from "../../../execution/live/verification/ExecutionAdapterVerificationService";

import type {
  CoinSwitchPublicVenue,
} from "../constants";

import type {
  CoinSwitchCredentials,
  CoinSwitchCredentialSource,
} from "../api/CoinSwitchCredentialsProvider";

import {
  CoinSwitchReadOnlyHttpClient,
} from "../api/CoinSwitchReadOnlyHttpClient";

import {
  CoinSwitchSigner,
} from "../api/CoinSwitchSigner";

import {
  CoinSwitchTradingFeeApi,
  type CoinSwitchTradingFee,
} from "../api/CoinSwitchTradingFeeApi";

import {
  CoinSwitchTradeInfoApi,
  type CoinSwitchTradeInfo,
} from "../api/CoinSwitchTradeInfoApi";

import {
  clearCoinSwitchMarketRuleEvidence,
  getCoinSwitchMarketRuleEvidence,
} from "../CoinSwitchMarketRuleEvidence";

import {
  CoinSwitchMarketRuleSynchronizationService,
} from "../CoinSwitchMarketRuleSynchronizationService";

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

const PRIVATE_SEED =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

const PRIVATE_KEY_DER_PREFIX =
  "302e020100300506032b657004220420";

function fixtureCredentials():
  CoinSwitchCredentials {
  const privateKey =
    createPrivateKey({
      key:
        Buffer.concat([
          Buffer.from(
            PRIVATE_KEY_DER_PREFIX,
            "hex",
          ),
          Buffer.from(
            PRIVATE_SEED,
            "hex",
          ),
        ]),
      format:
        "der",
      type:
        "pkcs8",
    });

  const publicDer =
    createPublicKey(
      privateKey,
    ).export({
      format:
        "der",
      type:
        "spki",
    });

  return {
    apiKey:
      publicDer
        .subarray(
          publicDer.length -
            32,
        )
        .toString(
          "hex",
        ),
    apiSecret:
      PRIVATE_SEED,
  };
}

class FixtureCredentialSource
  implements CoinSwitchCredentialSource
{
  constructor(
    private configured:
      boolean,
    private readonly credentials:
      CoinSwitchCredentials,
  ) {}

  getCredentials():
    CoinSwitchCredentials {
    if (!this.configured) {
      throw new Error(
        "Fixture credentials are not configured.",
      );
    }

    return {
      ...this.credentials,
    };
  }

  isConfigured():
    boolean {
    return this.configured;
  }

  setConfigured(
    configured: boolean,
  ): void {
    this.configured =
      configured;
  }
}

class FixtureTradingFeeSource {
  fail =
    false;

  async getTradingFees(
    venue:
      CoinSwitchPublicVenue,
  ): Promise<
    CoinSwitchTradingFee[]
  > {
    if (this.fail) {
      throw new Error(
        "X-AUTH-SIGNATURE=fixture-signature rejected",
      );
    }

    return [
      {
        venue,
        baseAsset:
          "BTC",
        makerPercent:
          venue ===
            "coinswitchx"
            ? 0
            : 0.07,
        takerPercent:
          venue ===
            "coinswitchx"
            ? 0.01
            : 0.08,
        sourceTimestamp:
          1_720_000_000_000,
      },
    ];
  }
}

class FixtureTradeInfoSource {
  fail =
    false;

  async getTradeInfo(
    venue:
      CoinSwitchPublicVenue,
  ): Promise<
    CoinSwitchTradeInfo[]
  > {
    if (this.fail) {
      throw new Error(
        "X-AUTH-SIGNATURE=fixture-rule-signature rejected",
      );
    }

    const quoteAsset =
      venue ===
        "coinswitchx"
        ? "INR"
        : "USDT";

    return [
      {
        venue,
        symbol:
          `BTC/${quoteAsset}`,
        market:
          `BTC_${quoteAsset}`,
        baseAsset:
          "BTC",
        quoteAsset,
        minimumNotional:
          100,
        maximumNotional:
          1_000_000,
        quantityPrecision:
          6,
        pricePrecision:
          2,
        quantityStep:
          0.000001,
        priceStep:
          0.01,
        limitPrecisionAdjustment:
          null,
      },
    ];
  }
}

async function main():
  Promise<void> {
  const credentials =
    fixtureCredentials();

  const epoch =
    1_720_000_000_123;

  const signed =
    new CoinSwitchSigner()
      .signGet(
        "/trade/api/v2/tradeInfo",
        {
          symbol:
            "BTC/INR",
          exchange:
            "coinswitchx",
        },
        epoch,
        credentials,
      );

  const privateKey =
    createPrivateKey({
      key:
        Buffer.concat([
          Buffer.from(
            PRIVATE_KEY_DER_PREFIX,
            "hex",
          ),
          Buffer.from(
            PRIVATE_SEED,
            "hex",
          ),
        ]),
      format:
        "der",
      type:
        "pkcs8",
    });

  const signatureValid =
    verify(
      null,
      Buffer.from(
        `GET${signed.path}${epoch}`,
        "utf8",
      ),
      createPublicKey(
        privateKey,
      ),
      Buffer.from(
        signed.headers[
          "X-AUTH-SIGNATURE"
        ] ??
          "",
        "hex",
      ),
    );

  assertCondition(
    signatureValid &&
      signed.path ===
        "/trade/api/v2/tradeInfo?exchange=coinswitchx&symbol=BTC/INR" &&
      !Object.values(
        signed.headers,
      ).includes(
        credentials.apiSecret,
      ),
    "CoinSwitch signing must match the official decoded-path Ed25519 contract without transmitting the private seed.",
  );

  let capturedMethod =
    "";

  let capturedUrl =
    "";

  const credentialSource =
    new FixtureCredentialSource(
      true,
      credentials,
    );

  const httpClient =
    new CoinSwitchReadOnlyHttpClient({
      credentialsProvider:
        credentialSource,
      now:
        () =>
          epoch,
      getServerTime:
        async () =>
          epoch,
      request:
        async (
          input,
          init,
        ) => {
          capturedMethod =
            init?.method ??
            "";
          capturedUrl =
            String(
              input,
            );

          return new Response(
            JSON.stringify({
              data: {
                ok:
                  true,
              },
            }),
            {
              status:
                200,
              headers: {
                "Content-Type":
                  "application/json",
              },
            },
          );
        },
    });

  const signedRead =
    await httpClient
      .getSigned<{
        data: {
          ok: boolean;
        };
      }>(
        "/trade/api/v2/tradingFee",
        {
          exchange:
            "coinswitchx",
        },
      );

  assertCondition(
    capturedMethod ===
      "GET" &&
      capturedUrl ===
        "https://coinswitch.co/trade/api/v2/tradingFee?exchange=coinswitchx" &&
      signedRead.data.ok &&
      httpClient
        .isClockSafeForSignedRequest(),
    "CoinSwitch authenticated client must expose only a clock-protected signed GET path.",
  );

  const feeApi =
    new CoinSwitchTradingFeeApi({
      getSigned:
        async <T>() => ({
          data: {
            coinswitchx: {
              BTC: {
                maker_fee:
                  0.0009,
                taker_fee:
                  0.001,
                maker_fee_after_discount:
                  0,
                taker_fee_after_discount:
                  0.0002,
                timestamp:
                  1_720_000_000,
              },
            },
          },
        }) as T,
    });

  const parsedFees =
    await feeApi
      .getTradingFees(
        "coinswitchx",
        credentials,
      );

  assertCondition(
    parsedFees.length ===
      1 &&
      parsedFees[0]
        ?.makerPercent ===
        0 &&
      parsedFees[0]
        ?.takerPercent ===
        0.02,
    "CoinSwitch fee normalization must use post-discount account rates, including a legitimate zero rate.",
  );

  const tradeInfoApi =
    new CoinSwitchTradeInfoApi({
      getSigned:
        async <T>() => ({
          data: {
            coinswitchx: {
              "BTC/INR": {
                quote: {
                  min:
                    "100",
                  max:
                    "1000000",
                },
                precision: {
                  base:
                    6,
                  quote:
                    2,
                  limit:
                    1,
                },
              },
            },
          },
        }) as T,
    });

  const parsedRules =
    await tradeInfoApi
      .getTradeInfo(
        "coinswitchx",
        credentials,
      );

  assertCondition(
    parsedRules.length ===
      1 &&
    parsedRules[0]
      ?.market ===
      "BTC_INR" &&
    parsedRules[0]
      ?.minimumNotional ===
      100 &&
    parsedRules[0]
      ?.quantityStep ===
      0.000001 &&
    parsedRules[0]
      ?.priceStep ===
      0.01,
    "CoinSwitch signed trade-info must normalize minimum notional and base/quote precision without guessed defaults.",
  );

  const mixedTradeInfoApi =
    new CoinSwitchTradeInfoApi({
      getSigned:
        async <T>() => ({
          data: {
            coinswitchx: {
              "BTC/INR": {
                quote: {
                  min:
                    "100",
                  max:
                    "1000000",
                },
                precision: {
                  base:
                    6,
                  quote:
                    2,
                },
              },
              "BONK/INR": {
                quote: {
                  min:
                    "100",
                  max:
                    "1000000",
                },
                precision: {
                  base:
                    "unsupported",
                  quote:
                    2,
                },
              },
            },
          },
        }) as T,
    });

  const mixedRules =
    await mixedTradeInfoApi
      .getTradeInfo(
        "coinswitchx",
        credentials,
      );

  assertCondition(
    mixedRules.length ===
      1 &&
    mixedRules[0]
      ?.market ===
      "BTC_INR",
    "CoinSwitch trade-info must retain valid signed rules while unsupported market rule shapes remain excluded.",
  );

  clearDynamicFeeEvidence(
    "coinswitch",
  );

  executionAdapterVerificationService
    .reset();

  try {
    const feeSource =
      new FixtureTradingFeeSource();

    const synchronizedAt =
      Date.now();

    const service =
      new CoinSwitchFeeSynchronizationService({
        api:
          feeSource,
        credentialsProvider:
          credentialSource,
        now:
          () =>
            synchronizedAt,
        scheduleTimers:
          false,
        evidenceTtlMs:
          30_000,
      });

    await service.synchronize();

    const inrEvidence =
      getExchangeFeeEvidence(
        "coinswitch",
        "BTC_INR",
      );

    const usdtEvidence =
      getExchangeFeeEvidence(
        "coinswitch",
        "BTCUSDT",
      );

    const verified =
      executionAdapterVerificationService
        .getReadiness(
          "coinswitch",
          true,
        );

    assertCondition(
      inrEvidence?.source ===
        "ACCOUNT_API" &&
      inrEvidence.makerPercent ===
        0 &&
      usdtEvidence?.takerPercent ===
        0.0944 &&
      verified.authenticationVerified &&
      verified.verificationMethod ===
        "SIGNED_FEE_READ" &&
      service.getStatus()
        .marketCount ===
        2,
      "Successful CoinSwitch signed fee reads must publish post-discount account fees including 18% GST and fresh read-only verification only.",
    );

    clearCoinSwitchMarketRuleEvidence();

    const ruleSource =
      new FixtureTradeInfoSource();

    const ruleService =
      new CoinSwitchMarketRuleSynchronizationService({
        api:
          ruleSource,
        credentialsProvider:
          credentialSource,
        now:
          () =>
            synchronizedAt,
        scheduleTimers:
          false,
        evidenceTtlMs:
          30_000,
      });

    await ruleService.synchronize();

    const inrRules =
      getCoinSwitchMarketRuleEvidence(
        "BTC_INR",
      );

    assertCondition(
      inrRules?.source ===
        "ACCOUNT_API" &&
      inrRules.minimumNotional ===
        100 &&
      inrRules.quantityPrecision ===
        6 &&
      ruleService.getStatus()
        .marketCount ===
        2,
      "Successful CoinSwitch signed trade-info reads must publish expiring account rule evidence for both venues.",
    );

    ruleSource.fail =
      true;

    let ruleRefreshFailedClosed =
      false;

    try {
      await ruleService.synchronize();
    } catch {
      ruleRefreshFailedClosed =
        true;
    }

    assertCondition(
      ruleRefreshFailedClosed &&
      getCoinSwitchMarketRuleEvidence(
        "BTC_INR",
      ) ===
        null &&
      ruleService.getStatus()
        .lastError
        ?.includes(
          "[REDACTED]",
        ) ===
        true,
      "A failed CoinSwitch trade-info refresh must atomically remove rule evidence and redact signed-request errors.",
    );

    feeSource.fail =
      true;

    let failedClosed =
      false;

    try {
      await service.synchronize();
    } catch {
      failedClosed =
        true;
    }

    const failedReadiness =
      executionAdapterVerificationService
        .getReadiness(
          "coinswitch",
          true,
        );

    assertCondition(
      failedClosed &&
      getExchangeFeeEvidence(
        "coinswitch",
        "BTC_INR",
      ) ===
        null &&
      !failedReadiness
        .authenticationVerified &&
      failedReadiness
        .lastVerificationError
        ?.includes(
          "[REDACTED]",
        ) ===
        true,
      "A failed CoinSwitch signed fee refresh must immediately remove fee evidence and sanitize verification errors.",
    );

    credentialSource
      .setConfigured(
        false,
      );

    await service.synchronize();

    assertCondition(
      executionAdapterVerificationService
        .getReadiness(
          "coinswitch",
          false,
        )
        .verificationState ===
        "NOT_CONFIGURED",
      "Missing CoinSwitch credentials must remain a non-error NOT_CONFIGURED state.",
    );

    console.log(
      "COINSWITCH AUTHENTICATED FEE READ TEST PASSED.",
    );

    console.log(
      "Only fixture GET requests were used; no order method was invoked or submitted.",
    );
  } finally {
    clearDynamicFeeEvidence(
      "coinswitch",
    );

    clearCoinSwitchMarketRuleEvidence();

    executionAdapterVerificationService
      .reset();
  }
}

void main().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      "[CoinSwitch Authenticated Fee Read Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
