import assert
  from "node:assert/strict";

import {
  TinyLiveReadinessClosureService,
  type TinyLiveReadinessClosureOptions,
} from "../tiny-live/TinyLiveReadinessClosureService";

function createOptions(
  ready:
    boolean,
): TinyLiveReadinessClosureOptions {
  const exchanges = [
    "coindcx",
    "binance",
    "bybit",
    "unocoin",
    "coinswitch",
  ];

  return {
    now:
      () =>
        1_700_000_000_000,

    fleetSource: {
      getReport:
        () => ({
          targetExchangeCount:
            5,
          summary: {
            marketDataConnected:
              5,
            liveOrderAdapters:
              ready
                ? 5
                : 2,
          },
          exchanges:
            exchanges.map(
              (
                exchange,
                index,
              ) => ({
                exchange,
                displayName:
                  exchange,
                marketData: {
                  connected:
                    true,
                },
                authenticatedRead: {
                  fresh:
                    ready ||
                    index !==
                      1,
                  verificationState:
                    ready ||
                    index !==
                      1
                      ? "VERIFIED"
                      : "CONFIGURED_UNVERIFIED",
                },
                liveOrderAdapter: {
                  adapterRegistered:
                    ready ||
                    index <
                      2,
                },
              }),
            ),
        }),
    },

    credentialSource: {
      getReport:
        () => ({
          allConfigured:
            true,
          credentialValuesReturned:
            false,
          redaction: {
            selfTestPassed:
              true,
          },
          blockers:
            [],
        }),
    },

    clockSource: {
      getReport:
        () => ({
          allServerSynchronizedClocksHealthy:
            true,
          blockers:
            [],
          exchanges:
            exchanges.map(
              (exchange) => ({
                exchange,
                signedRequestAllowed:
                  true,
                health:
                  "HEALTHY",
                reasons:
                  [],
              }),
            ),
        }),
    },

    alertHistorySource: {
      getReport:
        () => ({
          persistenceHealthy:
            true,
          livePromotionBlocked:
            !ready,
          summary: {
            unresolvedCritical:
              ready
                ? 0
                : 1,
            activeCritical:
              0,
          },
          alerts:
            ready
              ? []
              : [
                  {
                    key:
                      "CLEARED_TEST_ALERT",
                    status:
                      "OPEN",
                    conditionActive:
                      false,
                    severity:
                      "CRITICAL",
                    blocksFutureLiveTrading:
                      true,
                    title:
                      "Cleared fixture alert",
                  },
                ],
          blockers:
            ready
              ? []
              : [
                  "CLEARED_TEST_ALERT",
                ],
        }),
    },

    goNoGoSource: {
      getReport:
        () => ({
          activationReviewEligible:
            ready,
          exchanges:
            exchanges.map(
              (
                exchange,
                index,
              ) => ({
                exchange,
                rollingShadowStable:
                  ready,
                rollingPaperStable:
                  ready,
                authenticatedReadFresh:
                  ready ||
                  index !==
                    1,
                signedRequestAllowed:
                  true,
                liveAdapterRegistered:
                  ready ||
                  index <
                    2,
                blockers:
                  [],
              }),
            ),
        }),
    },

    healthSource: {
      getReport:
        () => ({
          status:
            ready
              ? "HEALTHY"
              : "NO_DATA",
          totalExecutions:
            ready
              ? 5
              : 0,
          reasons:
            ready
              ? []
              : [
                  "No execution metrics are available yet.",
                ],
        }),
    },

    accountSource: {
      getAccount:
        () => ({
          mode:
            "PAPER",
          enabled:
            true,
          emergencyStop:
            false,
        }),
    },
  };
}

function main():
  void {
  const blocked =
    new TinyLiveReadinessClosureService(
      createOptions(
        false,
      ),
    )
      .getReport();

  assert.equal(
    blocked.decision,
    "BLOCKED",
  );

  assert.equal(
    blocked.nextAction
      ?.key,
    "AUTHENTICATED_READ_ACCESS",
  );

  assert.equal(
    blocked.actions.find(
      (action) =>
        action.key ===
        "LIVE_ORDER_ADAPTER_FOUNDATION",
    )
      ?.owner,
    "CODE",
  );

  assert.equal(
    blocked.actions.find(
      (action) =>
        action.key ===
        "PRODUCTION_ALERT_LIFECYCLE",
    )
      ?.evidence.some(
        (evidence) =>
          evidence.includes(
            "explicit operator resolution",
          ),
      ),
    true,
  );

  assert.equal(
    blocked.actions.find(
      (action) =>
        action.key ===
        "FINAL_ACCOUNT_ACTIVATION",
    )
      ?.state,
    "DEFERRED",
  );

  const ready =
    new TinyLiveReadinessClosureService(
      createOptions(
        true,
      ),
    )
      .getReport();

  const preActivationOptions =
    createOptions(
      true,
    );

  preActivationOptions.healthSource = {
    getReport:
      () => ({
        status:
          "NO_DATA",
        totalExecutions:
          0,
        reasons: [
          "No real execution metrics are available before the first Tiny-LIVE attempt.",
        ],
      }),
  };

  const preActivationReady =
    new TinyLiveReadinessClosureService(
      preActivationOptions,
    )
      .getReport();

  assert.equal(
    preActivationReady.decision,
    "READY_FOR_AUDITED_ACTIVATION_REVIEW",
  );

  assert.equal(
    preActivationReady.summary
      .progressPercent,
    100,
  );

  assert.equal(
    preActivationReady.actions.find(
      (action) =>
        action.key ===
        "EXECUTION_HEALTH_EVIDENCE",
    )
      ?.state,
    "DEFERRED",
  );

  assert.equal(
    preActivationReady.actions.find(
      (action) =>
        action.key ===
        "EXECUTION_HEALTH_EVIDENCE",
    )
      ?.blocking,
    false,
  );

  assert.equal(
    preActivationReady.nextAction
      ?.key,
    "FINAL_ACCOUNT_ACTIVATION",
  );

  assert.equal(
    ready.decision,
    "READY_FOR_AUDITED_ACTIVATION_REVIEW",
  );

  assert.equal(
    ready.summary
      .progressPercent,
    100,
  );

  assert.equal(
    ready.nextAction
      ?.key,
    "FINAL_ACCOUNT_ACTIVATION",
  );

  assert.equal(
    ready.safety
      .orderSubmissionPerformed,
    false,
  );

  assert.equal(
    ready.safety
      .automaticLivePromotionAllowed,
    false,
  );

  console.log(
    "TINY-LIVE READINESS CLOSURE TEST PASSED.",
  );

  console.log(
    "No credential value, account mutation, capital reservation, LIVE promotion or exchange order was used.",
  );
}

try {
  main();
} catch (
  error:
    unknown
) {
  console.error(
    "[Tiny-LIVE Readiness Closure Test]",
    error instanceof Error
      ? error.message
      : error,
  );

  process.exitCode =
    1;
}
