import type { ArbitrageOpportunity } from "../models/ArbitrageOpportunity";

export interface LiquidityResult {
  executableQty: number;

  liquidityScore: number;

  enoughLiquidity: boolean;
}

export class LiquidityEngine {
  evaluate(
    opportunity: ArbitrageOpportunity,
    requiredQty: number,
  ): LiquidityResult {
    const availableQty = Math.min(
      opportunity.buyAvailableQty,
      opportunity.sellAvailableQty,
    );

    const enoughLiquidity =
      availableQty >= requiredQty;

    const liquidityScore =
      requiredQty <= 0
        ? 0
        : Math.min(
            100,
            (availableQty / requiredQty) * 100,
          );

    return {
      executableQty: Math.min(
        availableQty,
        requiredQty,
      ),

      liquidityScore,

      enoughLiquidity,
    };
  }
}

export const liquidityEngine =
  new LiquidityEngine();