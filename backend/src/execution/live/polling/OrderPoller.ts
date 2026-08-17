import {
  executionAuditLogger,
} from "../audit/ExecutionAuditLogger";

import type {
  LiveExecutionAdapter,
} from "../contracts/LiveExecutionAdapter";

import type {
  LiveExecutionRequest,
} from "../models/LiveExecutionRequest";

import type {
  LiveExecutionResult,
} from "../models/LiveExecutionResult";

export interface OrderPollingOptions {
  timeoutMs: number;

  pollingIntervalMs: number;

  cancelOnTimeout: boolean;
}

export class OrderPoller {
  async waitForFinalState(
    adapter: LiveExecutionAdapter,
    initialResult: LiveExecutionResult,
    options: OrderPollingOptions,
  ): Promise<LiveExecutionResult> {
    this.validateOptions(options);

    const auditRequest =
      this.createAuditRequest(
        initialResult,
        options,
      );

    if (!initialResult.orderId) {
      const failedResult:
        LiveExecutionResult = {
        ...initialResult,

        success: false,

        status: "FAILED",

        failureReason:
          "Cannot monitor live order because order ID is missing.",

        reasons: [
          ...initialResult.reasons,
          "Order polling was not started because order ID is missing.",
        ],
      };

      await this.safeAudit(() =>
        executionAuditLogger.executionFailed(
          auditRequest,
          failedResult.failureReason ??
            "Order polling failed.",
          failedResult,
        ),
      );

      return failedResult;
    }

    if (
      this.isFinalStatus(
        initialResult.status,
      )
    ) {
      await this.safeAudit(() =>
        executionAuditLogger.executionCompleted(
          auditRequest,
          initialResult,
        ),
      );

      return initialResult;
    }

    const monitoringStartedAt =
      Date.now();

    let latestResult =
      initialResult;

    while (
      Date.now() -
        monitoringStartedAt <
      options.timeoutMs
    ) {
      await this.sleep(
        options.pollingIntervalMs,
      );

       latestResult =
  await adapter.getOrderStatus(
    initialResult.orderId,
    initialResult.market,
    initialResult.product,
  );

      await this.safeAudit(() =>
        executionAuditLogger.orderStatusUpdated(
          latestResult,
        ),
      );

      if (
        this.isFinalStatus(
          latestResult.status,
        )
      ) {
        await this.safeAudit(() =>
          executionAuditLogger.executionCompleted(
            auditRequest,
            latestResult,
          ),
        );

        return latestResult;
      }
    }

    if (
      options.cancelOnTimeout &&
      this.isCancellableStatus(
        latestResult.status,
      )
    ) {
      try {
         const cancelledResult =
  await adapter.cancelOrder(
    initialResult.orderId,
    initialResult.market,
    initialResult.product,
  );
        const timedOutResult:
          LiveExecutionResult = {
          ...cancelledResult,

          success: false,

          cancelled: true,

          timedOut: true,

          failureReason:
            "Order timed out and was cancelled.",

          reasons: [
            ...cancelledResult.reasons,
            "Order did not reach a final filled state before timeout.",
            "Cancellation was requested automatically.",
          ],
        };

        await this.safeAudit(() =>
          executionAuditLogger.orderCancelled(
            timedOutResult,
          ),
        );

        await this.safeAudit(() =>
          executionAuditLogger.executionCompleted(
            auditRequest,
            timedOutResult,
          ),
        );

        return timedOutResult;
      } catch (error: unknown) {
        const completedAt =
          Date.now();

        const failedResult:
          LiveExecutionResult = {
          ...latestResult,

          success: false,

          status: "TIMED_OUT",

          timedOut: true,

          completedAt,

          executionTimeMs:
            completedAt -
            initialResult.startedAt,

          failureReason:
            error instanceof Error
              ? `Order timed out and automatic cancellation failed: ${error.message}`
              : "Order timed out and automatic cancellation failed.",

          reasons: [
            ...latestResult.reasons,
            "Order did not reach a final state before timeout.",
            "Automatic cancellation failed.",
          ],
        };

        await this.safeAudit(() =>
          executionAuditLogger.executionFailed(
            auditRequest,
            failedResult.failureReason ??
              "Automatic cancellation failed.",
            failedResult,
          ),
        );

        return failedResult;
      }
    }

    const completedAt =
      Date.now();

    const timedOutResult:
      LiveExecutionResult = {
      ...latestResult,

      success: false,

      status: "TIMED_OUT",

      timedOut: true,

      completedAt,

      executionTimeMs:
        completedAt -
        initialResult.startedAt,

      failureReason:
        "Order did not reach a final state before timeout.",

      reasons: [
        ...latestResult.reasons,

        options.cancelOnTimeout
          ? "Order could not be cancelled because its latest status was not cancellable."
          : "Automatic cancellation on timeout was disabled.",
      ],
    };

    await this.safeAudit(() =>
      executionAuditLogger.executionFailed(
        auditRequest,
        timedOutResult.failureReason ??
          "Order polling timed out.",
        timedOutResult,
      ),
    );

    return timedOutResult;
  }

