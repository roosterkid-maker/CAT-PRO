import assert from "node:assert/strict";

import {
  appendFileSync,
  closeSync,
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
  CandidateEvidenceAccumulatorService,
} from "../services/CandidateEvidenceAccumulatorService";

import {
  CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID,
} from "../../strategies/models/StrategyMetadata";

const TEST_CHUNK_SIZE_BYTES =
  4 * 1_024;

const TEST_MAXIMUM_SNAPSHOT_BYTES =
  128 * 1_024;

const LARGE_FILE_MINIMUM_BYTES =
  64 * 1_024 * 1_024;

interface FixtureSnapshotOptions {
  persistedAt: number;

  processedAuthoritativeSnapshots: number;

  routeKey: string;

  attributed: boolean;
}

function createCheckCounts():
  Record<string, number> {
  return {
    active:
      3,

    consecutiveObservations:
      2,

    persistence:
      2,

    netProfit:
      3,

    liquidity:
      3,

    freshness:
      3,

    profitStability:
      2,
  };
}

function createSnapshot(
  options:
    FixtureSnapshotOptions,
): Record<string, unknown> {
  const route:
    Record<string, unknown> = {
    key:
      options.routeKey,

    market:
      "BTCUSDT",

    buyExchange:
      "Binance",

    sellExchange:
      "CoinDCX",

    firstObservedAt:
      1_000,

    lastObservedAt:
      options.persistedAt,

    elapsedObservedMs:
      Math.max(
        0,
        options.persistedAt -
          1_000,
      ),

    activeSnapshotObservations:
      3,

    qualificationEvaluations:
      3,

    observingEvaluations:
      1,

    qualifiedEvaluations:
      2,

    rejectedEvaluations:
      0,

    maximumConsecutiveObservations:
      3,

    maximumLifetimeMs:
      2_000,

    maximumTotalObservations:
      3,

    maximumReappearances:
      0,

    latestNetProfitPercent:
      0.8,

    bestNetProfitPercent:
      1.1,

    maximumLiquidityScore:
      92,

    maximumFreshnessScore:
      96,

    minimumProfitDrawdownPercent:
      0.1,

    bestQualificationScore:
      98,

    checkPassCounts:
      createCheckCounts(),

    checkFailureCounts: {
      active:
        0,

      consecutiveObservations:
        1,

      persistence:
        1,

      netProfit:
        0,

      liquidity:
        0,

      freshness:
        0,

      profitStability:
        1,
    },

    persistencePassObservations:
      2,

    qualityPassObservations:
      3,

    allChecksPassObservations:
      2,

    lastFailedChecks:
      [],

    lastReasons:
      [],
  };

  if (
    options.attributed
  ) {
    route.latestStrategyAttribution = {
      attributionStatus:
        "ATTRIBUTED",

      strategyId:
        CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID,

      signalId:
        `signal-${options.persistedAt}`,

      intentId:
        null,
    };
  }

  return {
    schemaVersion:
      1,

    persistedAt:
      options.persistedAt,

    startedAt:
      1_000,

    processedAuthoritativeSnapshots:
      options
        .processedAuthoritativeSnapshots,

    lastProcessedSnapshotGeneratedAt:
      options.persistedAt,

    routes: [
      route,
    ],
  };
}

function appendSnapshot(
  filePath: string,
  snapshot:
    Record<string, unknown>,
): void {
  appendFileSync(
    filePath,
    `${JSON.stringify(
      snapshot,
    )}\n`,
    "utf8",
  );
}

function createService(
  filePath: string,
): CandidateEvidenceAccumulatorService {
  return new CandidateEvidenceAccumulatorService(
    filePath,
    {
      restoreChunkSizeBytes:
        TEST_CHUNK_SIZE_BYTES,

      maximumSnapshotBytes:
        TEST_MAXIMUM_SNAPSHOT_BYTES,
    },
  );
}

