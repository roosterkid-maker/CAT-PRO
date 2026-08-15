import assert from "node:assert/strict";

import {
  createHash,
} from "node:crypto";

import {
  appendFileSync,
  closeSync,
  ftruncateSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";

import {
  tmpdir,
} from "node:os";

import {
  join,
  resolve,
} from "node:path";

import {
  CapitalAwareQualificationEvidenceService,
} from "../services/CapitalAwareQualificationEvidenceService";

import {
  ShadowLearningEvidenceArchiveService,
} from "../services/ShadowLearningEvidenceArchiveService";

import {
  CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID,
} from "../../strategies/models/StrategyMetadata";

const TEST_CHUNK_BYTES =
  4 * 1_024;

const TEST_MAXIMUM_LINE_BYTES =
  256 * 1_024;

const LARGE_CAPITAL_FILE_BYTES =
  64 * 1_024 * 1_024;

const MULTI_GIGABYTE_EQUIVALENT_BYTES =
  3 * 1_024 * 1_024 * 1_024;

function attributedStrategyEvidence(
  signalId: string,
): Record<string, unknown> {
  return {
    attributionStatus:
      "ATTRIBUTED",

    strategyId:
      CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID,

    signalId,

    intentId:
      null,
  };
}

function capitalRoute(
  key: string,
  attributed: boolean,
): Record<string, unknown> {
  const route:
    Record<string, unknown> = {
    key,
    market:
      "BTCUSDT",
    buyExchange:
      "Binance",
    sellExchange:
      "CoinDCX",
    firstObservedAt:
      1_000,
    lastObservedAt:
      2_000,
    activeObservations:
      4,
    legacyLiquidityPassObservations:
      4,
    legacyLiquidityFailObservations:
      0,
    capitalAwareAttemptObservations:
      4,
    capitalAwareSimulationSuccessObservations:
      4,
    capitalAwarePassObservations:
      3,
    capitalAwareFailObservations:
      1,
    capitalAwareSourceObservations:
      3,
    qualifiedObservations:
      3,
    qualifiedViaCapitalAwareObservations:
      3,
    maximumLegacyLiquidityScore:
      95,
    bestCapitalAwareNetProfitPercent:
      0.9,
    maximumCapitalAwareFillPercent:
      100,
    maximumCapitalAwareExecutableCapital:
      500,
    minimumCapitalAwareSlippagePercent:
      0.02,
    maximumCapitalAwareConfidenceScore:
      98,
    lastQualificationStatus:
      "QUALIFIED",
    lastLiquiditySource:
      "CAPITAL_AWARE_SIMULATION",
    lastLegacyLiquidityScore:
      95,
    lastLegacyPassed:
      true,
    lastCapitalAwareAttempted:
      true,
    lastCapitalAwarePassed:
      true,
    lastCapitalAwareFullyExecutable:
      true,
    lastCapitalAwareFillPercent:
      100,
    lastCapitalAwareNetProfitPercent:
      0.9,
    lastCapitalAwareRecommendation:
      "EXECUTE",
    lastCapitalAwareFailureReason:
      null,
    lastQualified:
      true,
  };

  if (
    attributed
  ) {
    route.latestStrategyAttribution =
      attributedStrategyEvidence(
        "capital-signal",
      );
  }

  return route;
}

function capitalSnapshot(
  persistedAt: number,
  processedSnapshots: number,
  attributed: boolean,
): Record<string, unknown> {
  return {
    schemaVersion:
      1,
    persistedAt,
    startedAt:
      1_000,
    processedSnapshots,
    lastSnapshotGeneratedAt:
      persistedAt,
    routes: [
      capitalRoute(
        attributed
          ? "attributed-capital-route"
          : "legacy-capital-route",
        attributed,
      ),
    ],
  };
}

function shadowOutcome(
  id: string,
  dispatchedAt: number,
  attributed: boolean,
): Record<string, unknown> {
  const outcome:
    Record<string, unknown> = {
    id,
    dispatchId:
      `dispatch-${id}`,
    candidateKey:
      `candidate-${id}`,
    market:
      "BTCUSDT",
    buyExchange:
      "Binance",
    sellExchange:
      "CoinDCX",
    status:
      "SUCCESS",
    dispatchedAt,
    completedAt:
      dispatchedAt +
      1,
  };

  if (
    attributed
  ) {
    outcome.strategyAttribution =
      attributedStrategyEvidence(
        `shadow-signal-${id}`,
      );
  }

  return outcome;
}

function shadowSnapshot(
  persistedAt: number,
  captureCount: number,
  outcomes:
    Record<string, unknown>[],
): Record<string, unknown> {
  return {
    schemaVersion:
      1,
    persistedAt,
    startedAt:
      1_000,
    captureCount,
    lastCapturedAt:
      persistedAt,
    lastCapturedSnapshotGeneratedAt:
      persistedAt,
    queueItems:
      [],
    dispatchRecords:
      [],
    outcomeRecords:
      outcomes,
  };
}

function shadowCheckpoint(
  snapshot:
    Record<string, unknown>,
): Record<string, unknown> {
  const outcomes =
    snapshot.outcomeRecords;

  const evidenceCount =
    Array.isArray(
      outcomes,
    )
      ? outcomes.length
      : 0;

  return {
    schemaVersion:
      1,
    writtenAt:
      Date.now(),
    sourcePersistedAt:
      snapshot.persistedAt,
    sourceCaptureCount:
      snapshot.captureCount,
    sourceEvidenceCount:
      evidenceCount,
    sourceFingerprint:
      createHash(
        "sha256",
      )
        .update(
          JSON.stringify(
            snapshot,
          ),
          "utf8",
        )
        .digest(
          "hex",
        ),
  };
}

function appendJson(
  filePath: string,
  value:
    Record<string, unknown>,
): void {
  appendFileSync(
    filePath,
    `${JSON.stringify(
      value,
    )}\n`,
    "utf8",
  );
}

function writeRepeatedHistory(
  filePath: string,
  value:
    Record<string, unknown>,
  minimumBytes: number,
): void {
  const line =
    Buffer.from(
      `${JSON.stringify(
        value,
      )}\n`,
      "utf8",
    );

  const copies =
    Math.max(
      1,
      Math.floor(
        (1 * 1_024 * 1_024) /
          line.length,
      ),
    );

  const block =
    Buffer.allocUnsafe(
      copies *
        line.length,
    );

  for (
    let index =
      0;

    index <
      copies;

    index +=
      1
  ) {
    line.copy(
      block,
      index *
        line.length,
    );
  }

  const descriptor =
    openSync(
      filePath,
      "w",
    );

  try {
    let written =
      0;

    while (
      written <
      minimumBytes
    ) {
      written +=
        writeSync(
          descriptor,
          block,
        );
    }
  } finally {
    closeSync(
      descriptor,
    );
  }
}

function main():
  void {
  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "cat-pro-automation-retention-",
      ),
    );

  try {
    const missingCapitalPath =
      join(
        directory,
        "missing-capital.jsonl",
      );

    const missingCapital =
      new CapitalAwareQualificationEvidenceService(
        missingCapitalPath,
      ).getDiagnostics();

    assert.equal(
      missingCapital.persistence
        .restoreStatus,
      "NO_DATA",
    );

    const emptyCapitalPath =
      join(
        directory,
        "empty-capital.jsonl",
      );

    writeFileSync(
      emptyCapitalPath,
      "",
      "utf8",
    );

    const emptyCapital =
      new CapitalAwareQualificationEvidenceService(
        emptyCapitalPath,
      ).getDiagnostics();

    assert.equal(
      emptyCapital.persistence
        .restoreStatus,
      "NO_DATA",
    );

    const largeCapitalPath =
      join(
        directory,
        "large-capital.jsonl",
      );

    writeRepeatedHistory(
      largeCapitalPath,
      capitalSnapshot(
        2_000,
        20,
        false,
      ),
      LARGE_CAPITAL_FILE_BYTES,
    );

    appendFileSync(
      largeCapitalPath,
      "{\"corrupt-intermediate\":\n",
      "utf8",
    );

    const latestCapitalSnapshot =
      capitalSnapshot(
        3_000,
        21,
        true,
      );

    appendJson(
      largeCapitalPath,
      latestCapitalSnapshot,
    );

    appendJson(
      largeCapitalPath,
      latestCapitalSnapshot,
    );

    appendFileSync(
      largeCapitalPath,
      "{\"truncated-tail\":",
      "utf8",
    );

    const capitalSizeBefore =
      statSync(
        largeCapitalPath,
      ).size;

    const restoredCapital =
      new CapitalAwareQualificationEvidenceService(
        largeCapitalPath,
        {
          restoreChunkSizeBytes:
            TEST_CHUNK_BYTES,
          maximumSnapshotBytes:
            TEST_MAXIMUM_LINE_BYTES,
          rotationMaximumFileBytes:
            32 *
            1_024 *
            1_024,
          rotationMaximumRecords:
            1_000,
        },
      ).getDiagnostics();

    assert.equal(
      restoredCapital.persistence
        .restoreStatus,
      "AVAILABLE",
    );

    assert.ok(
      restoredCapital.persistence
        .restoreBytesRead <=
        TEST_CHUNK_BYTES,
      "Capital-aware restart must recover from a bounded tail chunk.",
    );

    assert.equal(
      restoredCapital
        .processedSnapshots,
      21,
    );

    assert.equal(
      restoredCapital.routes[0]
        ?.latestStrategyAttribution
        .signalId,
      "capital-signal",
      "Capital-aware strategy attribution must survive restart.",
    );

    assert.equal(
      restoredCapital.routes[0]
        ?.lastQualified,
      true,
      "Persisted qualification decisions must remain unchanged.",
    );

    assert.equal(
      restoredCapital.routes[0]
        ?.qualifiedObservations,
      3,
    );

    assert.equal(
      restoredCapital.persistence
        .rotation
        .existingOversizedFileProtected,
      true,
      "The existing large evidence fixture must not be rotated automatically.",
    );

    assert.equal(
      statSync(
        largeCapitalPath,
      ).size,
      capitalSizeBefore,
      "Capital restoration must not rewrite historical evidence.",
    );

    const legacyCapitalPath =
      join(
        directory,
        "legacy-capital.jsonl",
      );

    appendJson(
      legacyCapitalPath,
      capitalSnapshot(
        4_000,
        1,
        false,
      ),
    );

    const legacyCapital =
      new CapitalAwareQualificationEvidenceService(
        legacyCapitalPath,
      ).getDiagnostics();

    assert.equal(
      legacyCapital.routes[0]
        ?.latestStrategyAttribution
        .attributionStatus,
      "UNATTRIBUTED_LEGACY",
    );

    const legacyShadowPath =
      join(
        directory,
        "legacy-shadow.jsonl",
      );

    const olderShadow =
      shadowSnapshot(
        2_000,
        100,
        [
          shadowOutcome(
            "legacy-outcome",
            2_000,
            false,
          ),
        ],
      );

    const regressedShadow =
      shadowSnapshot(
        3_000,
        1,
        [
          shadowOutcome(
            "new-outcome",
            3_000,
            true,
          ),
        ],
      );

    const intermediateRegressedShadow =
      shadowSnapshot(
        2_500,
        50,
        [
          shadowOutcome(
            "intermediate-outcome",
            2_500,
            false,
          ),
        ],
      );

    appendJson(
      legacyShadowPath,
      olderShadow,
    );

    appendJson(
      legacyShadowPath,
      intermediateRegressedShadow,
    );

    appendJson(
      legacyShadowPath,
      regressedShadow,
    );

    const legacyShadowSizeBefore =
      statSync(
        legacyShadowPath,
      ).size;

    const legacyShadow =
      new ShadowLearningEvidenceArchiveService(
        legacyShadowPath,
        {
          restoreChunkSizeBytes:
            TEST_CHUNK_BYTES,
          maximumSnapshotBytes:
            TEST_MAXIMUM_LINE_BYTES,
        },
      ).getDiagnostics();

    assert.equal(
      legacyShadow.persistence
        .restoreMode,
      "LEGACY_BASELINE_SCAN",
    );

    assert.equal(
      legacyShadow.captureCount,
      100,
      "Legacy regression repair must preserve the previous capture-count high-water mark.",
    );

    assert.equal(
      legacyShadow.summary
        .outcomeRecordsArchived,
      2,
      "The true historical high-water snapshot and newest evidence must be merged; a newer partial regression must not win.",
    );

    assert.equal(
      legacyShadow.outcomeRecords
        .find(
          (
            outcome,
          ) =>
            outcome.id ===
            "legacy-outcome",
        )
        ?.strategyAttribution
        .attributionStatus,
      "UNATTRIBUTED_LEGACY",
    );

    const boundedLegacyRestart =
      new ShadowLearningEvidenceArchiveService(
        legacyShadowPath,
        {
          restoreChunkSizeBytes:
            TEST_CHUNK_BYTES,
          maximumSnapshotBytes:
            TEST_MAXIMUM_LINE_BYTES,
        },
      ).getDiagnostics();

    assert.equal(
      boundedLegacyRestart
        .persistence
        .restoreMode,
      "CHECKPOINT_BOUNDED",
      "The second restart must consume the seeded authoritative baseline checkpoint instead of rescanning legacy history.",
    );

    assert.equal(
      boundedLegacyRestart
        .persistence
        .checkpointMatched,
      true,
    );

    assert.equal(
      boundedLegacyRestart.captureCount,
      legacyShadow.captureCount,
      "The seeded checkpoint must preserve the exact legacy capture-count high-water mark.",
    );

    assert.equal(
      boundedLegacyRestart.summary
        .outcomeRecordsArchived,
      legacyShadow.summary
        .outcomeRecordsArchived,
      "The seeded checkpoint must preserve the exact merged legacy outcome set.",
    );

    assert.equal(
      statSync(
        legacyShadowPath,
      ).size,
      legacyShadowSizeBefore,
      "Checkpoint seeding must not rewrite or append to the authoritative source evidence file.",
    );

    const emptyRegressionPath =
      join(
        directory,
        "empty-regressed-shadow.jsonl",
      );

    const emptyRegressionCheckpointPath =
      `${emptyRegressionPath}.checkpoint.jsonl`;

    const emptyRegressedShadow =
      shadowSnapshot(
        5_000,
        1,
        [],
      );

    appendJson(
      emptyRegressionPath,
      olderShadow,
    );

    appendJson(
      emptyRegressionPath,
      emptyRegressedShadow,
    );

    appendJson(
      emptyRegressionCheckpointPath,
      shadowCheckpoint(
        emptyRegressedShadow,
      ),
    );

    const recoveredEmptyRegression =
      new ShadowLearningEvidenceArchiveService(
        emptyRegressionPath,
        {
          restoreChunkSizeBytes:
            TEST_CHUNK_BYTES,
          maximumSnapshotBytes:
            TEST_MAXIMUM_LINE_BYTES,
          checkpointFilePath:
            emptyRegressionCheckpointPath,
        },
      ).getDiagnostics();

    assert.equal(
      recoveredEmptyRegression
        .persistence
        .restoreMode,
      "LEGACY_BASELINE_SCAN",
      "A matching schema-v1 checkpoint must not legitimize an empty cumulative tail snapshot.",
    );

    assert.equal(
      recoveredEmptyRegression
        .summary
        .outcomeRecordsArchived,
      1,
      "Historical shadow outcomes must survive a restart that appended an empty tail snapshot.",
    );

    const boundedRecoveredEmptyRegression =
      new ShadowLearningEvidenceArchiveService(
        emptyRegressionPath,
        {
          restoreChunkSizeBytes:
            TEST_CHUNK_BYTES,
          maximumSnapshotBytes:
            TEST_MAXIMUM_LINE_BYTES,
          checkpointFilePath:
            emptyRegressionCheckpointPath,
        },
      ).getDiagnostics();

    assert.equal(
      boundedRecoveredEmptyRegression
        .persistence
        .restoreMode,
      "CHECKPOINT_BOUNDED",
      "Recovered empty-tail evidence must seed a schema-v2 checkpoint for bounded subsequent restarts.",
    );

    assert.equal(
      boundedRecoveredEmptyRegression
        .summary
        .outcomeRecordsArchived,
      1,
    );

    const boundedShadowPath =
      join(
        directory,
        "bounded-shadow.jsonl",
      );

    const checkpointPath =
      `${boundedShadowPath}.checkpoint.jsonl`;

    const authoritativeShadow =
      shadowSnapshot(
        4_000,
        100,
        [
          shadowOutcome(
            "legacy-outcome",
            2_000,
            false,
          ),
          shadowOutcome(
            "new-outcome",
            3_000,
            true,
          ),
        ],
      );

    const descriptor =
      openSync(
        boundedShadowPath,
        "w",
      );

    try {
      ftruncateSync(
        descriptor,
        MULTI_GIGABYTE_EQUIVALENT_BYTES,
      );
    } finally {
      closeSync(
        descriptor,
      );
    }

    appendFileSync(
      boundedShadowPath,
      "\n",
      "utf8",
    );

    appendJson(
      boundedShadowPath,
      authoritativeShadow,
    );

    appendFileSync(
      boundedShadowPath,
      "{\"truncated-tail\":",
      "utf8",
    );

    appendJson(
      checkpointPath,
      shadowCheckpoint(
        authoritativeShadow,
      ),
    );

    const shadowSizeBefore =
      statSync(
        boundedShadowPath,
      ).size;

    const boundedShadow =
      new ShadowLearningEvidenceArchiveService(
        boundedShadowPath,
        {
          restoreChunkSizeBytes:
            TEST_CHUNK_BYTES,
          maximumSnapshotBytes:
            TEST_MAXIMUM_LINE_BYTES,
          checkpointFilePath:
            checkpointPath,
          rotationMaximumFileBytes:
            64 *
            1_024 *
            1_024,
          rotationMaximumRecords:
            1_000,
        },
      ).getDiagnostics();

    assert.equal(
      boundedShadow.persistence
        .restoreMode,
      "CHECKPOINT_BOUNDED",
      "A verified checkpoint must suppress the multi-gigabyte legacy baseline scan.",
    );

    assert.equal(
      boundedShadow.persistence
        .checkpointMatched,
      true,
    );

    assert.ok(
      boundedShadow.persistence
        .restoreBytesRead <=
        TEST_CHUNK_BYTES,
      "Healthy Shadow restore must read only a bounded tail chunk.",
    );

    assert.equal(
      boundedShadow.captureCount,
      legacyShadow.captureCount,
      "Checkpoint restoration must preserve legacy regression-repair readiness state.",
    );

    assert.equal(
      boundedShadow.summary
        .outcomeRecordsArchived,
      legacyShadow.summary
        .outcomeRecordsArchived,
    );

    assert.equal(
      boundedShadow.outcomeRecords
        .find(
          (
            outcome,
          ) =>
            outcome.id ===
            "new-outcome",
        )
        ?.strategyAttribution
        .signalId,
      "shadow-signal-new-outcome",
    );

    assert.equal(
      statSync(
        boundedShadowPath,
      ).size,
      shadowSizeBefore,
      "Shadow restore must not modify its multi-gigabyte-equivalent source.",
    );

    const compiledSources = [
      resolve(
        __dirname,
        "..",
        "services",
        "CapitalAwareQualificationEvidenceService.js",
      ),
      resolve(
        __dirname,
        "..",
        "services",
        "ShadowLearningEvidenceArchiveService.js",
      ),
    ]
      .map(
        (
          filePath,
        ) =>
          readFileSync(
            filePath,
            "utf8",
          ),
      )
      .join(
        "\n",
      );

    for (
      const forbiddenAuthority
      of [
        "AutomatedPaperTradingService",
        "PaperOrderExecutor",
        "LiveExecutionService",
        "LiveExecutionCoordinator",
        "CapitalReservationService",
        "ExecutionSettlementService",
        "ExecutionRecoveryEngine",
        "ExecutionAdapter",
        "submitOrder",
        "createOrder",
        "reserveCapital",
      ]
    ) {
      assert.equal(
        compiledSources.includes(
          forbiddenAuthority,
        ),
        false,
        `Automation persistence must remain isolated from ${forbiddenAuthority}.`,
      );
    }

    const liveExecutionSource =
      readFileSync(
        resolve(
          __dirname,
          "..",
          "..",
          "execution",
          "live",
          "LiveExecutionService.js",
        ),
        "utf8",
      );

    assert.match(
      liveExecutionSource,
      /LIVE_EXECUTION_ENABLED\s*=\s*false/,
      "LIVE_EXECUTION_ENABLED must remain false.",
    );

    console.log(
      "AUTOMATION EVIDENCE RETENTION TEST PASSED.",
    );

    console.log(
      `Capital restore read ${restoredCapital.persistence.restoreBytesRead}/${capitalSizeBefore} bytes in ${restoredCapital.persistence.restoreDurationMs.toFixed(3)} ms.`,
    );

    console.log(
      `Shadow checkpoint restore read ${boundedShadow.persistence.restoreBytesRead}/${shadowSizeBefore} bytes in ${boundedShadow.persistence.restoreDurationMs.toFixed(3)} ms.`,
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

main();
