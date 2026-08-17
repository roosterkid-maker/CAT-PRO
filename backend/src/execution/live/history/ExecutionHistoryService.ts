import {
  readFile,
} from "node:fs/promises";

import {
  resolve,
} from "node:path";

export type ExecutionHistoryStatus =
  | "PENDING"
  | "OPEN"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELLED"
  | "TIMED_OUT"
  | "REJECTED"
  | "FAILED"
  | "UNKNOWN";

export interface ExecutionHistoryItem {
  id: string;

  timestamp: number;

  event: string;

  exchange: string;

  market: string;

  side:
    | "buy"
    | "sell"
    | "unknown";

  orderId:
    | string
    | null;

  clientOrderId:
    | string
    | null;

  status:
    ExecutionHistoryStatus;

  requestedQuantity: number;

  filledQuantity: number;

  remainingQuantity: number;

  requestedPrice:
    | number
    | null;

  averageFillPrice: number;

  feeAmount: number;

  executionTimeMs: number;

  cancelled: boolean;

  timedOut: boolean;

  success: boolean;

  failureReason:
    | string
    | null;

  message:
    | string
    | null;
}

export interface ExecutionHistoryReport {
  timestamp: number;

  total: number;

  executions:
    ExecutionHistoryItem[];
}

interface AuditEntry {
  id?: unknown;

  event?: unknown;

  timestamp?: unknown;

  exchange?: unknown;

  market?: unknown;

  side?: unknown;

  orderId?: unknown;

  clientOrderId?: unknown;

  result?: unknown;

  message?: unknown;
}

const DEFAULT_HISTORY_LIMIT =
  20;

const MAXIMUM_HISTORY_LIMIT =
  100;

const TERMINAL_EVENTS =
  new Set([
    "EXECUTION_COMPLETED",
    "EXECUTION_FAILED",
    "ORDER_CANCELLED",
  ]);

export class ExecutionHistoryService {
  private readonly auditFilePath =
    resolve(
      process.cwd(),
      "logs",
      "live-execution-audit.jsonl",
    );

  async getRecent(
    requestedLimit =
      DEFAULT_HISTORY_LIMIT,
  ): Promise<ExecutionHistoryReport> {
    const limit =
      this.normalizeLimit(
        requestedLimit,
      );

    const entries =
      await this.readAuditEntries();

    const executions =
      this.createExecutionHistory(
        entries,
        limit,
      );

    return {
      timestamp:
        Date.now(),

      total:
        executions.length,

      executions,
    };
  }

