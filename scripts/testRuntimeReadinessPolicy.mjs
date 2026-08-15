import assert
  from "node:assert/strict";

import {
  evaluateRuntimeReadiness,
} from "./runtimeReadinessPolicy.mjs";

function createFixture() {
  return {
    scheduler: {
      running:
        true,
      mode:
        "SHADOW",
      snapshotSubscriptionActive:
        true,
      droppedSnapshotEvents:
        0,
      liveExecutionAllowed:
        false,
    },
    dashboard: {
      stage:
        "SHADOW_LEARNING",
      liveExecutionAllowed:
        false,
      summary: {
        completedShadowOutcomes:
          14,
        paperExecutionArmed:
          false,
        paperExecutionAllowed:
          false,
      },
      safety: {
        shadowReadinessPassed:
          false,
        paperAccountMode:
          true,
        accountingIntegrityPassed:
          true,
        liveExecutionDisabled:
          true,
      },
    },
    performance: {
      summary: {
        completed:
          14,
      },
      sampleRequirement: {
        minimumCompletedOutcomes:
          50,
        requirementMet:
          false,
        remaining:
          36,
      },
      readiness: {
        level:
          "INSUFFICIENT_DATA",
        readyForPaperAutomation:
          false,
      },
    },
    fleet: {
      targetExchangeCount:
        5,
      summary: {
        marketDataConnected:
          5,
      },
    },
    paperShadowReadiness: {
      targetExchangeCount:
        5,
      allFivePaperAvailable:
        false,
      summary: {
        paperAvailableExchanges:
          4,
      },
    },
    productionSafety: {
      status:
        "BLOCKED",
      failClosed:
        true,
      liveSubmissionAllowed:
        false,
    },
    goNoGo: {
      decision:
        "NO_GO",
      liveTradingEnabled:
        false,
      liveSubmissionAllowed:
        false,
      automaticPromotionAllowed:
        false,
      orderSubmissionPerformed:
        false,
      capitalReserved:
        false,
    },
    paperReadiness: {
      stage:
        "SHADOW_SOAK",
      readyForShadowDeployment:
        true,
      readyForPaperTrading:
        false,
      readyForPaperSoakReview:
        false,
      summary: {
        paperExecutionArmed:
          false,
      },
      soak: {
        attributedClosedTrades:
          null,
        minimumAttributedClosedTrades:
          20,
      },
    },
  };
}

const shadowFixture =
  createFixture();

const shadowReport =
  evaluateRuntimeReadiness({
    stage:
      "shadow",
    ...shadowFixture,
  });

assert.equal(
  shadowReport.passed,
  true,
  "Fail-closed runtime may pass SHADOW verification while PAPER evidence remains incomplete.",
);

const blockedPaperReport =
  evaluateRuntimeReadiness({
    stage:
      "paper",
    ...createFixture(),
  });

assert.equal(
  blockedPaperReport.passed,
  false,
  "PAPER must remain blocked below the authoritative sample and fleet readiness gates.",
);

const readyPaperFixture =
  createFixture();

readyPaperFixture
  .dashboard
  .stage =
  "PAPER_ARMED";
readyPaperFixture
  .dashboard
  .summary
  .completedShadowOutcomes =
  50;
readyPaperFixture
  .dashboard
  .summary
  .paperExecutionArmed =
  true;
readyPaperFixture
  .dashboard
  .summary
  .paperExecutionAllowed =
  true;
readyPaperFixture
  .dashboard
  .safety
  .shadowReadinessPassed =
  true;
readyPaperFixture
  .performance
  .summary
  .completed =
  50;
readyPaperFixture
  .performance
  .sampleRequirement
  .requirementMet =
  true;
readyPaperFixture
  .performance
  .sampleRequirement
  .remaining =
  0;
readyPaperFixture
  .performance
  .readiness
  .level =
  "READY_FOR_PAPER";
readyPaperFixture
  .performance
  .readiness
  .readyForPaperAutomation =
  true;
readyPaperFixture
  .paperShadowReadiness
  .summary
  .paperAvailableExchanges =
  4;
readyPaperFixture
  .paperReadiness
  .stage =
  "PAPER_READY";
readyPaperFixture
  .paperReadiness
  .readyForShadowDeployment =
  false;
readyPaperFixture
  .paperReadiness
  .readyForPaperTrading =
  true;
readyPaperFixture
  .paperReadiness
  .summary
  .paperExecutionArmed =
  true;

const readyPaperReport =
  evaluateRuntimeReadiness({
    stage:
      "paper",
    ...readyPaperFixture,
  });

assert.equal(
  readyPaperReport.passed,
  true,
  "PAPER readiness may pass with two or more fully capable venues when every route-independent PAPER gate passes.",
);

const singleVenueFixture =
  structuredClone(
    readyPaperFixture,
  );

singleVenueFixture
  .paperShadowReadiness
  .summary
  .paperAvailableExchanges =
  1;

const singleVenueReport =
  evaluateRuntimeReadiness({
    stage:
      "paper",
    ...singleVenueFixture,
  });

assert.equal(
  singleVenueReport.passed,
  false,
  "Cross-exchange PAPER must fail closed when fewer than two venues are fully capable.",
);

const readySoakFixture =
  structuredClone(
    readyPaperFixture,
  );

readySoakFixture
  .paperReadiness
  .stage =
  "PAPER_SOAK_COMPLETE";
readySoakFixture
  .paperReadiness
  .readyForPaperSoakReview =
  true;
readySoakFixture
  .paperReadiness
  .soak
  .attributedClosedTrades =
  20;

const readySoakReport =
  evaluateRuntimeReadiness({
    stage:
      "paper-soak",
    ...readySoakFixture,
  });

assert.equal(
  readySoakReport.passed,
  true,
  "PAPER soak may pass only with the configured attributed finalized trade sample.",
);

const blockedSoakReport =
  evaluateRuntimeReadiness({
    stage:
      "paper-soak",
    ...readyPaperFixture,
  });

assert.equal(
  blockedSoakReport.passed,
  false,
  "PAPER start readiness must not be misreported as completed PAPER soak evidence.",
);

const accidentalLiveFixture =
  createFixture();

accidentalLiveFixture
  .scheduler
  .liveExecutionAllowed =
  true;
accidentalLiveFixture
  .goNoGo
  .liveTradingEnabled =
  true;
accidentalLiveFixture
  .goNoGo
  .liveSubmissionAllowed =
  true;
accidentalLiveFixture
  .goNoGo
  .orderSubmissionPerformed =
  true;
accidentalLiveFixture
  .goNoGo
  .capitalReserved =
  true;

const accidentalLiveReport =
  evaluateRuntimeReadiness({
    stage:
      "shadow",
    ...accidentalLiveFixture,
  });

assert.equal(
  accidentalLiveReport.passed,
  false,
  "Any detected LIVE capability or side effect must fail SHADOW verification closed.",
);

assert.ok(
  accidentalLiveReport
    .failedRequiredChecks
    .some(
      (check) =>
        check.key ===
        "GO_NO_GO_CANNOT_SUBMIT",
    ),
);

console.log(
  "Runtime readiness policy test passed.",
);

console.log(
  "No HTTP request, exchange request, order, balance, capital, PAPER arming, or LIVE action was performed.",
);
