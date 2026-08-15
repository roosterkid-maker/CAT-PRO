import {
  Router,
} from "express";

import {
  fillEngine,
} from "../fills/FillEngine";

const router =
  Router();

/*
 * GET /api/execution/fills
 *
 * Version 14.2 Fill Engine diagnostics.
 */
router.get(
  "/",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data:
        fillEngine
          .getDiagnostics(),
    });
  },
);

/*
 * GET /api/execution/fills/:orderLifecycleId
 */
router.get(
  "/:orderLifecycleId",
  (
    request,
    response,
  ) => {
    const summary =
      fillEngine
        .getSummary(
          request.params
            .orderLifecycleId,
        );

    if (!summary) {
      response
        .status(
          404,
        )
        .json({
          success:
            false,

          message:
            "Fill summary not found.",
        });

      return;
    }

    response.json({
      success:
        true,

      data:
        summary,
    });
  },
);

/*
 * POST /api/execution/fills/preview
 *
 * Safe calculation only.
 *
 * It does NOT:
 *
 * - create lifecycle records
 * - update lifecycle records
 * - submit exchange orders
 * - reserve capital
 *
 * Example:
 *
 * {
 *   "side": "buy",
 *   "requestedQuantity": 10,
 *   "filledQuantity": 8,
 *   "requestedPrice": 100,
 *   "averageFillPrice": 100.2,
 *   "feeAmount": 0.8,
 *   "executionTimeMs": 450
 * }
 */
router.post(
  "/preview",
  (
    request,
    response,
  ) => {
    try {
      if (
        !request.body ||
        typeof request.body !==
          "object"
      ) {
        response
          .status(
            400,
          )
          .json({
            success:
              false,

            message:
              "Request body is required.",
          });

        return;
      }

      const requestedPrice =
        request.body
          .requestedPrice ===
          null ||
        request.body
          .requestedPrice ===
          undefined
          ? null
          : Number(
              request.body
                .requestedPrice,
            );

      const result =
        fillEngine
          .preview({
            side:
              String(
                request.body
                  .side ??
                  "",
              ) as
                | "buy"
                | "sell",

            requestedQuantity:
              Number(
                request.body
                  .requestedQuantity,
              ),

            filledQuantity:
              Number(
                request.body
                  .filledQuantity,
              ),

            requestedPrice,

            averageFillPrice:
              Number(
                request.body
                  .averageFillPrice,
              ),

            feeAmount:
              Number(
                request.body
                  .feeAmount,
              ),

            executionTimeMs:
              Number(
                request.body
                  .executionTimeMs,
              ),
          });

      response.json({
        success:
          true,

        data:
          result,
      });
    } catch (
      error:
        unknown
    ) {
      response
        .status(
          400,
        )
        .json({
          success:
            false,

          message:
            error instanceof Error
              ? error.message
              : "Unable to calculate fill quality preview.",
        });
    }
  },
);

export default router;