import assert
  from "node:assert/strict";

import {
  mkdtempSync,
  rmSync,
} from "node:fs";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import type {
  AxiosInstance,
} from "axios";

import {
  BinanceHttpClient,
} from "./BinanceHttpClient";

import {
  BinanceRateLimitCooldownError,
  BinanceRateLimitCooldownService,
} from "./BinanceRateLimitCooldownService";

function rateLimitFailure(
  bannedUntil:
    number,
): unknown {
  return {
    isAxiosError:
      true,

    message:
      "Request failed with status code 418",

    response: {
      status:
        418,

      headers: {},

      data: {
        code:
          -1003,

        msg:
          `Way too much request weight used; IP banned until ${bannedUntil}. Please use WebSocket Streams for live updates to avoid bans.`,
      },
    },
  };
}

async function main():
  Promise<void> {
  let now =
    1_788_180_000_000;

  const advertisedBanUntil =
    now +
    120_000;

  const cooldown =
    new BinanceRateLimitCooldownService({
      filePath:
        null,

      now:
        () => now,

      recoveryBufferMs:
        5_000,
    });

  let networkTimeReads =
    0;

  let releaseRecoveryProbe!:
    () => void;

  const recoveryProbeGate =
    new Promise<void>(
      (
        resolve,
      ) => {
        releaseRecoveryProbe =
          resolve;
      },
    );

  const fakeClient = {
    get:
      async () => {
        networkTimeReads +=
          1;

        if (
          networkTimeReads ===
          1
        ) {
          throw rateLimitFailure(
            advertisedBanUntil,
          );
        }

        await recoveryProbeGate;

        return {
          data: {
            serverTime:
              Date.now(),
          },
        };
      },

    request:
      async () => {
        throw new Error(
          "A signed request must never reach the network inside cooldown.",
        );
      },
  } as unknown as
    AxiosInstance;

  const client =
    new BinanceHttpClient(
      fakeClient,
      cooldown,
    );

  await assert.rejects(
    client.synchronizeServerTime(),
    /IP banned until/,
  );

  assert.equal(
    networkTimeReads,
    1,
  );

  assert.deepEqual(
    {
      active:
        cooldown.getDiagnostics()
          .active,

      cooldownUntil:
        cooldown.getDiagnostics()
          .cooldownUntil,
    },
    {
      active:
        true,

      cooldownUntil:
        advertisedBanUntil +
        5_000,
    },
    "Binance's advertised ban timestamp must be retained with a recovery buffer.",
  );

  for (
    let attempt = 0;
    attempt < 4;
    attempt += 1
  ) {
    await assert.rejects(
      client.synchronizeServerTime(),
      (
        error,
      ) =>
        error instanceof BinanceRateLimitCooldownError,
    );
  }

  await assert.rejects(
    client.getSigned(
      "/api/v3/account",
      {},
      {
        apiKey:
          "test-key",

        apiSecret:
          "test-secret",
      },
    ),
    (
      error,
    ) =>
      error instanceof BinanceRateLimitCooldownError,
  );

  assert.equal(
    networkTimeReads,
    1,
    "Periodic clock and signed-read callers must perform zero Binance REST I/O during cooldown.",
  );

  assert.equal(
    cooldown.getDiagnostics()
      .suppressedRequests,
    5,
  );

  now =
    advertisedBanUntil +
    5_000;

  assert.throws(
    () =>
      cooldown.assertRequestAllowed(
        "/api/v3/depth",
      ),
    (
      error,
    ) =>
      error instanceof BinanceRateLimitCooldownError,
    "Non-time REST traffic must stay blocked until the controlled recovery probe succeeds.",
  );

  assert.equal(
    cooldown.getDiagnostics()
      .suppressedRequests,
    6,
  );

  const firstRecoveryProbe =
    client.synchronizeServerTime();

  const coalescedRecoveryProbe =
    client.synchronizeServerTime();

  await Promise.resolve();

  assert.equal(
    networkTimeReads,
    2,
    "Only one controlled server-time probe may enter the network after cooldown expiry.",
  );

  releaseRecoveryProbe();

  await Promise.all([
    firstRecoveryProbe,
    coalescedRecoveryProbe,
  ]);

  assert.equal(
    networkTimeReads,
    2,
  );

  assert.equal(
    client.isClockSafeForSignedRequest(),
    true,
    "A successful controlled recovery probe must restore signed-request clock safety.",
  );

  const retryAfterCooldown =
    new BinanceRateLimitCooldownService({
      filePath:
        null,

      now:
        () => now,

      recoveryBufferMs:
        5_000,
    });

  retryAfterCooldown.recordObservation({
    statusCode:
      429,

    apiCode:
      "-1003",

    message:
      "Too much request weight used.",

    retryAfter:
      "30",

    method:
      "GET",

    path:
      "/api/v3/time",
  });

  assert.equal(
    retryAfterCooldown.getDiagnostics()
      .cooldownUntil,
    now +
      35_000,
    "Retry-After must create a buffered local cooldown even when Binance omits ban-until.",
  );

  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "cat-pro-binance-cooldown-",
      ),
    );

  const filePath =
    join(
      directory,
      "cooldown.jsonl",
    );

  try {
    const writer =
      new BinanceRateLimitCooldownService({
        filePath,
        now:
          () => now,
      });

    writer.recordObservation({
      statusCode:
        418,

      apiCode:
        "-1003",

      message:
        `IP banned until ${now + 90_000}.`,

      retryAfter:
        null,

      method:
        "GET",

      path:
        "/api/v3/time",
    });

    const restored =
      new BinanceRateLimitCooldownService({
        filePath,
        now:
          () => now,
      });

    assert.equal(
      restored.getDiagnostics()
        .active,
      true,
    );

    assert.equal(
      restored.getDiagnostics()
        .cooldownUntil,
      now +
        95_000,
      "A backend restart must restore the still-active Binance cooldown from durable storage.",
    );
  } finally {
    rmSync(
      directory,
      {
        recursive:
          true,

        force:
          true,
      },
    );
  }

  console.log(
    "BINANCE RATE-LIMIT COOLDOWN TEST PASSED.",
  );

  console.log(
    "418/429 evidence now persists a buffered ban window, suppresses every periodic REST caller, survives restart, and admits one coalesced recovery probe after expiry.",
  );
}

void main();
