import { Router } from "express";

import { executionSimulator } from "../services/ExecutionSimulator";

const router = Router();

router.post(
  "/simulate",
  (request, response) => {
    try {
      const simulation =
        executionSimulator.simulate(
          request.body,
        );

      response.json({
        success: true,
        data: simulation,
      });
    } catch (error) {
      response.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Execution simulation failed.",
      });
    }
  },
);

export default router;