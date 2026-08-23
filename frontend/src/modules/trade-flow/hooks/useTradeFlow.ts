import {
  useQuery,
} from "@tanstack/react-query";

import {
  fetchStrategyOneTradeIntelligence,
} from "../services/tradeFlowApi";

import type {
  TradeIntelligenceQuery,
} from "../types/TradeFlow";

export function useStrategyOneTradeIntelligence(
  query: TradeIntelligenceQuery,
) {
  return useQuery({
    queryKey: [
      "strategies",
      "strategy-one",
      "trade-intelligence",
      query.window,
      query.startAt ?? null,
      query.endAt ?? null,
    ],
    queryFn: () => fetchStrategyOneTradeIntelligence(query),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
    retry: 2,
  });
}
