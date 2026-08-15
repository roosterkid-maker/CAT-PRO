import {
  randomUUID,
} from "node:crypto";

import {
  tradingAccountService,
} from "../../../trading/account/TradingAccountService";

import {
  liveExecutionCoordinator,
} from "../coordinator/LiveExecutionCoordinator";

import {
  fillEngine,
} from "../fills/FillEngine";

import type {
  OrderFillSummary,
} from "../fills/FillRecord";

import {
  orderLifecycleManager,
} from "../lifecycle/OrderLifecycleManager";

import type {
  OrderLifecycleStatus,
} from "../lifecycle/OrderLifecycleRecord";

import {
  executionReconciliationEngine,
} from "../reconciliation/ExecutionReconciliationEngine";

import {
  executionRecoveryEngine,
} from "../recovery/ExecutionRecoveryEngine";

import type {
  ExecutionAuditEvent,
  ExecutionAuditRecord,
  ExecutionSettlementDiagnostics,
  ExecutionSettlementRecord,
} from "./ExecutionSettlementRecord";

export class ExecutionSettlementService {
  private readonly settlements =
    new Map<
      string,
      ExecutionSettlementRecord
    >();

  settle(
    sessionId:
      string,
  ): ExecutionSettlementRecord {
    const existing =
      this.settlements
        .get(
          sessionId,
        );

    if (
      existing &&
      existing.status ===
        "SETTLED"
    ) {
      return structuredClone(
        existing,
      );
    }

    const session =
      liveExecutionCoordinator
        .getSession(
          sessionId,
        );

    if (
      !session
    ) {
      throw new Error(
        "Live execution session not found.",
      );
    }

    const lifecycleOrders =
      orderLifecycleManager
        .getBySession(
          sessionId,
        );

    const buyOrders =
      lifecycleOrders.filter(
        (
          order,
        ) =>
          order.leg ===
          "BUY",
      );

    const sellOrders =
      lifecycleOrders.filter(
        (
          order,
        ) =>
          order.leg ===
          "SELL",
      );

    const reasons:
      string[] =
      [];

    if (
      session.status !==
      "RUNNING"
    ) {
      reasons.push(
        `Execution session must be RUNNING before settlement. Current status: ${session.status}.`,
      );
    }

    if (
      buyOrders.length ===
      0
    ) {
      reasons.push(
        "BUY lifecycle order is missing.",
      );
    }

    if (
      sellOrders.length ===
      0
    ) {
      reasons.push(
        "SELL lifecycle order is missing.",
      );
    }

    const evidence =
      lifecycleOrders.map(
        (
          order,
        ) => ({
          order,
          fill:
            fillEngine
              .getSummary(
                order.id,
              ),
          reconciliation:
            executionReconciliationEngine
              .getRecord(
                order.id,
              ),
        }),
      );

    for (
      const item
      of evidence
    ) {
      if (
        !item.fill
      ) {
        reasons.push(
          `${item.order.leg} ${item.order.purpose} fill summary is unavailable.`,
        );
      }

      if (
        !this.isTerminalLifecycleStatus(
          item.order.status,
        )
      ) {
        reasons.push(
          `${item.order.leg} ${item.order.purpose} lifecycle is still ${item.order.status}.`,
        );
      }

      if (
        !item.reconciliation
      ) {
        reasons.push(
          `${item.order.leg} ${item.order.purpose} order has not passed reconciliation.`,
        );
      } else if (
        item.reconciliation.status !==
        "MATCHED"
      ) {
        reasons.push(
          `${item.order.leg} ${item.order.purpose} reconciliation is ${item.reconciliation.status}, not MATCHED.`,
        );
      }
    }

    const recoveryIncidents =
      executionRecoveryEngine
        .getBySession(
          sessionId,
        );

    const activeRecovery =
      recoveryIncidents.find(
        (
          incident,
        ) =>
          incident.status !==
          "RESOLVED",
      );

    if (
      activeRecovery
    ) {
      reasons.push(
        `Execution recovery incident ${activeRecovery.id} is still ${activeRecovery.status}.`,
      );
    }

    const buyFills =
      evidence
        .filter(
          (
            item,
          ) =>
            item.order.leg ===
              "BUY" &&
            item.fill !==
              null,
        )
        .map(
          (
            item,
          ) =>
            item.fill!,
        );

    const sellFills =
      evidence
        .filter(
          (
            item,
          ) =>
            item.order.leg ===
              "SELL" &&
            item.fill !==
              null,
        )
        .map(
          (
            item,
          ) =>
            item.fill!,
        );

    const boughtQuantity =
      buyFills.reduce(
        (
          total,
          fill,
        ) =>
          total +
          fill.filledQuantity,
        0,
      );

    const soldQuantity =
      sellFills.reduce(
        (
          total,
          fill,
        ) =>
          total +
          fill.filledQuantity,
        0,
      );

    const quantityReference =
      Math.max(
        boughtQuantity,
        soldQuantity,
        ...lifecycleOrders.map(
          (
            order,
          ) =>
            order.requestedQuantity,
        ),
      );

    const quantityTolerance =
      this.quantityTolerance(
        quantityReference,
      );

    if (
      Math.abs(
        boughtQuantity -
        soldQuantity,
      ) >
      quantityTolerance
    ) {
      reasons.push(
        "BUY and SELL settled quantities are not balanced.",
      );
    }

    if (
      Math.min(
        boughtQuantity,
        soldQuantity,
      ) <=
      quantityTolerance
    ) {
      reasons.push(
        "Execution has no positive balanced filled quantity to settle.",
      );
    }

    if (
      reasons.length >
      0
    ) {
      const blocked =
        this.createBlockedRecord(
          session.id,
          session.planId,
          session.market,
          session.buyExchange,
          session.sellExchange,
          reasons,
        );

      this.settlements.set(
        sessionId,
        blocked,
      );

      return structuredClone(
        blocked,
      );
    }

    const quantity =
      Math.min(
        boughtQuantity,
        soldQuantity,
      );

    const buyNotional =
      buyFills.reduce(
        (
          total,
          fill,
        ) =>
          total +
          fill.grossNotional,
        0,
      );

    const sellNotional =
      sellFills.reduce(
        (
          total,
          fill,
        ) =>
          total +
          fill.grossNotional,
        0,
      );

    const grossProfit =
      sellNotional -
      buyNotional;

    const buyFees =
      buyFills.reduce(
        (
          total,
          fill,
        ) =>
          total +
          fill.feeAmount,
        0,
      );

    const sellFees =
      sellFills.reduce(
        (
          total,
          fill,
        ) =>
          total +
          fill.feeAmount,
        0,
      );

    const totalFees =
      buyFees +
      sellFees;

    const netProfit =
      grossProfit -
      totalFees;

    const roiPercent =
      buyNotional >
      0
        ? (
            netProfit /
            buyNotional
          ) *
          100
        : 0;

    const startTimes = [
      ...lifecycleOrders.map(
        (
          order,
        ) =>
          order.submittedAt,
      ),
      session.startedAt,
    ].filter(
      (
        value,
      ): value is number =>
        typeof value ===
          "number" &&
        Number.isFinite(
          value,
        ) &&
        value >
          0,
    );

    const endTimes =
      lifecycleOrders
        .map(
          (
            order,
          ) =>
            order.completedAt,
        )
        .filter(
          (
            value,
          ): value is number =>
            typeof value ===
              "number" &&
            Number.isFinite(
              value,
            ) &&
            value >
              0,
        );

    const startedAt =
      startTimes.length >
      0
        ? Math.min(
            ...startTimes,
          )
        : session.createdAt;

    const completedAt =
      endTimes.length >
      0
        ? Math.max(
            ...endTimes,
          )
        : Date.now();

    const effectiveBuyExchange =
      [
        ...buyOrders,
      ]
        .reverse()
        .find(
          (
            order,
          ) =>
            (
              fillEngine
                .getSummary(
                  order.id,
                )
                ?.filledQuantity ??
              0
            ) >
            0,
        )
        ?.exchange ??
      session.buyExchange;

    const effectiveSellExchange =
      [
        ...sellOrders,
      ]
        .reverse()
        .find(
          (
            order,
          ) =>
            (
              fillEngine
                .getSummary(
                  order.id,
                )
                ?.filledQuantity ??
              0
            ) >
            0,
        )
        ?.exchange ??
      session.sellExchange;

    const record:
      ExecutionSettlementRecord = {
      id:
        randomUUID(),

      sessionId:
        session.id,

      planId:
        session.planId,

      market:
        session.market,

      buyExchange:
        effectiveBuyExchange,

      sellExchange:
        effectiveSellExchange,

      status:
        "SETTLED",

      quantity:
        this.round(
          quantity,
          12,
        ),

      buyAveragePrice:
        boughtQuantity >
          0
          ? this.round(
              buyNotional /
                boughtQuantity,
              12,
            )
          : 0,

      sellAveragePrice:
        soldQuantity >
          0
          ? this.round(
              sellNotional /
                soldQuantity,
              12,
            )
          : 0,

      buyNotional:
        this.round(
          buyNotional,
          12,
        ),

      sellNotional:
        this.round(
          sellNotional,
          12,
        ),

      grossProfit:
        this.round(
          grossProfit,
          12,
        ),

      buyFees:
        this.round(
          buyFees,
          12,
        ),

      sellFees:
        this.round(
          sellFees,
          12,
        ),

      totalFees:
        this.round(
          totalFees,
          12,
        ),

      buySlippagePercent:
        this.weightedSlippage(
          buyFills,
        ),

      sellSlippagePercent:
        this.weightedSlippage(
          sellFills,
        ),

      totalAdverseSlippagePercent:
        this.round(
          (
            this.weightedAdverseSlippage(
              buyFills,
            ) ??
            0
          ) +
            (
              this.weightedAdverseSlippage(
                sellFills,
              ) ??
              0
            ),
          6,
        ),

      netProfit:
        this.round(
          netProfit,
          12,
        ),

      roiPercent:
        this.round(
          roiPercent,
          6,
        ),

      executionDurationMs:
        Math.max(
          0,
          completedAt -
            startedAt,
        ),

      createdAt:
        Date.now(),

      settledAt:
        Date.now(),

      reasons: [
        "Execution quantities are balanced.",
        "All primary and recovery lifecycle orders are terminal.",
        "No unresolved recovery incident exists.",
        "All primary and recovery reconciliation states are MATCHED.",
      ],
    };

    this.settlements.set(
      sessionId,
      record,
    );

    /*
     * Non-LIVE sessions must never alter account PnL here.
     *
     * Real live sessions do record the actual
     * settled net result.
     */
    if (
      !liveExecutionCoordinator
        .isNonLiveSession(
          sessionId,
        )
    ) {
      tradingAccountService
        .recordProfit(
          netProfit,
        );
    }

    const latestSession =
      liveExecutionCoordinator
        .getSession(
          sessionId,
        );

    if (
      latestSession
        ?.status ===
      "RUNNING"
    ) {
      liveExecutionCoordinator
        .complete(
          sessionId,
        );
    }

    return structuredClone(
      record,
    );
  }

