import assert
  from "node:assert/strict";

import type {
  ArbitrageOpportunity,
} from "../../arbitrage/models/ArbitrageOpportunity";

import type {
  OpportunitySnapshot,
  OpportunitySnapshotListener,
} from "../../arbitrage/services/OpportunityService";

import type {
  CandidateQualificationRecord,
} from "../models/CandidateQualification";

import {
  AutomationSchedulerService,
  type AutomationOpportunitySnapshotSource,
} from "../services/AutomationSchedulerService";

import {
  ExecutionCandidateQueueService,
} from "../services/ExecutionCandidateQueueService";

import {
  assessAutomatedPaperCandidateAttemptWindow,
} from "../services/AutomatedPaperExecutionControllerService";

import {
  rankCandidatesForExecution,
} from "../services/ExecutionCandidateRanking";

class TestOpportunitySnapshotSource
implements AutomationOpportunitySnapshotSource {
  private listener:
    OpportunitySnapshotListener | null =
    null;

  private latest:
    OpportunitySnapshot | null =
    null;

  getLastOpportunitySnapshot():
    OpportunitySnapshot | null {
    return this.latest ===
      null
      ? null
      : structuredClone(
          this.latest,
        );
  }

  subscribeToOpportunitySnapshots(
    listener:
      OpportunitySnapshotListener,
  ): () => void {
    this.listener =
      listener;

    return () => {
      if (
        this.listener ===
        listener
      ) {
        this.listener =
          null;
      }
    };
  }

  emit(
    snapshot:
      OpportunitySnapshot,
  ): void {
    this.latest =
      structuredClone(
        snapshot,
      );

    this.listener?.(
      structuredClone(
        snapshot,
      ),
    );
  }
}

function createOpportunity(
  timestamp:
    number,
): ArbitrageOpportunity {
  return {
    id:
      "handoff-opportunity",

    pair: {
      market:
        "BTC-USDT",

      buy: {
        exchange:
          "binance",

        market:
          "BTC-USDT",

        lastPrice:
          100,

        bestBidPrice:
          99,

        bestBidQty:
          10,

        bestAskPrice:
          100,

        bestAskQty:
          10,

        spread:
          1,

        timestamp,

        source:
          "orderBook",

        executable:
          true,
      },

      sell: {
        exchange:
          "coindcx",

        market:
          "BTC-USDT",

        lastPrice:
          102,

        bestBidPrice:
          102,

        bestBidQty:
          10,

        bestAskPrice:
          103,

        bestAskQty:
          10,

        spread:
          1,

        timestamp,

        source:
          "orderBook",

        executable:
          true,
      },
    },

    buyPrice:
      100,

    sellPrice:
      102,

    buyAvailableQty:
      10,

    sellAvailableQty:
      10,

    requiredQty:
      1,

    availableExecutableQty:
      10,

    executableQty:
      1,

    liquidityScore:
      100,

    enoughLiquidity:
      true,

    freshnessScore:
      100,

    feeScore:
      100,

    spreadScore:
      100,

    decision:
      "EXECUTE",

    analysisSummary:
      [],

    rawSpread:
      2,

    rawSpreadPercent:
      2,

    estimatedFees:
      0.2,

    netProfit:
      1.8,

    netProfitPercent:
      1.8,

    usedLastPriceFallback:
      false,

    quotesAreFresh:
      true,

    score:
      100,

    timestamp,
  };
}

