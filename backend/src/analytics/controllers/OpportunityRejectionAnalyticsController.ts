import type {
  Request,
  Response,
} from "express";

import {
  opportunityRejectionAnalyticsService,
} from "../services/OpportunityRejectionAnalyticsService";

export class OpportunityRejectionAnalyticsController {
  getAnalytics(
    _request: Request,
    response: Response,
  ): void {
    try {
      const analytics =
        opportunityRejectionAnalyticsService.generate();

      response.status(200).json({
        success: true,
        data: analytics,
      });
    } catch (error: unknown) {
      response.status(500).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to generate opportunity rejection analytics.",
      });
    }
  }
}

export const opportunityRejectionAnalyticsController =
  new OpportunityRejectionAnalyticsController();