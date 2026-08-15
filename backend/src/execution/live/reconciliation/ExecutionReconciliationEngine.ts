import {
  randomUUID,
} from "node:crypto";

import {
  liveExecutionService,
} from "../LiveExecutionService";

import {
  orderLifecycleManager,
} from "../lifecycle/OrderLifecycleManager";

import type {
  OrderLifecycleRecord,
  OrderLifecycleStatus,
} from "../lifecycle/OrderLifecycleRecord";

import type {
  LiveExecutionResult,
  LiveExecutionStatus,
} from "../models/LiveExecutionResult";

import type {
  ExecutionReconciliationDiagnostics,
  ExecutionReconciliationRecord,
  ReconciliationSeverity,
  ReconciliationStatus,
} from "./ExecutionReconciliationRecord";

export class ExecutionReconciliationEngine {
  private static readonly SCAN_INTERVAL_MS =
    5_000;

  private static readonly MAXIMUM_RECORDS =
    500;

  private readonly records =
    new Map<
      string,
      ExecutionReconciliationRecord
    >();

  private timer:
    ReturnType<typeof setInterval> |
    null =
    null;

  private scanInProgress =
    false;

  private lastScanAt:
    number | null =
    null;

  private scans =
    0;

  private ordersChecked =
    0;

  start(): void {
    if (
      this.timer !==
      null
    ) {
      return;
    }

    this.timer =
      setInterval(
        () => {
          void this.scan();
        },
        ExecutionReconciliationEngine
          .SCAN_INTERVAL_MS,
      );

    this.timer.unref?.();

    console.log(
      "[Reconciliation] Exchange reconciliation engine started.",
    );
  }

  stop(): void {
    if (
      this.timer ===
      null
    ) {
      return;
    }

    clearInterval(
      this.timer,
    );

    this.timer =
      null;

    console.log(
      "[Reconciliation] Exchange reconciliation engine stopped.",
    );
  }

  async scan():
    Promise<number> {
    if (
      this.scanInProgress
    ) {
      return 0;
    }

    this.scanInProgress =
      true;

    this.scans +=
      1;

    this.lastScanAt =
      Date.now();

    let checked =
      0;

    try {
      const orders =
        orderLifecycleManager
          .getDiagnostics()
          .orders;

      for (
        const order
        of orders
      ) {
        await this.reconcileOrder(
          order.id,
        );

        checked +=
          1;
      }
    } finally {
      this.scanInProgress =
        false;
    }

    return checked;
  }

