import {
  tradingAccountService,
} from "../../trading/account/TradingAccountService";

import type {
  PaperTrade,
  PaperTradeStatus,
} from "../../trading/models/PaperTrade";

import {
  paperTradingService,
} from "../../trading/services/PaperTradingService";

import type {
  PortfolioSummary,
} from "../models/PortfolioSummary";

const OPEN_TRADE_STATUSES =
  new Set<PaperTradeStatus>([
    "detected",
    "validated",
    "open",
    "monitoring",
  ]);

function isFiniteNumber(
  value: number | null,
): value is number {
  return (
    value !== null &&
    Number.isFinite(value)
  );
}

function round(
  value: number,
  decimalPlaces = 2,
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const multiplier =
    10 ** decimalPlaces;

  return (
    Math.round(
      (value + Number.EPSILON) *
        multiplier,
    ) / multiplier
  );
}

export class PortfolioService {
  getSummary(): PortfolioSummary {
    const account =
      tradingAccountService.getAccount();

    const trades =
      paperTradingService.getTrades();

    const openTrades =
      trades.filter((trade) =>
        OPEN_TRADE_STATUSES.has(
          trade.status,
        ),
      );

    const completedTrades =
      trades.filter(
        (
          trade,
        ): trade is PaperTrade & {
          actualProfit: number;
        } =>
          isFiniteNumber(
            trade.actualProfit,
          ),
      );

    const winningTrades =
      completedTrades.filter(
        (trade) =>
          trade.actualProfit > 0,
      );

    const losingTrades =
      completedTrades.filter(
        (trade) =>
          trade.actualProfit < 0,
      );

    const grossProfit =
      winningTrades.reduce(
        (total, trade) =>
          total +
          trade.actualProfit,
        0,
      );

    const grossLoss =
      losingTrades.reduce(
        (total, trade) =>
          total +
          Math.abs(
            trade.actualProfit,
          ),
        0,
      );

    const totalRealizedProfit =
      completedTrades.reduce(
        (total, trade) =>
          total +
          trade.actualProfit,
        0,
      );

    const allocatedCapital =
      Math.max(
        0,
        account.currentCapital -
          account.availableCapital,
      );

    const todayNetProfit =
      account.todayProfit -
      account.todayLoss;

    const winRatePercent =
      completedTrades.length > 0
        ? (
            winningTrades.length /
            completedTrades.length
          ) * 100
        : 0;

    const roiPercent =
      account.initialCapital > 0
        ? (
            (
              account.currentCapital -
              account.initialCapital
            ) /
            account.initialCapital
          ) * 100
        : 0;

    /*
     * When no losing trade exists, there is
     * not enough data for a meaningful finite
     * profit-factor value. We return 0 instead
     * of Infinity because JSON cannot represent
     * Infinity reliably.
     */
    const profitFactor =
      grossLoss > 0
        ? grossProfit / grossLoss
        : 0;

    const bestTradeProfit =
      completedTrades.length > 0
        ? Math.max(
            ...completedTrades.map(
              (trade) =>
                trade.actualProfit,
            ),
          )
        : 0;

    const worstTradeProfit =
      completedTrades.length > 0
        ? Math.min(
            ...completedTrades.map(
              (trade) =>
                trade.actualProfit,
            ),
          )
        : 0;

    return {
      accountId:
        account.id,

      accountName:
        account.name,

      mode:
        account.mode,

      initialCapital:
        round(
          account.initialCapital,
        ),

      currentCapital:
        round(
          account.currentCapital,
        ),

      availableCapital:
        round(
          account.availableCapital,
        ),

      allocatedCapital:
        round(
          allocatedCapital,
        ),

      todayProfit:
        round(
          account.todayProfit,
        ),

      todayLoss:
        round(
          account.todayLoss,
        ),

      todayNetProfit:
        round(
          todayNetProfit,
        ),

      totalRealizedProfit:
        round(
          totalRealizedProfit,
        ),

      totalTrades:
        trades.length,

      openTrades:
        openTrades.length,

      closedTrades:
        completedTrades.length,

      winningTrades:
        winningTrades.length,

      losingTrades:
        losingTrades.length,

      winRatePercent:
        round(
          winRatePercent,
        ),

      roiPercent:
        round(
          roiPercent,
        ),

      profitFactor:
        round(
          profitFactor,
        ),

      bestTradeProfit:
        round(
          bestTradeProfit,
        ),

      worstTradeProfit:
        round(
          worstTradeProfit,
        ),

      generatedAt:
        Date.now(),
    };
  }
}

export const portfolioService =
  new PortfolioService();