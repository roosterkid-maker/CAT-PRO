import type { ExecutionContext } from "../../models/ExecutionContext";

export interface LiquidityAnalysis {
  requestedQty: number;
  availableQty: number;
  executableQty: number;

  liquidityPercent: number;
  minimumLiquidityPercent: number;

  score: number;
  enoughLiquidity: boolean;

  reason: string;
}

export class LiquidityAnalyzer {
  analyze(
    context: ExecutionContext,
    minimumLiquidityPercent = 100,
  ): LiquidityAnalysis {
    const validMinimumLiquidityPercent =
      Number.isFinite(minimumLiquidityPercent)
        ? Math.max(
            0,
            Math.min(
              100,
              minimumLiquidityPercent,
            ),
          )
        : 100;

    const enoughLiquidity =
      context.executableQty > 0 &&
      context.liquidityPercent >=
        validMinimumLiquidityPercent;

    const score = Math.round(
      Math.max(
        0,
        Math.min(
          100,
          context.liquidityPercent,
        ),
      ),
    );

    let reason: string;

    if (
      !Number.isFinite(context.requestedQty) ||
      context.requestedQty <= 0
    ) {
      reason =
        "Requested trade quantity is invalid.";
    } else if (
      !Number.isFinite(context.availableQty) ||
      context.availableQty <= 0
    ) {
      reason =
        "No executable top-of-book liquidity is available.";
    } else if (!enoughLiquidity) {
      reason =
        `${context.liquidityPercent.toFixed(
          1,
        )}% liquidity is available; minimum required is ${validMinimumLiquidityPercent.toFixed(
          1,
        )}%.`;
    } else {
      reason =
        `${context.liquidityPercent.toFixed(
          1,
        )}% of the requested quantity is executable at the current top-of-book prices.`;
    }

    return {
      requestedQty:
        context.requestedQty,

      availableQty:
        context.availableQty,

      executableQty:
        context.executableQty,

      liquidityPercent:
        context.liquidityPercent,

      minimumLiquidityPercent:
        validMinimumLiquidityPercent,

      score,
      enoughLiquidity,

      reason,
    };
  }
}

export const liquidityAnalyzer =
  new LiquidityAnalyzer();