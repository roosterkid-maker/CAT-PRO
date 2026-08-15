import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";

import {
  dirname,
  resolve,
} from "node:path";

import type {
  ArbitrageLiveExecutionResult,
} from "../execution/models/ArbitrageLiveExecutionResult";

export interface ArbitragePnLRecord {
  opportunityId: string;

  market: string;

  buyExchange: string;

  sellExchange: string;

  status:
    ArbitrageLiveExecutionResult["status"];

  matchedQuantity: number;

  buyAveragePrice: number;

  sellAveragePrice: number;

  grossProfit: number;

  totalFees: number;

  netProfit: number;

  netProfitPercent: number;

  recoveryRequired: boolean;

  completedAt: number;
}

export interface ArbitragePnLReport {
  timestamp: number;

  totalCycles: number;

  completedCycles: number;

  profitableCycles: number;

  lossCycles: number;

  recoveryRequiredCycles: number;

  totalMatchedQuantity: number;

  grossProfit: number;

  totalFees: number;

  netProfit: number;

  averageNetProfit: number;

  winRatePercent: number;

  latest:
    ArbitragePnLRecord[];
}

export interface ArbitragePnLRecordOptions {
  persist?: boolean;
}

const MAXIMUM_STORED_RECORDS =
  1_000;

const DEFAULT_RECENT_LIMIT =
  20;

const MAXIMUM_RECENT_LIMIT =
  100;

export class ArbitragePnLService {
  private readonly records:
    ArbitragePnLRecord[] = [];

 private readonly persistencePath:
  string;

   constructor(
  persistencePath?: string,
) {
  this.persistencePath =
    persistencePath ??
    resolve(
      process.cwd(),
      "logs",
      "arbitrage-pnl.jsonl",
    );

  this.loadPersistedRecords();
}

  record(
    result:
      ArbitrageLiveExecutionResult,
    options:
      ArbitragePnLRecordOptions = {},
  ): ArbitragePnLRecord | null {
    const buyResult =
      result.buyResult;

    const sellResult =
      result.sellResult;

    if (
      !buyResult ||
      !sellResult
    ) {
      return null;
    }

    const matchedQuantity =
      this.round(
        this.toNonNegativeNumber(
          result.matchedFilledQuantity,
        ),
      );

    const buyAveragePrice =
      this.round(
        this.resolveAveragePrice(
          buyResult.averageFillPrice,
          buyResult.requestedPrice,
        ),
      );

    const sellAveragePrice =
      this.round(
        this.resolveAveragePrice(
          sellResult.averageFillPrice,
          sellResult.requestedPrice,
        ),
      );

    const buyFee =
      this.toNonNegativeNumber(
        buyResult.feeAmount,
      );

    const sellFee =
      this.toNonNegativeNumber(
        sellResult.feeAmount,
      );

    const totalFees =
      this.round(
        buyFee +
        sellFee,
      );

    const grossBuyValue =
      matchedQuantity *
      buyAveragePrice;

    const grossSellValue =
      matchedQuantity *
      sellAveragePrice;

    const grossProfit =
      this.round(
        grossSellValue -
        grossBuyValue,
      );

    const netProfit =
      this.round(
        grossProfit -
        totalFees,
      );

    const netProfitPercent =
      this.round(
        grossBuyValue > 0
          ? netProfit /
            grossBuyValue *
            100
          : 0,
      );

    const record:
      ArbitragePnLRecord = {
      opportunityId:
        result.opportunityId,

      market:
        result.market
          .trim()
          .toUpperCase(),

      buyExchange:
        result.buyExchange
          .trim()
          .toLowerCase(),

      sellExchange:
        result.sellExchange
          .trim()
          .toLowerCase(),

      status:
        result.status,

      matchedQuantity,

      buyAveragePrice,

      sellAveragePrice,

      grossProfit,

      totalFees,

      netProfit,

      netProfitPercent,

      recoveryRequired:
        result.recoveryRequired,

      completedAt:
        result.completedAt,
    };

    this.insertRecord(
      record,
    );

    if (
      options.persist === true
    ) {
      this.persistRecord(
        record,
      );
    }

    return record;
  }

  getReport(
    recentLimit =
      DEFAULT_RECENT_LIMIT,
  ): ArbitragePnLReport {
    const completedRecords =
      this.records.filter(
        (record) =>
          record.status ===
          "COMPLETED",
      );

    const profitableCycles =
      completedRecords.filter(
        (record) =>
          record.netProfit > 0,
      ).length;

    const lossCycles =
      completedRecords.filter(
        (record) =>
          record.netProfit < 0,
      ).length;

    const recoveryRequiredCycles =
      this.records.filter(
        (record) =>
          record.recoveryRequired,
      ).length;

    const grossProfit =
      this.round(
        this.records.reduce(
          (
            total,
            record,
          ) =>
            total +
            record.grossProfit,
          0,
        ),
      );

    const totalFees =
      this.round(
        this.records.reduce(
          (
            total,
            record,
          ) =>
            total +
            record.totalFees,
          0,
        ),
      );

    const netProfit =
      this.round(
        this.records.reduce(
          (
            total,
            record,
          ) =>
            total +
            record.netProfit,
          0,
        ),
      );

    const totalMatchedQuantity =
      this.round(
        this.records.reduce(
          (
            total,
            record,
          ) =>
            total +
            record.matchedQuantity,
          0,
        ),
      );

    const normalizedLimit =
      this.normalizeLimit(
        recentLimit,
      );

    return {
      timestamp:
        Date.now(),

      totalCycles:
        this.records.length,

      completedCycles:
        completedRecords.length,

      profitableCycles,

      lossCycles,

      recoveryRequiredCycles,

      totalMatchedQuantity,

      grossProfit,

      totalFees,

      netProfit,

      averageNetProfit:
        this.records.length > 0
          ? this.round(
              netProfit /
              this.records.length,
            )
          : 0,

      winRatePercent:
        completedRecords.length > 0
          ? this.round(
              profitableCycles /
              completedRecords.length *
              100,
            )
          : 0,

      latest:
        this.records.slice(
          0,
          normalizedLimit,
        ),
    };
  }

