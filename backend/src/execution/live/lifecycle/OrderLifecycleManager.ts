import {
  randomUUID,
} from "node:crypto";

import {
  liveExecutionCoordinator,
} from "../coordinator/LiveExecutionCoordinator";

import type {
  LiveExecutionSession,
} from "../coordinator/LiveExecutionSession";

import {
  orderLifecycleEvidenceService,
} from "./OrderLifecycleEvidenceService";

import type {
  LiveExecutionRequest,
} from "../models/LiveExecutionRequest";

import type {
  LiveExecutionResult,
  LiveExecutionStatus,
} from "../models/LiveExecutionResult";

import type {
  OrderLifecycleDiagnostics,
  OrderLifecycleEventType,
  OrderLifecycleLeg,
  OrderLifecycleRecord,
  OrderLifecycleStatus,
  PreparePaperRecoveryOrderLifecycleRequest,
  PrepareOrderLifecycleResult,
} from "./OrderLifecycleRecord";

const LIVE_ORDER_SUBMISSION_CONFIRMATION =
  "SUBMIT_CONFIRMED_LIVE_ORDER";

export class OrderLifecycleManager {
  private static readonly MAXIMUM_HISTORY =
    500;

  private readonly orders =
    new Map<
      string,
      OrderLifecycleRecord
    >();

  private readonly orderBySessionLeg =
    new Map<
      string,
      string
    >();

  private readonly recoveryOrderByIncident =
    new Map<
      string,
      string
    >();

  prepare(
    sessionId:
      string,

    leg:
      OrderLifecycleLeg,
  ): PrepareOrderLifecycleResult {
    const session =
      liveExecutionCoordinator
        .getSession(
          sessionId,
        );

    if (
      !session
    ) {
      return this.reject(
        "Live execution session not found.",
      );
    }

    if (
      session.status !==
        "READY_FOR_SUBMISSION" &&
      session.status !==
        "RUNNING"
    ) {
      return this.reject(
        `Order lifecycle cannot be prepared from session status ${session.status}.`,
      );
    }

    if (
      Date.now() >=
      session.expiresAt
    ) {
      return this.reject(
        "Live execution session has expired.",
      );
    }

    const key =
      this.createSessionLegKey(
        session.id,
        leg,
      );

    const existingId =
      this.orderBySessionLeg
        .get(
          key,
        );

    if (
      existingId
    ) {
      const existing =
        this.orders
          .get(
            existingId,
          );

      if (
        existing
      ) {
        return {
          approved:
            false,

          order:
            this.clone(
              existing,
            ),

          reasons: [
            `A ${leg} order lifecycle already exists for this live execution session.`,
          ],
        };
      }
    }

    const clientOrderId =
      this.createClientOrderId(
        session.id,
        leg,
      );

    const persistedDuplicate =
      orderLifecycleEvidenceService
        .findPotentialDuplicate(
          session.id,
          leg,
          clientOrderId,
        );

    if (
      persistedDuplicate
    ) {
      return {
        approved:
          false,

        order:
          null,

        reasons: [
          `Persistent duplicate-order guard blocked ${leg}: historical lifecycle ${persistedDuplicate.orderId} is ${persistedDuplicate.status}.`,

          `clientOrderId=${persistedDuplicate.clientOrderId ?? "unknown"}, exchangeOrderId=${persistedDuplicate.exchangeOrderId ?? "unknown"}.`,

          "No exchange order was submitted by this prepare request.",
        ],
      };
    }

    const request =
      this.createRequest(
        session,
        leg,
      );

    const now =
      Date.now();

    const order:
      OrderLifecycleRecord = {
      id:
        randomUUID(),

      sessionId:
        session.id,

      planId:
        session.planId,

      leg,

      purpose:
        "PRIMARY",

      recoveryIncidentId:
        null,

      exchange:
        request.exchange,

      market:
        request.market,

      side:
        request.side,

      status:
        "PREPARED",

      request,

      exchangeOrderId:
        null,

      clientOrderId:
        request.clientOrderId ??
        null,

      requestedQuantity:
        request.quantity,

      filledQuantity:
        0,

      remainingQuantity:
        request.quantity,

      requestedPrice:
        request.price ??
        null,

      averageFillPrice:
        0,

      feeAmount:
        0,

      createdAt:
        now,

      updatedAt:
        now,

      submittedAt:
        null,

      completedAt:
        null,

      failureReason:
        null,

      latestResult:
        null,

      events: [],
    };

    this.addEvent(
      order,

      "ORDER_PREPARED",

      `${leg} order lifecycle prepared. No exchange order has been submitted.`,

      {
        exchange:
          order.exchange,

        market:
          order.market,

        side:
          order.side,

        quantity:
          order.requestedQuantity,

        price:
          order.requestedPrice,
      },
    );

    this.orders.set(
      order.id,
      order,
    );

    this.orderBySessionLeg
      .set(
        key,
        order.id,
      );

    this.trimHistory();

    this.persistEvidence(
      order,
    );

    return {
      approved:
        true,

      order:
        this.clone(
          order,
        ),

      reasons: [
        `${leg} lifecycle prepared successfully.`,

        "No live exchange order was submitted by Version 14.1 preparation.",
      ],
    };
  }

