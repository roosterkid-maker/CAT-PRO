import assert
  from "node:assert/strict";

import type {
  PaperTradingReadinessDependencies,
} from "../services/PaperTradingReadinessService";

import {
  PaperTradingReadinessService,
} from "../services/PaperTradingReadinessService";

function dependencies(
  overrides: {
    connected?: number;
    paperAvailable?: number;
    completedShadow?: number;
    shadowReady?: boolean;
    armed?: boolean;
    controllerAllowed?: boolean;
    attributedClosed?: number | null;
    runtimeAccepted?: boolean;
    consecutiveRuntimePasses?: number;
  } = {},
): PaperTradingReadinessDependencies {
  const connected =
    overrides.connected ??
    5;
  const paperAvailable =
    overrides.paperAvailable ??
    5;
  const completedShadow =
    overrides.completedShadow ??
    50;
  const shadowReady =
    overrides.shadowReady ??
    true;
  const armed =
    overrides.armed ??
    true;
  const controllerAllowed =
    overrides.controllerAllowed ??
    true;
  const attributedClosed =
    "attributedClosed" in
      overrides
      ? overrides
          .attributedClosed ??
        null
      : 20;
  const runtimeAccepted =
    overrides.runtimeAccepted ??
    true;
  const consecutiveRuntimePasses =
    overrides
      .consecutiveRuntimePasses ??
    (
      runtimeAccepted
        ? 20
        : 4
    );

  return {
    scheduler:
      () => ({
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
      } as ReturnType<PaperTradingReadinessDependencies["scheduler"]>),
    performance:
      () => ({
        summary: {
          completed:
            completedShadow,
        },
        sampleRequirement: {
          minimumCompletedOutcomes:
            50,
          requirementMet:
            completedShadow >=
            50,
          remaining:
            Math.max(
              0,
              50 -
                completedShadow,
            ),
        },
        readiness: {
          level:
            shadowReady
              ? "READY_FOR_PAPER"
              : "INSUFFICIENT_DATA",
          readyForPaperAutomation:
            shadowReady,
        },
      } as ReturnType<PaperTradingReadinessDependencies["performance"]>),
    paperController:
      () => ({
        mode:
          "PAPER",
        paperExecutionArmed:
          armed,
        paperExecutionAllowed:
          controllerAllowed,
        liveExecutionAllowed:
          false,
      } as ReturnType<PaperTradingReadinessDependencies["paperController"]>),
    accounting:
      () => ({
        mode:
          "PAPER",
        integrity: {
          accountCapitalValid:
            true,
          availableCapitalValid:
            true,
          portfolioCapitalMatchesAccount:
            true,
          automationLedgerMatchesPaperTrades:
            true,
          accountProfitMatchesAutomationLedger:
            null,
        },
      } as ReturnType<PaperTradingReadinessDependencies["accounting"]>),
    fleet:
      () => ({
        targetExchangeCount:
          5,
        liveTradingEnabled:
          false,
        liveSubmissionAllowed:
          false,
        summary: {
          marketDataConnected:
            connected,
        },
      } as ReturnType<PaperTradingReadinessDependencies["fleet"]>),
    paperShadowReadiness:
      async () => ({
        targetExchangeCount:
          5,
        liveTradingEnabled:
          false,
        liveSubmissionAllowed:
          false,
        allFivePaperAvailable:
          paperAvailable ===
          5,
        allFiveShadowAvailable:
          paperAvailable ===
          5,
        summary: {
          shadowAvailableExchanges:
            paperAvailable,
          paperAvailableExchanges:
            paperAvailable,
        },
      } as Awaited<ReturnType<PaperTradingReadinessDependencies["paperShadowReadiness"]>>),
    strategyPerformance:
      () => ({
        paper: {
          evidenceStatus:
            attributedClosed ===
            null
              ? "NO_DATA"
              : "AVAILABLE",
          totalTrades:
            attributedClosed,
          closedTrades:
            attributedClosed,
          netProfit:
            attributedClosed ===
            null
              ? null
              : 1,
        },
      } as ReturnType<PaperTradingReadinessDependencies["strategyPerformance"]>),
    runtimeAcceptance:
      () => ({
        evidenceStatus:
          consecutiveRuntimePasses >
            0
            ? "AVAILABLE"
            : "NO_DATA",
        consecutivePasses:
          consecutiveRuntimePasses,
        minimumConsecutivePasses:
          20,
        remainingConsecutivePasses:
          Math.max(
            0,
            20 -
              consecutiveRuntimePasses,
          ),
        evidenceIncomplete:
          0,
        readyForPaperSoakReview:
          runtimeAccepted,
      } as ReturnType<PaperTradingReadinessDependencies["runtimeAcceptance"]>),
  };
}