  reset(): void {
    /*
     * Isolated tests only clear memory.
     * Production P&L file remains untouched.
     */
    this.records.length =
      0;
  }

  private insertRecord(
    record:
      ArbitragePnLRecord,
  ): void {
    const duplicateIndex =
      this.records.findIndex(
        (existing) =>
          existing.opportunityId ===
            record.opportunityId &&
          existing.completedAt ===
            record.completedAt,
      );

    if (
      duplicateIndex !== -1
    ) {
      this.records.splice(
        duplicateIndex,
        1,
      );
    }

    this.records.unshift(
      record,
    );

    this.records.sort(
      (
        first,
        second,
      ) =>
        second.completedAt -
        first.completedAt,
    );

    if (
      this.records.length >
      MAXIMUM_STORED_RECORDS
    ) {
      this.records.length =
        MAXIMUM_STORED_RECORDS;
    }
  }

  private persistRecord(
    record:
      ArbitragePnLRecord,
  ): void {
    try {
      mkdirSync(
        dirname(
          this.persistencePath,
        ),
        {
          recursive:
            true,
        },
      );

      appendFileSync(
        this.persistencePath,
        `${JSON.stringify(
          record,
        )}\n`,
        "utf8",
      );
    } catch (
      error: unknown
    ) {
      console.error(
        "[ArbitragePnLService] Unable to persist P&L record:",
        error instanceof Error
          ? error.message
          : error,
      );
    }
  }

  private loadPersistedRecords():
  void {
    if (
      !existsSync(
        this.persistencePath,
      )
    ) {
      return;
    }

    try {
      const content =
        readFileSync(
          this.persistencePath,
          "utf8",
        );

      const parsedRecords:
        ArbitragePnLRecord[] = [];

      for (
        const line
        of content.split(
          /\r?\n/,
        )
      ) {
        const normalizedLine =
          line.trim();

        if (!normalizedLine) {
          continue;
        }

        try {
          const parsed:
            unknown =
            JSON.parse(
              normalizedLine,
            );

          if (
            this.isPnLRecord(
              parsed,
            )
          ) {
            parsedRecords.push(
              parsed,
            );
          }
        } catch {
          /*
           * Ignore one malformed line instead of
           * breaking complete backend startup.
           */
        }
      }

      parsedRecords
        .sort(
          (
            first,
            second,
          ) =>
            second.completedAt -
            first.completedAt,
        )
        .slice(
          0,
          MAXIMUM_STORED_RECORDS,
        )
        .forEach(
          (record) => {
            this.insertRecord(
              record,
            );
          },
        );
    } catch (
      error: unknown
    ) {
      console.error(
        "[ArbitragePnLService] Unable to load persisted P&L:",
        error instanceof Error
          ? error.message
          : error,
      );
    }
  }

  private isPnLRecord(
    value: unknown,
  ): value is ArbitragePnLRecord {
    if (
      typeof value !==
        "object" ||
      value === null ||
      Array.isArray(value)
    ) {
      return false;
    }

    const record =
      value as Record<
        string,
        unknown
      >;

    return (
      typeof record.opportunityId ===
        "string" &&
      typeof record.market ===
        "string" &&
      typeof record.buyExchange ===
        "string" &&
      typeof record.sellExchange ===
        "string" &&
      typeof record.status ===
        "string" &&
      typeof record.matchedQuantity ===
        "number" &&
      typeof record.buyAveragePrice ===
        "number" &&
      typeof record.sellAveragePrice ===
        "number" &&
      typeof record.grossProfit ===
        "number" &&
      typeof record.totalFees ===
        "number" &&
      typeof record.netProfit ===
        "number" &&
      typeof record.netProfitPercent ===
        "number" &&
      typeof record.recoveryRequired ===
        "boolean" &&
      typeof record.completedAt ===
        "number"
    );
  }

  private resolveAveragePrice(
    averageFillPrice: number,
    requestedPrice:
      | number
      | null,
  ): number {
    if (
      Number.isFinite(
        averageFillPrice,
      ) &&
      averageFillPrice > 0
    ) {
      return averageFillPrice;
    }

    if (
      requestedPrice !== null &&
      Number.isFinite(
        requestedPrice,
      ) &&
      requestedPrice > 0
    ) {
      return requestedPrice;
    }

    return 0;
  }

  private normalizeLimit(
    value: number,
  ): number {
    if (
      !Number.isFinite(value)
    ) {
      return DEFAULT_RECENT_LIMIT;
    }

    return Math.max(
      1,
      Math.min(
        Math.floor(value),
        MAXIMUM_RECENT_LIMIT,
      ),
    );
  }

  private round(
    value: number,
  ): number {
    if (
      !Number.isFinite(value)
    ) {
      return 0;
    }

    return Number(
      value.toFixed(
        8,
      ),
    );
  }

  private toNonNegativeNumber(
    value: number,
  ): number {
    return (
      Number.isFinite(value) &&
      value >= 0
    )
      ? value
      : 0;
  }
}

export const arbitragePnLService =
  new ArbitragePnLService();