import { profitWaterfallCalculator } from "../../../profit/calculators/ProfitWaterfallCalculator";

import type { ExecutionContext } from "../../models/ExecutionContext";

import type { ExecutionStage } from "../ExecutionStage";
import type { ExecutionStageResult } from "../ExecutionStageResult";

export class ProfitStage
  implements ExecutionStage
{
  readonly name = "Profit";

  execute(
    context: ExecutionContext,
  ): ExecutionStageResult {
    if (
      !context.buyVWAP ||
      !context.sellVWAP ||
      !context.buySlippage ||
      !context.sellSlippage ||
      !context.depth
    ) {
      return {
        success: false,
        context,
        reason:
          "Execution pipeline is incomplete.",
      };
    }

    const quantity =
      context.depth.executableQuantity;

    const grossSpreadProfit =
      (context.sellVWAP.averagePrice -
        context.buyVWAP.averagePrice) *
      quantity;

    /*
     * Temporary values.
     *
     * Next sprint these will come from:
     * Fee Engine
     * Transfer Engine
     * Network Fee Engine
     */
    const buyFees = 0;
    const sellFees = 0;
    const networkFees = 0;
    const transferCost = 0;

    const slippageCost =
      context.buySlippage.slippageCost +
      context.sellSlippage.slippageCost;

    context.profit =
      profitWaterfallCalculator.calculate({
        capital:
          context.request.capital,

        quantity,

        grossSpreadProfit,

        buyFees,

        sellFees,

        networkFees,

        transferCost,

        slippageCost,
      });

    return {
      success: true,
      context,
    };
  }
}

export const profitStage =
  new ProfitStage();