async function main(): Promise<void> {
  const blocked =
    await new PaperTradingReadinessService(
      dependencies({
        connected:
          4,
        paperAvailable:
          2,
        completedShadow:
          14,
        shadowReady:
          false,
        controllerAllowed:
          false,
        attributedClosed:
          null,
      }),
    ).getReport(
      1_000,
    );

  assert.equal(
    blocked.readyForPaperTrading,
    false,
  );
  assert.equal(
    blocked.stage,
    "PAPER_BLOCKED",
  );
  assert.equal(
    blocked.soak
      .evidenceStatus,
    "NO_DATA",
  );
  assert.equal(
    blocked.soak
      .attributedNetProfit,
    null,
    "Missing PAPER evidence must not become zero profit.",
  );
  assert.ok(
    blocked.blockers.some(
      (blocker) =>
        blocker.includes(
          "4/5",
        ),
    ),
  );

  const shadow =
    await new PaperTradingReadinessService(
      dependencies({
        armed:
          false,
        controllerAllowed:
          false,
        attributedClosed:
          null,
      }),
    ).getReport(
      1_000,
    );

  assert.equal(
    shadow.readyForShadowDeployment,
    true,
    "A fail-closed SHADOW deployment must require PAPER to remain unarmed.",
  );
  assert.equal(
    shadow.readyForPaperTrading,
    false,
  );

  const ready =
    await new PaperTradingReadinessService(
      dependencies({
        paperAvailable:
          4,
        attributedClosed:
          null,
      }),
    ).getReport(
      1_000,
    );

  assert.equal(
    ready.readyForPaperTrading,
    true,
    "PAPER readiness must not wait for an unusable connector when at least two fully capable venues remain.",
  );
  assert.equal(
    ready.readyForPaperSoakReview,
    false,
  );
  assert.equal(
    ready.stage,
    "PAPER_READY",
  );

  const singleVenueBlocked =
    await new PaperTradingReadinessService(
      dependencies({
        paperAvailable:
          1,
        attributedClosed:
          null,
      }),
    ).getReport(
      1_000,
    );

  assert.equal(
    singleVenueBlocked
      .readyForPaperTrading,
    false,
    "Cross-exchange PAPER requires at least two fully capable venues.",
  );
  assert.ok(
    singleVenueBlocked.blockers
      .some(
        (blocker) =>
          blocker.includes(
            "minimum=2",
          ),
      ),
  );

  const soaked =
    await new PaperTradingReadinessService(
      dependencies(),
    ).getReport(
      1_000,
    );

  assert.equal(
    soaked.readyForPaperSoakReview,
    true,
  );
  assert.equal(
    soaked.soak.status,
    "READY_FOR_DEPLOYMENT_REVIEW",
  );
  assert.equal(
    soaked.liveExecutionAllowed,
    false,
  );
  assert.equal(
    soaked.orderSubmissionAllowed,
    false,
  );

  const runtimeBlocked =
    await new PaperTradingReadinessService(
      dependencies({
        runtimeAccepted:
          false,
        consecutiveRuntimePasses:
          7,
      }),
    ).getReport(
      1_000,
    );

  assert.equal(
    runtimeBlocked
      .readyForPaperTrading,
    true,
    "Runtime soak evidence must not weaken or replace PAPER-start gates.",
  );
  assert.equal(
    runtimeBlocked
      .readyForPaperSoakReview,
    false,
  );
  assert.equal(
    runtimeBlocked.stage,
    "PAPER_SOAK",
  );
  assert.ok(
    runtimeBlocked.blockers.some(
      (
        blocker,
      ) =>
        blocker.includes(
          "7/20",
        ),
    ),
  );

  console.log(
    "PAPER trading readiness deterministic test passed.",
  );
  console.log(
    "SHADOW requires PAPER unarmed; PAPER and attributed soak evidence fail closed; no execution or external request occurred.",
  );
}

void main();
