import {
  GiottusAuthenticatedBalanceReadCoordinator,
} from "../GiottusAuthenticatedBalanceReadCoordinator";

import type {
  GiottusBalance,
} from "../api/GiottusAccountApi";

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
  let now =
    1_000_000;

  let networkReads =
    0;

  let releaseFirstRead:
    (
      balances:
        GiottusBalance[],
    ) => void =
    () => undefined;

  const firstRead =
    new Promise<
      GiottusBalance[]
    >(
      (resolve) => {
        releaseFirstRead =
          resolve;
      },
    );

  const coordinator =
    new GiottusAuthenticatedBalanceReadCoordinator({
      api: {
        async getBalances() {
          networkReads +=
            1;

          if (
            networkReads ===
            1
          ) {
            return firstRead;
          }

          return [
            balance(
              "USDT",
              11,
            ),
          ];
        },
      },
      now:
        () => now,
      cacheTtlMs:
        5_000,
      getRequestGovernorDiagnostics:
        () => ({
          requestsAdmitted:
            networkReads,
          successfulRequests:
            Math.max(
              0,
              networkReads -
                1,
            ),
          rateLimitResponses:
            0,
          locallySuppressedRequests:
            0,
          consecutiveRateLimits:
            0,
          lastRequestStartedAt:
            null,
          lastSuccessfulAt:
            null,
          cooldownUntil:
            null,
          cooldownRemainingMs:
            0,
        }),
    });

  const credentials = {
    apiKey:
      "synthetic-key",
    apiSecret:
      "synthetic-secret",
  };

  const primary =
    coordinator
      .readBalances(
        credentials,
      );

  const duplicate =
    coordinator
      .readBalances(
        credentials,
      );

  assertCondition(
    networkReads ===
      1,
    "Concurrent Giottus balance consumers must share one remote request.",
  );

  releaseFirstRead([
    balance(
      "USDT",
      10,
    ),
  ]);

  const [primaryEvidence, duplicateEvidence] =
    await Promise.all([
      primary,
      duplicate,
    ]);

  const cachedEvidence =
    await coordinator
      .readBalances(
        credentials,
      );

  assertCondition(
    primaryEvidence.source ===
      "REMOTE" &&
    duplicateEvidence.source ===
      "COALESCED" &&
    cachedEvidence.source ===
      "CACHE" &&
    primaryEvidence.observedAt ===
      now &&
    duplicateEvidence.observedAt ===
      now &&
    cachedEvidence.observedAt ===
      now &&
    networkReads ===
      1,
    "Giottus balance cache must retain the original remote observation timestamp instead of restamping stale evidence.",
  );

  now +=
    5_001;

  const refreshedEvidence =
    await coordinator
      .readBalances(
        credentials,
      );

  const diagnostics =
    coordinator
      .getDiagnostics();

  assertCondition(
    refreshedEvidence.source ===
      "REMOTE" &&
    refreshedEvidence.observedAt ===
      now &&
    refreshedEvidence.balances[0]
      ?.totalBalance ===
      11 &&
    diagnostics.cacheHits ===
      1 &&
    diagnostics.coalescedReads ===
      1 &&
    diagnostics.networkReads ===
      2 &&
    diagnostics.successfulNetworkReads ===
      2,
    "Expired Giottus balance cache must refresh remotely while reporting coalescing and cache diagnostics.",
  );

  console.log(
    "GIOTTUS AUTHENTICATED BALANCE READ COORDINATOR TEST PASSED.",
  );
}

function balance(
  asset: string,
  amount: number,
): GiottusBalance {
  return {
    asset,
    freeBalance:
      amount,
    lockedBalance:
      0,
    totalBalance:
      amount,
  };
}

void main().catch(
  (error: unknown) => {
    console.error(
      "[Giottus Authenticated Balance Read Coordinator Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