  private async readAuditEntries():
  Promise<AuditEntry[]> {
    let content: string;

    try {
      content =
        await readFile(
          this.auditFilePath,
          "utf8",
        );
    } catch (
      error: unknown
    ) {
      if (
        this.isNodeError(
          error,
        ) &&
        error.code === "ENOENT"
      ) {
        return [];
      }

      throw new Error(
        error instanceof Error
          ? `Unable to read execution audit history: ${error.message}`
          : "Unable to read execution audit history.",
      );
    }

    const entries:
      AuditEntry[] = [];

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
          this.isRecord(
            parsed,
          )
        ) {
          entries.push(
            parsed,
          );
        }
      } catch {
        /*
         * One malformed audit line should not break
         * the complete monitoring endpoint.
         */
      }
    }

    return entries;
  }

  private createExecutionHistory(
    entries: AuditEntry[],
    limit: number,
  ): ExecutionHistoryItem[] {
    const terminalEntries =
      entries.filter(
        (entry) =>
          TERMINAL_EVENTS.has(
            this.toUpperCaseString(
              entry.event,
            ),
          ),
      );

    const sourceEntries =
      terminalEntries.length > 0
        ? terminalEntries
        : entries;

    const seenOrders =
      new Set<string>();

    const executions:
      ExecutionHistoryItem[] = [];

    const sorted =
      [...sourceEntries].sort(
        (
          first,
          second,
        ) =>
          this.toTimestamp(
            second.timestamp,
          ) -
          this.toTimestamp(
            first.timestamp,
          ),
      );

    for (
      const entry
      of sorted
    ) {
      const mapped =
        this.mapAuditEntry(
          entry,
        );

      const deduplicationKey =
        mapped.orderId ??
        mapped.clientOrderId ??
        mapped.id;

      if (
        seenOrders.has(
          deduplicationKey,
        )
      ) {
        continue;
      }

      seenOrders.add(
        deduplicationKey,
      );

      executions.push(
        mapped,
      );

      if (
        executions.length >=
        limit
      ) {
        break;
      }
    }

    return executions;
  }

  private mapAuditEntry(
    entry: AuditEntry,
  ): ExecutionHistoryItem {
    const result =
      this.isRecord(
        entry.result,
      )
        ? entry.result
        : {};

    const event =
      this.toUpperCaseString(
        entry.event,
      ) ||
      "UNKNOWN";

    const status =
      this.resolveStatus(
        event,
        result.status,
        result.timedOut,
      );

    const timestamp =
      this.toTimestamp(
        entry.timestamp,
      );

    const orderId =
      this.toOptionalString(
        result.orderId ??
        entry.orderId,
      );

    const clientOrderId =
      this.toOptionalString(
        result.clientOrderId ??
        entry.clientOrderId,
      );

    const cancelled =
      result.cancelled === true ||
      status ===
        "CANCELLED";

    const timedOut =
      result.timedOut === true ||
      status ===
        "TIMED_OUT";

    return {
      id:
        this.toOptionalString(
          entry.id,
        ) ??
        `${event}-${timestamp}-${orderId ?? clientOrderId ?? "unknown"}`,

      timestamp,

      event,

      exchange:
        this.toLowerCaseString(
          result.exchange ??
          entry.exchange,
        ) ||
        "unknown",

      market:
        this.toUpperCaseString(
          result.market ??
          entry.market,
        ) ||
        "UNKNOWN",

      side:
        this.normalizeSide(
          result.side ??
          entry.side,
        ),

      orderId,

      clientOrderId,

      status,

      requestedQuantity:
        this.toNonNegativeNumber(
          result.requestedQuantity,
        ),

      filledQuantity:
        this.toNonNegativeNumber(
          result.filledQuantity,
        ),

      remainingQuantity:
        this.toNonNegativeNumber(
          result.remainingQuantity,
        ),

      requestedPrice:
        this.toOptionalNumber(
          result.requestedPrice,
        ),

      averageFillPrice:
        this.toNonNegativeNumber(
          result.averageFillPrice,
        ),

      feeAmount:
        this.toNonNegativeNumber(
          result.feeAmount,
        ),

      executionTimeMs:
        this.toNonNegativeNumber(
          result.executionTimeMs,
        ),

      cancelled,

      timedOut,

      success:
        result.success ===
        true,

      failureReason:
        this.toOptionalString(
          result.failureReason,
        ),

      message:
        this.toOptionalString(
          entry.message,
        ),
    };
  }

  private resolveStatus(
    event: string,
    rawStatus: unknown,
    rawTimedOut: unknown,
  ): ExecutionHistoryStatus {
    if (
      rawTimedOut === true
    ) {
      return "TIMED_OUT";
    }

    const status =
      this.toUpperCaseString(
        rawStatus,
      );

    switch (status) {
      case "PENDING":
      case "OPEN":
      case "PARTIALLY_FILLED":
      case "FILLED":
      case "CANCELLED":
      case "TIMED_OUT":
      case "REJECTED":
      case "FAILED":
        return status;

      default:
        break;
    }

    if (
      event ===
      "ORDER_CANCELLED"
    ) {
      return "CANCELLED";
    }

    if (
      event ===
      "EXECUTION_FAILED"
    ) {
      return "FAILED";
    }

    return "UNKNOWN";
  }

  private normalizeSide(
    value: unknown,
  ):
    | "buy"
    | "sell"
    | "unknown" {
    const normalized =
      this.toLowerCaseString(
        value,
      );

    if (
      normalized === "buy" ||
      normalized === "sell"
    ) {
      return normalized;
    }

    return "unknown";
  }

  private normalizeLimit(
    value: number,
  ): number {
    if (
      !Number.isFinite(value)
    ) {
      return DEFAULT_HISTORY_LIMIT;
    }

    return Math.max(
      1,
      Math.min(
        Math.floor(value),
        MAXIMUM_HISTORY_LIMIT,
      ),
    );
  }

  private toTimestamp(
    value: unknown,
  ): number {
    const numberValue =
      Number(value);

    return (
      Number.isSafeInteger(
        numberValue,
      ) &&
      numberValue >= 0
    )
      ? numberValue
      : 0;
  }

  private toNonNegativeNumber(
    value: unknown,
  ): number {
    const numberValue =
      Number(
        value ??
        0,
      );

    return (
      Number.isFinite(
        numberValue,
      ) &&
      numberValue >= 0
    )
      ? numberValue
      : 0;
  }

  private toOptionalNumber(
    value: unknown,
  ): number | null {
    if (
      value === null ||
      value === undefined
    ) {
      return null;
    }

    const numberValue =
      Number(value);

    return Number.isFinite(
      numberValue,
    )
      ? numberValue
      : null;
  }

  private toOptionalString(
    value: unknown,
  ): string | null {
    if (
      typeof value !==
      "string"
    ) {
      if (
        typeof value ===
          "number" &&
        Number.isFinite(value)
      ) {
        return String(value);
      }

      return null;
    }

    const normalized =
      value.trim();

    return normalized
      ? normalized
      : null;
  }

  private toUpperCaseString(
    value: unknown,
  ): string {
    return (
      this.toOptionalString(
        value,
      )
        ?.toUpperCase() ??
      ""
    );
  }

  private toLowerCaseString(
    value: unknown,
  ): string {
    return (
      this.toOptionalString(
        value,
      )
        ?.toLowerCase() ??
      ""
    );
  }

  private isRecord(
    value: unknown,
  ): value is Record<
    string,
    unknown
  > {
    return (
      typeof value ===
        "object" &&
      value !== null &&
      !Array.isArray(value)
    );
  }

  private isNodeError(
    value: unknown,
  ): value is NodeJS.ErrnoException {
    return (
      value instanceof Error &&
      "code" in value
    );
  }
}

export const executionHistoryService =
  new ExecutionHistoryService();