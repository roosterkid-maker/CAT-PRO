import type { ProfitWaterfall } from "../models/ProfitWaterfall";

export class ProfitWaterfallCalculator {
  calculate(params: {
    capital: number;

    quantity: number;

    grossSpreadProfit: number;

    buyFees: number;

    sellFees: number;

    networkFees: number;

    transferCost: number;

    slippageCost: number;

    taxes?: number;
  }): ProfitWaterfall {
    const taxes =
      params.taxes ?? 0;

    const netProfit =
      params.grossSpreadProfit -
      params.buyFees -
      params.sellFees -
      params.networkFees -
      params.transferCost -
      params.slippageCost -
      taxes;

    const profitPercent =
      params.capital > 0
        ? (netProfit / params.capital) *
          100
        : 0;

    return {
      capital: params.capital,

      quantity: params.quantity,

      breakdown: {
        grossSpreadProfit:
          params.grossSpreadProfit,

        buyFees:
          params.buyFees,

        sellFees:
          params.sellFees,

        networkFees:
          params.networkFees,

        transferCost:
          params.transferCost,

        slippageCost:
          params.slippageCost,

        taxes,

        netProfit,
      },

      profitPercent,

      profitable:
        netProfit > 0,
    };
  }
}

export const profitWaterfallCalculator =
  new ProfitWaterfallCalculator();