import {
  api,
} from "@/api/client";

import type {
  StrategyOneTradeFlowResponse,
} from "../types/TradeFlow";

export async function fetchStrategyOneTradeFlow():
Promise<StrategyOneTradeFlowResponse> {
  const response =
    await api.get<StrategyOneTradeFlowResponse>(
      "/api/strategies/strategy-one/trade-flow",
    );

  return response.data;
}