  preparePaperRecovery(
    input:
      PreparePaperRecoveryOrderLifecycleRequest,
  ): PrepareOrderLifecycleResult {
    const session =
      liveExecutionCoordinator
        .getSession(
          input.sessionId,
        );

    if (
      !session
    ) {
      return this.reject(
        "PAPER recovery session not found.",
      );
    }

    if (
      !liveExecutionCoordinator
        .isPaperSession(
          session.id,
        )
    ) {
      return this.reject(
        "Recovery lifecycle preparation is restricted to PAPER sessions.",
      );
    }

    if (
      session.status !==
      "RUNNING"
    ) {
      return this.reject(
        `PAPER recovery lifecycle requires a RUNNING session. Current status: ${session.status}.`,
      );
    }

    if (
      Date.now() >=
      session.expiresAt
    ) {
      return this.reject(
        "PAPER recovery session has expired.",
      );
    }

    const recoveryIncidentId =
      input.recoveryIncidentId
        .trim();

    if (
      !recoveryIncidentId
    ) {
      return this.reject(
        "PAPER recovery incident ID is required.",
      );
    }

    const existingId =
      this.recoveryOrderByIncident
        .get(
          recoveryIncidentId,
        );

    if (
      existingId
    ) {
      const existing =
        this.orders.get(
          existingId,
        );

      return {
        approved:
          false,
        order:
          existing
            ? this.clone(
                existing,
              )
            : null,
        reasons: [
          "A PAPER recovery lifecycle already exists for this incident.",
        ],
      };
    }

    const exchange =
      input.exchange
        .trim()
        .toLowerCase();

    const market =
      input.market
        .trim()
        .toUpperCase();

    if (
      ![
        session.buyExchange,
        session.sellExchange,
      ].includes(
        exchange,
      ) ||
      market !==
      session.market
    ) {
      return this.reject(
        "PAPER recovery leg must use one of the original route exchanges and the exact original market.",
      );
    }

    if (
      !Number.isFinite(
        input.quantity,
      ) ||
      input.quantity <=
        0 ||
      !Number.isFinite(
        input.limitPrice,
      ) ||
      input.limitPrice <=
        0
    ) {
      return this.reject(
        "PAPER recovery quantity and limit price must be positive finite numbers.",
      );
    }

    const now =
      Date.now();

    const clientOrderId =
      this.createRecoveryClientOrderId(
        session.id,
        input.leg,
        recoveryIncidentId,
      );

    const request:
      LiveExecutionRequest = {
      exchange,
      market,
      side:
        input.leg ===
          "BUY"
          ? "buy"
          : "sell",
      orderType:
        "limit",
      quantity:
        input.quantity,
      price:
        input.limitPrice,
      clientOrderId,
      timeoutMs:
        Math.min(
          session.plan.timeoutMs,
          Math.max(
            1,
            session.expiresAt -
              now,
          ),
        ),
      pollingIntervalMs:
        1_000,
      cancelOnTimeout:
        true,
    };

    const order:
      OrderLifecycleRecord = {
      id:
        randomUUID(),
      sessionId:
        session.id,
      planId:
        session.planId,
      leg:
        input.leg,
      purpose:
        "RECOVERY",
      recoveryIncidentId,
      exchange,
      market,
      side:
        request.side,
      status:
        "PREPARED",
      request,
      exchangeOrderId:
        null,
      clientOrderId,
      requestedQuantity:
        input.quantity,
      filledQuantity:
        0,
      remainingQuantity:
        input.quantity,
      requestedPrice:
        input.limitPrice,
      averageFillPrice:
        0,
      feeAmount:
        0,
      createdAt:
        now,
      updatedAt:
        now,
      submittedAt:
        null,
      completedAt:
        null,
      failureReason:
        null,
      latestResult:
        null,
      events:
        [],
    };

    this.addEvent(
      order,
      "ORDER_PREPARED",
      "Bounded PAPER recovery lifecycle prepared. No exchange order was submitted.",
      {
        purpose:
          "RECOVERY",
        recoveryIncidentId,
        quantity:
          input.quantity,
        price:
          input.limitPrice,
      },
    );

    this.orders.set(
      order.id,
      order,
    );

    this.recoveryOrderByIncident
      .set(
        recoveryIncidentId,
        order.id,
      );

    this.trimHistory();
    this.persistEvidence(
      order,
    );

    return {
      approved:
        true,
      order:
        this.clone(
          order,
        ),
      reasons: [
        "Bounded PAPER recovery lifecycle prepared.",
        "No live exchange order was submitted.",
      ],
    };
  }

