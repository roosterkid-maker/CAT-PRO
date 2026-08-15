import {
  SharedRecoveryIntentService,
} from "../services/SharedRecoveryIntentService";

import {
  HedgeInventorySharedRecoveryBridgeService,
} from "../adapters/HedgeInventorySharedRecoveryBridgeService";

import type {
  HedgeInventoryShadowRecoveryActionHandoff,
} from "../../strategies/hedge-inventory-management/HedgeInventoryShadowRecoveryActionHandoffPlanner";

function assertCondition(
  condition: boolean,
  message: string,
): asserts condition {
  if (
    !condition
  ) {
    throw new Error(
      message,
    );
  }
}

function proposal(
  now: number,
) {
  return {
    sourceStrategyId:
      "hedge-inventory-management",
    sourceEvidenceId:
      "handoff-1",
    sourceValidationHash:
      "validation-1",
    sourceType:
      "STRATEGY_RESIDUAL_EXPOSURE" as const,
    mode:
      "SHADOW" as const,
    severity:
      "WARNING" as const,
    routeId:
      "route-1",
    asset:
      "BTC",
    quoteAsset:
      "USDT",
    residualDirection:
      "LONG" as const,
    venue:
      "Bybit",
    market:
      "btc_usdt",
    side:
      "SELL" as const,
    quantity:
      0.01,
    referencePrice:
      50_000,
    estimatedQuoteValue:
      500,
    sourceCreatedAt:
      now - 1_000,
    sourceExpiresAt:
      now + 30_000,
  };
}

function handoff(
  now: number,
): HedgeInventoryShadowRecoveryActionHandoff {
  return {
    id:
      "bridge-handoff-1",
    validationHash:
      "bridge-validation-1",
    strategyId:
      "hedge-inventory-management",
    kind:
      "SHADOW_RECOVERY_ACTION_HANDOFF",
    status:
      "HANDOFF_READY",
    mode:
      "SHADOW",
    recoveryActionType:
      "RESIDUAL_HEDGE_REVIEW",
    sourceLifecycleAssessmentId:
      "lifecycle-assessment-1",
    sourceLifecycleRecordId:
      "lifecycle-record-1",
    sourceRecoveryProposalId:
      "recovery-proposal-1",
    sourceRecoveryProposalValidationHash:
      "recovery-proposal-hash-1",
    sourceOperatorDecisionId:
      "operator-decision-1",
    sourceReconciliationId:
      "reconciliation-1",
    routeId:
      "bridge-route-1",
    asset:
      "ETH",
    quoteAsset:
      "USDT",
    residualDirection:
      "SHORT",
    sourceSeverity:
      "CRITICAL",
    operator: {
      decidedBy:
        "operator-fixture",
      reason:
        "Bounded deterministic test approval.",
      decidedAt:
        now - 1_500,
      decision:
        "APPROVE",
    },
    leg: {
      venue:
        "binance",
      market:
        "ETHUSDT",
      side:
        "BUY",
      quantity:
        0.25,
      referencePrice:
        2_000,
      estimatedQuoteValue:
        500,
      orderTypeSelected:
        false,
      timeInForceSelected:
        false,
      submissionAuthorized:
        false,
    },
    createdAt:
      now - 1_000,
    expiresAt:
      now + 30_000,
    recoveryIncidentCreated:
      false,
    recoveryActionMaterialized:
      false,
    canonicalExecutionPlanCreated:
      false,
    capitalReservationCreated:
      false,
    executionAuthorized:
      false,
    automaticExecutionAllowed:
      false,
    orderSubmissionAuthorized:
      false,
  };
}

function main(): void {
  const now =
    1_800_000_000_000;

  const service =
    new SharedRecoveryIntentService({
      maximumIntentTtlMs:
        60_000,
      maximumQuoteValue:
        1_000,
      maximumIntents:
        2,
    });

  const first =
    service.stage(
      proposal(
        now,
      ),
      now,
    );

  const duplicate =
    service.stage(
      proposal(
        now,
      ),
      now + 1_000,
    );

  assertCondition(
    first.id ===
      duplicate.id &&
    first.stagedAt ===
      duplicate.stagedAt,
    "Exact source lineage must stage idempotently without extending TTL or rewriting evidence.",
  );

  assertCondition(
    first.mode ===
      "SHADOW" &&
    first.leg.side ===
      "SELL" &&
    !first.capitalReservationCreated &&
    !first.executionPlanCreated &&
    !first.executionAuthorized &&
    !first.paperExecutionAllowed &&
    !first.liveExecutionAllowed &&
    !first.orderSubmissionAllowed,
    "A shared recovery intent must remain non-executable and fail closed.",
  );

  const activeReport =
    service.getReport(
      now + 5_000,
    );

  const expiredReport =
    service.getReport(
      now + 31_000,
    );

  assertCondition(
    activeReport.summary.staged === 1 &&
    expiredReport.summary.expired === 1 &&
    expiredReport.intents[0]
      ?.remainingTtlMs === 0,
    "Intent expiry must be visible without mutating or extending source evidence.",
  );

  let wrongSideRejected =
    false;

  try {
    service.stage(
      {
        ...proposal(
          now,
        ),
        sourceEvidenceId:
          "wrong-side",
        side:
          "BUY",
      },
      now,
    );
  } catch {
    wrongSideRejected =
      true;
  }

  assertCondition(
    wrongSideRejected,
    "A recovery leg that increases residual exposure must fail closed.",
  );

  let valueMismatchRejected =
    false;

  try {
    service.stage(
      {
        ...proposal(
          now,
        ),
        sourceEvidenceId:
          "value-mismatch",
        estimatedQuoteValue:
          499,
      },
      now,
    );
  } catch {
    valueMismatchRejected =
      true;
  }

  assertCondition(
    valueMismatchRejected,
    "Recovery quantity, price, and value lineage must reconcile exactly within bounded tolerance.",
  );

  const bridge =
    new HedgeInventorySharedRecoveryBridgeService();

  const bridgeResult =
    bridge.synchronize(
      [
        handoff(
          now,
        ),
      ],
      now,
    );

  assertCondition(
    bridgeResult.staged === 1 &&
    bridgeResult.rejected === 0 &&
    bridgeResult.stagedIntents[0]
      ?.sourceStrategyId ===
      "hedge-inventory-management" &&
    bridgeResult.stagedIntents[0]
      ?.leg.side ===
      "BUY" &&
    !bridgeResult.executionAuthorized &&
    !bridgeResult.orderSubmissionAllowed,
    "The Strategy #3 bridge must normalize exact approved handoff lineage into the shared non-executable contract.",
  );

  console.log(
    "SHARED RECOVERY INTENT SERVICE TEST PASSED.",
  );

  console.log(
    "No recovery action, capital reservation, execution plan, PAPER/LIVE action, or exchange order was created.",
  );
}

main();