  async reconcileOrder(
    orderLifecycleId:
      string,
  ): Promise<ExecutionReconciliationRecord> {
    const order =
      orderLifecycleManager
        .getOrder(
          orderLifecycleId,
        );

    if (
      !order
    ) {
      throw new Error(
        "Order lifecycle record not found.",
      );
    }

    this.ordersChecked +=
      1;

    if (
      !order.exchangeOrderId
    ) {
      const record =
        this.createLocalOnlyRecord(
          order,
        );

      this.store(
        record,
      );

      return structuredClone(
        record,
      );
    }

    if (
      !liveExecutionService
        .hasAdapter(
          order.exchange,
        )
    ) {
      const record =
        this.createUnavailableRecord(
          order,
          "No live execution adapter is registered for this exchange.",
        );

      this.store(
        record,
      );

      return structuredClone(
        record,
      );
    }

    if (
      !liveExecutionService
        .isExchangeConnected(
          order.exchange,
        )
    ) {
      const record =
        this.createUnavailableRecord(
          order,
          "Live execution adapter is currently disconnected.",
        );

      this.store(
        record,
      );

      return structuredClone(
        record,
      );
    }

    try {
      const adapter =
        liveExecutionService
          .getAdapter(
            order.exchange,
          );

      const remote =
        await adapter
          .getOrderStatus(
            order.exchangeOrderId,
            order.market,
          );

      const record =
        this.compare(
          order,
          remote,
        );

      this.store(
        record,
      );

      return structuredClone(
        record,
      );
    } catch (
      error:
        unknown
    ) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown remote order reconciliation error.";

      const record =
        this.createErrorRecord(
          order,
          message,
        );

      this.store(
        record,
      );

      return structuredClone(
        record,
      );
    }
  }

  /*
   * Version 14.6
   *
   * Same reconciliation comparison logic,
   * but against a synthetic remote snapshot.
   *
   * No exchange API is called.
   */
  reconcileSynthetic(
    orderLifecycleId:
      string,

    syntheticRemote:
      LiveExecutionResult,
  ): ExecutionReconciliationRecord {
    const order =
      orderLifecycleManager
        .getOrder(
          orderLifecycleId,
        );

    if (
      !order
    ) {
      throw new Error(
        "Order lifecycle record not found.",
      );
    }

    this.ordersChecked +=
      1;

    const record =
      this.compare(
        order,
        syntheticRemote,
      );

    this.store(
      record,
    );

    return structuredClone(
      record,
    );
  }

  getRecord(
    orderLifecycleId:
      string,
  ): ExecutionReconciliationRecord | null {
    const record =
      this.records.get(
        orderLifecycleId,
      );

    return record
      ? structuredClone(
          record,
        )
      : null;
  }

  getBySession(
    sessionId:
      string,
  ): ExecutionReconciliationRecord[] {
    return Array.from(
      this.records.values(),
    )
      .filter(
        (
          record,
        ) =>
          record.sessionId ===
          sessionId,
      )
      .sort(
        (
          first,
          second,
        ) =>
          second.checkedAt -
          first.checkedAt,
      )
      .map(
        (
          record,
        ) =>
          structuredClone(
            record,
          ),
      );
  }

  getDiagnostics():
    ExecutionReconciliationDiagnostics {
    const records =
      Array.from(
        this.records.values(),
      )
        .sort(
          (
            first,
            second,
          ) =>
            second.checkedAt -
            first.checkedAt,
        );

    return {
      generatedAt:
        Date.now(),

      running:
        this.timer !==
        null,

      scanIntervalMs:
        ExecutionReconciliationEngine
          .SCAN_INTERVAL_MS,

      scanInProgress:
        this.scanInProgress,

      lastScanAt:
        this.lastScanAt,

      scans:
        this.scans,

      ordersChecked:
        this.ordersChecked,

      matched:
        this.countStatus(
          records,
          "MATCHED",
        ),

      drifted:
        this.countStatus(
          records,
          "DRIFT",
        ),

      notSubmitted:
        this.countStatus(
          records,
          "NOT_SUBMITTED",
        ),

      remoteUnavailable:
        this.countStatus(
          records,
          "REMOTE_UNAVAILABLE",
        ),

      errors:
        this.countStatus(
          records,
          "ERROR",
        ),

      criticalMismatches:
        records.filter(
          (
            record,
          ) =>
            record.severity ===
            "CRITICAL",
        ).length,

      warningMismatches:
        records.filter(
          (
            record,
          ) =>
            record.severity ===
            "WARNING",
        ).length,

      orphanScanSupported:
        false,

      orphanScanReason:
        "Current live execution adapter contract does not expose listOpenOrders(). Version 14.4 reconciles known internal lifecycle orders only.",

      records:
        records.map(
          (
            record,
          ) =>
            structuredClone(
              record,
            ),
        ),
    };
  }

  private compare(
    order:
      OrderLifecycleRecord,

    remote:
      LiveExecutionResult,
  ): ExecutionReconciliationRecord {
    const reasons:
      string[] =
      [];

    const expectedRemoteStatus =
      this.mapInternalStatus(
        order.status,
      );

    const statusMismatch =
      expectedRemoteStatus !==
        null &&
      expectedRemoteStatus !==
        remote.status;

    const requestedQuantityDifference =
      this.difference(
        order.requestedQuantity,
        remote.requestedQuantity,
      );

    const filledQuantityDifference =
      this.difference(
        order.filledQuantity,
        remote.filledQuantity,
      );

    const remainingQuantityDifference =
      this.difference(
        order.remainingQuantity,
        remote.remainingQuantity,
      );

    const averageFillPriceDifference =
      this.difference(
        order.averageFillPrice,
        remote.averageFillPrice,
      );

    const feeDifference =
      this.difference(
        order.feeAmount,
        remote.feeAmount,
      );

    const quantityTolerance =
      this.quantityTolerance(
        order.requestedQuantity,
      );

    if (
      statusMismatch
    ) {
      reasons.push(
        `Internal lifecycle status ${order.status} does not match remote status ${remote.status}.`,
      );
    }

    if (
      requestedQuantityDifference >
      quantityTolerance
    ) {
      reasons.push(
        "Requested quantity differs between internal and remote state.",
      );
    }

    if (
      filledQuantityDifference >
      quantityTolerance
    ) {
      reasons.push(
        "Filled quantity differs between internal and remote state.",
      );
    }

    if (
      remainingQuantityDifference >
      quantityTolerance
    ) {
      reasons.push(
        "Remaining quantity differs between internal and remote state.",
      );
    }

    const priceTolerance =
      this.priceTolerance(
        Math.max(
          order.averageFillPrice,
          remote.averageFillPrice,
          order.requestedPrice ??
            0,
        ),
      );

    if (
      order.filledQuantity >
        0 &&
      remote.filledQuantity >
        0 &&
      averageFillPriceDifference >
        priceTolerance
    ) {
      reasons.push(
        "Average fill price differs between internal and remote state.",
      );
    }

    const feeTolerance =
      Math.max(
        1e-10,
        Math.max(
          order.feeAmount,
          remote.feeAmount,
        ) *
          1e-6,
      );

    if (
      feeDifference >
      feeTolerance
    ) {
      reasons.push(
        "Fee amount differs between internal and remote state.",
      );
    }

    if (
      remote.exchange
        .trim()
        .toLowerCase() !==
      order.exchange
    ) {
      reasons.push(
        "Remote exchange identity does not match lifecycle exchange.",
      );
    }

    if (
      remote.market
        .trim()
        .toUpperCase() !==
      order.market
    ) {
      reasons.push(
        "Remote market identity does not match lifecycle market.",
      );
    }

    if (
      remote.side !==
      order.side
    ) {
      reasons.push(
        "Remote order side does not match lifecycle side.",
      );
    }

    const status:
      ReconciliationStatus =
      reasons.length ===
      0
        ? "MATCHED"
        : "DRIFT";

    const severity =
      status ===
      "MATCHED"
        ? "INFO"
        : this.determineSeverity(
            order.status,
            remote.status,
            filledQuantityDifference,
            quantityTolerance,
          );

    return {
      id:
        randomUUID(),

      orderLifecycleId:
        order.id,

      sessionId:
        order.sessionId,

      planId:
        order.planId,

      exchange:
        order.exchange,

      market:
        order.market,

      side:
        order.side,

      exchangeOrderId:
        order.exchangeOrderId,

      status,

      severity,

      internal: {
        status:
          order.status,

        requestedQuantity:
          order.requestedQuantity,

        filledQuantity:
          order.filledQuantity,

        remainingQuantity:
          order.remainingQuantity,

        averageFillPrice:
          order.averageFillPrice,

        feeAmount:
          order.feeAmount,
      },

      remote: {
        available:
          true,

        status:
          remote.status,

        requestedQuantity:
          remote.requestedQuantity,

        filledQuantity:
          remote.filledQuantity,

        remainingQuantity:
          remote.remainingQuantity,

        averageFillPrice:
          remote.averageFillPrice,

        feeAmount:
          remote.feeAmount,
      },

      drift: {
        statusMismatch,

        requestedQuantityDifference,

        filledQuantityDifference,

        remainingQuantityDifference,

        averageFillPriceDifference,

        feeDifference,
      },

      reasons,

      checkedAt:
        Date.now(),
    };
  }

  private createLocalOnlyRecord(
    order:
      OrderLifecycleRecord,
  ): ExecutionReconciliationRecord {
    const expectedNoRemoteOrder =
      order.status ===
        "PREPARED" ||
      order.status ===
        "ABORTED";

    const reasons =
      expectedNoRemoteOrder
        ? [
            "Lifecycle has no exchange order ID because no remote order has been submitted.",
          ]
        : [
            `Lifecycle status ${order.status} has no exchange order ID. Remote reconciliation cannot be performed.`,
          ];

    return {
      id:
        randomUUID(),

      orderLifecycleId:
        order.id,

      sessionId:
        order.sessionId,

      planId:
        order.planId,

      exchange:
        order.exchange,

      market:
        order.market,

      side:
        order.side,

      exchangeOrderId:
        null,

      status:
        expectedNoRemoteOrder
          ? "NOT_SUBMITTED"
          : "DRIFT",

      severity:
        expectedNoRemoteOrder
          ? "INFO"
          : "CRITICAL",

      internal: {
        status:
          order.status,

        requestedQuantity:
          order.requestedQuantity,

        filledQuantity:
          order.filledQuantity,

        remainingQuantity:
          order.remainingQuantity,

        averageFillPrice:
          order.averageFillPrice,

        feeAmount:
          order.feeAmount,
      },

      remote: {
        available:
          false,

        status:
          null,

        requestedQuantity:
          null,

        filledQuantity:
          null,

        remainingQuantity:
          null,

        averageFillPrice:
          null,

        feeAmount:
          null,
      },

      drift:
        this.emptyDrift(),

      reasons,

      checkedAt:
        Date.now(),
    };
  }

  private createUnavailableRecord(
    order:
      OrderLifecycleRecord,

    reason:
      string,
  ): ExecutionReconciliationRecord {
    return {
      id:
        randomUUID(),

      orderLifecycleId:
        order.id,

      sessionId:
        order.sessionId,

      planId:
        order.planId,

      exchange:
        order.exchange,

      market:
        order.market,

      side:
        order.side,

      exchangeOrderId:
        order.exchangeOrderId,

      status:
        "REMOTE_UNAVAILABLE",

      severity:
        "WARNING",

      internal: {
        status:
          order.status,

        requestedQuantity:
          order.requestedQuantity,

        filledQuantity:
          order.filledQuantity,

        remainingQuantity:
          order.remainingQuantity,

        averageFillPrice:
          order.averageFillPrice,

        feeAmount:
          order.feeAmount,
      },

      remote: {
        available:
          false,

        status:
          null,

        requestedQuantity:
          null,

        filledQuantity:
          null,

        remainingQuantity:
          null,

        averageFillPrice:
          null,

        feeAmount:
          null,
      },

      drift:
        this.emptyDrift(),

      reasons: [
        reason,
      ],

      checkedAt:
        Date.now(),
    };
  }

  private createErrorRecord(
    order:
      OrderLifecycleRecord,

    reason:
      string,
  ): ExecutionReconciliationRecord {
    return {
      ...this.createUnavailableRecord(
        order,
        reason,
      ),

      id:
        randomUUID(),

      status:
        "ERROR",

      severity:
        "WARNING",

      checkedAt:
        Date.now(),
    };
  }

  private determineSeverity(
    internalStatus:
      OrderLifecycleStatus,

    remoteStatus:
      LiveExecutionStatus,

    filledQuantityDifference:
      number,

    tolerance:
      number,
  ): ReconciliationSeverity {
    const internalTerminal =
      this.isInternalTerminal(
        internalStatus,
      );

    const remoteTerminal =
      this.isRemoteTerminal(
        remoteStatus,
      );

    if (
      internalTerminal !==
      remoteTerminal
    ) {
      return "CRITICAL";
    }

    if (
      filledQuantityDifference >
      tolerance
    ) {
      return "CRITICAL";
    }

    return "WARNING";
  }

  private mapInternalStatus(
    status:
      OrderLifecycleStatus,
  ): LiveExecutionStatus | null {
    switch (
      status
    ) {
      case "PREPARED":
      case "SUBMISSION_REQUESTED":
      case "ABORTED":
        return null;

      case "ACKNOWLEDGED":
        return "PENDING";

      case "OPEN":
        return "OPEN";

      case "PARTIALLY_FILLED":
        return "PARTIALLY_FILLED";

      case "FILLED":
        return "FILLED";

      case "CANCELLED":
        return "CANCELLED";

      case "REJECTED":
        return "REJECTED";

      case "TIMED_OUT":
        return "TIMED_OUT";

      case "FAILED":
        return "FAILED";
    }
  }

  private isInternalTerminal(
    status:
      OrderLifecycleStatus,
  ): boolean {
    return (
      status ===
        "FILLED" ||
      status ===
        "CANCELLED" ||
      status ===
        "REJECTED" ||
      status ===
        "TIMED_OUT" ||
      status ===
        "FAILED" ||
      status ===
        "ABORTED"
    );
  }

  private isRemoteTerminal(
    status:
      LiveExecutionStatus,
  ): boolean {
    return (
      status ===
        "FILLED" ||
      status ===
        "CANCELLED" ||
      status ===
        "REJECTED" ||
      status ===
        "TIMED_OUT" ||
      status ===
        "FAILED"
    );
  }

  private difference(
    first:
      number,

    second:
      number,
  ): number {
    return Math.abs(
      first -
      second,
    );
  }

  private quantityTolerance(
    quantity:
      number,
  ): number {
    return Math.max(
      1e-12,
      Math.abs(
        quantity,
      ) *
        1e-8,
    );
  }

  private priceTolerance(
    price:
      number,
  ): number {
    return Math.max(
      1e-10,
      Math.abs(
        price,
      ) *
        1e-8,
    );
  }

  private emptyDrift() {
    return {
      statusMismatch:
        false,

      requestedQuantityDifference:
        0,

      filledQuantityDifference:
        0,

      remainingQuantityDifference:
        0,

      averageFillPriceDifference:
        0,

      feeDifference:
        0,
    };
  }

  private store(
    record:
      ExecutionReconciliationRecord,
  ): void {
    this.records.set(
      record.orderLifecycleId,
      record,
    );

    this.trim();
  }

  private trim(): void {
    if (
      this.records.size <=
      ExecutionReconciliationEngine
        .MAXIMUM_RECORDS
    ) {
      return;
    }

    const ordered =
      Array.from(
        this.records.values(),
      )
        .sort(
          (
            first,
            second,
          ) =>
            first.checkedAt -
            second.checkedAt,
        );

    while (
      this.records.size >
        ExecutionReconciliationEngine
          .MAXIMUM_RECORDS &&
      ordered.length >
        0
    ) {
      const oldest =
        ordered.shift();

      if (
        oldest
      ) {
        this.records.delete(
          oldest.orderLifecycleId,
        );
      }
    }
  }

  private countStatus(
    records:
      readonly ExecutionReconciliationRecord[],

    status:
      ReconciliationStatus,
  ): number {
    return records.filter(
      (
        record,
      ) =>
        record.status ===
        status,
    ).length;
  }
}

export const executionReconciliationEngine =
  new ExecutionReconciliationEngine();