  markSubmissionRequested(
    orderId:
      string,
  ): OrderLifecycleRecord {
    const order =
      this.requireOrder(
        orderId,
      );

    if (
      order.status !==
        "PREPARED"
    ) {
      throw new Error(
        `Order submission cannot be requested from lifecycle status ${order.status}.`,
      );
    }

    if (
      !this.isLiveOrderSubmissionConfirmed()
    ) {
      throw new Error(
        "Live order submission is blocked because LIVE_ORDER_SUBMISSION_CONFIRMATION is not SUBMIT_CONFIRMED_LIVE_ORDER.",
      );
    }

    order.status =
      "SUBMISSION_REQUESTED";

    order.submittedAt =
      Date.now();

    this.addEvent(
      order,

      "SUBMISSION_REQUESTED",

      "Order lifecycle handed to the future live submission adapter boundary.",
    );

    this.persistEvidence(
      order,
    );

    return this.clone(
      order,
    );
  }

  applyExecutionResult(
    orderId:
      string,

    result:
      LiveExecutionResult,
  ): OrderLifecycleRecord {
    const order =
      this.requireOrder(
        orderId,
      );

    if (
      this.isTerminal(
        order.status,
      )
    ) {
      throw new Error(
        `Order lifecycle is already terminal: ${order.status}.`,
      );
    }

    this.validateResultIdentity(
      order,
      result,
    );

    order.exchangeOrderId =
      result.orderId;

    order.clientOrderId =
      result.clientOrderId ??
      order.clientOrderId;

    order.filledQuantity =
      result.filledQuantity;

    order.remainingQuantity =
      result.remainingQuantity;

    order.requestedPrice =
      result.requestedPrice;

    order.averageFillPrice =
      result.averageFillPrice;

    order.feeAmount =
      result.feeAmount;

    order.failureReason =
      result.failureReason;

    order.latestResult =
      structuredClone(
        result,
      );

    const mappedStatus =
      this.mapStatus(
        result.status,
      );

    order.status =
      mappedStatus;

    if (
      order.submittedAt ===
        null
    ) {
      order.submittedAt =
        result.startedAt;
    }

    if (
      this.isTerminal(
        mappedStatus,
      )
    ) {
      order.completedAt =
        result.completedAt;
    }

    this.addEvent(
      order,

      this.mapEventType(
        mappedStatus,
      ),

      this.createResultMessage(
        mappedStatus,
      ),

      {
        exchangeOrderId:
          result.orderId,

        filledQuantity:
          result.filledQuantity,

        remainingQuantity:
          result.remainingQuantity,

        averageFillPrice:
          result.averageFillPrice,

        feeAmount:
          result.feeAmount,

        failureReason:
          result.failureReason,
      },
    );

    this.persistEvidence(
      order,
    );

    return this.clone(
      order,
    );
  }

  abortPrepared(
    orderId:
      string,

    reason =
      "Prepared order lifecycle aborted before exchange submission.",
  ): OrderLifecycleRecord {
    const order =
      this.requireOrder(
        orderId,
      );

    if (
      order.status !==
        "PREPARED"
    ) {
      throw new Error(
        `Only PREPARED lifecycle records may be aborted. Current status: ${order.status}.`,
      );
    }

    order.status =
      "ABORTED";

    order.failureReason =
      reason;

    order.completedAt =
      Date.now();

    this.addEvent(
      order,
      "ORDER_ABORTED",
      reason,
    );

    this.persistEvidence(
      order,
    );

    return this.clone(
      order,
    );
  }

  getOrder(
    orderId:
      string,
  ): OrderLifecycleRecord | null {
    const order =
      this.orders.get(
        orderId,
      );

    return order
      ? this.clone(
          order,
        )
      : null;
  }

