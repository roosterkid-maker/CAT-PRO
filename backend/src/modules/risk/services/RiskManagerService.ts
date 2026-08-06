import type { RiskEngine } from "../../../core/contracts/RiskEngine";
import {
  LiquidityAnalyzer,
  type LiquidityAnalysisInput,
} from "../analyzers/LiquidityAnalyzer";
import type { RiskAssessment } from "../models/RiskAssessment";

export interface RiskEvaluationInput {
  liquidity: LiquidityAnalysisInput;

  spreadScore: number;

  feeScore: number;

  capitalScore: number;
}

export class RiskManagerService
  implements RiskEngine
{
  private readonly minimumApprovalScore = 80;

  constructor(
    private readonly liquidityAnalyzer = new LiquidityAnalyzer(),
  ) {}

  evaluate(
    input: RiskEvaluationInput,
  ): RiskAssessment {
    const rejectionReasons: string[] = [];

    const liquidity =
      this.liquidityAnalyzer.analyze(
        input.liquidity,
      );

    if (!liquidity.approved) {
      rejectionReasons.push(
        "Insufficient liquidity.",
      );
    }

    if (input.spreadScore < 70) {
      rejectionReasons.push(
        "Spread score too low.",
      );
    }

    if (input.feeScore < 70) {
      rejectionReasons.push(
        "Fee score too low.",
      );
    }

    if (input.capitalScore < 70) {
      rejectionReasons.push(
        "Capital score too low.",
      );
    }

    const overallScore =
      liquidity.score * 0.35 +
      input.spreadScore * 0.25 +
      input.feeScore * 0.20 +
      input.capitalScore * 0.20;

    return {
      approved:
        rejectionReasons.length === 0 &&
        overallScore >=
          this.minimumApprovalScore,

      score: overallScore,

      rejectionReasons,

      liquidityScore:
        liquidity.score,

      spreadScore:
        input.spreadScore,

      feeScore: input.feeScore,

      capitalScore:
        input.capitalScore,

      overallScore,

      evaluatedAt: Date.now(),
    };
  }
}

export const riskManagerService =
  new RiskManagerService();