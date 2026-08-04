import { Router } from "express";

import { capitalOptimizer } from "../services/CapitalOptimizer";

const router = Router();

router.post(
  "/capital",
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
        capitalOptimizer.optimize(
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
            : "Capital optimization failed.",
      });
    }
  },
);

export default router;