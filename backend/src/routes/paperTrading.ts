import { Router } from "express";

import { opportunityService } from "../arbitrage/services/OpportunityService";
import { automatedPaperTradingService } from "../trading/execution/AutomatedPaperTradingService";

const router = Router();

router.post(
  "/execute",
  (request, response) => {
    const {
      opportunityId,
      requestedCapital,
    } = request.body;

    if (
      typeof opportunityId !== "string"
    ) {
      return response.status(400).json({
        success: false,
        message:
          "Missing opportunityId.",
      });
    }

    if (
      typeof requestedCapital !==
        "number" ||
      requestedCapital <= 0
    ) {
      return response.status(400).json({
        success: false,
        message:
          "Invalid requestedCapital.",
      });
    }

    const opportunity =
      opportunityService.getOpportunityById(
        opportunityId,
      );

    if (!opportunity) {
      return response.status(404).json({
        success: false,
        message:
          "Opportunity not found or expired.",
      });
    }

    const execution =
      automatedPaperTradingService.execute({
        opportunity,
        requestedCapital,
      });

    return response.json({
      success: execution.approved,

      data: execution,
    });
  },
);

export default router;