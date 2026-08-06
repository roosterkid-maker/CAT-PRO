export interface LiquidityAnalysisInput {
  requiredQuantity: number;
  availableQuantity: number;
}

export interface LiquidityAnalysisResult {
  approved: boolean;

  score: number;

  executableQuantity: number;

  liquidityPercent: number;
}

export class LiquidityAnalyzer {
  analyze(
    input: LiquidityAnalysisInput,
  ): LiquidityAnalysisResult {
    if (
      input.requiredQuantity <= 0 ||
      input.availableQuantity <= 0
    ) {
      return {
        approved: false,
        score: 0,
        executableQuantity: 0,
        liquidityPercent: 0,
      };
    }

    const executableQuantity =
      Math.min(
        input.requiredQuantity,
        input.availableQuantity,
      );

    const liquidityPercent =
      (input.availableQuantity /
        input.requiredQuantity) *
      100;

    const score = Math.min(
      100,
      liquidityPercent,
    );

    return {
      approved: liquidityPercent >= 100,
      score,
      executableQuantity,
      liquidityPercent,
    };
  }
}

export const liquidityAnalyzer =
  new LiquidityAnalyzer();