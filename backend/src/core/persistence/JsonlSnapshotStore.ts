import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

import {
  dirname,
} from "node:path";

export interface JsonlSnapshotEnvelope<T> {
  storeVersion: 1;

  sequence: number;

  writtenAt: number;

  payload: T;
}

export interface JsonlSnapshotStoreDiagnostics {
  filePath: string;

  exists: boolean;

  linesRead: number;

  validRecordsRead: number;

  legacyRecordsRead: number;

  malformedRecordsIgnored: number;

  writes: number;

  writeFailures: number;

  lastSequence: number;

  lastWriteAt: number | null;

  lastReadAt: number | null;

  lastError: string | null;
}

export interface JsonlSnapshotStoreOptions<T> {
  filePath: string;

  isPayload: (
    value: unknown,
  ) => value is T;

  decodeLegacy?: (
    value: unknown,
  ) => T | null;
}

export class JsonlSnapshotStore<T> {
  private sequence =
    0;

  private linesRead =
    0;

  private validRecordsRead =
    0;

  private legacyRecordsRead =
    0;

  private malformedRecordsIgnored =
    0;

  private writes =
    0;

  private writeFailures =
    0;

  private lastWriteAt:
    number | null =
    null;

  private lastReadAt:
    number | null =
    null;

  private lastError:
    string | null =
    null;

  constructor(
    private readonly options:
      JsonlSnapshotStoreOptions<T>,
  ) {}

  append(
    payload:
      T,
  ): JsonlSnapshotEnvelope<T> {
    const envelope:
      JsonlSnapshotEnvelope<T> = {
      storeVersion:
        1,

      sequence:
        this.sequence +
        1,

      writtenAt:
        Date.now(),

      payload:
        structuredClone(
          payload,
        ),
    };

    try {
      mkdirSync(
        dirname(
          this.options
            .filePath,
        ),

        {
          recursive:
            true,
        },
      );

      appendFileSync(
        this.options
          .filePath,

        `${JSON.stringify(
          envelope,
        )}\n`,

        "utf8",
      );

      this.sequence =
        envelope.sequence;

      this.writes +=
        1;

      this.lastWriteAt =
        envelope.writtenAt;

      this.lastError =
        null;

      return structuredClone(
        envelope,
      );
    } catch (
      error:
        unknown
    ) {
      this.writeFailures +=
        1;

      this.lastError =
        error instanceof Error
          ? error.message
          : "Unknown JSONL snapshot write error.";

      throw error;
    }
  }

  /**
   * Replace the durable snapshot stream with an exact new set of payloads.
   *
   * This is intentionally separate from append-only runtime writes and is
   * reserved for explicit operator-owned reset/retention boundaries.
   */
  replaceAll(
    payloads:
      readonly T[],
  ): void {
    const writtenAt =
      Date.now();

    const text =
      payloads
        .map(
          (
            payload,

            index,
          ) =>
            JSON.stringify({
              storeVersion:
                1,

              sequence:
                index +
                1,

              writtenAt,

              payload:
                structuredClone(
                  payload,
                ),
            } satisfies JsonlSnapshotEnvelope<T>),
        )
        .join(
          "\n",
        );

    try {
      mkdirSync(
        dirname(
          this.options
            .filePath,
        ),

        {
          recursive:
            true,
        },
      );

      writeFileSync(
        this.options
          .filePath,

        text
          ? `${text}\n`
          : "",

        "utf8",
      );

      this.sequence =
        payloads.length;

      this.writes +=
        1;

      this.lastWriteAt =
        writtenAt;

      this.lastError =
        null;
    } catch (
      error:
        unknown
    ) {
      this.writeFailures +=
        1;

      this.lastError =
        error instanceof Error
          ? error.message
          : "Unknown JSONL snapshot replacement error.";

      throw error;
    }
  }

  clear(): void {
    this.replaceAll(
      [],
    );
  }

