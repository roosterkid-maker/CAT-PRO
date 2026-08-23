import {
  api,
} from "@/api/client";

import type {
  StrategyOneTradeIntelligenceResponse,
  TradeIntelligenceQuery,
} from "../types/TradeFlow";

export async function fetchStrategyOneTradeIntelligence(
  query: TradeIntelligenceQuery,
): Promise<StrategyOneTradeIntelligenceResponse> {
  const response =
    await api.get<StrategyOneTradeIntelligenceResponse>(
      "/api/strategies/strategy-one/trade-intelligence",
      {
        params: {
          mode: "PAPER",
          window: query.window,
          startAt: query.startAt,
          endAt: query.endAt,
        },
      },
    );

  return response.data;
}
