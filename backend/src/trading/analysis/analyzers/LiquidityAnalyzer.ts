import type { ArbitrageOpportunity } from "../../../arbitrage/models/ArbitrageOpportunity";

export interface LiquidityAnalysis {
  requiredQty: number;
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
    opportunity: ArbitrageOpportunity,
    minimumLiquidityPercent = 100,
  ): LiquidityAnalysis {
    const requiredQty =
      opportunity.requiredQty;

    const availableQty = Math.min(
      opportunity.buyAvailableQty,
      opportunity.sellAvailableQty,
    );

    const executableQty =
      Number.isFinite(requiredQty) &&
      Number.isFinite(availableQty)
        ? Math.max(
            0,
            Math.min(
              requiredQty,
              availableQty,
            ),
          )
        : 0;

    const liquidityPercent =
      requiredQty > 0 &&
      Number.isFinite(requiredQty)
        ? Math.max(
            0,
            Math.min(
              100,
              (availableQty / requiredQty) *
                100,
            ),
          )
        : 0;

    const validMinimumLiquidityPercent =
      Number.isFinite(
        minimumLiquidityPercent,
      )
        ? Math.max(
            0,
            Math.min(
              100,
              minimumLiquidityPercent,
            ),
          )
        : 100;

    const enoughLiquidity =
      requiredQty > 0 &&
      executableQty > 0 &&
      liquidityPercent >=
        validMinimumLiquidityPercent;

    const score = Math.round(
      liquidityPercent,
    );

    let reason: string;

    if (
      !Number.isFinite(requiredQty) ||
      requiredQty <= 0
    ) {
      reason =
        "Required trade quantity is invalid.";
    } else if (
      !Number.isFinite(availableQty) ||
      availableQty <= 0
    ) {
      reason =
        "No executable top-of-book liquidity is available.";
    } else if (!enoughLiquidity) {
      reason =
        `${liquidityPercent.toFixed(
          1,
        )}% liquidity is available; minimum required is ${validMinimumLiquidityPercent.toFixed(
          1,
        )}%.`;
    } else {
      reason =
        `${liquidityPercent.toFixed(
          1,
        )}% of the required quantity is executable at the current top-of-book prices.`;
    }

    return {
      requiredQty,
      availableQty,
      executableQty,

      liquidityPercent,

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