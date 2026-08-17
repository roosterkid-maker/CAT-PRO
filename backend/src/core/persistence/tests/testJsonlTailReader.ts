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
