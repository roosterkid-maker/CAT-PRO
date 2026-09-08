import assert from "node:assert/strict";

import {
  evaluateApplicationReadiness,
} from "../ApplicationReadiness";

function main(): void {
  const starting =
    evaluateApplicationReadiness(
      "STARTING",
      [
        {
          name:
            "binance",
          connected:
            true,
        },
        {
          name:
            "bybit",
          connected:
            true,
        },
      ],
    );

  assert.equal(
    starting.ready,
    false,
  );
  assert.equal(
    starting.status,
    "STARTING",
  );

  const insufficient =
    evaluateApplicationReadiness(
      "READY",
      [
        {
          name:
            "binance",
          connected:
            false,
        },
        {
          name:
            "bybit",
          connected:
            true,
        },
      ],
    );

  assert.equal(
    insufficient.ready,
    false,
  );
  assert.equal(
    insufficient.status,
    "INSUFFICIENT_MARKET_DATA",
  );
  assert.deepEqual(
    insufficient.connected,
    [
      "bybit",
    ],
  );
  assert.deepEqual(
    insufficient.disconnected,
    [
      "binance",
    ],
  );

  const ready =
    evaluateApplicationReadiness(
      "READY",
      [
        {
          name:
            "coindcx",
          connected:
            true,
        },
        {
          name:
            "bybit",
          connected:
            true,
        },
        {
          name:
            "binance",
          connected:
            false,
        },
      ],
    );

  assert.equal(
    ready.ready,
    true,
  );
  assert.equal(
    ready.status,
    "READY",
  );
  assert.equal(
    ready.connectedExchanges,
    2,
  );

  const failed =
    evaluateApplicationReadiness(
      "FAILED",
      [
        {
          name:
            "coindcx",
          connected:
            true,
        },
        {
          name:
            "bybit",
          connected:
            true,
        },
      ],
    );

  assert.equal(
    failed.ready,
    false,
  );
  assert.equal(
    failed.status,
    "INITIALIZATION_FAILED",
  );

  assert.throws(
    () =>
      evaluateApplicationReadiness(
        "READY",
        [],
        0,
      ),
    /positive integer/,
  );

  console.log(
    "APPLICATION READINESS TEST PASSED.",
  );
}

try {
  main();
} catch (
  error:
    unknown
) {
  console.error(
    error instanceof Error
      ? error.message
      : error,
  );
  process.exitCode =
    1;
}
