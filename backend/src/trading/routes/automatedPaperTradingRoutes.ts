import {
  Router,
} from "express";

import {
  automatedPaperTradingCycleService,
} from "../execution/AutomatedPaperTradingCycleService";

const router =
  Router();

router.post(
  "/cycle",
  async (
    _request,
    response,
  ) => {
    try {
      const result =
        await automatedPaperTradingCycleService
          .run();

      return response.json({
        success:
          true,

        data:
          result,
      });
    } catch (
      error: unknown
    ) {
      return response
        .status(400)
        .json({
          success:
            false,

          message:
            error instanceof Error
              ? error.message
              : "Automated paper-trading cycle failed.",
        });
    }
  },
);

export default router;