import type { ExecutionResult } from "../models/ExecutionResult";
import type { PaperTrade } from "../models/PaperTrade";

import {
  cloneStrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

import {
  paperTradeStore,
  type PaperTradeStoreDiagnostics,
  type PaperTradeStore,
} from "./PaperTradeStore";

export class PaperTradingService {
  constructor(
    private readonly store:
      PaperTradeStore =
      paperTradeStore,
  ) {}

  recordCompletedExecution(
    result: ExecutionResult,
  ): PaperTrade {
    if (!result.successful) {
      throw new Error(
        result.failureReason ??
          "Paper execution was not successful.",
      );
    }

    const completedAt =
      result.completedAt ??
      result.startedAt;

    const quantity = Math.min(
      result.buy.filledQuantity,
      result.sell.filledQuantity,
    );

    if (
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      throw new Error(
        "Paper execution produced an invalid filled quantity.",
      );
    }

    const trade: PaperTrade = {
      strategyAttribution:
        cloneStrategyAttribution(
          result.strategyAttribution,
        ),

      priceCredibility:
        result.priceCredibility
          ? structuredClone(
              result.priceCredibility,
            )
          : null,

      paperExecutionStress:
        result.paperExecutionStress
          ? structuredClone(
              result.paperExecutionStress,
            )
          : null,

      paperVdaTaxWithholding:
        result.paperVdaTaxWithholding
          ? structuredClone(
              result.paperVdaTaxWithholding,
            )
          : null,

      capitalConversion:
        result.capitalConversion
          ? structuredClone(
              result.capitalConversion,
            )
          : null,

      quoteCapitalUsed:
        result.quoteCapitalUsed ??
        null,

      quoteGrossProfit:
        result.quoteGrossProfit ??
        null,

      quoteTotalFees:
        result.quoteTotalFees ??
        null,

      quoteNetProfit:
        result.quoteNetProfit ??
        null,

      quoteTdsWithheld:
        result.quoteTdsWithheld ??
        null,

      quoteDeployableCashProfit:
        result.quoteDeployableCashProfit ??
        null,

      tdsWithheld:
        result.tdsWithheld ??
        null,

      deployableCashProfit:
        result.deployableCashProfit ??
        null,

      executionQuality: {
        schemaVersion:
          1,
        buyRequestedPrice:
          result.buy.requestedPrice,
        buyAverageFillPrice:
          result.buy.averageFillPrice,
        sellRequestedPrice:
          result.sell.requestedPrice,
        sellAverageFillPrice:
          result.sell.averageFillPrice,
        buyAdverseSlippagePercent:
          this.calculateAdverseSlippagePercent(
            "BUY",
            result.buy.requestedPrice,
            result.buy.averageFillPrice,
          ),
        sellAdverseSlippagePercent:
          this.calculateAdverseSlippagePercent(
            "SELL",
            result.sell.requestedPrice,
            result.sell.averageFillPrice,
          ),
        combinedAdverseSlippagePercent:
          this.calculateAdverseSlippagePercent(
            "BUY",
            result.buy.requestedPrice,
            result.buy.averageFillPrice,
          ) +
          this.calculateAdverseSlippagePercent(
            "SELL",
            result.sell.requestedPrice,
            result.sell.averageFillPrice,
          ),
      },

      id: result.planId,

      market: result.market,

      buyExchange:
        result.buy.exchange,

      sellExchange:
        result.sell.exchange,

      capital:
        result.capitalUsed,

      quantity,

      buyPrice:
        result.buy.averageFillPrice,

      sellPrice:
        result.sell.averageFillPrice,

      estimatedFees:
        result.totalFees,

      expectedProfit:
        result.netProfit,

      expectedProfitPercent:
        result.netProfitPercent,

      status: "closed",

      openedAt:
        result.startedAt,

      closedAt:
        completedAt,

      currentPrice:
        result.sell.averageFillPrice,

      currentProfit:
        result.netProfit,

      currentProfitPercent:
        result.netProfitPercent,

      highestProfit:
        Math.max(
          0,
          result.netProfit,
        ),

      lowestProfit:
        Math.min(
          0,
          result.netProfit,
        ),

      lastUpdatedAt:
        completedAt,

      actualSellPrice:
        result.sell.averageFillPrice,

      actualProfit:
        result.netProfit,

      actualProfitPercent:
        result.netProfitPercent,

      failureReason:
        result.failureReason,
    };

    return this.store.create(
      trade,
    );
  }

  closeTrade(
    id: string,
    sellPrice: number,
    actualProfit: number,
    actualProfitPercent: number,
  ): PaperTrade | undefined {
    const now = Date.now();

    return this.store.update(id, {
      status: "closed",

      closedAt: now,

      currentPrice: sellPrice,
      currentProfit: actualProfit,
      currentProfitPercent:
        actualProfitPercent,

      actualSellPrice: sellPrice,
      actualProfit,
      actualProfitPercent,

      lastUpdatedAt: now,
    });
  }

  getTrades(): PaperTrade[] {
    return this.store.getAll();
  }

  getTradeRevision(): number {
    return this.store.getRevision();
  }

  getTrade(
    id: string,
  ): PaperTrade | undefined {
    return this.store.getById(id);
  }

  getStoreDiagnostics():
    PaperTradeStoreDiagnostics {
    return this.store
      .getDiagnostics();
  }

  private calculateAdverseSlippagePercent(
    side:
      "BUY" | "SELL",

    requestedPrice:
      number,

    averageFillPrice:
      number,
  ): number {
    if (
      !Number.isFinite(
        requestedPrice,
      ) ||
      requestedPrice <=
        0 ||
      !Number.isFinite(
        averageFillPrice,
      ) ||
      averageFillPrice <=
        0
    ) {
      return 0;
    }

    const adverseDifference =
      side ===
        "BUY"
        ? Math.max(
            0,
            averageFillPrice -
              requestedPrice,
          )
        : Math.max(
            0,
            requestedPrice -
              averageFillPrice,
          );

    return adverseDifference /
      requestedPrice *
      100;
  }
}

export const paperTradingService =
  new PaperTradingService();
