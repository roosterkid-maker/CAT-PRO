import crypto from "node:crypto";

import type { ExecutionPlan } from "../models/ExecutionPlan";
import type {
  ExecutionLegResult,
  ExecutionResult,
} from "../models/ExecutionResult";

export interface PaperExecutionConfig {
  buyFeePercent: number;
  sellFeePercent: number;
  simulatedSlippagePercent: number;
}

export const defaultPaperExecutionConfig:
  PaperExecutionConfig = {
  buyFeePercent: 0.1,
  sellFeePercent: 0.1,
  simulatedSlippagePercent: 0.02,
};

export class PaperOrderExecutor {
  execute(
    plan: ExecutionPlan,
    config: PaperExecutionConfig =
      defaultPaperExecutionConfig,
  ): ExecutionResult {
    if (plan.mode !== "PAPER") {
      throw new Error(
        "PaperOrderExecutor only supports PAPER execution plans.",
      );
    }

    if (plan.status !== "READY") {
      throw new Error(
        `Execution plan must be READY. Current status: ${plan.status}.`,
      );
    }

    const startedAt = Date.now();

    const slippageRatio =
      config.simulatedSlippagePercent / 100;

    const buyFillPrice =
      plan.buy.limitPrice *
      (1 + slippageRatio);

    const sellFillPrice =
      plan.sell.limitPrice *
      (1 - slippageRatio);

    const quantity = Math.min(
      plan.buy.quantity,
      plan.sell.quantity,
    );

    if (
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      throw new Error(
        "Execution plan contains an invalid quantity.",
      );
    }

    const buyResult =
      this.createFilledLeg(
        plan.buy.exchange,
        plan.market,
        "BUY",
        plan.buy.quantity,
        quantity,
        plan.buy.limitPrice,
        buyFillPrice,
        startedAt,
      );

    const sellResult =
      this.createFilledLeg(
        plan.sell.exchange,
        plan.market,
        "SELL",
        plan.sell.quantity,
        quantity,
        plan.sell.limitPrice,
        sellFillPrice,
        startedAt,
      );

    const buyNotional =
      buyFillPrice * quantity;

    const sellNotional =
      sellFillPrice * quantity;

    const buyFee =
      buyNotional *
      (config.buyFeePercent / 100);

    const sellFee =
      sellNotional *
      (config.sellFeePercent / 100);

    const grossProfit =
      sellNotional - buyNotional;

    const totalFees =
      buyFee + sellFee;

    const netProfit =
      grossProfit - totalFees;

    const netProfitPercent =
      buyNotional > 0
        ? (netProfit / buyNotional) * 100
        : 0;

    const completedAt = Date.now();

    return {
      planId: plan.id,

      market: plan.market,

      mode: plan.mode,

      status: "COMPLETED",

      buy: {
        ...buyResult,
        completedAt,
      },

      sell: {
        ...sellResult,
        completedAt,
      },

      capitalUsed: buyNotional,

      grossProfit,

      totalFees,

      netProfit,

      netProfitPercent,

      startedAt,

      completedAt,

      successful: true,

      failureReason: null,
    };
  }

  private createFilledLeg(
    exchange: string,
    market: string,
    side: "BUY" | "SELL",
    requestedQuantity: number,
    filledQuantity: number,
    requestedPrice: number,
    averageFillPrice: number,
    startedAt: number,
  ): ExecutionLegResult {
    return {
      exchange,

      market,

      side,

      requestedQuantity,

      filledQuantity,

      requestedPrice,

      averageFillPrice,

      status: "FILLED",

      orderId: crypto.randomUUID(),

      error: null,

      startedAt,

      completedAt: null,
    };
  }
}

export const paperOrderExecutor =
  new PaperOrderExecutor();