function writeLargeHistory(
  filePath: string,
  snapshot:
    Record<string, unknown>,
): void {
  const line =
    Buffer.from(
      `${JSON.stringify(
        snapshot,
      )}\n`,
      "utf8",
    );

  const recordsPerBlock =
    Math.max(
      1,
      Math.floor(
        (1 * 1_024 * 1_024) /
          line.length,
      ),
    );

  const block =
    Buffer.allocUnsafe(
      line.length *
        recordsPerBlock,
    );

  for (
    let index =
      0;

    index <
      recordsPerBlock;

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
    let bytesWritten =
      0;

    while (
      bytesWritten <
      LARGE_FILE_MINIMUM_BYTES
    ) {
      bytesWritten +=
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
  const temporaryDirectory =
    mkdtempSync(
      join(
        tmpdir(),
        "cat-pro-candidate-tail-",
      ),
    );

  try {
    const missingPath =
      join(
        temporaryDirectory,
        "missing.jsonl",
      );

    const missing =
      createService(
        missingPath,
      ).getDiagnostics();

    assert.equal(
      missing.persistence
        .restoreStatus,
      "NO_DATA",
      "A missing evidence file must expose explicit NO_DATA.",
    );

    assert.equal(
      missing.persistence
        .restored,
      false,
    );

    assert.equal(
      missing.persistence
        .writes,
      0,
      "Restore must not create or rewrite evidence.",
    );

    const emptyPath =
      join(
        temporaryDirectory,
        "empty.jsonl",
      );

    writeFileSync(
      emptyPath,
      "",
      "utf8",
    );

    const empty =
      createService(
        emptyPath,
      ).getDiagnostics();

    assert.equal(
      empty.persistence
        .restoreStatus,
      "NO_DATA",
      "An empty evidence file must expose explicit NO_DATA.",
    );

    assert.equal(
      empty.persistence
        .lastError,
      null,
    );

    const corruptPath =
      join(
        temporaryDirectory,
        "corrupt-tail.jsonl",
      );

    const recoverableSnapshot =
      createSnapshot({
        persistedAt:
          2_000,

        processedAuthoritativeSnapshots:
          7,

        routeKey:
          "legacy-route",

        attributed:
          false,
      });

    appendSnapshot(
      corruptPath,
      recoverableSnapshot,
    );

    appendFileSync(
      corruptPath,
      "{\"corrupt-intermediate\":\n",
      "utf8",
    );

    appendFileSync(
      corruptPath,
      `${JSON.stringify({
        schemaVersion:
          1,
        routes:
          "not-an-array",
      })}\n`,
      "utf8",
    );

    appendFileSync(
      corruptPath,
      "{\"truncated-tail\":",
      "utf8",
    );

    const recovered =
      createService(
        corruptPath,
      ).getDiagnostics();

    assert.equal(
      recovered.persistence
        .restoreStatus,
      "AVAILABLE",
    );

    assert.equal(
      recovered
        .processedAuthoritativeSnapshots,
      7,
      "The newest valid required snapshot must survive corrupt later records.",
    );

    assert.equal(
      recovered.routes[0]
        ?.latestStrategyAttribution
        .attributionStatus,
      "UNATTRIBUTED_LEGACY",
      "A restored historical route must never receive inferred strategy attribution.",
    );

    assert.equal(
      recovered.persistence
        .restoreMalformedLinesIgnored,
      2,
      "Truncated and corrupt JSON lines must be ignored deterministically.",
    );

    assert.equal(
      recovered.persistence
        .restoreRecordsExamined,
      4,
      "Restore must inspect backward until the first valid snapshot.",
    );

    const unusablePath =
      join(
        temporaryDirectory,
        "unusable.jsonl",
      );

    writeFileSync(
      unusablePath,
      "{\"only\":\"invalid schema\"}\n{\"truncated\":",
      "utf8",
    );

    const unusable =
      createService(
        unusablePath,
      ).getDiagnostics();

    assert.equal(
      unusable.persistence
        .restoreStatus,
      "FAILED",
      "A non-empty file with no usable evidence must fail closed.",
    );

    assert.equal(
      unusable.persistence
        .restored,
      false,
    );

    assert.match(
      unusable.persistence
        .lastError ??
        "",
      /no valid candidate-evidence snapshot/i,
    );

    const largePath =
      join(
        temporaryDirectory,
        "large-candidate-evidence.jsonl",
      );

    writeLargeHistory(
      largePath,
      createSnapshot({
        persistedAt:
          3_000,

        processedAuthoritativeSnapshots:
          10,

        routeKey:
          "historical-route",

        attributed:
          false,
      }),
    );

    appendFileSync(
      largePath,
      "{\"corrupt-before-newest\":\n",
      "utf8",
    );

    const newestSnapshot =
      createSnapshot({
        persistedAt:
          4_000,

        processedAuthoritativeSnapshots:
          11,

        routeKey:
          "attributed-route",

        attributed:
          true,
      });

    appendSnapshot(
      largePath,
      newestSnapshot,
    );

    appendSnapshot(
      largePath,
      newestSnapshot,
    );

    appendFileSync(
      largePath,
      "{\"partial-final-write\":",
      "utf8",
    );

    const largeFileSizeBefore =
      statSync(
        largePath,
      ).size;

    const largeRestore =
      createService(
        largePath,
      ).getDiagnostics();

    const largeFileSizeAfter =
      statSync(
        largePath,
      ).size;

    assert.ok(
      largeFileSizeBefore >=
        LARGE_FILE_MINIMUM_BYTES,
      "The bounded restore fixture must be a genuinely large JSONL file.",
    );

    assert.equal(
      largeRestore.persistence
        .restoreStatus,
      "AVAILABLE",
    );

    assert.equal(
      largeRestore.persistence
        .restoreFileSizeBytes,
      largeFileSizeBefore,
    );

    assert.ok(
      largeRestore.persistence
        .restoreBytesRead <
        largeFileSizeBefore,
      "Restore must not read the whole large evidence file.",
    );

    assert.ok(
      largeRestore.persistence
        .restoreBytesRead <=
        TEST_CHUNK_SIZE_BYTES,
      "The newest recoverable snapshot should require only one bounded tail chunk.",
    );

    assert.equal(
      largeRestore.persistence
        .restoreMalformedLinesIgnored,
      1,
      "A truncated final line must be ignored safely.",
    );

    assert.equal(
      largeRestore.persistence
        .restoreRecordsExamined,
      2,
      "A duplicate valid record must not disturb newest-state selection.",
    );

    assert.equal(
      largeRestore
        .processedAuthoritativeSnapshots,
      11,
    );

    assert.equal(
      largeRestore.routes[0]
        ?.latestStrategyAttribution
        .strategyId,
      CROSS_EXCHANGE_ARBITRAGE_STRATEGY_ID,
      "Strategy attribution must survive bounded restoration.",
    );

    assert.equal(
      largeRestore.routes[0]
        ?.latestStrategyAttribution
        .signalId,
      "signal-4000",
    );

    assert.equal(
      largeRestore.routes[0]
        ?.latestStrategyAttribution
        .intentId,
      null,
      "Restore must not fabricate an intent ID.",
    );

    assert.equal(
      largeRestore.routes[0]
        ?.qualifiedEvaluations,
      2,
      "Restart restoration must preserve accumulated qualification decisions exactly.",
    );

    assert.equal(
      largeRestore.routes[0]
        ?.bestQualificationScore,
      98,
    );

    assert.equal(
      largeRestore.persistence
        .writes,
      0,
      "Restoration must not append, compact, backfill, or rewrite evidence.",
    );

    assert.equal(
      largeFileSizeAfter,
      largeFileSizeBefore,
      "The source evidence file must remain byte-for-byte the same size after restore.",
    );

    assert.equal(
      largeRestore.persistence
        .restoreReadStrategy,
      "REVERSE_BOUNDED_TAIL",
    );

    assert.equal(
      largeRestore.persistence
        .restoreChunkSizeBytes,
      TEST_CHUNK_SIZE_BYTES,
    );

    assert.equal(
      largeRestore.persistence
        .maximumSnapshotBytes,
      TEST_MAXIMUM_SNAPSHOT_BYTES,
    );

    assert.equal(
      largeRestore.tradingPolicyMutationAllowed,
      false,
    );

    assert.equal(
      largeRestore.liveExecutionAllowed,
      false,
    );

    const compiledServicePath =
      resolve(
        __dirname,
        "..",
        "services",
        "CandidateEvidenceAccumulatorService.js",
      );

    const compiledService =
      readFileSync(
        compiledServicePath,
        "utf8",
      );

    for (
      const forbiddenAuthority
      of [
        "AutomatedPaperTradingService",
        "PaperOrderExecutor",
        "PaperTradingService",
        "LiveExecutionService",
        "LiveExecutionCoordinator",
        "CapitalReservationService",
        "ExecutionSettlementService",
        "ExecutionAdapter",
      ]
    ) {
      assert.equal(
        compiledService.includes(
          forbiddenAuthority,
        ),
        false,
        `Candidate restore must remain isolated from ${forbiddenAuthority}.`,
      );
    }

    console.log(
      "CANDIDATE EVIDENCE BOUNDED PERSISTENCE TEST PASSED.",
    );

    console.log(
      `Large restore read ${largeRestore.persistence.restoreBytesRead}/${largeRestore.persistence.restoreFileSizeBytes} bytes, examined ${largeRestore.persistence.restoreRecordsExamined} record(s), and completed in ${largeRestore.persistence.restoreDurationMs.toFixed(3)} ms.`,
    );
  } finally {
    rmSync(
      temporaryDirectory,
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
