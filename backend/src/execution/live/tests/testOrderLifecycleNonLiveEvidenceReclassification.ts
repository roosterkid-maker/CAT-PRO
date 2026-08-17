import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import {
  tmpdir,
} from "node:os";
import {
  join,
} from "node:path";

import {
  LiveExecutionSessionEvidenceService,
} from "../coordinator/LiveExecutionSessionEvidenceService";

import {
  OrderLifecycleEvidenceService,
} from "../lifecycle/OrderLifecycleEvidenceService";

import type {
  OrderLifecycleRecord,
} from "../lifecycle/OrderLifecycleRecord";

function createOrder(
  orderId: string,
  sessionId: string,
  explicitSyntheticPaper =
    false,
): OrderLifecycleRecord {
  const now =
    Date.now();

  return {
    id:
      orderId,

    sessionId,

    planId:
      `production-looking-${orderId}`,

    leg:
      "BUY",

    purpose:
      "PRIMARY",

    recoveryIncidentId:
      null,

    exchange:
      "binance",

    market:
      "BTC/USDT",

    side:
      "buy",

    status:
      "FILLED",

    request: {
      exchange:
        "binance",

      market:
        "BTC/USDT",

      side:
        "buy",

      orderType:
        "limit",

      quantity:
        0.001,

      price:
        60_000,
    },

    exchangeOrderId:
      `exchange-${orderId}`,

    clientOrderId:
      `client-${orderId}`,

    requestedQuantity:
      0.001,

    filledQuantity:
      0.001,

    remainingQuantity:
      0,

    requestedPrice:
      60_000,

    averageFillPrice:
      60_000,

    feeAmount:
      0.01,

    createdAt:
      now,

    updatedAt:
      now,

    submittedAt:
      now,

    completedAt:
      now,

    failureReason:
      null,

    latestResult:
      explicitSyntheticPaper
        ? {
            success:
              true,

            exchange:
              "binance",

            market:
              "BTC/USDT",

            side:
              "buy",

            orderId:
              `exchange-${orderId}`,

            clientOrderId:
              `client-${orderId}`,

            status:
              "FILLED",

            requestedQuantity:
              0.001,

            filledQuantity:
              0.001,

            remainingQuantity:
              0,

            requestedPrice:
              60_000,

            averageFillPrice:
              60_000,

            feeAmount:
              0.01,

            cancelled:
              false,

            timedOut:
              false,

            startedAt:
              now,

            completedAt:
              now,

            executionTimeMs:
              0,

            failureReason:
              null,

            reasons: [
              "Synthetic PAPER leg completed.",
            ],
          }
        : null,

    events: [
      {
        type:
          "ORDER_PREPARED",

        timestamp:
          now,

        message:
          "BUY order lifecycle prepared. No exchange order has been submitted.",

        metadata: {},
      },

      {
        type:
          "ORDER_FILLED",

        timestamp:
          now,

        message:
          "Fixture order filled.",

        metadata: {},
      },
    ],
  };
}

function createSessionEnvelope(
  sequence: number,
  sessionId: string,
  dryRun: boolean,
  paper: boolean,
): Record<string, unknown> {
  const now =
    Date.now();

  return {
    storeVersion:
      1,

    sequence,

    writtenAt:
      now,

    payload: {
      schemaVersion:
        1,

      capturedAt:
        now,

      dryRun,

      session: {
        id:
          sessionId,

        planId:
          `opaque-${sessionId}`,

        status:
          "COMPLETED",

        updatedAt:
          now,

        events: [
          {
            type:
              "PLAN_VALIDATED",

            timestamp:
              now,

            message:
              "Persisted mode evidence.",

            metadata: {
              paper,
            },
          },
        ],
      },
    },
  };
}