  getBySession(
    sessionId:
      string,
  ): OrderLifecycleRecord[] {
    return Array.from(
      this.orders.values(),
    )
      .filter(
        (
          order,
        ) =>
          order.sessionId ===
          sessionId,
      )
      .sort(
        (
          first,
          second,
        ) =>
          first.createdAt -
          second.createdAt,
      )
      .map(
        (
          order,
        ) =>
          this.clone(
            order,
          ),
      );
  }

  getDiagnostics():
    OrderLifecycleDiagnostics {
    const orders =
      Array.from(
        this.orders.values(),
      )
        .sort(
          (
            first,
            second,
          ) =>
            second.createdAt -
            first.createdAt,
        )
        .slice(
          0,
          OrderLifecycleManager
            .MAXIMUM_HISTORY,
        )
        .map(
          (
            order,
          ) =>
            this.clone(
              order,
            ),
        );

    return {
      generatedAt:
        Date.now(),

      liveOrderSubmissionConfirmed:
        this.isLiveOrderSubmissionConfirmed(),

      totalOrders:
        orders.length,

      prepared:
        this.count(
          orders,
          "PREPARED",
        ),

      submissionRequested:
        this.count(
          orders,
          "SUBMISSION_REQUESTED",
        ),

      acknowledged:
        this.count(
          orders,
          "ACKNOWLEDGED",
        ),

      open:
        this.count(
          orders,
          "OPEN",
        ),

      partiallyFilled:
        this.count(
          orders,
          "PARTIALLY_FILLED",
        ),

      filled:
        this.count(
          orders,
          "FILLED",
        ),

      cancelled:
        this.count(
          orders,
          "CANCELLED",
        ),

      rejected:
        this.count(
          orders,
          "REJECTED",
        ),

      timedOut:
        this.count(
          orders,
          "TIMED_OUT",
        ),

      failed:
        this.count(
          orders,
          "FAILED",
        ),

      aborted:
        this.count(
          orders,
          "ABORTED",
        ),

      orders,
    };
  }

  private createRequest(
    session:
      LiveExecutionSession,

    leg:
      OrderLifecycleLeg,
  ): LiveExecutionRequest {
    const executionLeg =
      leg ===
      "BUY"
        ? session.plan.buy
        : session.plan.sell;

    const orderType =
      executionLeg.orderType ??
      "limit";

    const now =
      Date.now();

    const remainingLifetimeMs =
      Math.max(
        1_000,

        session.expiresAt -
          now,
      );

    return {
      exchange:
        executionLeg.exchange
          .trim()
          .toLowerCase(),

      market:
        executionLeg.market
          .trim()
          .toUpperCase(),

      side:
        leg ===
        "BUY"
          ? "buy"
          : "sell",

      orderType,

      quantity:
        executionLeg.quantity,

      price:
        orderType ===
        "limit"
          ? executionLeg
              .limitPrice
          : undefined,

      clientOrderId:
        this.createClientOrderId(
          session.id,
          leg,
        ),

      timeoutMs:
        Math.min(
          session.plan.timeoutMs,
          remainingLifetimeMs,
        ),

      pollingIntervalMs:
        1_000,

      cancelOnTimeout:
        true,
    };
  }

  private validateResultIdentity(
    order:
      OrderLifecycleRecord,

    result:
      LiveExecutionResult,
  ): void {
    if (
      result.exchange
        .trim()
        .toLowerCase() !==
      order.exchange
    ) {
      throw new Error(
        "Live execution result exchange does not match the lifecycle record.",
      );
    }

    if (
      result.market
        .trim()
        .toUpperCase() !==
      order.market
    ) {
      throw new Error(
        "Live execution result market does not match the lifecycle record.",
      );
    }

    if (
      result.side !==
      order.side
    ) {
      throw new Error(
        "Live execution result side does not match the lifecycle record.",
      );
    }
  }

