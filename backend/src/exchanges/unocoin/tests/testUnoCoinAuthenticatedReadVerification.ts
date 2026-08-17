import {
  credentialSafetyService,
} from "../../../execution/live/security/CredentialSafetyService";

import {
  liveExecutionService,
} from "../../../execution/live/LiveExecutionService";

import {
  exchangeClockSafetyService,
} from "../../../execution/live/time/ExchangeClockSafetyService";

import {
  executionAdapterVerificationService,
} from "../../../execution/live/verification/ExecutionAdapterVerificationService";

import {
  UnoCoinCredentialsProvider,
} from "../api/UnoCoinCredentialsProvider";

import {
  UnoCoinReadOnlyHttpClient,
} from "../api/UnoCoinReadOnlyHttpClient";

import {
  UnoCoinAuthenticatedReadVerificationService,
} from "../UnoCoinAuthenticatedReadVerificationService";

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
  const originalToken =
    process.env
      .UNOCOIN_API_TOKEN;

  const syntheticToken =
    "synthetic-unocoin-read-only-token";

  let requestCount =
    0;

  let orderRequestCount =
    0;

  try {
    delete process.env
      .UNOCOIN_API_TOKEN;

    const provider =
      new UnoCoinCredentialsProvider();

    assertCondition(
      !provider.isConfigured(),
      "Missing UnoCoin token must remain NOT_CONFIGURED.",
    );

    process.env
      .UNOCOIN_API_TOKEN =
      syntheticToken;

    assertCondition(
      provider.isConfigured() &&
        provider.getCredentials()
          .apiToken ===
          syntheticToken,
      "Configured UnoCoin token must be available only through the backend provider.",
    );

    const client =
      new UnoCoinReadOnlyHttpClient({
        fetchImplementation:
          async (
            input,
            init,
          ) => {
            requestCount +=
              1;

            const url =
              new URL(
                input instanceof Request
                  ? input.url
                  : input.toString(),
              );

            const method =
              init?.method ??
              "GET";

            if (
              method !==
                "GET"
            ) {
              orderRequestCount +=
                1;
            }

            const headers =
              new Headers(
                init?.headers,
              );

            assertCondition(
              url.origin ===
                "https://api.unocoin.com" &&
                url.pathname ===
                  "/api/user/status" &&
                method ===
                  "GET" &&
                headers.get(
                  "Authorization",
                ) ===
                  `Bearer ${syntheticToken}`,
              "UnoCoin verification must call only the documented authenticated account-status GET.",
            );

            return new Response(
              JSON.stringify({
                status:
                  1,
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

    const service =
      new UnoCoinAuthenticatedReadVerificationService({
        api:
          client,

        credentialsProvider:
          provider,

        scheduleTimers:
          false,
      });

    await service.verify();

    const readiness =
      executionAdapterVerificationService
        .getReadiness(
          "unocoin",
          true,
        );

    const liveStatus =
      liveExecutionService
        .getMonitoredExchangeStatus(
          "unocoin",
        );

    assertCondition(
      readiness.verificationState ===
        "VERIFIED" &&
        readiness.authenticationVerified &&
      readiness.readOnlyVerificationFresh &&
      readiness.verificationMethod ===
          "TOKEN_ACCOUNT_STATUS_READ" &&
        liveStatus.verificationState ===
          "VERIFIED" &&
        liveStatus.adapterRegistered &&
        liveStatus.capabilities
          ?.supportsLimitOrders ===
          true &&
        liveStatus.capabilities
          ?.supportsMarketOrders ===
          false &&
        !liveStatus.liveExecutionEnabled &&
        !liveStatus.adapterConnected,
      "Successful UnoCoin token verification may support the audited LIMIT foundation but must never enable or connect LIVE execution.",
    );

    const credentialReport =
      credentialSafetyService
        .getReport();

    const serializedReport =
      JSON.stringify(
        credentialReport,
      );

    const unoCoinCredential =
      credentialReport.exchanges
        .find(
          (exchange) =>
            exchange.exchange ===
            "unocoin",
        );

    assertCondition(
      unoCoinCredential
        ?.configured ===
        true &&
        !unoCoinCredential.secretValuesExposed &&
        unoCoinCredential.requiredVariables.length ===
          1 &&
        unoCoinCredential.requiredVariables[0] ===
          "UNOCOIN_API_TOKEN" &&
        !serializedReport.includes(
          syntheticToken,
        ),
      "UnoCoin credential diagnostics must expose status only, never the token.",
    );

    const clock =
      exchangeClockSafetyService
        .getUnoCoinState();

    assertCondition(
      clock.mode ===
        "NOT_REQUIRED" &&
        clock.health ===
          "NOT_APPLICABLE" &&
        !clock.synchronized &&
        clock.signedRequestAllowed,
      "UnoCoin bearer authentication must be reported as clock-not-required, not falsely synchronized.",
    );

    assertCondition(
      requestCount ===
        1 &&
        orderRequestCount ===
          0,
      "UnoCoin verification must perform one GET and no order, withdrawal, or state-changing request.",
    );

    console.log(
      "UNOCOIN AUTHENTICATED READ VERIFICATION TEST PASSED.",
    );

    console.log(
      "Only a fixture GET /api/user/status was used; no order, withdrawal, balance storage, LIVE enablement, or external request was invoked.",
    );
  } finally {
    executionAdapterVerificationService
      .reset();

    if (
      originalToken ===
        undefined
    ) {
      delete process.env
        .UNOCOIN_API_TOKEN;
    } else {
      process.env
        .UNOCOIN_API_TOKEN =
        originalToken;
    }
  }
}

void main().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      "[UnoCoin Authenticated Read Verification Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
