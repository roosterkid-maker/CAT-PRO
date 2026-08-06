import type { ExecutionRequest } from "../models/ExecutionRequest";
import type { ExecutionContext } from "../models/ExecutionContext";
import { ExecutionState } from "../models/ExecutionState";

export function createExecutionContext(
  request: ExecutionRequest,
): ExecutionContext {
  const now = Date.now();

  return {
    tradeId: request.tradeId,

    market: request.market,

    capital: request.capital,

    buyExchange:
      request.buyExchange,

    sellExchange:
      request.sellExchange,

    state: ExecutionState.IDLE,

    createdAt: now,

    updatedAt: now,
  };
}