  private createAuditRequest(
    result: LiveExecutionResult,
    options: OrderPollingOptions,
  ): LiveExecutionRequest {
    return {
      exchange:
        result.exchange,

      ...(result.product
        ? {product: result.product}
        : {}),

      ...(result.reduceOnly !== undefined
        ? {reduceOnly: result.reduceOnly}
        : {}),

      ...(result.positionMode
        ? {positionMode: result.positionMode}
        : {}),

      ...(result.positionSide
        ? {positionSide: result.positionSide}
        : {}),

      market:
        result.market,

      side:
        result.side,

      orderType:
        result.requestedPrice === null
          ? "market"
          : "limit",

      quantity:
        result.requestedQuantity,

      ...(result.requestedPrice !==
      null
        ? {
            price:
              result.requestedPrice,
          }
        : {}),

      ...(result.clientOrderId
        ? {
            clientOrderId:
              result.clientOrderId,
          }
        : {}),

      timeoutMs:
        options.timeoutMs,

      pollingIntervalMs:
        options.pollingIntervalMs,

      cancelOnTimeout:
        options.cancelOnTimeout,
    };
  }

  private isFinalStatus(
    status:
      LiveExecutionResult["status"],
  ): boolean {
    return (
      status === "FILLED" ||
      status === "CANCELLED" ||
      status === "REJECTED" ||
      status === "FAILED"
    );
  }

  private isCancellableStatus(
    status:
      LiveExecutionResult["status"],
  ): boolean {
    return (
      status === "PENDING" ||
      status === "OPEN" ||
      status ===
        "PARTIALLY_FILLED"
    );
  }

  private validateOptions(
    options: OrderPollingOptions,
  ): void {
    if (
      !Number.isFinite(
        options.timeoutMs,
      ) ||
      options.timeoutMs <= 0
    ) {
      throw new Error(
        "Order polling timeout must be a positive finite number.",
      );
    }

    if (
      !Number.isFinite(
        options.pollingIntervalMs,
      ) ||
      options.pollingIntervalMs <= 0
    ) {
      throw new Error(
        "Order polling interval must be a positive finite number.",
      );
    }

    if (
      options.pollingIntervalMs >
      options.timeoutMs
    ) {
      throw new Error(
        "Order polling interval cannot exceed timeout.",
      );
    }
  }

  private async safeAudit(
    action: () => Promise<void>,
  ): Promise<void> {
    try {
      await action();
    } catch (error: unknown) {
      console.error(
        "[ExecutionAuditLogger]",
        error instanceof Error
          ? error.message
          : error,
      );
    }
  }

  private sleep(
    milliseconds: number,
  ): Promise<void> {
    return new Promise(
      (resolve) => {
        setTimeout(
          resolve,
          milliseconds,
        );
      },
    );
  }
}

export const orderPoller =
  new OrderPoller();
