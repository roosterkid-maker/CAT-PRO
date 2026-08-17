import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";

import {
  basename,
  dirname,
  extname,
  join,
} from "node:path";

import {
  readLatestValidJsonlRecord,
} from "./JsonlTailReader";

import type {
  JsonlTailReadDiagnostics,
  JsonlTailReaderOptions,
} from "./JsonlTailReader";

const ARCHIVE_SEQUENCE_DIGITS =
  6;

const RECORD_COUNT_CHUNK_BYTES =
  64 * 1_024;

export type JsonlArchiveRestoreStatus =
  | "AVAILABLE"
  | "NO_DATA"
  | "FAILED";

export interface JsonlArchiveRestoreDiagnostics {
  activeFile: string;

  activeFileOpened: boolean;

  archivesConsidered: number;

  archivesOpened: number;

  bytesRead: number;

  recordsExamined: number;

  malformedRecordsIgnored: number;

  oversizedRecordsIgnored: number;

  durationMs: number;

  selectedAuthoritativeSource: string | null;

  restoreStatus: JsonlArchiveRestoreStatus;

  lastError: string | null;
}

export interface JsonlArchiveRestoreResult<T>
extends JsonlArchiveRestoreDiagnostics {
  value: T | null;
}

export interface JsonlArchiveReaderOptions
extends JsonlTailReaderOptions {
  archivePaths?: readonly string[];

  noMatchStatus?:
    | "NO_DATA"
    | "FAILED";
}

export interface JsonlRotatingWriterOptions {
  enabled: boolean;

  maximumFileBytes: number;

  maximumRecords: number;

  maximumArchives?: number;

  protectExistingOversizedFile?: boolean;
}

export interface JsonlRotatingWriterDiagnostics {
  activeFile: string;

  archivePattern: string;

  rotationEnabled: boolean;

  maximumFileBytes: number;

  maximumRecords: number;

  maximumArchives: number | null;

  existingOversizedFileProtected: boolean;

  activeRecordCount: number | null;

  rotations: number;

  archivesPruned: number;

  lockAcquisitionFailures: number;

  lastArchiveCreated: string | null;
}

export function listJsonlArchivePaths(
  activeFilePath: string,
): string[] {
  const directory =
    dirname(
      activeFilePath,
    );

  if (
    !existsSync(
      directory,
    )
  ) {
    return [];
  }

  const descriptor =
    archiveDescriptor(
      activeFilePath,
    );

  return readdirSync(
    directory,
    {
      withFileTypes:
        true,
    },
  )
    .filter(
      (
        entry,
      ) =>
        entry.isFile(),
    )
    .flatMap(
      (
        entry,
      ) => {
        const sequence =
          parseArchiveSequence(
            entry.name,
            descriptor,
          );

        return sequence ===
          null
          ? []
          : [
              {
                entryName:
                  entry.name,

                sequence,
              },
            ];
      },
    )
    .sort(
      (
        first,
        second,
      ) =>
        second.sequence -
        first.sequence,
    )
    .map(
      (
        item,
      ) =>
        join(
          directory,
          item.entryName,
        ),
    );
}

