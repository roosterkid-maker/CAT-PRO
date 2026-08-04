import { paperTradingService } from "../../trading/services/PaperTradingService";

import type { AnalyticsReport } from "../models/AnalyticsReport";
import type { AnalyticsOverview } from "../models/AnalyticsOverview";
import type { ExchangePerformance } from "../models/ExchangePerformance";
import type { MarketPerformance } from "../models/MarketPerformance";

export class AnalyticsService {
  getReport(): AnalyticsReport {
    const trades =
      paperTradingService.getTrades();

    const closedTrades =
      trades.filter(
        (trade) =>
          trade.status === "closed",
      );

    const openTrades =
      trades.filter(
        (trade) =>
          trade.status === "open",
      );

    const winningTrades =
      closedTrades.filter(
        (trade) =>
          (trade.actualProfit ?? 0) > 0,
      );

    const losingTrades =
      closedTrades.filter(
        (trade) =>
          (trade.actualProfit ?? 0) <= 0,
      );

    const totalProfit =
      closedTrades.reduce(
        (total, trade) =>
          total +
          (trade.actualProfit ?? 0),
        0,
      );

    const capitalInUse =
      openTrades.reduce(
        (total, trade) =>
          total + trade.capital,
        0,
      );

    const totalCapital =
      closedTrades.reduce(
        (total, trade) =>
          total + trade.capital,
        0,
      );

    const overview: AnalyticsOverview =
      {
        totalTrades:
          trades.length,

        openTrades:
          openTrades.length,

        closedTrades:
          closedTrades.length,

        winningTrades:
          winningTrades.length,

        losingTrades:
          losingTrades.length,

        winRate:
          closedTrades.length > 0
            ? (winningTrades.length /
                closedTrades.length) *
              100
            : 0,

        totalProfit,

        averageProfit:
          winningTrades.length > 0
            ? winningTrades.reduce(
                (total, trade) =>
                  total +
                  (trade.actualProfit ??
                    0),
                0,
              ) /
              winningTrades.length
            : 0,

        averageLoss:
          losingTrades.length > 0
            ? losingTrades.reduce(
                (total, trade) =>
                  total +
                  (trade.actualProfit ??
                    0),
                0,
              ) /
              losingTrades.length
            : 0,

        roi:
          totalCapital > 0
            ? (totalProfit /
                totalCapital) *
              100
            : 0,

        capitalInUse,

        averageExecutionTimeMs: 0,
      };

    return {
      generatedAt:
        Date.now(),

      overview,

      exchanges:
        this.calculateExchangePerformance(
          closedTrades,
        ),

      markets:
        this.calculateMarketPerformance(
          closedTrades,
        ),
    };
  }

  private calculateExchangePerformance(
    trades: ReturnType<
      typeof paperTradingService.getTrades
    >,
  ): ExchangePerformance[] {
    const map =
      new Map<
        string,
        typeof trades
      >();

    for (const trade of trades) {
      const key =
        trade.buyExchange;

      const bucket =
        map.get(key) ?? [];

      bucket.push(trade);

      map.set(
        key,
        bucket,
      );
    }

    return [...map.entries()].map(
      ([exchange, bucket]) => {
        const totalProfit =
          bucket.reduce(
            (sum, trade) =>
              sum +
              (trade.actualProfit ??
                0),
            0,
          );

        const wins =
          bucket.filter(
            (trade) =>
              (trade.actualProfit ??
                0) > 0,
          ).length;

        return {
          exchange,

          totalTrades:
            bucket.length,

          totalProfit,

          averageProfit:
            bucket.length > 0
              ? totalProfit /
                bucket.length
              : 0,

          winRate:
            bucket.length > 0
              ? (wins /
                  bucket.length) *
                100
              : 0,
        };
      });
  }

  private calculateMarketPerformance(
    trades: ReturnType<
      typeof paperTradingService.getTrades
    >,
  ): MarketPerformance[] {
    const map =
      new Map<
        string,
        typeof trades
      >();

    for (const trade of trades) {
      const bucket =
        map.get(
          trade.market,
        ) ?? [];

      bucket.push(trade);

      map.set(
        trade.market,
        bucket,
      );
    }

    return [...map.entries()].map(
      ([market, bucket]) => {
        const totalProfit =
          bucket.reduce(
            (sum, trade) =>
              sum +
              (trade.actualProfit ??
                0),
            0,
          );

        const wins =
          bucket.filter(
            (trade) =>
              (trade.actualProfit ??
                0) > 0,
          ).length;

        return {
          market,

          totalTrades:
            bucket.length,

          totalProfit,

          averageProfit:
            bucket.length > 0
              ? totalProfit /
                bucket.length
              : 0,

          winRate:
            bucket.length > 0
              ? (wins /
                  bucket.length) *
                100
              : 0,
        };
      });
  }
}

export const analyticsService =
  new AnalyticsService();