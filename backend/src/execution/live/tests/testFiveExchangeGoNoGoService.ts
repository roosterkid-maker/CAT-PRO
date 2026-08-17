import {
  CAT_PRO_TARGET_EXCHANGES,
} from "../../../exchanges/core/ExchangeFleetRegistry";

import {
  fiveExchangeGoNoGoService,
} from "../readiness/FiveExchangeGoNoGoService";

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

function main(): void {
  const report =
    fiveExchangeGoNoGoService
      .getReport();

  const blockedGates =
    report.gates.filter(
      (gate) =>
        gate.state ===
        "BLOCKED",
    );

  const requiredBlockedGates =
    blockedGates.filter(
      (gate) =>
        gate.requiredForActivationReview,
    );

  assertCondition(
    report.exchanges.length ===
      5 &&
    CAT_PRO_TARGET_EXCHANGES
      .every(
        (exchange) =>
          report.exchanges.some(
            (item) =>
              item.exchange ===
              exchange,
          ),
      ),
    "Go/no-go evidence must explicitly cover all five target exchanges.",
  );

  assertCondition(
    report.summary.blocked ===
      blockedGates.length &&
    report.summary.requiredBlocked ===
      requiredBlockedGates.length &&
    report.activationReviewEligible ===
      (
        requiredBlockedGates.length ===
        0
      ) &&
    report.decision ===
      (
        requiredBlockedGates.length ===
          0
          ? "GO_FOR_AUDITED_ACTIVATION_REVIEW"
          : "NO_GO"
      ),
    "Go/no-go decision must be derived exclusively from required evidence gates.",
  );

  assertCondition(
    report.gates.find(
      (gate) =>
        gate.key ===
        "V18_TINY_LIVE_OPERATIONAL_READINESS",
    )
      ?.requiredForActivationReview ===
      false &&
    report.gates.find(
      (gate) =>
        gate.key ===
        "PRODUCTION_SAFETY_SAFE",
    )
      ?.requiredForActivationReview ===
      false,
    "LIVE-state and real-execution operational gates must remain visible without creating a circular pre-activation dependency.",
  );

  assertCondition(
    !report.liveTradingEnabled &&
    !report.liveSubmissionAllowed &&
    !report.automaticPromotionAllowed &&
    !report.orderSubmissionPerformed &&
    !report.capitalReserved &&
    report.exchanges.every(
      (exchange) =>
        !exchange.liveAdapterConnected,
    ),
    "Go/no-go evaluation must preserve all LIVE-disabled safety invariants regardless of its evidence decision.",
  );

  console.log(
    "FIVE-EXCHANGE GO/NO-GO SERVICE TEST PASSED.",
  );

  console.log(
    `Decision=${report.decision}; required blocked gates=${requiredBlockedGates.length}; post-activation blocked gates=${report.summary.postActivationBlocked}; no order or capital action was performed.`,
  );
}

main();
