import { randomUUID } from "node:crypto";

import type { ArbitrageOpportunity } from "../../arbitrage/models/ArbitrageOpportunity";
import { defaultTradingExecutionConfig } from "../config/execution";
import type { PaperTrade } from "../models/PaperTrade";

import { paperTradeStore } from "./PaperTradeStore";

export class PaperTradingService {
  openTrade(
    opportunity: ArbitrageOpportunity,
    requestedCapital: number,
  ): PaperTrade {
    const config = defaultTradingExecutionConfig;

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

    const buyPrice =
      opportunity.buyPrice;

    const sellPrice =
      opportunity.sellPrice;

    const executableQty =
      opportunity.executableQty;

    if (
      !Number.isFinite(buyPrice) ||
      !Number.isFinite(sellPrice) ||
      !Number.isFinite(executableQty) ||
      buyPrice <= 0 ||
      sellPrice <= 0 ||
      executableQty <= 0
    ) {
      throw new Error(
        "Opportunity contains invalid execution prices or liquidity.",
      );
    }

    const requestedQuantity =
      requestedCapital / buyPrice;

    const quantity = Math.min(
      requestedQuantity,
      executableQty,
    );

    if (
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      throw new Error(
        "Unable to calculate a valid executable quantity.",
      );
    }

    const executableCapital =
      quantity * buyPrice;

    const estimatedFees =
      quantity * opportunity.estimatedFees;

    const expectedProfit =
      quantity * opportunity.netProfit;

    const now = Date.now();

    const trade: PaperTrade = {
      id: randomUUID(),

      market:
        opportunity.pair.market,

      buyExchange:
        opportunity.pair.buy.exchange,

      sellExchange:
        opportunity.pair.sell.exchange,

      capital: executableCapital,
      quantity,

      buyPrice,
      sellPrice,

      estimatedFees,
      expectedProfit,

      expectedProfitPercent:
        opportunity.netProfitPercent,

      status: "open",

      openedAt: now,
      closedAt: null,

      currentPrice: buyPrice,
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