function createExecutionQualification(
  key:
    string,

  validationCapital:
    number,

  modeledNetProfitPercent:
    number,

  headlineNetProfitPercent:
    number,

  freshnessScore:
    number,
): CandidateQualificationRecord {
  const now =
    10_000;

  const passed = {
    passed:
      true,
    currentValue:
      100,
    requiredValue:
      1,
    reason:
      "Passed deterministic ranking fixture.",
  };

  return {
    key,
    market:
      key.split(
        "|",
      )[0] ??
      key,
    buyExchange:
      "binance",
    sellExchange:
      "coindcx",
    status:
      "QUALIFIED",
    qualified:
      true,
    score:
      100,
    evaluatedAt:
      now,
    profitDrawdownPercent:
      0,
    liquidityAssessment: {
      legacyLiquidityScore:
        100,
      legacyMinimumLiquidityScore:
        70,
      legacyPassed:
        true,
      capitalAware: {
        enabled:
          true,
        validationCapital,
        attempted:
          true,
        simulationSuccess:
          true,
        fullyExecutable:
          true,
        fillPercent:
          100,
        executableCapital:
          validationCapital,
        netProfit:
          validationCapital *
          modeledNetProfitPercent /
          100,
        netProfitPercent:
          modeledNetProfitPercent,
        totalSlippagePercent:
          0,
        confidenceScore:
          100,
        recommendation:
          "EXECUTE",
        minimumRequiredNetProfitPercent:
          0.2,
        requireExecuteRecommendation:
          true,
        passed:
          true,
        failureReason:
          null,
      },
      passed:
        true,
      source:
        "CAPITAL_AWARE_SIMULATION",
    },
    checks: {
      active:
        passed,
      consecutiveObservations:
        passed,
      persistence:
        passed,
      netProfit:
        passed,
      liquidity:
        passed,
      freshness:
        passed,
      profitStability:
        passed,
    },
    reasons: [
      "Qualified deterministic ranking fixture.",
    ],
    candidate: {
      strategyAttribution: {
        attributionStatus:
          "ATTRIBUTED",
        strategyId:
          "cross-exchange-arbitrage",
        signalId:
          `signal-${key}`,
        intentId:
          null,
      },
      key,
      market:
        key.split(
          "|",
        )[0] ??
        key,
      buyExchange:
        "binance",
      sellExchange:
        "coindcx",
      status:
        "ACTIVE",
      latestOpportunityId:
        `opportunity-${key}`,
      firstSeenAt:
        now -
        5_000,
      lastSeenAt:
        now,
      disappearedAt:
        null,
      lifetimeMs:
        5_000,
      totalObservations:
        5,
      consecutiveObservations:
        5,
      missedSnapshots:
        0,
      reappearances:
        0,
      latest: {
        buyPrice:
          100,
        sellPrice:
          105,
        executableQuantity:
          10,
        netProfit:
          headlineNetProfitPercent,
        netProfitPercent:
          headlineNetProfitPercent,
        estimatedFees:
          0,
        rawSpread:
          headlineNetProfitPercent,
        rawSpreadPercent:
          headlineNetProfitPercent,
        liquidityScore:
          100,
        freshnessScore,
        opportunityTimestamp:
          now,
        buyQuoteTimestamp:
          now,
        sellQuoteTimestamp:
          now,
        quotesAreFresh:
          true,
        usedLastPriceFallback:
          false,
      },
      best: {
        netProfit:
          headlineNetProfitPercent,
        netProfitPercent:
          headlineNetProfitPercent,
        observedAt:
          now,
        opportunityId:
          `opportunity-${key}`,
      },
    },
  };
}

async function waitFor(
  predicate:
    () => boolean,
): Promise<void> {
  const deadline =
    Date.now() +
    1_000;

  while (
    !predicate()
  ) {
    if (
      Date.now() >=
      deadline
    ) {
      throw new Error(
        "Timed out waiting for snapshot handoff.",
      );
    }

    await new Promise<void>(
      (
        resolve,
      ) => {
        setTimeout(
          resolve,
          5,
        );
      },
    );
  }
}

