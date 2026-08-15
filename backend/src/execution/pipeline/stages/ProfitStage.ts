import {
  profitWaterfallCalculator,
} from "../../../profit/calculators/ProfitWaterfallCalculator";

import {
  getExchangeFees,
} from "../../../arbitrage/config/fees";

import type {
  ExecutionContext,
} from "../../models/ExecutionContext";

import type {
  ExecutionStage,
} from "../ExecutionStage";

import type {
  ExecutionStageResult,
} from "../ExecutionStageResult";

export class ProfitStage
  implements ExecutionStage
{
  readonly name =
    "Profit";

  execute(
    context:
      ExecutionContext,
  ): ExecutionStageResult {
    if (
      !context.buyVWAP ||
      !context.sellVWAP ||
      !context.buySlippage ||
      !context.sellSlippage ||
      !context.depth
    ) {
      return {
        success:
          false,

        context,

        reason:
          "Execution pipeline is incomplete before profit calculation.",
      };
    }

    const quantity =
      context.depth
        .executableQuantity;

    if (
      !Number.isFinite(
        quantity,
      ) ||
      quantity <=
        0
    ) {
      return {
        success:
          false,

        context,

        reason:
          "Executable quantity is invalid for profit calculation.",
      };
    }

    const buyAveragePrice =
      context.buyVWAP
        .averagePrice;

    const sellAveragePrice =
      context.sellVWAP
        .averagePrice;

    if (
      !Number.isFinite(
        buyAveragePrice,
      ) ||
      !Number.isFinite(
        sellAveragePrice,
      ) ||
      buyAveragePrice <=
        0 ||
      sellAveragePrice <=
        0
    ) {
      return {
        success:
          false,

        context,

        reason:
          "VWAP prices are invalid for profit calculation.",
      };
    }

    const grossSpreadProfit =
      (
        sellAveragePrice -
        buyAveragePrice
      ) *
      quantity;

    let buyFeePercent:
      number;

    let sellFeePercent:
      number;

    try {
      buyFeePercent =
        getExchangeFees(
          context.request
            .buyExchange,
          context.request
            .market,
        ).takerPercent;

      sellFeePercent =
        getExchangeFees(
          context.request
            .sellExchange,
          context.request
            .market,
        ).takerPercent;
    } catch (
      error:
        unknown
    ) {
      return {
        success:
          false,

        context,

        reason:
          error instanceof Error
            ? error.message
            : "Market-specific fee evidence is unavailable.",
      };
    }

    const buyNotional =
      context.buyVWAP
        .totalCost;

    const sellNotional =
      context.sellVWAP
        .totalCost;

    const buyFees =
      buyNotional *
      (
        buyFeePercent /
        100
      );

    const sellFees =
      sellNotional *
      (
        sellFeePercent /
        100
      );

    /*
     * Network / transfer costs remain zero for
     * pre-funded cross-exchange arbitrage.
     *
     * We should not manufacture withdrawal
     * costs when assets are already available
     * on both exchanges for execution.
     */
    const networkFees =
      0;

    const transferCost =
      0;

    const slippageCost =
      Math.max(
        0,
        context
          .buySlippage
          .slippageCost,
      ) +
      Math.max(
        0,
        context
          .sellSlippage
          .slippageCost,
      );

    context.profit =
      profitWaterfallCalculator
        .calculate({
          capital:
            context.request
              .capital,

          quantity,

          grossSpreadProfit,

          buyFees,

          sellFees,

          networkFees,

          transferCost,

          slippageCost,
        });

    const netProfit =
      context.profit
        .breakdown
        .netProfit;

    const profitPercent =
      context.profit
        .profitPercent;

    if (
      !Number.isFinite(
        netProfit,
      ) ||
      !Number.isFinite(
        profitPercent,
      )
    ) {
      return {
        success:
          false,

        context,

        reason:
          "Calculated executable profit is invalid.",
      };
    }

    /*
     * HARD EXECUTABLE-PROFIT GATE
     *
     * A trade that loses money after:
     *
     * - VWAP
     * - trading fees
     * - slippage
     * - network cost
     * - transfer cost
     *
     * must never continue toward an execution
     * recommendation.
     */
    if (
      netProfit <=
        0 ||
      !context.profit
        .profitable
    ) {
      return {
        success:
          false,

        context,

        reason:
          `Trade is not executable after fees and slippage. Net profit ${netProfit.toFixed(
            8,
          )}, profit ${profitPercent.toFixed(
            6,
          )}%.`,
      };
    }

    return {
      success:
        true,

      context,
    };
  }
}

export const profitStage =
  new ProfitStage();