export function readLatestValidJsonlAcrossArchives<T>(
  activeFilePath: string,
  isValid: (
    value: unknown,
  ) => value is T,
  options:
    JsonlArchiveReaderOptions = {},
  selectBetter?: (
    candidate: T,
    selected: T,
  ) => boolean,
): JsonlArchiveRestoreResult<T> {
  const startedAt =
    process.hrtime.bigint();

  const archivePaths =
    options.archivePaths
      ? [
          ...options.archivePaths,
        ]
      : listJsonlArchivePaths(
          activeFilePath,
        );

  const segments = [
    activeFilePath,
    ...archivePaths,
  ];

  let activeFileOpened =
    false;

  let archivesOpened =
    0;

  let bytesRead =
    0;

  let recordsExamined =
    0;

  let malformedRecordsIgnored =
    0;

  let oversizedRecordsIgnored =
    0;

  let nonEmptySegmentFound =
    false;

  let selectedValue:
    T | null =
    null;

  let selectedSource:
    string | null =
    null;

  try {
    for (
      let index =
        0;

      index <
        segments.length;

      index +=
        1
    ) {
      const segment =
        segments[index];

      if (
        !segment ||
        !existsSync(
          segment,
        )
      ) {
        continue;
      }

      const fileSizeBytes =
        statSync(
          segment,
        ).size;

      if (
        fileSizeBytes ===
        0
      ) {
        continue;
      }

      nonEmptySegmentFound =
        true;

      if (
        index ===
        0
      ) {
        activeFileOpened =
          true;
      } else {
        archivesOpened +=
          1;
      }

      const tail =
        (() => {
          const completion: {
            value:
              JsonlTailReadDiagnostics | null;
          } = {
            value:
              null,
          };

          const result =
        readLatestValidJsonlRecord(
          segment,
          isValid,
          {
            chunkSizeBytes:
              options.chunkSizeBytes,

            maximumLineBytes:
              options.maximumLineBytes,

            onComplete:
              (
                diagnostics,
              ) => {
                completion.value =
                  diagnostics;
              },
          },
          selectBetter,
        );

          if (
            !result &&
            completion.value
          ) {
            bytesRead +=
              completion.value
                .bytesRead;

            recordsExamined +=
              completion.value
                .linesInspected;

            malformedRecordsIgnored +=
              completion.value
                .malformedLinesIgnored;

            oversizedRecordsIgnored +=
              completion.value
                .oversizedLinesIgnored;
          }

          return result;
        })();

      if (
        !tail
      ) {
        continue;
      }

      bytesRead +=
        tail.bytesRead;

      recordsExamined +=
        tail.linesInspected;

      malformedRecordsIgnored +=
        tail.malformedLinesIgnored;

      oversizedRecordsIgnored +=
        tail.oversizedLinesIgnored;

      if (
        selectBetter
      ) {
        if (
          selectedValue ===
            null ||
          selectBetter(
            tail.value,
            selectedValue,
          )
        ) {
          selectedValue =
            tail.value;

          selectedSource =
            segment;
        }

        continue;
      }

      return {
        value:
          tail.value,

        activeFile:
          activeFilePath,

        activeFileOpened,

        archivesConsidered:
          archivePaths.length,

        archivesOpened,

        bytesRead,

        recordsExamined,

        malformedRecordsIgnored,

        oversizedRecordsIgnored,

        durationMs:
          elapsedMilliseconds(
            startedAt,
          ),

        selectedAuthoritativeSource:
          segment,

        restoreStatus:
          "AVAILABLE",

        lastError:
          null,
      };
    }

    if (
      selectedValue !==
      null
    ) {
      return {
        value:
          selectedValue,

        activeFile:
          activeFilePath,

        activeFileOpened,

        archivesConsidered:
          archivePaths.length,

        archivesOpened,

        bytesRead,

        recordsExamined,

        malformedRecordsIgnored,

        oversizedRecordsIgnored,

        durationMs:
          elapsedMilliseconds(
            startedAt,
          ),

        selectedAuthoritativeSource:
          selectedSource,

        restoreStatus:
          "AVAILABLE",

        lastError:
          null,
      };
    }

    return {
      value:
        null,

      activeFile:
        activeFilePath,

      activeFileOpened,

      archivesConsidered:
        archivePaths.length,

      archivesOpened,

      bytesRead,

      recordsExamined,

      malformedRecordsIgnored,

      oversizedRecordsIgnored,

      durationMs:
        elapsedMilliseconds(
          startedAt,
        ),

      selectedAuthoritativeSource:
        null,

      restoreStatus:
        nonEmptySegmentFound
          ? options.noMatchStatus ??
            "FAILED"
          : "NO_DATA",

      lastError:
        nonEmptySegmentFound
          ? options.noMatchStatus ===
              "NO_DATA"
            ? null
            : "No valid JSONL record was recoverable from the active file or its archives."
          : null,
    };
  } catch (
    error:
      unknown
  ) {
    return {
      value:
        null,

      activeFile:
        activeFilePath,

      activeFileOpened,

      archivesConsidered:
        archivePaths.length,

      archivesOpened,

      bytesRead,

      recordsExamined,

      malformedRecordsIgnored,

      oversizedRecordsIgnored,

      durationMs:
        elapsedMilliseconds(
          startedAt,
        ),

      selectedAuthoritativeSource:
        null,

      restoreStatus:
        "FAILED",

      lastError:
        error instanceof Error
          ? error.message
          : "JSONL multi-archive restore failed.",
    };
  }
}

