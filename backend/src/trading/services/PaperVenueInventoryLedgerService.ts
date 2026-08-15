import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../core/persistence/JsonlSnapshotStore";

import type {
  ExecutionResult,
} from "../models/ExecutionResult";

import type {
  PaperVenueInventoryCheckpoint,
  PaperVenueInventoryDiagnostics,
  PaperVenueInventoryPosition,
} from "../models/PaperExecutionJournal";

const DEFAULT_PAPER_INVENTORY_FILE =
  resolve(
    process.cwd(),
    "logs",
    "paper",
    "venue-inventory.jsonl",
  );

export class PaperVenueInventoryLedgerService {
  private readonly store:
    JsonlSnapshotStore<
      PaperVenueInventoryCheckpoint
    >;

  private readonly checkpoints =
    new Map<
      string,
      PaperVenueInventoryCheckpoint
    >();

  private readonly positions =
    new Map<string, number>();

  private restored =
    false;

  private restoredAt:
    number | null =
    null;

  constructor(
    persistenceFilePath =
      DEFAULT_PAPER_INVENTORY_FILE,
  ) {
    this.store =
      new JsonlSnapshotStore<
        PaperVenueInventoryCheckpoint
      >({
        filePath:
          persistenceFilePath,

        isPayload:
          (
            value,
          ): value is
            PaperVenueInventoryCheckpoint =>
            this.isValidCheckpoint(
              value,
            ),
      });

    this.restore();
  }

  apply(
    result:
      ExecutionResult,

    accountingTransactionId =
      `paper-settlement:${result.planId}`,
  ): PaperVenueInventoryCheckpoint {
    if (
      result.mode !==
        "PAPER" ||
      !result.successful ||
      result.status !==
        "COMPLETED"
    ) {
      throw new Error(
        "Only a completed PAPER result can update PAPER venue inventory.",
      );
    }

    const existing =
      this.checkpoints.get(
        result.planId,
      );

    const checkpoint:
      PaperVenueInventoryCheckpoint = {
      schemaVersion:
        1,

      checkpointId:
        `paper-inventory:${result.planId}`,

      planId:
        result.planId,

      accountingTransactionId,

      capturedAt:
        result.completedAt ??
        result.startedAt,

      deltas: [
        {
          sourceLeg:
            "BUY",

          exchange:
            this.normalizeExchange(
              result.buy.exchange,
            ),

          market:
            this.normalizeMarket(
              result.market,
            ),

          quantityDelta:
            result.buy
              .filledQuantity,
        },
        {
          sourceLeg:
            "SELL",

          exchange:
            this.normalizeExchange(
              result.sell.exchange,
            ),

          market:
            this.normalizeMarket(
              result.market,
            ),

          quantityDelta:
            -result.sell
              .filledQuantity,
        },
      ],
    };

    if (
      existing
    ) {
      if (
        !this.isEquivalent(
          existing,
          checkpoint,
        )
      ) {
        throw new Error(
          `PAPER venue inventory conflicts for plan ${result.planId}.`,
        );
      }

      return structuredClone(
        existing,
      );
    }

    this.store.append(
      checkpoint,
    );

    this.absorb(
      checkpoint,
    );

    return structuredClone(
      checkpoint,
    );
  }

  getCheckpoint(
    planId:
      string,
  ): PaperVenueInventoryCheckpoint | null {
    const checkpoint =
      this.checkpoints.get(
        planId,
      );

    return checkpoint
      ? structuredClone(
          checkpoint,
        )
      : null;
  }

  getPosition(
    exchange:
      string,

    market:
      string,
  ): PaperVenueInventoryPosition {
    const normalizedExchange =
      this.normalizeExchange(
        exchange,
      );

    const normalizedMarket =
      this.normalizeMarket(
        market,
      );

    return {
      exchange:
        normalizedExchange,

      market:
        normalizedMarket,

      quantity:
        this.positions.get(
          this.createPositionKey(
            normalizedExchange,
            normalizedMarket,
          ),
        ) ??
        0,
    };
  }

  getPositions():
    PaperVenueInventoryPosition[] {
    return Array.from(
      this.positions.entries(),
    )
      .map(
        (
          [
            key,
            quantity,
          ],
        ) => {
          const separator =
            key.indexOf(
              "|",
            );

          return {
            exchange:
              key.slice(
                0,
                separator,
              ),

            market:
              key.slice(
                separator +
                  1,
              ),

            quantity,
          };
        },
      )
      .sort(
        (
          first,
          second,
        ) =>
          first.exchange.localeCompare(
            second.exchange,
          ) ||
          first.market.localeCompare(
            second.market,
          ),
      );
  }

