import {
  Router,
} from "express";

import {
  fiveExchangePaperShadowReadinessService,
} from "../services/FiveExchangePaperShadowReadinessService";

const router =
  Router();

router.get(
  "/",
  async (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,
        data:
          await fiveExchangePaperShadowReadinessService
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
              : "Five-exchange paper/shadow readiness failed.",
        });
    }
  },
);

export default router;
