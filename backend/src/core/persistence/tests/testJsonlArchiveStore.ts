import assert from "node:assert/strict";

import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";

import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import {
  JsonlRotatingWriter,
  jsonlRotationLockPath,
  listJsonlArchivePaths,
  readLatestValidJsonlAcrossArchives,
} from "../JsonlArchiveStore";

interface FixtureRecord {
  valid: true;

  sequence: number;
}

function isFixtureRecord(
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

function main():
  void {
  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "cat-pro-jsonl-archive-",
      ),
    );

  try {
    const activeFile =
      join(
        directory,
        "evidence.jsonl",
      );

    const missing =
      readLatestValidJsonlAcrossArchives(
        activeFile,
        isFixtureRecord,
      );

    assert.equal(
      missing.restoreStatus,
      "NO_DATA",
    );

    const writer =
      new JsonlRotatingWriter<
        FixtureRecord
      >(
        activeFile,
        {
          enabled:
            true,

          maximumFileBytes:
            1_024 *
            1_024,

          maximumRecords:
            2,
        },
      );

    for (
      let sequence =
        1;

      sequence <=
        5;

      sequence +=
        1
    ) {
      writer.append({
        valid:
          true,

        sequence,
      });
    }

    const archives =
      listJsonlArchivePaths(
        activeFile,
      );

    assert.equal(
      archives.length,
      2,
      "Record-count rotation must create two deterministic archives.",
    );

    assert.match(
      archives[0] ??
        "",
      /archive\.000002\.jsonl$/,
      "Archives must be ordered newest-to-oldest.",
    );

    assert.match(
      archives[1] ??
        "",
      /archive\.000001\.jsonl$/,
    );

    appendFileSync(
      activeFile,
      "{\"truncated\":",
      "utf8",
    );

    const latest =
      readLatestValidJsonlAcrossArchives(
        activeFile,
        isFixtureRecord,
        {
          chunkSizeBytes:
            128,

          maximumLineBytes:
            1_024,
        },
      );

    assert.equal(
      latest.restoreStatus,
      "AVAILABLE",
    );

    assert.equal(
      latest.value?.sequence,
      5,
      "A corrupt active tail must not hide the newest valid active record.",
    );

    assert.equal(
      latest.malformedRecordsIgnored,
      1,
    );

    const allSequences =
      [
        ...archives.reverse(),
        activeFile,
      ]
        .flatMap(
          (
            filePath,
          ) =>
            readFileSync(
              filePath,
              "utf8",
            )
              .split(
                /\r?\n/,
              )
              .flatMap(
                (
                  line,
                ) => {
                  try {
                    const parsed:
                      unknown =
                      JSON.parse(
                        line,
                      );

                    return isFixtureRecord(
                      parsed,
                    )
                      ? [
                          parsed.sequence,
                        ]
                      : [];
                  } catch {
                    return [];
                  }
                },
              ),
        );

    assert.deepEqual(
      allSequences,
      [
        1,
        2,
        3,
        4,
        5,
      ],
      "Rotation must not lose or duplicate writes.",
    );

    const sizeBeforeLockFailure =
      statSync(
        activeFile,
      ).size;

    writeFileSync(
      jsonlRotationLockPath(
        activeFile,
      ),
      "simulated interrupted writer",
      "utf8",
    );

    assert.throws(
      () =>
        writer.append({
          valid:
            true,

          sequence:
            6,
        }),
      /single-writer rotation lock unavailable/i,
      "An interrupted/stale rotation lock must fail later writes closed.",
    );

    assert.equal(
      statSync(
        activeFile,
      ).size,
      sizeBeforeLockFailure,
      "Lock failure must not partially append evidence.",
    );

    rmSync(
      jsonlRotationLockPath(
        activeFile,
      ),
      {
        force:
          true,
      },
    );

    writeFileSync(
      activeFile,
      "{\"interrupted-rotation\":",
      "utf8",
    );

    const archiveFallback =
      readLatestValidJsonlAcrossArchives(
        activeFile,
        isFixtureRecord,
        {
          chunkSizeBytes:
            128,

          maximumLineBytes:
            1_024,
        },
      );

    assert.equal(
      archiveFallback.value
        ?.sequence,
      4,
      "An unusable active segment must fall back to the newest archive.",
    );

    assert.match(
      archiveFallback
        .selectedAuthoritativeSource ??
        "",
      /archive\.000002\.jsonl$/,
    );

    const protectedFile =
      join(
        directory,
        "legacy-oversized.jsonl",
      );

    writeFileSync(
      protectedFile,
      `${"x".repeat(
        2_048,
      )}\n`,
      "utf8",
    );

    const protectedWriter =
      new JsonlRotatingWriter<
        FixtureRecord
      >(
        protectedFile,
        {
          enabled:
            true,

          maximumFileBytes:
            1_024,

          maximumRecords:
            1,

          protectExistingOversizedFile:
            true,
        },
      );

    protectedWriter.append({
      valid:
        true,

      sequence:
        1,
    });

    assert.equal(
      protectedWriter
        .getDiagnostics()
        .existingOversizedFileProtected,
      true,
      "A pre-existing oversized file must remain untouched by future-only rotation.",
    );

    assert.equal(
      listJsonlArchivePaths(
        protectedFile,
      ).length,
      0,
    );

    const retainedFile =
      join(
        directory,
        "retained-evidence.jsonl",
      );

    const retainedWriter =
      new JsonlRotatingWriter<
        FixtureRecord
      >(
        retainedFile,
        {
          enabled:
            true,

          maximumFileBytes:
            1_024 *
            1_024,

          maximumRecords:
            1,

          maximumArchives:
            2,
        },
      );

    for (
      let sequence =
        1;

      sequence <=
        4;

      sequence +=
        1
    ) {
      retainedWriter.append({
        valid:
          true,

        sequence,
      });
    }

    assert.equal(
      listJsonlArchivePaths(
        retainedFile,
      ).length,
      2,
      "Archive retention must prune segments beyond the configured maximum.",
    );

    assert.equal(
      retainedWriter
        .getDiagnostics()
        .archivesPruned,
      1,
    );

    assert.equal(
      readLatestValidJsonlAcrossArchives(
        retainedFile,
        isFixtureRecord,
      ).value?.sequence,
      4,
      "Archive pruning must preserve the newest active snapshot.",
    );

    console.log(
      "JSONL MULTI-ARCHIVE + ROTATION TEST PASSED.",
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
