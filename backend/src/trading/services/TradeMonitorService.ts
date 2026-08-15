import { marketCache } from "../../services/cache.service";
import { defaultTradingExecutionConfig } from "../config/execution";

import { paperTradingService } from "./PaperTradingService";
import { paperTradeStore } from "./PaperTradeStore";

export class TradeMonitorService {
  monitorOpenTrades(): void {
    const activeTrades = paperTradeStore
      .getByStatuses([
        "open",
        "monitoring",
      ]);

    for (const trade of activeTrades) {
      const conversion =
        trade.capitalConversion;

      if (!conversion) {
        paperTradeStore.update(trade.id, {
          status: "failed",
          failureReason:
            "Legacy open trade has no INR/quote conversion evidence; monitoring stopped fail-closed.",
          lastUpdatedAt:
            Date.now(),
        });

        continue;
      }

      const quote = marketCache.get(
        trade.sellExchange,
        trade.market,
      );

      if (!quote) {
        continue;
      }

      /*
       * Open arbitrage trade ko close karne ke liye
       * sell exchange ka executable best bid use hoga.
       */
      const currentPrice =
        quote.bestBidPrice;

      if (
        !quote.executable ||
        currentPrice === null ||
        !Number.isFinite(currentPrice) ||
        currentPrice <= 0
      ) {
        continue;
      }

      /*
       * Current executable sell liquidity ko verify karo.
       * Agar complete paper-trade quantity top-of-book par
       * available nahi hai, trade ko abhi close nahi karte.
       */
      const availableSellQty =
        quote.bestBidQty;

      if (
        availableSellQty === null ||
        !Number.isFinite(availableSellQty) ||
        availableSellQty < trade.quantity
      ) {
        continue;
      }

      const currentGrossProfitInr =
        (currentPrice - trade.buyPrice) *
          trade.quantity *
        conversion.quoteToInrRate;

      const currentProfit =
        currentGrossProfitInr -
        trade.estimatedFees;

      const currentProfitPercent =
        trade.capital > 0
          ? (currentProfit / trade.capital) * 100
          : 0;

      const highestProfit = Math.max(
        trade.highestProfit,
        currentProfit,
      );

      const lowestProfit = Math.min(
        trade.lowestProfit,
        currentProfit,
      );

      const now = Date.now();

      const targetReached =
        currentProfitPercent >=
        defaultTradingExecutionConfig
          .targetProfitPercent;

      if (targetReached) {
        paperTradeStore.update(trade.id, {
          status: "target-hit",

          currentPrice,
          currentProfit,
          currentProfitPercent,

          highestProfit,
          lowestProfit,

          lastUpdatedAt: now,
        });

        paperTradingService.closeTrade(
          trade.id,
          currentPrice,
          currentProfit,
          currentProfitPercent,
        );

        console.log(
          `[TradeMonitor] Closed ${trade.market} at ${currentProfitPercent.toFixed(
            2,
          )}% profit`,
        );

        continue;
      }

      paperTradeStore.update(trade.id, {
        status: "monitoring",

        currentPrice,
        currentProfit,
        currentProfitPercent,

        highestProfit,
        lowestProfit,

        lastUpdatedAt: now,
      });
    }
  }
}

export const tradeMonitorService =
  new TradeMonitorService();
