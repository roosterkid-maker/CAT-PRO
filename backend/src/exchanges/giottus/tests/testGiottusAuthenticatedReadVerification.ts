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

          assertCondition(
            url.origin ===
              "https://api.giottus.com" &&
            url.pathname ===
              "/api/v1/wallet" &&
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
            "Giottus verification must issue only the documented signed wallet GET.",
          );

          return new Response(
            JSON.stringify([
              {
                asset:
                  "USDT",
                free:
                  "10.5",
                locked:
                  "1.5",
                lockedFd:
                  "0",
                lockedStaking:
                  "0",
                lockedOtc:
                  "0",
              },
            ]),
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
      diagnostics.executionEligible === false &&
      requestCount === 1 &&
      nonGetRequestCount === 0,
      "Giottus signed balance evidence must verify read access without granting execution.",
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