function main(): void {
  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "cat-pro-non-live-reclassification-",
      ),
    );

  try {
    const sessionFile =
      join(
        directory,
        "sessions.jsonl",
      );

    const orderFile =
      join(
        directory,
        "orders.jsonl",
      );

    const envelopes = [
      createSessionEnvelope(
        1,
        "legacy-paper-session",
        false,
        true,
      ),

      createSessionEnvelope(
        2,
        "legacy-dry-run-session",
        true,
        false,
      ),

      createSessionEnvelope(
        3,
        "real-live-session",
        false,
        false,
      ),
    ];

    writeFileSync(
      sessionFile,
      `${envelopes
        .map(
          (
            envelope,
          ) =>
            JSON.stringify(
              envelope,
            ),
        )
        .join("\n")}\n`,
      "utf8",
    );

    const sessionEvidence =
      new LiveExecutionSessionEvidenceService(
        sessionFile,
      );

    const verifiedNonLiveSessionIds =
      sessionEvidence
        .getVerifiedNonLiveSessionIds();

    assert.deepEqual(
      Array.from(
        verifiedNonLiveSessionIds,
      ).sort(),
      [
        "legacy-dry-run-session",
        "legacy-paper-session",
      ],
      "Only explicit persisted PAPER/dry-run evidence may prove non-LIVE ownership.",
    );

    const orderEvidence =
      new OrderLifecycleEvidenceService(
        orderFile,
      );

    orderEvidence.capture(
      createOrder(
        "paper-order",
        "legacy-paper-session",
      ),
      false,
    );

    orderEvidence.capture(
      createOrder(
        "dry-run-order",
        "legacy-dry-run-session",
      ),
      false,
    );

    orderEvidence.capture(
      createOrder(
        "live-order",
        "real-live-session",
      ),
      false,
    );

    orderEvidence.capture(
      createOrder(
        "orphan-paper-order",
        "orphan-paper-session",
        true,
      ),
      false,
    );

    const injectedPaperOrder =
      createOrder(
        "orphan-injected-order",
        "orphan-injected-session",
        true,
      );

    if (
      !injectedPaperOrder
        .latestResult
    ) {
      throw new Error(
        "Injected PAPER fixture requires a result.",
      );
    }

    injectedPaperOrder
      .latestResult
      .failureReason =
      "Injected deterministic SELL-leg failure.";

    injectedPaperOrder
      .latestResult
      .reasons = [
      "Injected deterministic SELL-leg failure.",
    ];

    orderEvidence.capture(
      injectedPaperOrder,
      false,
    );

    assert.equal(
      orderEvidence
        .getDiagnostics()
        .possibleSubmittedRealOrders,
      5,
      "Legacy mode-loss fixtures must begin fail-closed.",
    );

    const reconciliation =
      orderEvidence
        .reclassifyVerifiedNonLiveSessions(
          verifiedNonLiveSessionIds,
        );

    assert.deepEqual(
      reconciliation,
      {
        requestedSessionIds:
          2,

        matchedOrders:
          2,

        reclassifiedOrders:
          2,

        failures:
          0,

        failedOrderIds: [],
      },
    );

    const diagnostics =
      orderEvidence
        .getDiagnostics();

    assert.equal(
      diagnostics
        .possibleSubmittedRealOrders,
      3,
      "Session-level reconciliation must leave orphan and genuine LIVE uncertainty untouched.",
    );

    assert.deepEqual(
      Array.from(
        orderEvidence
          .getSelfVerifiedSyntheticPaperSessionIds(),
      ).sort(),
      [
        "orphan-injected-session",
        "orphan-paper-session",
      ],
      "Only self-contained explicit synthetic PAPER provenance may recover an orphan session.",
    );

    const orphanReconciliation =
      orderEvidence
        .reclassifyVerifiedNonLiveSessions(
          orderEvidence
            .getSelfVerifiedSyntheticPaperSessionIds(),
        );

    assert.equal(
      orphanReconciliation
        .reclassifiedOrders,
      2,
    );

    assert.equal(
      orderEvidence
        .getDiagnostics()
        .possibleSubmittedRealOrders,
      1,
      "Explicit orphan PAPER evidence must be corrected while genuine LIVE uncertainty remains blocked.",
    );

    assert.deepEqual(
      diagnostics
        .duplicateEvidence
        .map(
          (
            evidence,
          ) =>
            evidence.orderId,
        )
        .sort(),
      [
        "live-order",
        "orphan-injected-order",
        "orphan-paper-order",
      ],
    );

    const restored =
      new OrderLifecycleEvidenceService(
        orderFile,
      );

    assert.equal(
      restored
        .getDiagnostics()
        .possibleSubmittedRealOrders,
      1,
      "Non-LIVE correction must remain durable after restart.",
    );

    assert.equal(
      restored
        .reclassifyVerifiedNonLiveSessions(
          verifiedNonLiveSessionIds,
        )
        .reclassifiedOrders,
      0,
      "Startup reconciliation must be idempotent.",
    );

    console.log(
      "ORDER LIFECYCLE NON-LIVE EVIDENCE RECLASSIFICATION TEST PASSED.",
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