  getSettlement(
    sessionId:
      string,
  ): ExecutionSettlementRecord | null {
    const record =
      this.settlements
        .get(
          sessionId,
        );

    return record
      ? structuredClone(
          record,
        )
      : null;
  }

  getAudit(
    sessionId:
      string,
  ): ExecutionAuditRecord {
    const session =
      liveExecutionCoordinator
        .getSession(
          sessionId,
        );

    if (
      !session
    ) {
      throw new Error(
        "Live execution session not found.",
      );
    }

    const events:
      ExecutionAuditEvent[] =
      [];

    for (
      const event
      of session.events
    ) {
      events.push({
        sequence:
          0,

        timestamp:
          event.timestamp,

        source:
          "COORDINATOR",

        type:
          event.type,

        message:
          event.message,

        metadata:
          structuredClone(
            event.metadata,
          ),
      });
    }

    const orders =
      orderLifecycleManager
        .getBySession(
          sessionId,
        );

    for (
      const order
      of orders
    ) {
      for (
        const event
        of order.events
      ) {
        events.push({
          sequence:
            0,

          timestamp:
            event.timestamp,

          source:
            "LIFECYCLE",

          type:
            event.type,

          message:
            event.message,

          metadata: {
            lifecycleOrderId:
              order.id,

            leg:
              order.leg,

            ...structuredClone(
              event.metadata,
            ),
          },
        });
      }

      const fill =
        fillEngine
          .getSummary(
            order.id,
          );

      if (
        fill
      ) {
        for (
          const slice
          of fill.fills
        ) {
          events.push({
            sequence:
              0,

            timestamp:
              slice.observedAt,

            source:
              "FILL",

            type:
              "FILL_OBSERVED",

            message:
              `${order.leg} fill slice recorded.`,

            metadata: {
              lifecycleOrderId:
                order.id,

              fillId:
                slice.id,

              quantity:
                slice.quantity,

              price:
                slice.price,

              feeAmount:
                slice.feeAmount,

              cumulativeQuantity:
                slice.cumulativeQuantity,
            },
          });
        }
      }
    }

    const recovery =
      executionRecoveryEngine
        .getBySession(
          sessionId,
        );

    for (
      const incident
      of recovery
    ) {
      events.push({
        sequence:
          0,

        timestamp:
          incident.createdAt,

        source:
          "RECOVERY",

        type:
          "RECOVERY_INCIDENT",

        message:
          incident.reason,

        metadata: {
          incidentId:
            incident.id,

          status:
            incident.status,

          severity:
            incident.severity,

          strategy:
            incident.strategy,

          exposedQuantity:
            incident.exposedQuantity,
        },
      });
    }

    const reconciliation =
      executionReconciliationEngine
        .getBySession(
          sessionId,
        );

    for (
      const record
      of reconciliation
    ) {
      events.push({
        sequence:
          0,

        timestamp:
          record.checkedAt,

        source:
          "RECONCILIATION",

        type:
          record.status,

        message:
          record.reasons.length >
          0
            ? record.reasons.join(
                " | ",
              )
            : "Internal lifecycle state matched exchange state.",

        metadata: {
          reconciliationId:
            record.id,

          orderLifecycleId:
            record.orderLifecycleId,

          severity:
            record.severity,
        },
      });
    }

    const settlement =
      this.getSettlement(
        sessionId,
      );

    if (
      settlement
    ) {
      events.push({
        sequence:
          0,

        timestamp:
          settlement.settledAt ??
          settlement.createdAt,

        source:
          "SETTLEMENT",

        type:
          settlement.status,

        message:
          settlement.status ===
          "SETTLED"
            ? "Execution settlement finalized."
            : "Execution settlement did not finalize.",

        metadata: {
          settlementId:
            settlement.id,

          grossProfit:
            settlement.grossProfit,

          totalFees:
            settlement.totalFees,

          netProfit:
            settlement.netProfit,

          roiPercent:
            settlement.roiPercent,
        },
      });
    }

    events.sort(
      (
        first,
        second,
      ) =>
        first.timestamp -
        second.timestamp,
    );

    events.forEach(
      (
        event,
        index,
      ) => {
        event.sequence =
          index +
          1;
      },
    );

    return {
      sessionId:
        session.id,

      planId:
        session.planId,

      market:
        session.market,

      buyExchange:
        session.buyExchange,

      sellExchange:
        session.sellExchange,

      generatedAt:
        Date.now(),

      finalSessionStatus:
        session.status,

      settlementStatus:
        settlement
          ?.status ??
        "NOT_CREATED",

      recoveryIncidentCount:
        recovery.length,

      reconciliationRecordCount:
        reconciliation.length,

      events,
    };
  }

