import {
  appendFile,
  mkdir,
} from "node:fs/promises";

import { dirname } from "node:path";

import type {
  LiveExecutionRequest,
} from "../models/LiveExecutionRequest";

import type {
  LiveExecutionResult,
} from "../models/LiveExecutionResult";

export type ExecutionAuditEvent =
  | "EXECUTION_STARTED"
  | "ORDER_CREATED"
  | "ORDER_STATUS_UPDATED"
  | "ORDER_CANCELLED"
  | "EXECUTION_COMPLETED"
  | "EXECUTION_FAILED";

export interface ExecutionAuditRecord {
  id: string;

  event: ExecutionAuditEvent;

  timestamp: number;

  exchange: string;

  market: string;

  side: "buy" | "sell";

  orderId: string | null;

  clientOrderId: string | null;

  request:
    | LiveExecutionRequest
    | null;

  result:
    | LiveExecutionResult
    | null;

  message: string | null;

  metadata:
    Record<string, unknown>;
}

export interface WriteExecutionAuditInput {
  event: ExecutionAuditEvent;

  request?:
    | LiveExecutionRequest
    | null;

  result?:
    | LiveExecutionResult
    | null;

  message?: string | null;

  metadata?:
    Record<string, unknown>;
}

export class ExecutionAuditLogger {
  private writeQueue:
    Promise<void> =
      Promise.resolve();

  constructor(
    private readonly filePath =
      "logs/live-execution-audit.jsonl",
  ) {}

  write(
    input: WriteExecutionAuditInput,
  ): Promise<void> {
    const record =
      this.createRecord(
        input,
      );

    /*
     * Serialise writes so concurrent executions cannot
     * corrupt the JSONL audit file.
     */
    this.writeQueue =
      this.writeQueue
        .catch(() => {
          /*
           * A previous write failure must not permanently
           * block future audit records.
           */
        })
        .then(() =>
          this.persist(
            record,
          ),
        );

    return this.writeQueue;
  }

  executionStarted(
    request: LiveExecutionRequest,
  ): Promise<void> {
    return this.write({
      event:
        "EXECUTION_STARTED",

      request,

      message:
        "Live execution started.",
    });
  }

  orderCreated(
    request: LiveExecutionRequest,
    result: LiveExecutionResult,
  ): Promise<void> {
    return this.write({
      event:
        "ORDER_CREATED",

      request,

      result,

      message:
        "Exchange order was created.",
    });
  }

  orderStatusUpdated(
    result: LiveExecutionResult,
  ): Promise<void> {
    return this.write({
      event:
        "ORDER_STATUS_UPDATED",

      result,

      message:
        `Order status changed to ${result.status}.`,
    });
  }

  orderCancelled(
    result: LiveExecutionResult,
  ): Promise<void> {
    return this.write({
      event:
        "ORDER_CANCELLED",

      result,

      message:
        "Order cancellation was confirmed.",
    });
  }

  executionCompleted(
    request: LiveExecutionRequest,
    result: LiveExecutionResult,
  ): Promise<void> {
    return this.write({
      event:
        "EXECUTION_COMPLETED",

      request,

      result,

      message:
        "Live execution reached a terminal state.",
    });
  }

  executionFailed(
    request: LiveExecutionRequest,
    message: string,
    result:
      | LiveExecutionResult
      | null = null,
  ): Promise<void> {
    return this.write({
      event:
        "EXECUTION_FAILED",

      request,

      result,

      message,
    });
  }

  private createRecord(
    input: WriteExecutionAuditInput,
  ): ExecutionAuditRecord {
    const request =
      input.request ??
      null;

    const result =
      input.result ??
      null;

    return {
      id:
        this.createAuditId(),

      event:
        input.event,

      timestamp:
        Date.now(),

      exchange:
        result?.exchange ??
        request?.exchange ??
        "unknown",

      market:
        result?.market ??
        request?.market ??
        "unknown",

      side:
        result?.side ??
        request?.side ??
        "buy",

      orderId:
        result?.orderId ??
        null,

      clientOrderId:
        result?.clientOrderId ??
        request?.clientOrderId ??
        null,

      request:
        request
          ? this.sanitizeRequest(
              request,
            )
          : null,

      result,

      message:
        input.message ??
        null,

      metadata:
        input.metadata ??
        {},
    };
  }

  private sanitizeRequest(
    request: LiveExecutionRequest,
  ): LiveExecutionRequest {
    /*
     * The request currently contains no credentials.
     * Keep this method as a permanent boundary so secrets
     * are never added to logs accidentally in the future.
     */
    return {
      exchange:
        request.exchange,

      market:
        request.market,

      side:
        request.side,

      orderType:
        request.orderType,

      quantity:
        request.quantity,

      ...(request.price !==
      undefined
        ? {
            price:
              request.price,
          }
        : {}),

      ...(request.clientOrderId
      ? {
          clientOrderId:
            request.clientOrderId,
        }
      : {}),

      ...(request.timeoutMs !==
      undefined
        ? {
            timeoutMs:
              request.timeoutMs,
          }
        : {}),

      ...(request.pollingIntervalMs !==
      undefined
        ? {
            pollingIntervalMs:
              request.pollingIntervalMs,
          }
        : {}),

      ...(request.cancelOnTimeout !==
      undefined
        ? {
            cancelOnTimeout:
              request.cancelOnTimeout,
          }
        : {}),
    };
  }

  private async persist(
    record: ExecutionAuditRecord,
  ): Promise<void> {
    await mkdir(
      dirname(
        this.filePath,
      ),
      {
        recursive: true,
      },
    );

    await appendFile(
      this.filePath,
      `${JSON.stringify(
        record,
      )}\n`,
      {
        encoding:
          "utf8",
      },
    );
  }

  private createAuditId(): string {
    return [
      "audit",
      Date.now(),
      Math.random()
        .toString(36)
        .slice(
          2,
          10,
        ),
    ].join("-");
  }
}

export const executionAuditLogger =
  new ExecutionAuditLogger();