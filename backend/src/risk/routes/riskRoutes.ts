import { Router } from "express";

import { riskEngine } from "../services/RiskEngine";

const router = Router();

router.post(
  "/evaluate",
  (request, response) => {
    try {
      if (
        !request.body ||
        typeof request.body !== "object"
      ) {
        response.status(400).json({
          success: false,
          message:
            "Request body is required.",
        });

        return;
      }

      const result =
        riskEngine.assess(
          request.body,
        );

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
            : "Risk evaluation failed.",
      });
    }
  },
);

export default router;