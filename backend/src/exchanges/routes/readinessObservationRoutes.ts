import {
  Router,
} from "express";

import {
  fiveExchangeReadinessObservationService,
} from "../services/FiveExchangeReadinessObservationService";

const router =
  Router();

router.get(
  "/",
  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,
        data:
          fiveExchangeReadinessObservationService
            .getReport(),
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
          message:
            error instanceof Error
              ? error.message
              : "Rolling five-exchange readiness evidence failed.",
        });
    }
  },
);

export default router;
