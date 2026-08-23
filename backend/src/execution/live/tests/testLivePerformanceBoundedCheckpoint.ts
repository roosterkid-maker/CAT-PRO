import assert from "node:assert/strict";

import {
  mkdirSync,
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
  JsonlSnapshotStore,
} from "../../../core/persistence/JsonlSnapshotStore";

import {
  LivePerformanceEvidencePersistenceService,
} from "../metrics/LivePerformanceEvidencePersistenceService";

function main(): void {
  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "cat-pro-live-performance-checkpoint-",
      ),
    );
  const legacyPath =
    join(
      directory,
      "live-performance-evidence.jsonl",
    );
  const checkpointPath =
    join(
      directory,
      "live-performance-checkpoint.jsonl",
    );

  try {
    mkdirSync(
      directory,
      {
        recursive:
          true,
      },
    );
    writeEnvelope(
      legacyPath,
      legacyPayload(11),
      41,
    );

    const legacyRestore =
      new LivePerformanceEvidencePersistenceService(
        legacyPath,
        checkpointPath,
      );

    assert.equal(
      legacyRestore.getDiagnostics().restoreSource,
      "LEGACY_BOUNDED_TAIL",
    );
    assert.equal(
      legacyRestore.getRestoredMetricsReport()?.totalExecutions,
      11,
    );
    assert.equal(
      legacyRestore.getDiagnostics().legacyAppendDisabled,
      true,
    );

    const checkpointStore =
      new JsonlSnapshotStore<Record<string, unknown>>({
        filePath:
          checkpointPath,
        isPayload:
          isCheckpoint,
      });
    checkpointStore.replaceAllAtomically([
      checkpointPayload(21, 2_100),
    ]);
    checkpointStore.replaceAllAtomically([
      checkpointPayload(22, 2_200),
    ]);

    const checkpointRestore =
      new LivePerformanceEvidencePersistenceService(
        legacyPath,
        checkpointPath,
      );

    assert.equal(
      checkpointRestore.getDiagnostics().restoreSource,
      "CHECKPOINT",
    );
    assert.equal(
      checkpointRestore.getRestoredMetricsReport()?.totalExecutions,
      22,
    );
    assert.deepEqual(
      checkpointRestore
        .getRestoredMetricSnapshots()
        .map((snapshot) => snapshot.timestamp),
      [2_200],
    );

    writeFileSync(
      checkpointPath,
      "{\"crash-truncated\":",
      "utf8",
    );

    const fallbackRestore =
      new LivePerformanceEvidencePersistenceService(
        legacyPath,
        checkpointPath,
      );

    assert.equal(
      fallbackRestore.getDiagnostics().restoreSource,
      "CHECKPOINT_PREVIOUS",
    );
    assert.equal(
      fallbackRestore.getRestoredMetricsReport()?.totalExecutions,
      21,
    );

    console.log(
      "V143 live-performance bounded checkpoint test passed: immutable legacy tail migration, bounded current state and previous-checkpoint crash fallback preserved analytics without an order path.",
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

function legacyPayload(
  totalExecutions: number,
): Record<string, unknown> {
  return {
    schemaVersion:
      1,
    persistedAt:
      1_000,
    metrics: {
      timestamp:
        1_000,
      totalExecutions,
      exchanges:
        [],
    },
    metricSnapshot: {
      timestamp:
        1_000,
      totalExecutions,
      averageExecutionTimeMs:
        0,
      fillRatePercent:
        0,
      timeoutRatePercent:
        0,
      failureRatePercent:
        0,
    },
    settlements:
      [],
  };
}

function checkpointPayload(
  totalExecutions: number,
  timestamp: number,
): Record<string, unknown> {
  return {
    schemaVersion:
      2,
    persistedAt:
      timestamp,
    metrics: {
      timestamp,
      totalExecutions,
      exchanges:
        [],
    },
    metricSnapshots: [{
      timestamp,
      totalExecutions,
      averageExecutionTimeMs:
        0,
      fillRatePercent:
        0,
      timeoutRatePercent:
        0,
      failureRatePercent:
        0,
    }],
    settlements:
      [],
  };
}

function writeEnvelope(
  filePath: string,
  payload: Record<string, unknown>,
  sequence: number,
): void {
  writeFileSync(
    filePath,
    `${JSON.stringify({
      storeVersion:
        1,
      sequence,
      writtenAt:
        1_000,
      payload,
    })}\n`,
    "utf8",
  );
}

function isCheckpoint(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value ===
    "object" &&
    value !==
      null &&
    !Array.isArray(
      value,
    ) &&
    (
      value as Record<string, unknown>
    ).schemaVersion ===
      2;
}

main();
