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

import {
  CAT_PRO_TARGET_EXCHANGES,
} from "../core/ExchangeFleetRegistry";

import type {
  FiveExchangePaperShadowReadinessReport,
} from "../services/FiveExchangePaperShadowReadinessService";

import {
  FiveExchangeReadinessObservationService,
} from "../services/FiveExchangeReadinessObservationService";

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

class FixtureReadinessSource {
  available =
    true;

  constructor(
    private readonly now:
      () => number,
  ) {}

  async getReport():
    Promise<FiveExchangePaperShadowReadinessReport> {
    return {
      generatedAt:
        this.now(),
      version:
        "19.33",
      mode:
        "READ_ONLY_PAPER_SHADOW_READINESS",
      targetExchangeCount:
        5,
      liveTradingEnabled:
        false,
      liveSubmissionAllowed:
        false,
      allFiveShadowAvailable:
        this.available,
      allFivePaperAvailable:
        this.available,
      summary: {
        shadowAvailableExchanges:
          this.available
            ? 5
            : 0,
        paperAvailableExchanges:
          this.available
            ? 5
            : 0,
        totalShadowEligibleMarkets:
          this.available
            ? 5
            : 0,
        totalPaperEligibleMarkets:
          this.available
            ? 5
            : 0,
      },
      exchanges:
        CAT_PRO_TARGET_EXCHANGES
          .map(
            (exchange) => ({
              exchange,
              displayName:
                exchange,
              marketDataConnected:
                this.available,
              capabilitySynchronization:
                "SYNCHRONIZED" as const,
              capabilitySynchronizationError:
                null,
              capabilityMarkets:
                1,
              executableMarkets:
                this.available
                  ? 1
                  : 0,
              feeEvidenceMarkets:
                this.available
                  ? 1
                  : 0,
              completeOrderRuleMarkets:
                this.available
                  ? 1
                  : 0,
              shadowEligibleMarkets:
                this.available
                  ? 1
                  : 0,
              paperEligibleMarkets:
                this.available
                  ? 1
                  : 0,
              feeEvidenceSources: {
                STATIC_CONFIG:
                  this.available
                    ? 1
                    : 0,
                PUBLIC_API:
                  0,
                ACCOUNT_API:
                  0,
              },
              shadowAvailability:
                this.available
                  ? "AVAILABLE" as const
                  : "BLOCKED" as const,
              paperAvailability:
                this.available
                  ? "AVAILABLE" as const
                  : "BLOCKED" as const,
              shadowEligibleMarketSample:
                this.available
                  ? [
                      "BTC_USDT",
                    ]
                  : [],
              paperEligibleMarketSample:
                this.available
                  ? [
                      "BTC_USDT",
                    ]
                  : [],
              blockers:
                this.available
                  ? []
                  : [
                      "Fixture evidence unavailable.",
                    ],
            }),
          ),
      blockers:
        this.available
          ? []
          : [
              "Fixture evidence unavailable.",
            ],
      notes:
        [],
    };
  }
}

async function main():
  Promise<void> {
  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "cat-pro-v1934-",
      ),
    );

  const persistenceFilePath =
    join(
      directory,
      "observations.jsonl",
    );

  let currentTime =
    1_800_000_000_000;

  const now =
    () =>
      currentTime;

  const source =
    new FixtureReadinessSource(
      now,
    );

  try {
    const service =
      new FiveExchangeReadinessObservationService({
        readinessSource:
          source,
        persistenceFilePath,
        now,
        scheduleTimers:
          false,
        captureIntervalMs:
          1_000,
        rollingWindowMs:
          60_000,
        minimumObservations:
          3,
        minimumDurationMs:
          2_000,
        minimumAvailabilityRatio:
          1,
      });

    await service.capture();

    currentTime +=
      1_000;

    await service.capture();

    const insufficient =
      service.getReport();

    assertCondition(
      insufficient.status ===
        "INSUFFICIENT_EVIDENCE" &&
      !insufficient
        .allFiveRollingPaperStable,
      "Two point-in-time observations must not satisfy the three-observation rolling policy.",
    );

    currentTime +=
      1_000;

    await service.capture();

    const stable =
      service.getReport();

    assertCondition(
      stable.status ===
        "STABLE" &&
      stable
        .allFiveRollingShadowStable &&
      stable
        .allFiveRollingPaperStable &&
      stable.evidence
        .persistenceHealthy,
      "Real observations must satisfy count, elapsed-duration, persistence, and availability policies before becoming stable.",
    );

    const restored =
      new FiveExchangeReadinessObservationService({
        readinessSource:
          source,
        persistenceFilePath,
        now,
        scheduleTimers:
          false,
        captureIntervalMs:
          1_000,
        rollingWindowMs:
          60_000,
        minimumObservations:
          3,
        minimumDurationMs:
          2_000,
        minimumAvailabilityRatio:
          1,
      });

    assertCondition(
      restored.getReport()
        .status ===
        "STABLE" &&
      restored.getReport()
        .evidence
        .observationsInWindow ===
        3,
      "Rolling readiness observations must restore from restart-safe JSONL evidence.",
    );

    source.available =
      false;

    currentTime +=
      1_000;

    await restored.capture();

    const unstable =
      restored.getReport();

    assertCondition(
      unstable.status ===
        "UNSTABLE" &&
      !unstable
        .allFiveRollingShadowStable &&
      !unstable
        .allFiveRollingPaperStable,
      "A real unavailable observation must lower the ratio and fail rolling readiness closed.",
    );

    console.log(
      "FIVE-EXCHANGE READINESS OBSERVATION TEST PASSED.",
    );

    console.log(
      "Only isolated fixture evidence was persisted; no exchange request or order was submitted.",
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

void main().catch(
  (error: unknown) => {
    console.error(
      "[Five-Exchange Readiness Observation Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
