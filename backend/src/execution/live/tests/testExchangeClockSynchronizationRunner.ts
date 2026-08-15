import assert from "node:assert/strict";

import type {
  ExchangeClockSafetyReport,
} from "../time/ExchangeClockSafety";

import {
  ExchangeClockSynchronizationRunner,
} from "../time/ExchangeClockSynchronizationRunner";

function report(
  healthy:
    boolean,
): ExchangeClockSafetyReport {
  return {
    generatedAt:
      Date.now(),

    version:
      "18.0",

    build:
      "9",

    liveTradingEnabled:
      false,

    liveSubmissionAllowed:
      false,

    automaticClockCorrectionAllowed:
      true,

    signedRequestsFailClosed:
      true,

    exchanges: [],

    allServerSynchronizedClocksHealthy:
      healthy,

    blockers:
      healthy
        ? []
        : [
            "fixture clock unsafe",
          ],

    notes: [],
  };
}

async function main():
  Promise<void> {
  let release!:
    () => void;

  const pending =
    new Promise<void>(
      (
        resolve,
      ) => {
        release =
          resolve;
      },
    );

  let calls =
    0;

  const runner =
    new ExchangeClockSynchronizationRunner(
      {
        synchronizeAllSupported:
          async () => {
            calls +=
              1;

            await pending;

            return report(
              true,
            );
          },
      },
      {
        refreshIntervalMs:
          20_000,

        maximumEvidenceAgeMs:
          60_000,

        synchronizeImmediately:
          false,
      },
    );

  const first =
    runner
      .synchronizeNow();

  const overlapping =
    await runner
      .synchronizeNow();

  assert.equal(
    overlapping,
    null,
    "Overlapping refreshes must be coalesced.",
  );

  assert.equal(
    calls,
    1,
  );

  release();

  const completed =
    await first;

  assert.equal(
    completed
      ?.allServerSynchronizedClocksHealthy,
    true,
  );

  const status =
    runner.getStatus();

  assert.equal(
    status.refreshIntervalMs,
    20_000,
  );

  assert.equal(
    status.maximumEvidenceAgeMs,
    60_000,
  );

  assert.equal(
    status.refreshMarginMs,
    40_000,
  );

  assert.equal(
    status.attempts,
    1,
  );

  assert.equal(
    status.skippedOverlaps,
    1,
  );

  assert.equal(
    status.lastAllServerClocksHealthy,
    true,
  );

  assert.equal(
    status.lastError,
    null,
  );

  await runner.start();

  assert.equal(
    runner.getStatus()
      .running,
    true,
  );

  runner.stop();

  assert.equal(
    runner.getStatus()
      .running,
    false,
  );

  let releaseInitial!:
    () => void;

  const initialPending =
    new Promise<void>(
      (
        resolve,
      ) => {
        releaseInitial =
          resolve;
      },
    );

  let initialCalls =
    0;

  const startupRunner =
    new ExchangeClockSynchronizationRunner(
      {
        synchronizeAllSupported:
          async () => {
            initialCalls +=
              1;

            await initialPending;

            return report(
              true,
            );
          },
      },
      {
        refreshIntervalMs:
          20_000,

        maximumEvidenceAgeMs:
          60_000,

        synchronizeImmediately:
          true,
      },
    );

  let startupCompleted =
    false;

  const startup =
    startupRunner
      .start()
      .then(
        (
          startupReport,
        ) => {
          startupCompleted =
            true;

          return startupReport;
        },
      );

  await Promise.resolve();

  assert.equal(
    initialCalls,
    1,
  );

  assert.equal(
    startupCompleted,
    false,
    "start() must remain pending until the initial authoritative synchronization completes.",
  );

  releaseInitial();

  const startupReport =
    await startup;

  assert.equal(
    startupReport
      ?.allServerSynchronizedClocksHealthy,
    true,
  );

  assert.equal(
    startupCompleted,
    true,
  );

  assert.equal(
    startupRunner.getStatus()
      .attempts,
    1,
  );

  startupRunner.stop();

  assert.throws(
    () =>
      new ExchangeClockSynchronizationRunner(
        {
          synchronizeAllSupported:
            async () =>
              report(
                true,
              ),
        },
        {
          refreshIntervalMs:
            40_000,

          maximumEvidenceAgeMs:
            60_000,
        },
      ),
    /must leave at least one full refresh interval/,
  );

  console.log(
    "EXCHANGE CLOCK SYNCHRONIZATION RUNNER TEST PASSED.",
  );

  console.log(
    "Authoritative server-time reads complete before startup returns, refresh every 20 seconds, preserve the 60-second fail-closed expiry, and coalesce overlaps without any order action.",
  );
}

void main();