  getDiagnostics():
    PaperVenueInventoryDiagnostics {
    const foundation =
      this.store
        .getDiagnostics();

    return {
      persistenceFilePath:
        foundation.filePath,

      restored:
        this.restored,

      restoredAt:
        this.restoredAt,

      checkpoints:
        this.checkpoints.size,

      positions:
        this.getPositions(),

      writes:
        foundation.writes,

      writeFailures:
        foundation.writeFailures,

      malformedRecordsIgnored:
        foundation
          .malformedRecordsIgnored,

      lastError:
        foundation.lastError,

      liveInventoryMutationAllowed:
        false,
    };
  }

  clear(): void {
    this.store.clear();

    this.checkpoints.clear();

    this.positions.clear();

    this.restored =
      false;

    this.restoredAt =
      null;
  }

  private restore():
    void {
    const records =
      this.store
        .readAll();

    for (
      const record
      of records
    ) {
      if (
        this.checkpoints.has(
          record.planId,
        )
      ) {
        continue;
      }

      this.absorb(
        record,
      );
    }

    if (
      records.length >
      0
    ) {
      this.restored =
        true;

      this.restoredAt =
        Date.now();
    }
  }

  private absorb(
    checkpoint:
      PaperVenueInventoryCheckpoint,
  ): void {
    this.checkpoints.set(
      checkpoint.planId,
      structuredClone(
        checkpoint,
      ),
    );

    for (
      const delta
      of checkpoint.deltas
    ) {
      const key =
        this.createPositionKey(
          delta.exchange,
          delta.market,
        );

      const next =
        (
          this.positions.get(
            key,
          ) ??
          0
        ) +
        delta.quantityDelta;

      this.positions.set(
        key,
        Math.abs(
          next,
        ) <=
          1e-12
          ? 0
          : next,
      );
    }
  }

  private isEquivalent(
    first:
      PaperVenueInventoryCheckpoint,

    second:
      PaperVenueInventoryCheckpoint,
  ): boolean {
    return (
      first.checkpointId ===
        second.checkpointId &&
      first.accountingTransactionId ===
        second.accountingTransactionId &&
      JSON.stringify(
        first.deltas,
      ) ===
        JSON.stringify(
          second.deltas,
        )
    );
  }

  private normalizeExchange(
    exchange:
      string,
  ): string {
    const normalized =
      exchange
        .trim()
        .toLowerCase();

    if (
      !normalized
    ) {
      throw new Error(
        "PAPER inventory exchange is required.",
      );
    }

    return normalized;
  }

  private normalizeMarket(
    market:
      string,
  ): string {
    const normalized =
      market
        .trim()
        .toUpperCase();

    if (
      !normalized
    ) {
      throw new Error(
        "PAPER inventory market is required.",
      );
    }

    return normalized;
  }

  private createPositionKey(
    exchange:
      string,

    market:
      string,
  ): string {
    return `${this.normalizeExchange(
      exchange,
    )}|${this.normalizeMarket(
      market,
    )}`;
  }

  private isValidCheckpoint(
    value:
      unknown,
  ): value is
    PaperVenueInventoryCheckpoint {
    return (
      this.isRecord(
        value,
      ) &&
      value.schemaVersion ===
        1 &&
      typeof value.checkpointId ===
        "string" &&
      typeof value.planId ===
        "string" &&
      typeof value.accountingTransactionId ===
        "string" &&
      typeof value.capturedAt ===
        "number" &&
      Number.isFinite(
        value.capturedAt,
      ) &&
      Array.isArray(
        value.deltas,
      ) &&
      value.deltas.length ===
        2 &&
      value.deltas.every(
        (
          delta,
        ) =>
          this.isRecord(
            delta,
          ) &&
          (
            delta.sourceLeg ===
              "BUY" ||
            delta.sourceLeg ===
              "SELL"
          ) &&
          typeof delta.exchange ===
            "string" &&
          typeof delta.market ===
            "string" &&
          typeof delta.quantityDelta ===
            "number" &&
          Number.isFinite(
            delta.quantityDelta,
          ),
      )
    );
  }

  private isRecord(
    value:
      unknown,
  ): value is
    Record<string, unknown> {
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
}

export const paperVenueInventoryLedgerService =
  new PaperVenueInventoryLedgerService();
