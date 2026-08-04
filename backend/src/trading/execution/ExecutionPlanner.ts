import crypto from "node:crypto";
import type { TradingDecision } from "../orchestrator/TradingOrchestrator";
import type { ExecutionPlan } from "../models/ExecutionPlan";

export class ExecutionPlanner {
  createPlan(
    decision: TradingDecision,
    market: string,
    buyExchange: string,
    sellExchange: string,
    buyPrice: number,
    sellPrice: number,
  ): ExecutionPlan {
    if (!decision.approved) {
      throw new Error(
        "Trading decision is not approved.",
      );
    }

    const quantity =
      decision.allocatedCapital /
      buyPrice;

    return {
      id: crypto.randomUUID(),

      market,

      mode: "PAPER",

      strategy: "PARALLEL",

      status: "READY",

      capital:
        decision.allocatedCapital,

      expectedProfit:
        (sellPrice - buyPrice) *
        quantity,

      expectedProfitPercent:
        ((sellPrice - buyPrice) /
          buyPrice) *
        100,

      maximumSlippagePercent:
        0.05,

      timeoutMs: 3000,

      buy: {
        exchange: buyExchange,

        market,

        side: "BUY",

        quantity,

        limitPrice: buyPrice,
      },

      sell: {
        exchange: sellExchange,

        market,

        side: "SELL",

        quantity,

        limitPrice: sellPrice,
      },

      createdAt: Date.now(),
    };
  }
}

export const executionPlanner =
  new ExecutionPlanner();