  getDiagnostics():
    ExecutionSettlementDiagnostics {
    const settlements =
      Array.from(
        this.settlements.values(),
      )
        .sort(
          (
            first,
            second,
          ) =>
            second.createdAt -
            first.createdAt,
        )
        .map(
          (
            record,
          ) =>
            structuredClone(
              record,
            ),
        );

    return {
      generatedAt:
        Date.now(),

      totalSettlements:
        settlements.length,

      settled:
        settlements.filter(
          (
            record,
          ) =>
            record.status ===
            "SETTLED",
        ).length,

      blocked:
        settlements.filter(
          (
            record,
          ) =>
            record.status ===
            "BLOCKED",
        ).length,

      failed:
        settlements.filter(
          (
            record,
          ) =>
            record.status ===
            "FAILED",
        ).length,

      totalGrossProfit:
        this.round(
          settlements.reduce(
            (
              total,
              record,
            ) =>
              total +
              (
                record.status ===
                "SETTLED"
                  ? record.grossProfit
                  : 0
              ),
            0,
          ),
          12,
        ),

      totalFees:
        this.round(
          settlements.reduce(
            (
              total,
              record,
            ) =>
              total +
              (
                record.status ===
                "SETTLED"
                  ? record.totalFees
                  : 0
              ),
            0,
          ),
          12,
        ),

      totalNetProfit:
        this.round(
          settlements.reduce(
            (
              total,
              record,
            ) =>
              total +
              (
                record.status ===
                "SETTLED"
                  ? record.netProfit
                  : 0
              ),
            0,
          ),
          12,
        ),

      settlements,
    };
  }

