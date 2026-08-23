import {
  createHmac,
} from "node:crypto";

import {
  executionAdapterVerificationService,
} from "../../../execution/live/verification/ExecutionAdapterVerificationService";

import {
  clearDynamicFeeEvidence,
  getExchangeFeeEvidence,
} from "../../../arbitrage/config/fees";

import {
  ZebPayAuthenticatedReadVerificationService,
} from "../ZebPayAuthenticatedReadVerificationService";

import {
  ZebPayAccountApi,
} from "../api/ZebPayAccountApi";

import type {
  ZebPayCredentials,
} from "../api/ZebPayCredentialsProvider";

import {
  ZebPayPrivateHttpClient,
} from "../api/ZebPayPrivateHttpClient";

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

const credentials:
  ZebPayCredentials = {
  apiKey:
    "fixture-api-key",
  apiSecret:
    "fixture-api-secret",
};

const feeData = (
  side:
    "buy" | "sell",
) => ({
  customerLevel:
    "Regular",
  feeList: [
    {
      feeCode:
        "MFEE",
      fee:
        0.1,
    },
    {
      feeCode:
        "TFEE",
      fee:
        0.2,
    },
    {
      feeCode:
        "GST",
      fee:
        18,
    },
    {
      feeCode:
        "TDS",
      fee:
        side ===
          "sell"
          ? 1
          : 0,
    },
  ],
});

