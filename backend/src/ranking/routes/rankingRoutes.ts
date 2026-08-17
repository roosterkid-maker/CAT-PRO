import { Router } from "express";

import { opportunityRankingService } from "../services/OpportunityRankingService";

const router = Router();

router.get(
  "/",
  (_request, response) => {
    console.log(
      "[Ranking API] Request received",
    );

    try {
      const result =
        opportunityRankingService.rank();

      console.log(
        "[Ranking API] Ranked opportunities:",
        result.opportunities.length,
      );

      response.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error(
        "[Ranking API] Failed:",
        error,
      );

      response.status(500).json({
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "Opportunity ranking failed.",
      });
    }
  },
);

export default router;