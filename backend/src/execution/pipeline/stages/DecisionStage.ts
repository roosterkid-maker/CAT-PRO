import type {
  ExecutionContext,
} from "../../models/ExecutionContext";

import type {
  ExecutionStage,
} from "../ExecutionStage";

import type {
  ExecutionStageResult,
} from "../ExecutionStageResult";

export class DecisionStage
  implements ExecutionStage
{
  readonly name =
    "Decision";

  execute(
    context:
      ExecutionContext,
  ): ExecutionStageResult {
    if (
      !context.profit
    ) {
      return {
        success:
          false,

        context,

        reason:
          "Profit analysis is unavailable.",
      };
    }

    if (
      !context.confidence
    ) {
      return {
        success:
          false,

        context,

        reason:
          "Execution confidence analysis is unavailable.",
      };
    }

    const netProfit =
      context.profit
        .breakdown
        .netProfit;

    const profitPercent =
      context.profit
        .profitPercent;

    /*
     * Defensive profitability gate.
     *
     * ProfitStage already blocks this path,
     * but DecisionStage independently protects
     * against a future pipeline reorder or
     * direct stage invocation.
     */
    if (
      !Number.isFinite(
        netProfit,
      ) ||
      !Number.isFinite(
        profitPercent,
      ) ||
      netProfit <=
        0 ||
      profitPercent <=
        0 ||
      !context.profit
        .profitable
    ) {
      context.decision = {
        recommendation:
          "SKIP",

        confidence:
          0,

        reasons: [
          `Execution rejected because executable profit is not positive. Net profit ${Number.isFinite(
            netProfit,
          )
            ? netProfit.toFixed(
                8,
              )
            : "invalid"}, profit ${Number.isFinite(
            profitPercent,
          )
            ? profitPercent.toFixed(
                6,
              )
            : "invalid"}%.`,
        ],
      };

      return {
        success:
          true,

        context,
      };
    }

    const confidenceScore =
      this.clampScore(
        context.confidence
          .score,
      );

    const confidenceRecommendation =
      context.confidence
        .recommendation;

    const reasons =
      Array.from(
        new Set(
          context.confidence
            .reasons,
        ),
      );

    /*
     * Profitability is mandatory.
     *
     * Confidence can downgrade an otherwise
     * profitable trade, but it can never upgrade
     * an unprofitable trade.
     */
    if (
      confidenceRecommendation ===
        "EXECUTE" &&
      confidenceScore >=
        85
    ) {
      context.decision = {
        recommendation:
          "EXECUTE",

        confidence:
          confidenceScore,

        reasons,
      };

      return {
        success:
          true,

        context,
      };
    }

    if (
      confidenceRecommendation ===
        "SKIP" ||
      confidenceScore <
        65
    ) {
      context.decision = {
        recommendation:
          "SKIP",

        confidence:
          confidenceScore,

        reasons:
          reasons.length >
            0
            ? reasons
            : [
                "Execution confidence is below the required threshold.",
              ],
      };

      return {
        success:
          true,

        context,
      };
    }

    context.decision = {
      recommendation:
        "REVIEW",

      confidence:
        confidenceScore,

      reasons:
        reasons.length >
          0
          ? reasons
          : [
              "Trade is profitable but execution quality requires review.",
            ],
    };

    return {
      success:
        true,

      context,
    };
  }

  private clampScore(
    value:
      number,
  ): number {
    if (
      !Number.isFinite(
        value,
      )
    ) {
      return 0;
    }

    return Math.max(
      0,
      Math.min(
        100,
        value,
      ),
    );
  }
}

export const decisionStage =
  new DecisionStage();