  private mapStatus(
    status:
      LiveExecutionStatus,
  ): OrderLifecycleStatus {
    switch (
      status
    ) {
      case "PENDING":
        return "ACKNOWLEDGED";

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

  private mapEventType(
    status:
      OrderLifecycleStatus,
  ): OrderLifecycleEventType {
    switch (
      status
    ) {
      case "ACKNOWLEDGED":
        return "ORDER_ACKNOWLEDGED";

      case "OPEN":
        return "ORDER_OPEN";

      case "PARTIALLY_FILLED":
        return "ORDER_PARTIALLY_FILLED";

      case "FILLED":
        return "ORDER_FILLED";

      case "CANCELLED":
        return "ORDER_CANCELLED";

      case "REJECTED":
        return "ORDER_REJECTED";

      case "TIMED_OUT":
        return "ORDER_TIMED_OUT";

      case "FAILED":
        return "ORDER_FAILED";

      case "ABORTED":
        return "ORDER_ABORTED";

      case "PREPARED":
        return "ORDER_PREPARED";

      case "SUBMISSION_REQUESTED":
        return "SUBMISSION_REQUESTED";
    }
  }

  private createResultMessage(
    status:
      OrderLifecycleStatus,
  ): string {
    return `Order lifecycle updated to ${status}.`;
  }

  private addEvent(
    order:
      OrderLifecycleRecord,

    type:
      OrderLifecycleEventType,

    message:
      string,

    metadata:
      Record<
        string,
        unknown
      > =
      {},
  ): void {
    const timestamp =
      Date.now();

    order.events.push({
      type,

      timestamp,

      message,

      metadata:
        structuredClone(
          metadata,
        ),
    });

    order.updatedAt =
      timestamp;
  }

  private reject(
    reason:
      string,
  ): PrepareOrderLifecycleResult {
    return {
      approved:
        false,

      order:
        null,

      reasons: [
        reason,
      ],
    };
  }

  private requireOrder(
    orderId:
      string,
  ): OrderLifecycleRecord {
    const order =
      this.orders.get(
        orderId,
      );

    if (
      !order
    ) {
      throw new Error(
        "Order lifecycle record not found.",
      );
    }

    return order;
  }

  private isTerminal(
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

  private count(
    orders:
      readonly OrderLifecycleRecord[],

    status:
      OrderLifecycleStatus,
  ): number {
    return orders
      .filter(
        (
          order,
        ) =>
          order.status ===
          status,
      )
      .length;
  }

  private createSessionLegKey(
    sessionId:
      string,

    leg:
      OrderLifecycleLeg,
  ): string {
    return `${sessionId}|${leg}`;
  }

  private createClientOrderId(
    sessionId:
      string,

    leg:
      OrderLifecycleLeg,
  ): string {
    const compactSession =
      sessionId
        .replace(
          /-/g,
          "",
        )
        .slice(
          0,
          16,
        );

    return (
      `arb-${compactSession}-` +
      leg
        .toLowerCase()
    );
  }

  private createRecoveryClientOrderId(
    sessionId:
      string,

    leg:
      OrderLifecycleLeg,

    incidentId:
      string,
  ): string {
    const compactSession =
      sessionId
        .replace(
          /-/g,
          "",
        )
        .slice(
          0,
          10,
        );

    const compactIncident =
      incidentId
        .replace(
          /-/g,
          "",
        )
        .slice(
          0,
          8,
        );

    return `paper-rec-${compactSession}-${leg.toLowerCase()}-${compactIncident}`;
  }

  private isLiveOrderSubmissionConfirmed():
    boolean {
    return (
      process.env
        .LIVE_ORDER_SUBMISSION_CONFIRMATION
        ?.trim() ===
      LIVE_ORDER_SUBMISSION_CONFIRMATION
    );
  }

  private persistEvidence(
    order:
      OrderLifecycleRecord,
  ): void {
    orderLifecycleEvidenceService
      .capture(
        order,

        liveExecutionCoordinator
          .isNonLiveSession(
            order.sessionId,
          ),
      );
  }

  private trimHistory():
    void {
    if (
      this.orders.size <=
      OrderLifecycleManager
        .MAXIMUM_HISTORY
    ) {
      return;
    }

    const removable =
      Array.from(
        this.orders.values(),
      )
        .filter(
          (
            order,
          ) =>
            this.isTerminal(
              order.status,
            ),
        )
        .sort(
          (
            first,
            second,
          ) =>
            first.updatedAt -
            second.updatedAt,
        );

    while (
      this.orders.size >
        OrderLifecycleManager
          .MAXIMUM_HISTORY &&
      removable.length >
        0
    ) {
      const oldest =
        removable.shift();

      if (
        !oldest
      ) {
        break;
      }

      this.orders.delete(
        oldest.id,
      );

      if (
        oldest.purpose ===
        "PRIMARY"
      ) {
        this.orderBySessionLeg
          .delete(
            this.createSessionLegKey(
              oldest.sessionId,
              oldest.leg,
            ),
          );
      }

      if (
        oldest.recoveryIncidentId
      ) {
        this.recoveryOrderByIncident
          .delete(
            oldest.recoveryIncidentId,
          );
      }
    }
  }

  private clone(
    order:
      OrderLifecycleRecord,
  ): OrderLifecycleRecord {
    return structuredClone(
      order,
    );
  }
}

export const orderLifecycleManager =
  new OrderLifecycleManager();
