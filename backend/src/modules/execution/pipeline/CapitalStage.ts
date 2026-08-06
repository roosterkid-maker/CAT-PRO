import type { CapitalAllocationRequest } from "../../capital/models/CapitalAllocationRequest";
import { capitalFacade } from "../../capital/facades/CapitalFacade";

import type { ExecutionContext } from "../models/ExecutionContext";
import { ExecutionState } from "../models/ExecutionState";

import type { ExecutionStage } from "./ExecutionStage";

export class CapitalStage
  implements ExecutionStage
{
  readonly name = "CapitalStage";

  async execute(
    context: ExecutionContext,
  ): Promise<ExecutionContext> {
    const request: CapitalAllocationRequest =
      {
        opportunityId: context.tradeId,

        requestedCapital:
          context.capital,

        expectedProfitPercent: 0,

        priority: 100,
      };

    const result =
      capitalFacade.allocate(
        request,
      );

    if (!result.approved) {
      throw new Error(
        result.rejectionReason ??
          "Capital allocation failed.",
      );
    }

    return {
      ...context,

      state:
        ExecutionState.CAPITAL_ALLOCATED,

      updatedAt: Date.now(),
    };
  }
}

export const capitalStage =
  new CapitalStage();