async function main():
  Promise<void> {
  executionAdapterVerificationService
    .reset();

  clearDynamicFeeEvidence(
    "zebpay",
  );

  let now =
    Date.now() -
    5_000;

  const requests:
    Array<{
      url: URL;
      init:
        RequestInit | undefined;
    }> = [];

  const client =
    new ZebPayPrivateHttpClient(
      async (
        input,
        init,
      ) => {
        const url =
          new URL(
            input,
          );

        requests.push({
          url,
          init,
        });

        const side =
          url.searchParams
            .get(
              "side",
            );

        const data =
          url.pathname.endsWith(
            "/wallet/balance",
          )
            ? [
                {
                  currency:
                    "INR",
                  balance:
                    "100",
                  pending_trade_balance:
                    "5",
                  lien_locked_balance:
                    0,
                  lending_balance:
                    0,
                  pack_balance:
                    0,
                  qt_locked_balance:
                    0,
                  rms_locked_colletral:
                    0,
                },
              ]
            : feeData(
                side ===
                  "sell"
                  ? "sell"
                  : "buy",
              );

        return new Response(
          JSON.stringify({
            data,
            statusCode:
              200,
            statusDescription:
              "",
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
      undefined,
      () => now,
      1_000,
    );

  const api =
    new ZebPayAccountApi(
      client,
    );

  const balances =
    await api.getBalances(
      credentials,
    );

  assertCondition(
    balances.length ===
      1 &&
      balances[0]
        ?.asset ===
        "INR" &&
      balances[0]
        ?.availableBalance ===
        100 &&
      balances[0]
        ?.lockedBalance ===
        5 &&
      balances[0]
        ?.totalBalance ===
        105,
    "ZebPay wallet rows must normalize available and locked balances without changing units.",
  );

  const firstRequest =
    requests[0];

  const firstHeaders =
    new Headers(
      firstRequest
        ?.init
        ?.headers,
    );

  const firstQuery =
    `timestamp=${now}`;

  const expectedSignature =
    createHmac(
      "sha256",
      credentials.apiSecret,
    )
      .update(
        firstQuery,
      )
      .digest(
        "hex",
      );

  assertCondition(
    firstRequest
      ?.url.search.slice(
        1,
      ) ===
        firstQuery &&
      firstHeaders.get(
        "X-AUTH-APIKEY",
      ) ===
        credentials.apiKey &&
      firstHeaders.get(
        "X-AUTH-SIGNATURE",
      ) ===
        expectedSignature &&
      firstHeaders.get(
        "User-Agent",
      ) ===
        "CAT-PRO/1.0",
    "ZebPay GET requests must sign the exact timestamped query and include the authenticated API headers plus stable user agent.",
  );

  await client.postSigned(
    "/api/v1/orders",
    {
      trade_pair:
        "BTC-INR",
      side:
        "bid",
      size:
        0.001,
      price:
        100,
      tradeType:
        1,
      platform:
        "API_Trading",
    },
    credentials,
  );

  const postRequest =
    requests[1];
  const postBody =
    String(
      postRequest?.init
        ?.body ??
      "",
    );
  const postHeaders =
    new Headers(
      postRequest?.init
        ?.headers,
    );

  assertCondition(
    postRequest?.init
      ?.method ===
        "POST" &&
      JSON.parse(
        postBody,
      ).timestamp ===
        now &&
      postHeaders.get(
        "X-AUTH-SIGNATURE",
      ) ===
        createHmac(
          "sha256",
          credentials.apiSecret,
        )
          .update(
            postBody,
          )
          .digest(
            "hex",
          ),
    "ZebPay POST requests must sign the exact serialized timestamped body.",
  );

  requests.length =
    0;

  let executableFeeMarkets:
    string[] = [];

  const service =
    new ZebPayAuthenticatedReadVerificationService({
      api,
      credentialsProvider: {
        isConfigured:
          () => true,
        getCredentials:
          () => credentials,
      },
      now:
        () => now,
      scheduleTimers:
        false,
      refreshIntervalMs:
        5_000,
      feeRefreshIntervalMs:
        5_000,
      feeTtlMs:
        10_000,
      feeMarketsProvider:
        () => executableFeeMarkets,
    });

  await service.verify();

  const readiness =
    service.getReadiness();

  const diagnostics =
    service.getDiagnostics();

  assertCondition(
    readiness.verificationState ===
      "VERIFIED" &&
      readiness.verificationMethod ===
        "SIGNED_BALANCE_READ" &&
      diagnostics.balanceRows ===
        1 &&
      diagnostics.positiveBalanceRows ===
        1 &&
      diagnostics.feeEvidenceFresh &&
      Math.abs(
        (
          diagnostics.buyFee
            ?.effectiveTakerPercent ??
          0
        ) -
          0.236,
      ) <
        1e-12 &&
      diagnostics.buyFee
        ?.tdsPercent ===
        0 &&
      diagnostics.sellFee
        ?.tdsPercent ===
        1 &&
      diagnostics.executionEligible &&
      diagnostics.verifiedFeeMarkets ===
        1,
    "ZebPay authenticated balance and conservative side-aware fee evidence must verify.",
  );

  const registeredFee =
    getExchangeFeeEvidence(
      "zebpay",
      "BTCINR",
    );

  assertCondition(
    registeredFee
      ?.source ===
        "ACCOUNT_API" &&
      Math.abs(
        registeredFee.takerPercent -
          0.236,
      ) <
        1e-12,
    "ZebPay fees must enter the hot path while account TDS remains separate.",
  );

  assertCondition(
    requests.length ===
      3,
    "Initial ZebPay verification must issue one balance and two side-aware fee reads.",
  );

  now +=
    4_000;

  await service.verify();

  assertCondition(
    Number(
      requests.length,
    ) ===
      4,
    "ZebPay fee evidence must be cached between refresh windows while balance verification remains fresh.",
  );

  executableFeeMarkets = [
    "ETH-USDT",
  ];

  now +=
    500;

  await service.verify();

  assertCondition(
    Number(
      requests.length,
    ) ===
      9 &&
    service
      .getDiagnostics()
      .verifiedFeeMarkets ===
      2 &&
    getExchangeFeeEvidence(
      "zebpay",
      "ETHUSDT",
    )?.source ===
      "ACCOUNT_API",
    "A newly executable ZebPay market must receive side-aware fee evidence immediately instead of waiting for the old fee TTL to expire.",
  );

  const missingCredentials =
    new ZebPayAuthenticatedReadVerificationService({
      api,
      credentialsProvider: {
        isConfigured:
          () => false,
        getCredentials:
          () => {
            throw new Error(
              "Credentials must not be requested when unconfigured.",
            );
          },
      },
      now:
        () => now,
      scheduleTimers:
        false,
      refreshIntervalMs:
        5_000,
      feeRefreshIntervalMs:
        5_000,
      feeTtlMs:
        10_000,
    });

  await missingCredentials
    .verify();

  assertCondition(
    missingCredentials
      .getReadiness()
      .verificationState ===
      "NOT_CONFIGURED",
    "Missing ZebPay credentials must fail closed without starting an authenticated request.",
  );

  executionAdapterVerificationService
    .reset();

  clearDynamicFeeEvidence(
    "zebpay",
  );

  console.log(
    "ZEBPAY V162 FEE TEST PASSED: signed balance and side-aware account fees entered the hot path while TDS stayed separate.",
  );
}

void main().catch(
  (
    error:
      unknown,
  ) => {
    executionAdapterVerificationService
      .reset();

    clearDynamicFeeEvidence(
      "zebpay",
    );

    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);
