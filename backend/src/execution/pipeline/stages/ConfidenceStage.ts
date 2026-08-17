import {
  profitConfidenceCalculator,
} from "../../../profit/calculators/ProfitConfidenceCalculator";

import type { ExecutionContext } from "../../models/ExecutionContext";

import type { ExecutionStage } from "../ExecutionStage";
import type { ExecutionStageResult } from "../ExecutionStageResult";

export class ConfidenceStage
  implements ExecutionStage
{
  readonly name = "Confidence";

  execute(
    context: ExecutionContext,
  ): ExecutionStageResult {
    if (
      !context.depth ||
      !context.buySlippage ||
      !context.sellSlippage ||
      !context.profit
    ) {
      return {
        success: false,
        context,
        reason:
          "Execution metrics are incomplete.",
      };
    }

    const liquidityScore =
      Math.round(
        context.depth.fillPercent,
      );

    const spreadScore =
      context.profit.profitable
        ? 100
        : 0;

    const feeScore = 100;

    const averageSlippage =
      (
        Math.abs(
          context.buySlippage.slippagePercent,
        ) +
        Math.abs(
          context.sellSlippage.slippagePercent,
        )
      ) / 2;

    const slippageScore =
      Math.max(
        0,
        100 - averageSlippage * 100,
      );

    const fillScore =
      Math.round(
        context.depth.fillPercent,
      );

    context.confidence =
      profitConfidenceCalculator.calculate(
        {
          liquidityScore,

          spreadScore,

          feeScore,

          slippageScore,

          fillScore,
        },
      );

    return {
      success: true,
      context,
    };
  }
}

export const confidenceStage =
  new ConfidenceStage();