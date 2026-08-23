import {
  appendFileSync,
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
  type JsonlTailReadDiagnostics,
  readLatestValidJsonlRecord,
} from "../JsonlTailReader";

import {
  JsonlSnapshotStore,
} from "../JsonlSnapshotStore";

interface FixtureRecord {
  valid: true;

  sequence: number;

  payload: string;
}

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

function isFixture(
  value: unknown,
): value is FixtureRecord {
  return typeof value ===
    "object" &&
    value !==
      null &&
    !Array.isArray(
      value,
    ) &&
    (
      value as Partial<
        FixtureRecord
      >
    ).valid ===
      true &&
    typeof (
      value as Partial<
        FixtureRecord
      >
    ).sequence ===
      "number";
}

function main(): void {
  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "cat-pro-jsonl-tail-",
      ),
    );

  const filePath =
    join(
      directory,
      "evidence.jsonl",
    );

  try {
    for (
      let sequence =
        1;

      sequence <=
        2_000;

      sequence +=
        1
    ) {
      appendFileSync(
        filePath,
        `${JSON.stringify({
          valid:
            true,
          sequence,
          payload:
            "x".repeat(
              256,
            ),
        })}\n`,
        "utf8",
      );
    }

    appendFileSync(
      filePath,
      "{\"partial\":",
      "utf8",
    );

    const result =
      readLatestValidJsonlRecord(
        filePath,
        isFixture,
        {
          chunkSizeBytes:
            1_024,
          maximumLineBytes:
            16 *
            1_024,
        },
      );

    assertCondition(
      result?.value
        .sequence ===
        2_000 &&
      result.malformedLinesIgnored ===
        1 &&
      result.bytesRead <
        result.fileSizeBytes,
      "Reverse JSONL restore must ignore a partial tail and recover the latest valid record without loading the full file.",
    );

    console.log(
      "JSONL TAIL READER TEST PASSED.",
    );

    console.log(
      `Recovered sequence ${result.value.sequence} after reading ${result.bytesRead}/${result.fileSizeBytes} bytes.`,
    );

    const noMatchCompletion: {
      value:
        JsonlTailReadDiagnostics | null;
    } = {
      value:
        null,
    };

    const noMatch =
      readLatestValidJsonlRecord(
        filePath,
        (
          value,
        ): value is FixtureRecord =>
          isFixture(
            value,
          ) &&
          value.sequence >
            10_000,
        {
          chunkSizeBytes:
            1_024,

          maximumLineBytes:
            16 *
            1_024,

          onComplete:
            (
              diagnostics,
            ) => {
              noMatchCompletion.value =
                diagnostics;
            },
        },
      );

    assertCondition(
      noMatch ===
        null &&
      noMatchCompletion.value !==
        null &&
      noMatchCompletion.value.bytesRead ===
        noMatchCompletion.value.fileSizeBytes &&
      noMatchCompletion.value.linesInspected >=
        2_000,
      "A no-match tail scan must retain bounded-reader diagnostics without changing its null result.",
    );

    const oversizedFilePath =
      join(
        directory,
        "oversized-evidence.jsonl",
      );

    appendFileSync(
      oversizedFilePath,
      `${JSON.stringify({
        valid:
          true,
        sequence:
          1,
        payload:
          "recoverable",
      })}\n${"x".repeat(
        512 *
          1_024,
      )}\n`,
      "utf8",
    );

    const oversizedResult =
      readLatestValidJsonlRecord(
        oversizedFilePath,
        isFixture,
        {
          chunkSizeBytes:
            1_024,
          maximumLineBytes:
            16 *
            1_024,
        },
      );

    assertCondition(
      oversizedResult?.value
        .sequence ===
        1 &&
      oversizedResult
        .oversizedLinesIgnored ===
        1,
      "Reverse JSONL restore must discard a fragmented oversized tail without repeatedly assembling it, then recover the preceding valid record.",
    );

    const snapshotPath =
      join(
        directory,
        "cumulative-snapshots.jsonl",
      );
    const snapshotWriter =
      new JsonlSnapshotStore<FixtureRecord>({
        filePath:
          snapshotPath,
        isPayload:
          isFixture,
      });

    for (
      let sequence =
        1;
      sequence <=
        2_000;
      sequence +=
        1
    ) {
      snapshotWriter.append({
        valid:
          true,
        sequence,
        payload:
          "x".repeat(256),
      });
    }

    appendFileSync(
      snapshotPath,
      "{\"truncated-tail\":",
      "utf8",
    );

    const snapshotReader =
      new JsonlSnapshotStore<FixtureRecord>({
        filePath:
          snapshotPath,
        isPayload:
          isFixture,
      });
    const latestSnapshot =
      snapshotReader.readLatest();
    const snapshotDiagnostics =
      snapshotReader.getDiagnostics();

    assertCondition(
      latestSnapshot?.sequence ===
        2_000 &&
      snapshotDiagnostics.linesRead ===
        2 &&
      snapshotDiagnostics.lastSequence ===
        2_000,
      "Cumulative snapshot restore must skip a broken tail, read only the latest valid envelope and retain its append sequence.",
    );

    appendFileSync(
      snapshotPath,
      "\n",
      "utf8",
    );

    const resumedEnvelope =
      snapshotReader.append({
        valid:
          true,
        sequence:
          2_001,
        payload:
          "resumed",
      });

    assertCondition(
      resumedEnvelope.sequence ===
        2_001,
      "Bounded snapshot restore must continue the durable envelope sequence.",
    );

    const checkpointPath =
      join(
        directory,
        "bounded-checkpoint.jsonl",
      );
    const checkpointStore =
      new JsonlSnapshotStore<FixtureRecord>({
        filePath:
          checkpointPath,
        isPayload:
          isFixture,
      });

    checkpointStore.replaceAllAtomically([{
      valid:
        true,
      sequence:
        1,
      payload:
        "first-checkpoint",
    }]);
    checkpointStore.replaceAllAtomically([{
      valid:
        true,
      sequence:
        2,
      payload:
        "second-checkpoint",
    }]);

    const currentCheckpoint =
      new JsonlSnapshotStore<FixtureRecord>({
        filePath:
          checkpointPath,
        isPayload:
          isFixture,
      }).readLatest();
    const previousCheckpoint =
      new JsonlSnapshotStore<FixtureRecord>({
        filePath:
          `${checkpointPath}.previous`,
        isPayload:
          isFixture,
      }).readLatest();

    assertCondition(
      currentCheckpoint?.sequence ===
        2 &&
      previousCheckpoint?.sequence ===
        1,
      "Atomic checkpoint replacement must retain the latest cumulative state plus one valid crash fallback without appending redundant history.",
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
