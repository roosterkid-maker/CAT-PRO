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
  BinanceRateLimitCooldownService,
} from "./BinanceRateLimitCooldownService";

import {
  BinanceRequestWeightGovernorError,
  BinanceRequestWeightGovernorService,
  estimateBinanceSpotRequestWeight,
} from "./BinanceRequestWeightGovernorService";

function governor(
  now: () => number,
  filePath:
    string | null = null,
): {
  cooldown: BinanceRateLimitCooldownService;
  service: BinanceRequestWeightGovernorService;
} {
  const cooldown =
    new BinanceRateLimitCooldownService({
      filePath:
        null,
      now,
    });

  return {
    cooldown,
    service:
      new BinanceRequestWeightGovernorService({
        cooldownService:
          cooldown,
        filePath,
        now,
        backgroundWeightLimit:
          25,
        criticalWeightLimit:
          40,
        upstreamWeightLimit:
          50,
        proactiveHoldMs:
          60_000,
      }),
  };
}

async function main():
  Promise<void> {
  let now =
    1_788_200_000_000;

  const local =
    governor(
      () => now,
    );

  const first =
    local.service
      .admitRequest({
        method:
          "GET",
        path:
          "https://data-api.binance.vision/api/v3/exchangeInfo",
      });

  assert.equal(
    first.estimatedWeight,
    20,
  );

  assert.throws(
    () =>
      local.service
        .admitRequest({
          method:
            "GET",
          path:
            "/api/v3/exchangeInfo",
        }),
    (
      error,
    ) =>
      error instanceof BinanceRequestWeightGovernorError,
    "A second heavy catalog read must be stopped before the conservative local budget is exceeded.",
  );

  assert.equal(
    local.service
      .getDiagnostics()
      .active,
    true,
  );

  now +=
    60_000;

  assert.throws(
    () =>
      local.service
        .admitRequest({
          method:
            "GET",
          path:
            "/api/v3/account",
        }),
    (
      error,
    ) =>
      error instanceof BinanceRequestWeightGovernorError,
    "After the hold expires, ordinary REST must remain blocked until one controlled time probe succeeds.",
  );

  const recoveryEpoch =
    local.service
      .getRecoveryEpoch();

  const recovery =
    local.service
      .admitRequest({
        method:
          "GET",
        path:
          "/api/v3/time",
        recoveryProbe:
          true,
      });

  local.service
    .recordSuccessfulResponse({
      admission:
        recovery,
      usedWeightOneMinute:
        "1",
    });

  local.service
    .markRecoverySuccessful(
      recoveryEpoch,
    );

  assert.equal(
    local.service
      .getDiagnostics()
      .recoveryProbeRequired,
    false,
  );

  const upstream =
    governor(
      () => now,
    );

  const upstreamAdmission =
    upstream.service
      .admitRequest({
        method:
          "GET",
        path:
          "/api/v3/time",
        recoveryProbe:
          true,
      });

  upstream.service
    .recordSuccessfulResponse({
      admission:
        upstreamAdmission,
      usedWeightOneMinute:
        "50",
    });

  assert.equal(
    upstream.service
      .getDiagnostics()
      .active,
    true,
    "The authoritative Binance used-weight header must trigger a proactive hold before a 429 is received.",
  );

  let networkReads =
    0;

  const httpGovernor =
    governor(
      () => now,
    );

  const fakeClient = {
    get:
      async () => {
        networkReads +=
          1;

        return {
          data: {
            symbols:
              [],
          },
          headers: {
            "x-mbx-used-weight-1m":
              "50",
          },
        };
      },
    request:
      async () => {
        throw new Error(
          "Unexpected signed request.",
        );
      },
  } as unknown as AxiosInstance;

  const client =
    new BinanceHttpClient(
      fakeClient,
      httpGovernor.cooldown,
      httpGovernor.service,
    );

  await client.getPublic(
    "/api/v3/exchangeInfo",
  );

  await assert.rejects(
    client.getPublic(
      "/api/v3/account",
    ),
    (
      error,
    ) =>
      error instanceof BinanceRequestWeightGovernorError,
  );

  assert.equal(
    networkReads,
    1,
    "Once a success header reaches the proactive threshold, the next REST caller must perform zero network I/O.",
  );

  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "cat-pro-binance-governor-",
      ),
    );

  const filePath =
    join(
      directory,
      "governor.jsonl",
    );

  try {
    const writer =
      governor(
        () => now,
        filePath,
      );

    const admission =
      writer.service
        .admitRequest({
          method:
            "GET",
          path:
            "/api/v3/time",
          recoveryProbe:
            true,
        });

    writer.service
      .recordSuccessfulResponse({
        admission,
        usedWeightOneMinute:
          50,
      });

    const restored =
      governor(
        () => now,
        filePath,
      );

    assert.equal(
      restored.service
        .getDiagnostics()
        .active,
      true,
      "A backend restart must restore an unrecovered proactive hold.",
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

  assert.deepEqual(
    {
      exchangeInfo:
        estimateBinanceSpotRequestWeight(
          "GET",
          "/api/v3/exchangeInfo",
        ),
      allTickers:
        estimateBinanceSpotRequestWeight(
          "GET",
          "/api/v3/ticker/24hr",
        ),
      boundedDepth:
        estimateBinanceSpotRequestWeight(
          "GET",
          "/api/v3/depth",
          {
            limit:
              20,
          },
        ),
      account:
        estimateBinanceSpotRequestWeight(
          "GET",
          "/api/v3/account",
        ),
    },
    {
      exchangeInfo:
        20,
      allTickers:
        80,
      boundedDepth:
        2,
      account:
        20,
    },
  );

  console.log(
    "BINANCE REQUEST-WEIGHT GOVERNOR TEST PASSED.",
  );

  console.log(
    "All Spot REST callers now share conservative rolling admission, authoritative upstream weight telemetry, durable proactive holds, and one controlled recovery probe.",
  );
}

void main();
