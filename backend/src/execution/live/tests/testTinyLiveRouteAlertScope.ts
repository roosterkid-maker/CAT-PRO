import assert from "node:assert/strict";

import type {
  ProductionAlertHistoryRecord,
} from "../alerts/ProductionAlertHistory";

import {
  isCriticalAlertRelevantToTinyLiveRoute,
} from "../tiny-live/TinyLivePreflightService";

function alert(
  overrides:
    Partial<ProductionAlertHistoryRecord>,
): ProductionAlertHistoryRecord {
  return {
    key:
      "CLOCK_UNSAFE_COINSWITCH",
    severity:
      "CRITICAL",
    source:
      "CLOCK_SAFETY",
    title:
      "CoinSwitch signed-request clock is unsafe",
    message:
      "Clock evidence is stale.",
    status:
      "OPEN",
    conditionActive:
      true,
    blocksFutureLiveTrading:
      true,
    requiresManualReview:
      false,
    firstDetectedAt:
      1,
    lastDetectedAt:
      1,
    lastStateChangedAt:
      1,
    acknowledgedAt:
      null,
    resolvedAt:
      null,
    occurrenceCount:
      1,
    acknowledgementNote:
      null,
    resolutionNote:
      null,
    metadata: {},
    ...overrides,
  };
}

function main(): void {
  assert.equal(
    isCriticalAlertRelevantToTinyLiveRoute(
      alert({}),
      "coindcx",
      "binance",
    ),
    false,
    "An unrelated CoinSwitch clock alert must not block CoinDCX -> Binance.",
  );

  assert.equal(
    isCriticalAlertRelevantToTinyLiveRoute(
      alert({
        key:
          "CLOCK_UNSAFE_BINANCE",
        title:
          "Binance signed-request clock is unsafe",
      }),
      "coindcx",
      "binance",
    ),
    true,
    "An exact-route Binance clock alert must remain blocking.",
  );

  assert.equal(
    isCriticalAlertRelevantToTinyLiveRoute(
      alert({
        key:
          "RESTART_RECOVERY_UNCERTAIN",
        source:
          "RESTART_RECOVERY",
        title:
          "Restart recovery requires attention",
      }),
      "coindcx",
      "binance",
    ),
    true,
    "Recovery alerts must remain globally blocking.",
  );

  assert.equal(
    isCriticalAlertRelevantToTinyLiveRoute(
      alert({
        key:
          "CLOCK_SAFETY_UNKNOWN",
      }),
      "coindcx",
      "binance",
    ),
    true,
    "Unknown clock alert formats must fail closed.",
  );

  assert.equal(
    isCriticalAlertRelevantToTinyLiveRoute(
      alert({
        status:
          "RESOLVED",
      }),
      "coindcx",
      "binance",
    ),
    false,
    "Resolved alerts must not block a route.",
  );

  console.log(
    "Tiny-LIVE alert scope preserved global safety while isolating unrelated exchange clock alerts.",
  );
}

main();