export function readBestValidJsonlAcrossArchives<T>(
  activeFilePath: string,
  isValid: (
    value: unknown,
  ) => value is T,
  selectBetter: (
    candidate: T,
    selected: T,
  ) => boolean,
  options:
    JsonlArchiveReaderOptions = {},
): JsonlArchiveRestoreResult<T> {
  return readLatestValidJsonlAcrossArchives(
    activeFilePath,
    isValid,
    options,
    selectBetter,
  );
}

export class JsonlRotatingWriter<T> {
  private activeRecordCount:
    number | null;

  private readonly existingOversizedFileProtected:
    boolean;

  private rotations =
    0;

  private archivesPruned =
    0;

  private lockAcquisitionFailures =
    0;

  private lastArchiveCreated:
    string | null =
    null;

  constructor(
    private readonly activeFilePath:
      string,
    private readonly options:
      JsonlRotatingWriterOptions,
  ) {
    positiveInteger(
      options.maximumFileBytes,
      "JSONL maximum active-file bytes",
    );

    positiveInteger(
      options.maximumRecords,
      "JSONL maximum active-file records",
    );

    if (
      options.maximumArchives !==
        undefined
    ) {
      positiveInteger(
        options.maximumArchives,
        "JSONL maximum archives",
      );
    }

    const existingSize =
      existsSync(
        activeFilePath,
      )
        ? statSync(
            activeFilePath,
          ).size
        : 0;

    this.existingOversizedFileProtected =
      options.enabled &&
      (
        options
          .protectExistingOversizedFile ??
        true
      ) &&
      existingSize >=
        options.maximumFileBytes;

    const existingOversizedFile =
      options.enabled &&
      existingSize >=
        options.maximumFileBytes;

    this.activeRecordCount =
      existingOversizedFile
        ? null
        : countJsonlRecords(
            activeFilePath,
          );
  }

  append(
    value: T,
  ): void {
    const line =
      `${JSON.stringify(
        value,
      )}\n`;

    const lineBytes =
      Buffer.byteLength(
        line,
        "utf8",
      );

    mkdirSync(
      dirname(
        this.activeFilePath,
      ),
      {
        recursive:
          true,
      },
    );

    const lockPath =
      jsonlRotationLockPath(
        this.activeFilePath,
      );

    let lockDescriptor:
      number;

    try {
      lockDescriptor =
        openSync(
          lockPath,
          "wx",
        );
    } catch (
      error:
        unknown
    ) {
      this.lockAcquisitionFailures +=
        1;

      throw new Error(
        error instanceof Error
          ? `JSONL single-writer rotation lock unavailable: ${error.message}`
          : "JSONL single-writer rotation lock unavailable.",
      );
    }

    try {
      if (
        this.shouldRotate(
          lineBytes,
        )
      ) {
        this.rotate();
      }

      appendFileSync(
        this.activeFilePath,
        line,
        "utf8",
      );

      if (
        this.activeRecordCount !==
        null
      ) {
        this.activeRecordCount +=
          1;
      }

      this.pruneArchives();
    } finally {
      closeSync(
        lockDescriptor,
      );

      try {
        unlinkSync(
          lockPath,
        );
      } catch {
        /*
         * A stale lock fails later writes closed.
         * It is never silently removed by another writer.
         */
      }
    }
  }

  getDiagnostics():
    JsonlRotatingWriterDiagnostics {
    return {
      activeFile:
        this.activeFilePath,

      archivePattern:
        archiveDescriptor(
          this.activeFilePath,
        ).displayPattern,

      rotationEnabled:
        this.options.enabled,

      maximumFileBytes:
        this.options.maximumFileBytes,

      maximumRecords:
        this.options.maximumRecords,

      maximumArchives:
        this.options.maximumArchives ??
        null,

      existingOversizedFileProtected:
        this
          .existingOversizedFileProtected,

      activeRecordCount:
        this.activeRecordCount,

      rotations:
        this.rotations,

      archivesPruned:
        this.archivesPruned,

      lockAcquisitionFailures:
        this.lockAcquisitionFailures,

      lastArchiveCreated:
        this.lastArchiveCreated,
    };
  }

  private shouldRotate(
    incomingBytes: number,
  ): boolean {
    if (
      !this.options.enabled ||
      this.existingOversizedFileProtected ||
      !existsSync(
        this.activeFilePath,
      )
    ) {
      return false;
    }

    const currentBytes =
      statSync(
        this.activeFilePath,
      ).size;

    if (
      currentBytes ===
      0
    ) {
      return false;
    }

    return (
      currentBytes +
        incomingBytes >
        this.options
          .maximumFileBytes ||
      (
        this.activeRecordCount !==
          null &&
        this.activeRecordCount +
          1 >
          this.options
            .maximumRecords
      )
    );
  }