async function main():
  Promise<void> {
  const source =
    new TestOpportunitySnapshotSource();

  const processed:
    OpportunitySnapshot[] =
    [];

  const scheduler =
    new AutomationSchedulerService(
      {
        intervalMs:
          60_000,

        maximumSnapshotAgeMs:
          7_500,

        runImmediately:
          false,
      },
      {
        opportunitySource:
          source,

        processSnapshot:
          (
            snapshot,
          ) => {
            processed.push(
              structuredClone(
                snapshot,
              ),
            );
          },
      },
    );

  scheduler.start();

  const firstGeneratedAt =
    Date.now();

  source.emit({
    generatedAt:
      firstGeneratedAt,

    opportunities: [
      createOpportunity(
        firstGeneratedAt,
      ),
    ],
  });

  source.emit({
    generatedAt:
      firstGeneratedAt +
      1,

    opportunities:
      [],
  });

  await waitFor(
    () =>
      processed.length ===
      2,
  );

  assert.deepEqual(
    processed.map(
      (
        snapshot,
      ) => ({
        generatedAt:
          snapshot.generatedAt,

        opportunityCount:
          snapshot
            .opportunities
            .length,
      }),
    ),
    [
      {
        generatedAt:
          firstGeneratedAt,

        opportunityCount:
          1,
      },
      {
        generatedAt:
          firstGeneratedAt +
          1,

        opportunityCount:
          0,
      },
    ],
    "Accepted and disappearance snapshots must be processed in authoritative order.",
  );

  const runningDiagnostics =
    scheduler.getDiagnostics();

  assert.equal(
    runningDiagnostics
      .snapshotSubscriptionActive,
    true,
  );

  assert.equal(
    runningDiagnostics
      .snapshotEventsReceived,
    2,
  );

  assert.equal(
    runningDiagnostics
      .eventTriggeredCycles,
    2,
  );

  assert.equal(
    runningDiagnostics
      .droppedSnapshotEvents,
    0,
  );

  assert.equal(
    runningDiagnostics
      .pendingSnapshotEvents,
    0,
  );

  scheduler.stop();

  source.emit({
    generatedAt:
      firstGeneratedAt +
      2,

    opportunities: [
      createOpportunity(
        firstGeneratedAt +
        2,
      ),
    ],
  });

  await new Promise<void>(
    (
      resolve,
    ) => {
      setTimeout(
        resolve,
        10,
      );
    },
  );

  assert.equal(
    processed.length,
    2,
    "Stopping the scheduler must unsubscribe the event handoff.",
  );

  assert.equal(
    scheduler
      .getDiagnostics()
      .snapshotSubscriptionActive,
    false,
  );

  const coalescingSource =
    new TestOpportunitySnapshotSource();

  const coalescedProcessed:
    OpportunitySnapshot[] =
    [];

  const firstGateControl: {
    release:
      (() => void) | null;
  } = {
    release:
      null,
  };

  const firstGate =
    new Promise<void>(
      (
        resolve,
      ) => {
        firstGateControl.release =
          resolve;
      },
    );

  const coalescingScheduler =
    new AutomationSchedulerService(
      {
        intervalMs:
          60_000,
        maximumSnapshotAgeMs:
          7_500,
        runImmediately:
          false,
      },
      {
        opportunitySource:
          coalescingSource,
        processSnapshot:
          async (
            snapshot,
          ) => {
            coalescedProcessed.push(
              structuredClone(
                snapshot,
              ),
            );

            if (
              coalescedProcessed.length ===
              1
            ) {
              await firstGate;
            }
          },
      },
    );

  coalescingScheduler.start();

  const coalescingStartedAt =
    Date.now();

  coalescingSource.emit({
    generatedAt:
      coalescingStartedAt,
    opportunities: [
      createOpportunity(
        coalescingStartedAt,
      ),
    ],
  });

  await waitFor(
    () =>
      coalescedProcessed.length ===
      1,
  );

  coalescingSource.emit({
    generatedAt:
      coalescingStartedAt +
      1,
    opportunities:
      [],
  });

  coalescingSource.emit({
    generatedAt:
      coalescingStartedAt +
      2,
    opportunities:
      [],
  });

  const releaseFirst =
    firstGateControl.release;

  if (
    releaseFirst ===
    null
  ) {
    throw new Error(
      "Snapshot coalescing test gate was not initialized.",
    );
  }

  releaseFirst();

  await waitFor(
    () =>
      coalescedProcessed.length ===
      2,
  );

  assert.deepEqual(
    coalescedProcessed.map(
      (
        snapshot,
      ) =>
        snapshot.generatedAt,
    ),
    [
      coalescingStartedAt,
      coalescingStartedAt +
        2,
    ],
    "Only consecutive trailing empty snapshots may coalesce; candidate truth and the newest disappearance must remain ordered.",
  );

  const coalescingDiagnostics =
    coalescingScheduler
      .getDiagnostics();

  assert.equal(
    coalescingDiagnostics
      .coalescedEmptySnapshotEvents,
    1,
  );

  assert.equal(
    coalescingDiagnostics
      .droppedCandidateSnapshotEvents,
    0,
  );

  coalescingScheduler.stop();

  const candidateRevisionSource =
    new TestOpportunitySnapshotSource();

  const candidateRevisionProcessed:
    OpportunitySnapshot[] =
    [];

  const candidateGateControl: {
    release:
      (() => void) | null;
  } = {
    release:
      null,
  };

  const candidateGate =
    new Promise<void>(
      (
        resolve,
      ) => {
        candidateGateControl.release =
          resolve;
      },
    );

  const candidateRevisionScheduler =
    new AutomationSchedulerService(
      {
        intervalMs:
          60_000,
        maximumSnapshotAgeMs:
          7_500,
        runImmediately:
          false,
      },
      {
        opportunitySource:
          candidateRevisionSource,
        processSnapshot:
          async (
            snapshot,
          ) => {
            candidateRevisionProcessed.push(
              structuredClone(
                snapshot,
              ),
            );

            if (
              candidateRevisionProcessed.length ===
              1
            ) {
              await candidateGate;
            }
          },
      },
    );

  candidateRevisionScheduler.start();

  const candidateRevisionStartedAt =
    Date.now();

  candidateRevisionSource.emit({
    generatedAt:
      candidateRevisionStartedAt,
    opportunities: [
      createOpportunity(
        candidateRevisionStartedAt,
      ),
    ],
  });

  await waitFor(
    () =>
      candidateRevisionProcessed.length ===
      1,
  );

  candidateRevisionSource.emit({
    generatedAt:
      candidateRevisionStartedAt +
      1,
    opportunities: [
      createOpportunity(
        candidateRevisionStartedAt +
          1,
      ),
    ],
  });

  candidateRevisionSource.emit({
    generatedAt:
      candidateRevisionStartedAt +
      2,
    opportunities: [
      createOpportunity(
        candidateRevisionStartedAt +
          2,
      ),
    ],
  });

  const releaseCandidate =
    candidateGateControl.release;

  if (
    releaseCandidate ===
    null
  ) {
    throw new Error(
      "Candidate revision test gate was not initialized.",
    );
  }

  releaseCandidate();

  await waitFor(
    () =>
      candidateRevisionProcessed.length ===
      2,
  );

  assert.deepEqual(
    candidateRevisionProcessed.map(
      (
        snapshot,
      ) =>
        snapshot.generatedAt,
    ),
    [
      candidateRevisionStartedAt,
      candidateRevisionStartedAt +
        2,
    ],
    "A queued candidate revision must be replaced by the newest authoritative candidate state.",
  );

  const candidateRevisionDiagnostics =
    candidateRevisionScheduler
      .getDiagnostics();

  assert.equal(
    candidateRevisionDiagnostics
      .coalescedCandidateSnapshotEvents,
    1,
  );

  assert.equal(
    candidateRevisionDiagnostics
      .droppedCandidateSnapshotEvents,
    0,
  );

  candidateRevisionScheduler.stop();

  const highHeadlineShallow =
    createExecutionQualification(
      "AAA-USDT|binance|coindcx",
      100,
      2,
      12,
      100,
    );

  const lowerHeadlineStrongerInr =
    createExecutionQualification(
      "BBB-USDT|binance|coindcx",
      1_000,
      1.5,
      2,
      99,
    );

  const deterministicTie =
    createExecutionQualification(
      "CCC-USDT|binance|coindcx",
      1_000,
      1.5,
      2,
      99,
    );

  const shuffledCandidates = [
    deterministicTie,
    highHeadlineShallow,
    lowerHeadlineStrongerInr,
  ];

  const rankedCandidates =
    rankCandidatesForExecution(
      shuffledCandidates,
    );

  assert.deepEqual(
    rankedCandidates.map(
      (candidate) =>
        candidate.key,
    ),
    [
      lowerHeadlineStrongerInr.key,
      deterministicTie.key,
      highHeadlineShallow.key,
    ],
    "Simultaneous candidates must rank by conservative modeled INR profit and a deterministic key, not headline spread or input order.",
  );

  const executionQueue =
    new ExecutionCandidateQueueService({
      ttlMs:
        15_000,
      maximumQueueSize:
        10,
    });

  executionQueue.synchronize(
    10_000,
    shuffledCandidates,
  );

  assert.deepEqual(
    executionQueue
      .getReadyItems(
        10_000,
      )
      .map(
        (item) =>
          item.candidateKey,
      ),
    rankedCandidates.map(
      (candidate) =>
        candidate.key,
    ),
    "The queue and PAPER scheduler must share best-executable-first ordering.",
  );

  assert.equal(
    executionQueue
      .getReadyItems(
        25_001,
      )
      .length,
    0,
    "Stale simultaneous candidates must expire instead of retaining an execution slot.",
  );

  const coolingAttemptWindow =
    assessAutomatedPaperCandidateAttemptWindow({
      candidateKey:
        lowerHeadlineStrongerInr.key,
      candidateGeneration:
        "generation-1",
      generationAlreadyAttempted:
        false,
      lastRouteAttemptAt:
        10_000,
      routeCooldownMs:
        30_000,
      now:
        25_000,
    });

  assert.equal(
    coolingAttemptWindow.eligible,
    false,
  );
  assert.equal(
    coolingAttemptWindow.routeCooldownRemainingMs,
    15_000,
  );

  const attemptedGenerationWindow =
    assessAutomatedPaperCandidateAttemptWindow({
      candidateKey:
        lowerHeadlineStrongerInr.key,
      candidateGeneration:
        "generation-1",
      generationAlreadyAttempted:
        true,
      lastRouteAttemptAt:
        null,
      routeCooldownMs:
        30_000,
      now:
        50_000,
    });

  assert.equal(
    attemptedGenerationWindow.eligible,
    false,
  );
  assert.equal(
    attemptedGenerationWindow.generationAlreadyAttempted,
    true,
  );

  console.log(
    "Automation snapshot handoff and deterministic best-executable-first ranking tests passed.",
  );
}

void main()
  .catch(
    (
      error:
        unknown,
    ) => {
      console.error(
        error instanceof Error
          ? error.message
          : error,
      );

      process.exitCode =
        1;
    },
  );
