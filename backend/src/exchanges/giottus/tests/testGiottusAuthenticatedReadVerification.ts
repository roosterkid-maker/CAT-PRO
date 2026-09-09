import {
  createHmac,
} from "node:crypto";

import {
  executionAdapterVerificationService,
} from "../../../execution/live/verification/ExecutionAdapterVerificationService";

import {
  GiottusAccountApi,
} from "../api/GiottusAccountApi";

import {
  GiottusCredentialsProvider,
} from "../api/GiottusCredentialsProvider";

import {
  GiottusPrivateHttpClient,
} from "../api/GiottusPrivateHttpClient";

import {
  GiottusPrivateRateLimitError,
  GiottusPrivateRequestGovernor,
} from "../api/GiottusPrivateRequestGovernor";

import {
  GiottusAuthenticatedReadVerificationService,
} from "../GiottusAuthenticatedReadVerificationService";

function assertCondition(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main():
  Promise<void> {
  const originalKey =
    process.env
      .GIOTTUS_API_KEY;

  const originalSecret =
    process.env
      .GIOTTUS_API_SECRET;

  const apiKey =
    "synthetic-giottus-key";

  const apiSecret =
    "synthetic-giottus-secret";

  const timestamp =
    Date.now();

  let requestCount =
    0;

  let nonGetRequestCount =
    0;

  try {
    process.env
      .GIOTTUS_API_KEY =
      apiKey;

    process.env
      .GIOTTUS_API_SECRET =
      apiSecret;

    const provider =
      new GiottusCredentialsProvider();

    assertCondition(
      provider.isConfigured(),
      "Giottus credentials must be detected without exposing them.",
    );

    const client =
      new GiottusPrivateHttpClient(
        async (input, init) => {
          requestCount += 1;

          const method =
            init?.method ??
            "GET";

          if (method !== "GET") {
            nonGetRequestCount += 1;
          }

          const url =
            new URL(
              input instanceof Request
                ? input.url
                : input.toString(),
            );

          const headers =
            new Headers(
              init?.headers,
            );

          const canonical =
            `recvWindow=5000&timestamp=${timestamp}`;

          const expectedSignature =
            createHmac(
              "sha256",
              apiSecret,
            )
              .update(canonical)
              .digest("hex");

          const supportedReadPath =
            url.pathname === "/api/v1/wallet" ||
            url.pathname === "/api/v1/spot/orders/open";

          assertCondition(
            url.origin ===
              "https://api.giottus.com" &&
            supportedReadPath &&
            url.searchParams.get(
              "recvWindow",
            ) === "5000" &&
            url.searchParams.get(
              "timestamp",
            ) === String(timestamp) &&
            url.searchParams.get(
              "signature",
            ) === expectedSignature &&
            headers.get(
              "X-GIOTTUS-APIKEY",
            ) === apiKey &&
            headers.get(
              "User-Agent",
            ) === "CAT-PRO/20.0" &&
            method === "GET",
            "Giottus verification must issue only documented signed account-read GETs.",
          );

          return new Response(
            JSON.stringify(
              url.pathname === "/api/v1/wallet"
                ? [
                    {
                      asset: "USDT",
                      free: "10.5",
                      locked: "1.5",
                      lockedFd: "0",
                      lockedStaking: "0",
                      lockedOtc: "0",
                    },
                  ]
                : [],
            ),
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
        () => timestamp,
      );

    const accountApi =
      new GiottusAccountApi(
        client,
      );

    const service =
      new GiottusAuthenticatedReadVerificationService({
        api:
          accountApi,
        credentialsProvider:
          provider,
        now:
          () => timestamp,
        scheduleTimers:
          false,
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
      readiness.authenticationVerified &&
      readiness.readOnlyVerificationFresh &&
      diagnostics.balanceRows === 1 &&
      diagnostics.positiveBalanceRows === 1 &&
      diagnostics.openOrderRows === 0 &&
      diagnostics.partiallyFilledOpenOrders === 0 &&
      diagnostics.executionEligible === false &&
      requestCount === 1 &&
      nonGetRequestCount === 0,
      "Giottus verification must reuse the signed balance lane without issuing a parallel open-order probe or granting execution.",
    );

    let rateLimitedNetworkReads =
      0;

    let governorNow =
      timestamp;

    const requestGovernor =
      new GiottusPrivateRequestGovernor(
        {
          minimumRequestIntervalMs:
            0,
          minimumRateLimitCooldownMs:
            30_000,
          maximumRateLimitCooldownMs:
            300_000,
        },
        () => governorNow,
      );

    const rateLimitedClient =
      new GiottusPrivateHttpClient(
        async () => {
          rateLimitedNetworkReads +=
            1;

          return new Response(
            JSON.stringify({
              code:
                -1003,
              msg:
                "Too many requests.",
            }),
            {
              status:
                429,
              headers: {
                "Content-Type":
                  "application/json",
                "Retry-After":
                  "2",
              },
            },
          );
        },
        undefined,
        () => governorNow,
        undefined,
        undefined,
        requestGovernor,
      );

    let firstRateLimit:
      unknown = null;

    try {
      await rateLimitedClient
        .getSigned(
          "/api/v1/wallet",
          [],
          provider
            .getCredentials(),
        );
    } catch (error: unknown) {
      firstRateLimit =
        error;
    }

    let suppressedRateLimit:
      unknown = null;

    try {
      await rateLimitedClient
        .getSigned(
          "/api/v1/wallet",
          [],
          provider
            .getCredentials(),
        );
    } catch (error: unknown) {
      suppressedRateLimit =
        error;
    }

    const governorDiagnostics =
      requestGovernor
        .getDiagnostics();

    assertCondition(
      firstRateLimit instanceof
        GiottusPrivateRateLimitError &&
      firstRateLimit.retryAfterMs ===
        2_000 &&
      suppressedRateLimit instanceof
        GiottusPrivateRateLimitError &&
      suppressedRateLimit.locallySuppressed &&
      rateLimitedNetworkReads ===
        1 &&
      governorDiagnostics.rateLimitResponses ===
        1 &&
      governorDiagnostics.locallySuppressedRequests ===
        1 &&
      governorDiagnostics.cooldownUntil ===
        governorNow +
          30_000,
      "A Giottus 429 must open one shared bounded cooldown and suppress duplicate signed network probes.",
    );

    governorNow +=
      30_001;

    let authoritativeCooldownError:
      unknown = null;

    try {
      await requestGovernor
        .execute(
          async () => {
            throw new GiottusPrivateRateLimitError(
              "Synthetic authoritative Giottus cooldown.",
              600_000,
            );
          },
        );
    } catch (error: unknown) {
      authoritativeCooldownError =
        error;
    }

    assertCondition(
      authoritativeCooldownError instanceof
        GiottusPrivateRateLimitError &&
      requestGovernor
        .getDiagnostics()
        .cooldownUntil ===
        governorNow +
          600_000,
      "An exchange-declared Giottus Retry-After must never be shortened by the local exponential-backoff cap.",
    );

    console.log(
      "GIOTTUS AUTHENTICATED READ VERIFICATION TEST PASSED.",
    );
  } finally {
    executionAdapterVerificationService
      .reset();

    if (originalKey === undefined) {
      delete process.env
        .GIOTTUS_API_KEY;
    } else {
      process.env
        .GIOTTUS_API_KEY =
        originalKey;
    }

    if (originalSecret === undefined) {
      delete process.env
        .GIOTTUS_API_SECRET;
    } else {
      process.env
        .GIOTTUS_API_SECRET =
        originalSecret;
    }
  }
}

void main().catch(
  (error: unknown) => {
    console.error(
      "[Giottus Authenticated Read Verification Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