  private rotate():
    void {
    const archives =
      listJsonlArchivePaths(
        this.activeFilePath,
      );

    const descriptor =
      archiveDescriptor(
        this.activeFilePath,
      );

    const latestSequence =
      archives.reduce(
        (
          maximum,
          archive,
        ) =>
          Math.max(
            maximum,
            parseArchiveSequence(
              basename(
                archive,
              ),
              descriptor,
            ) ??
              0,
          ),
        0,
      );

    const archivePath =
      join(
        dirname(
          this.activeFilePath,
        ),
        `${descriptor.prefix}${String(
          latestSequence +
            1,
        ).padStart(
          ARCHIVE_SEQUENCE_DIGITS,
          "0",
        )}${descriptor.extension}`,
      );

    renameSync(
      this.activeFilePath,
      archivePath,
    );

    this.activeRecordCount =
      0;

    this.rotations +=
      1;

    this.lastArchiveCreated =
      archivePath;

    this.pruneArchives();
  }

  private pruneArchives():
    void {
    const maximumArchives =
      this.options.maximumArchives;

    if (
      maximumArchives ===
      undefined
    ) {
      return;
    }

    const removable =
      listJsonlArchivePaths(
        this.activeFilePath,
      ).slice(
        maximumArchives,
      );

    for (
      const archivePath
      of removable
    ) {
      unlinkSync(
        archivePath,
      );

      this.archivesPruned +=
        1;
    }
  }
}

export function jsonlRotationLockPath(
  activeFilePath: string,
): string {
  return `${activeFilePath}.rotation.lock`;
}

function countJsonlRecords(
  filePath: string,
): number {
  if (
    !existsSync(
      filePath,
    )
  ) {
    return 0;
  }

  const descriptor =
    openSync(
      filePath,
      "r",
    );

  let records =
    0;

  let lastByte:
    number | null =
    null;

  try {
    const buffer =
      Buffer.allocUnsafe(
        RECORD_COUNT_CHUNK_BYTES,
      );

    let bytesRead:
      number;

    do {
      bytesRead =
        readSync(
          descriptor,
          buffer,
          0,
          buffer.length,
          null,
        );

      for (
        let index =
          0;

        index <
          bytesRead;

        index +=
          1
      ) {
        if (
          buffer[index] ===
          0x0a
        ) {
          records +=
            1;
        }
      }

      if (
        bytesRead >
        0
      ) {
        lastByte =
          buffer[
            bytesRead -
              1
          ] ??
          null;
      }
    } while (
      bytesRead >
      0
    );

    if (
      lastByte !==
        null &&
      lastByte !==
        0x0a
    ) {
      records +=
        1;
    }

    return records;
  } finally {
    closeSync(
      descriptor,
    );
  }
}

function archiveDescriptor(
  activeFilePath: string,
): {
  prefix: string;
  extension: string;
  displayPattern: string;
} {
  const activeName =
    basename(
      activeFilePath,
    );

  const extension =
    extname(
      activeName,
    ) ||
    ".jsonl";

  const stem =
    activeName.endsWith(
      extension,
    )
      ? activeName.slice(
          0,
          -extension.length,
        )
      : activeName;

  return {
    prefix:
      `${stem}.archive.`,

    extension,

    displayPattern:
      `${stem}.archive.NNNNNN${extension}`,
  };
}

function parseArchiveSequence(
  fileName: string,
  descriptor: {
    prefix: string;
    extension: string;
  },
): number | null {
  if (
    !fileName.startsWith(
      descriptor.prefix,
    ) ||
    !fileName.endsWith(
      descriptor.extension,
    )
  ) {
    return null;
  }

  const sequenceText =
    fileName.slice(
      descriptor.prefix.length,
      -descriptor.extension.length,
    );

  if (
    !new RegExp(
      `^\\d{${ARCHIVE_SEQUENCE_DIGITS}}$`,
    ).test(
      sequenceText,
    )
  ) {
    return null;
  }

  const sequence =
    Number(
      sequenceText,
    );

  return Number.isSafeInteger(
    sequence,
  ) &&
    sequence >
      0
    ? sequence
    : null;
}

function elapsedMilliseconds(
  startedAt: bigint,
): number {
  return Number(
    process.hrtime.bigint() -
      startedAt,
  ) /
    1_000_000;
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
