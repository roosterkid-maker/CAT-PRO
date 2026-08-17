import {
  useQuery,
} from "@tanstack/react-query";

import {
  fetchStrategyOneTradeFlow,
} from "../services/tradeFlowApi";

export function useStrategyOneTradeFlow() {
  return useQuery({
    queryKey: [
      "strategies",
      "strategy-one",
      "trade-flow",
    ],
    queryFn:
      fetchStrategyOneTradeFlow,
    refetchInterval:
      15_000,
    refetchIntervalInBackground:
      false,
    staleTime:
      10_000,
    retry:
      2,
  });
}
