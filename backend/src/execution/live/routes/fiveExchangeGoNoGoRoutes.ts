import {
  Router,
} from "express";

import {
  fiveExchangeGoNoGoService,
} from "../readiness/FiveExchangeGoNoGoService";

const router =
  Router();

router.get(
  "/",
  (
    _request,
    response,
  ) => {
    try {
      const report =
        fiveExchangeGoNoGoService
          .getReport();

      response
        .status(
          report.activationReviewEligible
            ? 200
            : 409,
        )
        .json({
          success:
            report.activationReviewEligible,
          data:
            report,
        });
    } catch (
      error:
        unknown
    ) {
      response
        .status(
          500,
        )
        .json({
          success:
            false,
          data: {
            generatedAt:
              Date.now(),
            version:
              "19.35",
            decision:
              "NO_GO",
            activationReviewEligible:
              false,
            liveTradingEnabled:
              false,
            liveSubmissionAllowed:
              false,
            error:
              error instanceof Error
                ? error.message
                : "Five-exchange go/no-go evaluation failed.",
          },
        });
    }
  },
);

export default router;
