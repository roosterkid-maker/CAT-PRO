import crypto from "node:crypto";

import {
  getExchangeFees,
} from "../../arbitrage/config/fees";

import type { ExecutionPlan } from "../models/ExecutionPlan";
import type {
  ExecutionLegResult,
  ExecutionResult,
} from "../models/ExecutionResult";

import {
  cloneStrategyAttribution,
  unattributedLegacyStrategyEvidence,
} from "../../strategies/models/StrategyAttribution";

import {
  paperVdaTaxWithholdingService,
} from "../services/PaperVdaTaxWithholdingService";

import type {
  StrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

export interface PaperExecutionConfig {
  simulatedSlippagePercent: number;

  buy?: PaperLegSimulationConfig;

  sell?: PaperLegSimulationConfig;
}

export interface PaperLegSimulationConfig {
  fillRatio?: number;

  /**
   * Current full-depth VWAP captured by the final PAPER stress gate.
   * It may only improve on the executable limit bound; callers cannot use
   * this override to manufacture a fill outside the submitted limit.
   */
  averageFillPrice?: number;

  terminalStatus?:
    | "FILLED"
    | "PARTIALLY_FILLED"
    | "FAILED"
    | "CANCELLED";

  failureReason?: string;
}

export const defaultPaperExecutionConfig:
  PaperExecutionConfig = {
  simulatedSlippagePercent: 0.02,
};

export class PaperOrderExecutor {
  execute(
    plan: ExecutionPlan,
    config: PaperExecutionConfig =
      defaultPaperExecutionConfig,
    strategyAttribution: StrategyAttribution =
      unattributedLegacyStrategyEvidence(),
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

    const buyResult =
      this.executeLeg(
        plan,
        "BUY",
        config,
      );

    const sellResult =
      this.executeLeg(
        plan,
        "SELL",
        config,
      );

    const quantity =
      Math.min(
        buyResult.filledQuantity,
        sellResult.filledQuantity,
      );

    if (
      !Number.isFinite(quantity) ||
      quantity < 0
    ) {
      throw new Error(
        "PAPER execution produced an invalid matched quantity.",
      );
    }

    const buyNotional =
      buyResult.averageFillPrice *
      quantity;

    const sellNotional =
      sellResult.averageFillPrice *
      quantity;

    const buyFeePercent =
      getExchangeFees(
        plan.buy.exchange,
        plan.market,
      ).takerPercent;

    const sellFeePercent =
      getExchangeFees(
        plan.sell.exchange,
        plan.market,
      ).takerPercent;

    const buyFee =
      buyNotional *
      (buyFeePercent / 100);

    const sellFee =
      sellNotional *
      (sellFeePercent / 100);

    const grossProfit =
      sellNotional - buyNotional;

    const totalFees =
      buyFee + sellFee;

    const netProfit =
      grossProfit - totalFees;

    const paperVdaTaxWithholding =
      paperVdaTaxWithholdingService
        .calculate({
          market:
            plan.market,
          quoteAsset:
            plan.buy.quoteAsset ??
            plan.sell.quoteAsset,
          buyExchange:
            plan.buy.exchange,
          sellExchange:
            plan.sell.exchange,
          buyNotional,
          sellNotional,
          buyTradingFee:
            buyFee,
          sellTradingFee:
            sellFee,
        });

    const tdsWithheld =
      paperVdaTaxWithholding
        .totalWithheld;

    const deployableCashProfit =
      netProfit -
      tdsWithheld;

    const netProfitPercent =
      buyNotional > 0
        ? (netProfit / buyNotional) * 100
        : 0;

    const completedAt =
      Math.max(
        buyResult.completedAt ??
          buyResult.startedAt,
        sellResult.completedAt ??
          sellResult.startedAt,
      );

    const balanced =
      Math.abs(
        buyResult.filledQuantity -
          sellResult.filledQuantity,
      ) <=
      Math.max(
        1e-12,
        Math.max(
          buyResult.requestedQuantity,
          sellResult.requestedQuantity,
        ) *
          1e-9,
      );

    const completed =
      buyResult.status ===
        "FILLED" &&
      sellResult.status ===
        "FILLED" &&
      balanced;

    const anyFill =
      buyResult.filledQuantity >
        0 ||
      sellResult.filledQuantity >
        0;

    return {
      strategyAttribution:
        cloneStrategyAttribution(
          strategyAttribution,
        ),

      planId: plan.id,

      market: plan.market,

      mode: plan.mode,

      paperVdaTaxWithholding,

      quoteTdsWithheld:
        tdsWithheld,

      quoteDeployableCashProfit:
        deployableCashProfit,

      tdsWithheld,

      deployableCashProfit,

      status:
        completed
          ? "COMPLETED"
          : anyFill
            ? "PARTIALLY_COMPLETED"
            : "FAILED",

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

      startedAt:
        Math.min(
          buyResult.startedAt,
          sellResult.startedAt,
        ),

      completedAt,

      successful:
        completed,

      failureReason:
        completed
          ? null
          : "PAPER execution legs did not finish with balanced full fills.",
    };
  }

  executeLeg(
    plan:
      ExecutionPlan,

    side:
      "BUY" |
      "SELL",

    config:
      PaperExecutionConfig =
      defaultPaperExecutionConfig,
  ): ExecutionLegResult {
    if (
      plan.mode !==
      "PAPER"
    ) {
      throw new Error(
        "PaperOrderExecutor only supports PAPER execution plans.",
      );
    }

    if (
      plan.status !==
      "READY"
    ) {
      throw new Error(
        `Execution plan must be READY. Current status: ${plan.status}.`,
      );
    }

    const leg =
      side ===
        "BUY"
        ? plan.buy
        : plan.sell;

    const legConfig =
      side ===
        "BUY"
        ? config.buy
        : config.sell;

    if (
      !Number.isFinite(
        leg.quantity,
      ) ||
      leg.quantity <=
        0 ||
      !Number.isFinite(
        leg.limitPrice,
      ) ||
      leg.limitPrice <=
        0
    ) {
      throw new Error(
        `${side} PAPER leg quantity and limit price must be positive.`,
      );
    }

    if (
      !Number.isFinite(
        config.simulatedSlippagePercent,
      ) ||
      config.simulatedSlippagePercent <
        0
    ) {
      throw new Error(
        "PAPER simulated slippage must be a non-negative finite number.",
      );
    }

    const fillRatio =
      legConfig
        ?.fillRatio ??
      1;

    if (
      !Number.isFinite(
        fillRatio,
      ) ||
      fillRatio <
        0 ||
      fillRatio >
        1
    ) {
      throw new Error(
        `${side} PAPER fill ratio must be between 0 and 1.`,
      );
    }

    const terminalStatus =
      legConfig
        ?.terminalStatus ??
      (
        fillRatio >=
          1
          ? "FILLED"
          : fillRatio >
              0
            ? "PARTIALLY_FILLED"
            : "FAILED"
      );

    const effectiveFillRatio =
      terminalStatus ===
        "FILLED"
        ? 1
        : terminalStatus ===
              "FAILED" ||
            terminalStatus ===
              "CANCELLED"
          ? 0
          : Math.min(
              fillRatio,
              1 -
                1e-12,
            );

    const filledQuantity =
      leg.quantity *
      effectiveFillRatio;

    const averageFillPriceOverride =
      legConfig
        ?.averageFillPrice;

    if (
      averageFillPriceOverride !==
        undefined &&
      (
        !Number.isFinite(
          averageFillPriceOverride,
        ) ||
        averageFillPriceOverride <=
          0
      )
    ) {
      throw new Error(
        `${side} PAPER average-fill override must be a positive finite number.`,
      );
    }

    const priceTolerance =
      Math.max(
        1e-12,
        leg.limitPrice *
          1e-9,
      );

    if (
      averageFillPriceOverride !==
        undefined &&
      (
        side ===
          "BUY"
          ? averageFillPriceOverride >
            leg.limitPrice +
              priceTolerance
          : averageFillPriceOverride <
            leg.limitPrice -
              priceTolerance
      )
    ) {
      throw new Error(
        `${side} PAPER average-fill override violates the executable limit price.`,
      );
    }

    const slippageRatio =
      config
        .simulatedSlippagePercent /
      100;

    const averageFillPrice =
      filledQuantity >
      0
        ? averageFillPriceOverride ??
          leg.limitPrice *
            (
              side ===
                "BUY"
                ? 1 +
                  slippageRatio
                : 1 -
                  slippageRatio
            )
        : 0;

    const startedAt =
      Date.now();

    return {
      exchange:
        leg.exchange,

      market:
        plan.market,

      side,

      requestedQuantity:
        leg.quantity,

      filledQuantity,

      requestedPrice:
        leg.limitPrice,

      averageFillPrice,

      status:
        terminalStatus,

      orderId:
        crypto.randomUUID(),

      error:
        terminalStatus ===
          "FILLED"
          ? null
          : legConfig
              ?.failureReason ??
            `Synthetic PAPER ${side} leg ended with ${terminalStatus}.`,

      startedAt,

      completedAt:
        startedAt,
    };
  }
}

export const paperOrderExecutor =
  new PaperOrderExecutor();
