import { riskManagerService } from "../../risk/services/RiskManagerService";

import type { ExecutionContext } from "../models/ExecutionContext";
import { ExecutionState } from "../models/ExecutionState";

import type { ExecutionStage } from "./ExecutionStage";

export class RiskStage
  implements ExecutionStage
{
  readonly name = "RiskStage";

  async execute(
    context: ExecutionContext,
  ): Promise<ExecutionContext> {
    const assessment =
      riskManagerService.evaluate({
        liquidity: {
          requiredQuantity: 1,
          availableQuantity: 1,
        },

        spreadScore: 90,

        feeScore: 90,

        capitalScore: 90,
      });

    if (!assessment.approved) {
      throw new Error(
        assessment.rejectionReasons.join(
          ", ",
        ),
      );
    }

    return {
      ...context,

      state:
        ExecutionState.RISK_APPROVED,

      updatedAt: Date.now(),
    };
  }
}

export const riskStage =
  new RiskStage();