  private createBlockedRecord(
    sessionId:
      string,

    planId:
      string,

    market:
      string,

    buyExchange:
      string,

    sellExchange:
      string,

    reasons:
      string[],
  ): ExecutionSettlementRecord {
    return {
      id:
        randomUUID(),

      sessionId,

      planId,

      market,

      buyExchange,

      sellExchange,

      status:
        "BLOCKED",

      quantity:
        0,

      buyAveragePrice:
        0,

      sellAveragePrice:
        0,

      buyNotional:
        0,

      sellNotional:
        0,

      grossProfit:
        0,

      buyFees:
        0,

      sellFees:
        0,

      totalFees:
        0,

      buySlippagePercent:
        null,

      sellSlippagePercent:
        null,

      totalAdverseSlippagePercent:
        0,

      netProfit:
        0,

      roiPercent:
        0,

      executionDurationMs:
        0,

      createdAt:
        Date.now(),

      settledAt:
        null,

      reasons: [
        ...new Set(
          reasons,
        ),
      ],
    };
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
        1e-9,
    );
  }

  private isTerminalLifecycleStatus(
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

  private weightedSlippage(
    fills:
      readonly OrderFillSummary[],
  ): number | null {
    const eligible =
      fills.filter(
        (
          fill,
        ) =>
          fill.grossNotional >
            0 &&
          fill.slippagePercent !==
            null,
      );

    const notional =
      eligible.reduce(
        (
          total,
          fill,
        ) =>
          total +
          fill.grossNotional,
        0,
      );

    if (
      notional <=
      0
    ) {
      return null;
    }

    return this.round(
      eligible.reduce(
        (
          total,
          fill,
        ) =>
          total +
          (
            fill.slippagePercent ??
            0
          ) *
            fill.grossNotional,
        0,
      ) /
        notional,
      6,
    );
  }

  private weightedAdverseSlippage(
    fills:
      readonly OrderFillSummary[],
  ): number | null {
    const eligible =
      fills.filter(
        (
          fill,
        ) =>
          fill.grossNotional >
            0 &&
          fill.adverseSlippagePercent !==
            null,
      );

    const notional =
      eligible.reduce(
        (
          total,
          fill,
        ) =>
          total +
          fill.grossNotional,
        0,
      );

    if (
      notional <=
      0
    ) {
      return null;
    }

    return this.round(
      eligible.reduce(
        (
          total,
          fill,
        ) =>
          total +
          (
            fill.adverseSlippagePercent ??
            0
          ) *
            fill.grossNotional,
        0,
      ) /
        notional,
      6,
    );
  }

  private round(
    value:
      number,

    decimalPlaces =
      2,
  ): number {
    if (
      !Number.isFinite(
        value,
      )
    ) {
      return 0;
    }

    const multiplier =
      10 **
      decimalPlaces;

    return (
      Math.round(
        (
          value +
          Number.EPSILON
        ) *
          multiplier,
      ) /
      multiplier
    );
  }
}

export const executionSettlementService =
  new ExecutionSettlementService();