  readAll():
    T[] {
    this.resetReadDiagnostics();

    if (
      !existsSync(
        this.options
          .filePath,
      )
    ) {
      this.lastReadAt =
        Date.now();

      return [];
    }

    try {
      const text =
        readFileSync(
          this.options
            .filePath,

          "utf8",
        );

      const lines =
        text
          .split(
            /\r?\n/,
          )
          .map(
            (
              line,
            ) =>
              line.trim(),
          )
          .filter(
            Boolean,
          );

      this.linesRead =
        lines.length;

      const records:
        T[] = [];

      for (
        const line
        of lines
      ) {
        try {
          const parsed:
            unknown =
            JSON.parse(
              line,
            );

          const envelope =
            this.decodeEnvelope(
              parsed,
            );

          if (
            envelope
          ) {
            records.push(
              structuredClone(
                envelope.payload,
              ),
            );

            this.validRecordsRead +=
              1;

            this.sequence =
              Math.max(
                this.sequence,
                envelope.sequence,
              );

            continue;
          }

          const legacy =
            this.options
              .decodeLegacy?.(
                parsed,
              ) ??
            null;

          if (
            legacy
          ) {
            records.push(
              structuredClone(
                legacy,
              ),
            );

            this.validRecordsRead +=
              1;

            this.legacyRecordsRead +=
              1;

            continue;
          }

          this.malformedRecordsIgnored +=
            1;
        } catch {
          /*
           * Crash-tolerant JSONL:
           *
           * malformed / truncated records do not
           * prevent valid historical records from
           * being restored.
           */
          this.malformedRecordsIgnored +=
            1;
        }
      }

      this.lastReadAt =
        Date.now();

      this.lastError =
        null;

      return records;
    } catch (
      error:
        unknown
    ) {
      this.lastReadAt =
        Date.now();

      this.lastError =
        error instanceof Error
          ? error.message
          : "Unknown JSONL snapshot read error.";

      return [];
    }
  }

  getDiagnostics():
    JsonlSnapshotStoreDiagnostics {
    return {
      filePath:
        this.options
          .filePath,

      exists:
        existsSync(
          this.options
            .filePath,
        ),

      linesRead:
        this.linesRead,

      validRecordsRead:
        this.validRecordsRead,

      legacyRecordsRead:
        this.legacyRecordsRead,

      malformedRecordsIgnored:
        this.malformedRecordsIgnored,

      writes:
        this.writes,

      writeFailures:
        this.writeFailures,

      lastSequence:
        this.sequence,

      lastWriteAt:
        this.lastWriteAt,

      lastReadAt:
        this.lastReadAt,

      lastError:
        this.lastError,
    };
  }

  private decodeEnvelope(
    value:
      unknown,
  ):
    JsonlSnapshotEnvelope<T> |
    null {
    if (
      !this.isRecord(
        value,
      ) ||
      value.storeVersion !==
        1 ||
      typeof value.sequence !==
        "number" ||
      !Number.isInteger(
        value.sequence,
      ) ||
      value.sequence <
        1 ||
      typeof value.writtenAt !==
        "number" ||
      !Number.isFinite(
        value.writtenAt,
      ) ||
      !this.options
        .isPayload(
          value.payload,
        )
    ) {
      return null;
    }

    return {
      storeVersion:
        1,

      sequence:
        value.sequence,

      writtenAt:
        value.writtenAt,

      payload:
        value.payload,
    };
  }

  private isRecord(
    value:
      unknown,
  ): value is
    Record<
      string,
      unknown
    > {
    return (
      typeof value ===
        "object" &&
      value !==
        null &&
      !Array.isArray(
        value,
      )
    );
  }

  private resetReadDiagnostics():
    void {
    this.linesRead =
      0;

    this.validRecordsRead =
      0;

    this.legacyRecordsRead =
      0;

    this.malformedRecordsIgnored =
      0;
  }
}
