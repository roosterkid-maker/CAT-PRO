import { Router } from "express";

import { automatedPaperTradingCycleService } from "../execution/AutomatedPaperTradingCycleService";

const router = Router();

router.post(
  "/cycle",
  (_request, response) => {
    try {
      const result =
        automatedPaperTradingCycleService.run();

      response.json({
        success: true,
        data: result,
      });
    } catch (error) {
      response.status(400).json({
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "Automated paper-trading cycle failed.",
      });
    }
  },
);

export default router;