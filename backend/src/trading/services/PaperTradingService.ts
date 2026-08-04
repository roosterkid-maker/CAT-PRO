import { randomUUID } from "node:crypto";

import type { ArbitrageOpportunity } from "../../arbitrage/models/ArbitrageOpportunity";
import { executionCalculator } from "../calculators/ExecutionCalculator";
import { defaultTradingExecutionConfig } from "../config/execution";
import type { ExecutionResult } from "../models/ExecutionResult";
import type { PaperTrade } from "../models/PaperTrade";

import { paperTradeStore } from "./PaperTradeStore";

export class PaperTradingService {
  openTrade(
    opportunity: ArbitrageOpportunity,
    requestedCapital: number,
  ): PaperTrade {
    const config =
      defaultTradingExecutionConfig;

    if (!config.enabled) {
      throw new Error(
        "Trading execution is disabled.",
      );
    }

    if (config.mode !== "paper") {
      throw new Error(
        `Paper trading is unavailable in ${config.mode} mode.`,
      );
    }

    if (
      !Number.isFinite(requestedCapital) ||
      requestedCapital <= 0
    ) {
      throw new Error(
        "Trading capital must be a positive number.",
      );
    }

    if (
      requestedCapital >
      config.maximumCapitalPerTrade
    ) {
      throw new Error(
        `Maximum paper-trade capital is ₹${config.maximumCapitalPerTrade}.`,
      );
    }

    if (
      paperTradeStore.countOpenTrades() >=
      config.maximumOpenTrades
    ) {
      throw new Error(
        "Maximum number of open paper trades reached.",
      );
    }

    if (
      opportunity.netProfitPercent <
      config.minimumNetProfitPercent
    ) {
      throw new Error(
        "Opportunity does not meet the minimum net-profit requirement.",
      );
    }

    if (
      config.requireFreshBidAsk &&
      opportunity.usedLastPriceFallback
    ) {
      throw new Error(
        "Executable bid/ask prices are required for this paper trade.",
      );
    }

    if (!opportunity.quotesAreFresh) {
      throw new Error(
        "Opportunity contains stale exchange quotes.",
      );
    }

    const execution =
      executionCalculator.calculate(
        opportunity.buyPrice,
        opportunity.buyAvailableQty,
        opportunity.sellAvailableQty,
        requestedCapital,
      );

    if (!execution.enoughLiquidity) {
      throw new Error(
        `Only ${execution.liquidityPercent.toFixed(
          1,
        )}% liquidity is available for the requested capital.`,
      );
    }

    const estimatedFees =
      execution.executableQty *
      opportunity.estimatedFees;

    const expectedProfit =
      execution.executableQty *
      opportunity.netProfit;

    const expectedProfitPercent =
      execution.executableCapital > 0
        ? (expectedProfit /
            execution.executableCapital) *
          100
        : 0;

    const now = Date.now();

    const trade: PaperTrade = {
      id: randomUUID(),

      market:
        opportunity.pair.market,

      buyExchange:
        opportunity.pair.buy.exchange,

      sellExchange:
        opportunity.pair.sell.exchange,

      capital:
        execution.executableCapital,

      quantity:
        execution.executableQty,

      buyPrice:
        opportunity.buyPrice,

      sellPrice:
        opportunity.sellPrice,

      estimatedFees,
      expectedProfit,
      expectedProfitPercent,

      status: "open",

      openedAt: now,
      closedAt: null,

      currentPrice:
        opportunity.buyPrice,

      currentProfit: 0,
      currentProfitPercent: 0,

      highestProfit: 0,
      lowestProfit: 0,

      lastUpdatedAt: now,

      actualSellPrice: null,
      actualProfit: null,
      actualProfitPercent: null,

      failureReason: null,
    };

    return paperTradeStore.create(
      trade,
    );
  }

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
      result.completedAt ?? Date.now();

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

    return paperTradeStore.create(
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

    return paperTradeStore.update(id, {
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
    return paperTradeStore.getAll();
  }

  getTrade(
    id: string,
  ): PaperTrade | undefined {
    return paperTradeStore.getById(id);
  }
}

export const paperTradingService =
  new PaperTradingService();