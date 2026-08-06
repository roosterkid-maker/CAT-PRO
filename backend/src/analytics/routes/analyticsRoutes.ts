import {
  opportunityRejectionAnalyticsController,
} from "../controllers/OpportunityRejectionAnalyticsController";

import { Router } from "express";

import { analyticsService } from "../services/AnalyticsService";

const router = Router();

router.get(
  "/opportunity-rejections",
  opportunityRejectionAnalyticsController.getAnalytics.bind(
    opportunityRejectionAnalyticsController,
  ),
);

router.get(
  "/",
  (_request, response) => {
    try {
      const report =
        analyticsService.getReport();

      response.json({
        success: true,
        data: report,
      });
    } catch (error) {
      response.status(500).json({
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "Analytics report failed.",
      });
    }
  },
);

export default router;