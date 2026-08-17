import {
  closeSync,
  fstatSync,
  openSync,
  readSync,
} from "node:fs";

const DEFAULT_CHUNK_SIZE_BYTES =
  64 * 1_024;

const DEFAULT_MAXIMUM_LINE_BYTES =
  64 * 1_024 * 1_024;

export interface JsonlTailReadResult<T> {
  value: T;

  fileSizeBytes: number;

  bytesRead: number;

  linesInspected: number;

  malformedLinesIgnored: number;

  oversizedLinesIgnored: number;
}

export interface JsonlTailReaderOptions {
  chunkSizeBytes?: number;

  maximumLineBytes?: number;

  onComplete?: (
    diagnostics:
      JsonlTailReadDiagnostics,
  ) => void;
}

export interface JsonlTailReadDiagnostics {
  fileSizeBytes: number;

  bytesRead: number;

  linesInspected: number;

  malformedLinesIgnored: number;

  oversizedLinesIgnored: number;
}

export function readLatestValidJsonlRecord<T>(
  filePath: string,
  isValid: (
    value: unknown,
  ) => value is T,
  options:
    JsonlTailReaderOptions = {},
  selectBetter?: (
    candidate: T,
    selected: T,
  ) => boolean,
): JsonlTailReadResult<T> | null {
  const chunkSizeBytes =
    positiveInteger(
      options.chunkSizeBytes ??
        DEFAULT_CHUNK_SIZE_BYTES,
      "JSONL tail chunk size",
    );

  const maximumLineBytes =
    positiveInteger(
      options.maximumLineBytes ??
        DEFAULT_MAXIMUM_LINE_BYTES,
      "JSONL maximum line size",
    );

  const descriptor =
    openSync(
      filePath,
      "r",
    );

  let bytesRead =
    0;

  let linesInspected =
    0;

  let malformedLinesIgnored =
    0;

  let oversizedLinesIgnored =
    0;

  let selectedValue:
    T | null =
    null;

  try {
    const fileSizeBytes =
      fstatSync(
        descriptor,
      ).size;

    let position =
      fileSizeBytes;

    /*
     * Keep an oversized/incomplete line as reverse-ordered fragments while
     * walking the file backwards. Concatenating the whole partial line on
     * every chunk turns a large JSONL snapshot into O(n^2) copying during
     * startup (a 100 MB record previously copied many gigabytes). Fragments
     * are assembled exactly once, when the preceding newline is found.
     */
    let partialFragments:
      Buffer[] =
      [];

    let partialLength =
      0;

    let discardingOversizedLine =
      false;

    const inspect =
      (
        candidate:
          Buffer,
      ): T | null => {
        const trimmed =
          trimLineEnding(
            candidate,
          );

        if (
          trimmed.length ===
          0
        ) {
          return null;
        }

        linesInspected +=
          1;

        if (
          trimmed.length >
          maximumLineBytes
        ) {
          oversizedLinesIgnored +=
            1;

          return null;
        }

        try {
          const parsed:
            unknown =
            JSON.parse(
              trimmed.toString(
                "utf8",
              ),
            );

          return isValid(
            parsed,
          )
            ? parsed
            : null;
        } catch {
          malformedLinesIgnored +=
            1;

          return null;
        }
      };

    while (
      position >
      0
    ) {
      const readLength =
        Math.min(
          chunkSizeBytes,
          position,
        );

      position -=
        readLength;

      const chunk =
        Buffer.allocUnsafe(
          readLength,
        );

      const actualRead =
        readSync(
          descriptor,
          chunk,
          0,
          readLength,
          position,
        );

      bytesRead +=
        actualRead;

      const availableChunk =
        chunk.subarray(
          0,
          actualRead,
        );

      let lineEnd =
        availableChunk.length;

      for (
        let index =
          availableChunk.length -
            1;

        index >=
        0;

        index -=
          1
      ) {
        if (
          availableChunk[index] !==
          0x0a
        ) {
          continue;
        }

        if (
          discardingOversizedLine
        ) {
          discardingOversizedLine =
            false;

          partialFragments =
            [];

          partialLength =
            0;

          lineEnd =
            index;

          continue;
        }

        const leadingFragment =
          availableChunk.subarray(
            index +
              1,
            lineEnd,
          );

        const candidateLength =
          leadingFragment.length +
          partialLength;

        const candidate =
          candidateLength ===
            leadingFragment.length
            ? leadingFragment
            : Buffer.concat(
                [
                  leadingFragment,
                  ...partialFragments
                    .slice()
                    .reverse(),
                ],
                candidateLength,
              );

        const value =
          inspect(
            candidate,
          );

        if (
          value &&
          selectBetter
        ) {
          if (
            selectedValue ===
              null ||
            selectBetter(
              value,
              selectedValue,
            )
          ) {
            selectedValue =
              value;
          }
        } else if (value) {
          const result = {
            value,
            fileSizeBytes,
            bytesRead,
            linesInspected,
            malformedLinesIgnored,
            oversizedLinesIgnored,
          };

          options.onComplete?.(
            result,
          );

          return result;
        }

        lineEnd =
          index;

        partialFragments =
          [];

        partialLength =
          0;
      }

      const remainingFragment =
        availableChunk.subarray(
          0,
          lineEnd,
        );

      if (
        !discardingOversizedLine &&
        remainingFragment.length >
          0
      ) {
        partialFragments.push(
          remainingFragment,
        );

        partialLength +=
          remainingFragment.length;
      }

      if (
        partialLength >
        maximumLineBytes
      ) {
        oversizedLinesIgnored +=
          1;

        partialFragments =
          [];

        partialLength =
          0;

        discardingOversizedLine =
          true;
      }
    }

    if (
      !discardingOversizedLine &&
      partialLength >
        0
    ) {
      const partial =
        Buffer.concat(
          partialFragments
            .slice()
            .reverse(),
          partialLength,
        );

      const value =
        inspect(
          partial,
        );

      if (
        value &&
        selectBetter
      ) {
        if (
          selectedValue ===
            null ||
          selectBetter(
            value,
            selectedValue,
          )
        ) {
          selectedValue =
            value;
        }
      } else if (value) {
        const result = {
          value,
          fileSizeBytes,
          bytesRead,
          linesInspected,
          malformedLinesIgnored,
          oversizedLinesIgnored,
        };

        options.onComplete?.(
          result,
        );

        return result;
      }
    }

    const diagnostics = {
      fileSizeBytes,
      bytesRead,
      linesInspected,
      malformedLinesIgnored,
      oversizedLinesIgnored,
    };

    options.onComplete?.(
      diagnostics,
    );

    if (
      selectedValue !==
      null
    ) {
      return {
        value:
          selectedValue,

        ...diagnostics,
      };
    }

    return null;
  } finally {
    closeSync(
      descriptor,
    );
  }
}

function trimLineEnding(
  line: Buffer,
): Buffer {
  let start =
    0;

  let end =
    line.length;

  while (
    start <
      end &&
    (
      line[start] ===
        0x20 ||
      line[start] ===
        0x09 ||
      line[start] ===
        0x0d
    )
  ) {
    start +=
      1;
  }

  while (
    end >
      start &&
    (
      line[
        end -
          1
      ] ===
        0x20 ||
      line[
        end -
          1
      ] ===
        0x09 ||
      line[
        end -
          1
      ] ===
        0x0d
    )
  ) {
    end -=
      1;
  }

  return line.subarray(
    start,
    end,
  );
}

function positiveInteger(
  value: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(
      value,
    ) ||
    value <=
      0
  ) {
    throw new Error(
      `${label} must be a positive integer.`,
    );
  }

  return value;
}
