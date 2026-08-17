import {
  Router,
} from "express";

import {
  opportunityService,
} from "../arbitrage/services/OpportunityService";

import {
  automatedPaperTradingService,
} from "../trading/execution/AutomatedPaperTradingService";

import {
  paperExecutionAccountingService,
} from "../trading/services/PaperExecutionAccountingService";

const router =
  Router();

router.get(
  "/accounting-diagnostics",
  (
    _request,
    response,
  ) => {
    return response.json({
      success:
        true,

      data:
        paperExecutionAccountingService
          .getDiagnostics(),
    });
  },
);

router.post(
  "/execute",
  async (
    request,
    response,
  ) => {
    try {
      const {
        opportunityId,
        requestedCapital,
      } = request.body;

      if (
        typeof opportunityId !==
        "string"
      ) {
        return response
          .status(400)
          .json({
            success:
              false,

            message:
              "Missing opportunityId.",
          });
      }

      if (
        typeof requestedCapital !==
          "number" ||
        !Number.isFinite(
          requestedCapital,
        ) ||
        requestedCapital <=
          0
      ) {
        return response
          .status(400)
          .json({
            success:
              false,

            message:
              "Invalid requestedCapital.",
          });
      }

      const opportunity =
        opportunityService
          .getOpportunityById(
            opportunityId,
          );

      if (
        !opportunity
      ) {
        return response
          .status(404)
          .json({
            success:
              false,

            message:
              "Opportunity not found or expired.",
          });
      }

      const execution =
        await automatedPaperTradingService
          .execute({
            opportunity,
            requestedCapital,
          });

      return response.json({
        success:
          execution.approved,

        data:
          execution,
      });
    } catch (
      error: unknown
    ) {
      return response
        .status(500)
        .json({
          success:
            false,

          message:
            error instanceof Error
              ? error.message
              : "Paper trading execution failed.",
        });
    }
  },
);

export default router;
