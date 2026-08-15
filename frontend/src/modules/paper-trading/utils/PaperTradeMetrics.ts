import type {
  PaperTrade,
} from "../types/PaperTrade";

import {
  isActiveTrade,
  isClosedTrade,
} from "./tradeStatus";

/**
 * These metrics describe the raw /api/paper-trades
 * storage surface only.
 *
 * IMPORTANT:
 *
 * They MUST NOT be presented as authoritative
 * Strategy #1 performance because the paper-trade
 * store can contain historical / legacy / synthetic
 * records.
 *
 * Credible Strategy #1 performance is owned by:
 *
 * GET /api/strategies/personal-bot
 *
 * through PersonalStrategyOneBotService.
 */
export interface PaperTradeMetrics {
  totalStoredRecords:
    number;

  activeStoredRecords:
    number;

  closedStoredRecords:
    number;

  expectedProfitAcrossStoredRecords:
    number;

  actualProfitAcrossClosedStoredRecords:
    number;
}

export function calculatePaperTradeMetrics(
  trades:
    readonly PaperTrade[],
): PaperTradeMetrics {
  const activeTrades =
    trades.filter(
      isActiveTrade,
    );

  const closedTrades =
    trades.filter(
      isClosedTrade,
    );

  return {
    totalStoredRecords:
      trades.length,

    activeStoredRecords:
      activeTrades.length,

    closedStoredRecords:
      closedTrades.length,

    expectedProfitAcrossStoredRecords:
      trades.reduce(
        (
          total,
          trade,
        ) =>
          total +
          trade.expectedProfit,

        0,
      ),

    actualProfitAcrossClosedStoredRecords:
      closedTrades.reduce(
        (
          total,
          trade,
        ) =>
          total +
          (
            trade.actualProfit ??
            0
          ),

        0,
      ),
  };
}