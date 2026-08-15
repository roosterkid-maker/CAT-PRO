import {
  BybitAccountApi,
} from "../../../exchanges/bybit/api/BybitAccountApi";

import type {
  BybitCredentials,
} from "../../../exchanges/bybit/api/BybitCredentialsProvider";

import {
  liveExecutionService,
} from "../LiveExecutionService";

import {
  executionAdapterVerificationService,
} from "../verification/ExecutionAdapterVerificationService";

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

async function main():
  Promise<void> {
  let requestedPath =
    "";

  let requestedParameters:
    Record<
      string,
      string
    > = {};

  let suppliedCredentials:
    BybitCredentials | undefined;

  const credentials:
    BybitCredentials = {
    apiKey:
      "synthetic-bybit-key",

    apiSecret:
      "synthetic-bybit-secret",
  };

  const accountApi =
    new BybitAccountApi({
      async getSigned<T>(
        path: string,
        parameters:
          Record<
            string,
            string
          > = {},
        providedCredentials?:
          BybitCredentials,
      ): Promise<T> {
        requestedPath =
          path;

        requestedParameters =
          parameters;

        suppliedCredentials =
          providedCredentials;

        return {
          list: [
            {
              accountType:
                "UNIFIED",

              coin: [
                {
                  coin:
                    "usdt",

                  equity:
                    "12.5",

                  walletBalance:
                    "12.25",

                  locked:
                    "0.5",

                  spotBorrow:
                    "0.25",
                },
              ],
            },
          ],
        } as T;
      },
    });

  const balances =
    await accountApi
      .getUnifiedWalletBalances(
        credentials,
      );

  assertCondition(
    requestedPath ===
      "/v5/account/wallet-balance" &&
      requestedParameters.accountType ===
        "UNIFIED" &&
      suppliedCredentials ===
        credentials,
    "Bybit account verification must use the official signed UNIFIED wallet endpoint.",
  );

  assertCondition(
    balances.length ===
      1 &&
      balances[0]
        ?.coin ===
        "USDT" &&
      balances[0]
        ?.equity ===
        12.5 &&
      balances[0]
        ?.walletBalance ===
        12.25 &&
      balances[0]
        ?.lockedBalance ===
        0.5 &&
      balances[0]
        ?.spotBorrow ===
        0.25,
    "Bybit wallet response must be normalized without inventing transferable balance.",
  );

  const originalApiKey =
    process.env
      .BYBIT_API_KEY;

  const originalApiSecret =
    process.env
      .BYBIT_API_SECRET;

  try {
    process.env
      .BYBIT_API_KEY =
      credentials.apiKey;

    process.env
      .BYBIT_API_SECRET =
      credentials.apiSecret;

    executionAdapterVerificationService
      .recordSuccess(
        "bybit",
        "SIGNED_BALANCE_READ",
      );

    const status =
      liveExecutionService
        .getMonitoredExchangeStatus(
          "bybit",
        );

    assertCondition(
      liveExecutionService
        .getMonitoredExchanges()
        .includes(
          "bybit",
        ) &&
      liveExecutionService
        .getRegisteredExchanges()
        .includes(
          "bybit",
        ) &&
      liveExecutionService
        .hasAdapter(
          "bybit",
        ) &&
      status.adapterRegistered &&
      status.credentialsConfigured &&
      status.authenticationVerified &&
      status.exchangeApiReachable &&
      status.readOnlyVerificationFresh &&
      status.verificationState ===
        "VERIFIED" &&
      !status.liveExecutionEnabled &&
      !status.adapterConnected,
      "Verified Bybit read access must feed the registered V22.20 adapter while global LIVE connectivity remains disabled.",
    );
  } finally {
    executionAdapterVerificationService
      .reset();

    restoreEnvironmentValue(
      "BYBIT_API_KEY",
      originalApiKey,
    );

    restoreEnvironmentValue(
      "BYBIT_API_SECRET",
      originalApiSecret,
    );
  }

  console.log(
    "BYBIT AUTHENTICATED READ VERIFICATION TEST PASSED.",
  );

  console.log(
    "No external exchange request or order was submitted.",
  );
}

function restoreEnvironmentValue(
  name: string,
  value:
    | string
    | undefined,
): void {
  if (
    value ===
    undefined
  ) {
    delete process.env[
      name
    ];

    return;
  }

  process.env[
    name
  ] =
    value;
}

void main().catch(
  (error: unknown) => {
    console.error(
      "[Bybit Authenticated Read Verification Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
