import {
  Router,
} from "express";

import {
  riskDiagnosticsService,
} from "../services/RiskDiagnosticsService";

import {
  riskEngine,
} from "../services/RiskEngine";

const router =
  Router();

/*
 * Existing production endpoint preserved.
 *
 * POST /api/risk/evaluate
 */
router.post(
  "/evaluate",
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

      const result =
        riskEngine
          .assess(
            request.body,
          );

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
              : "Risk evaluation failed.",
        });
    }
  },
);

/*
 * Version 13.6
 *
 * GET /api/risk/diagnostics
 *
 * Current system-level risk context.
 *
 * Important:
 * freshness and synchronization are
 * opportunity-specific, so this endpoint
 * intentionally reports them as
 * NOT_APPLICABLE until a real opportunity
 * is evaluated.
 */
router.get(
  "/diagnostics",
  (
    _request,
    response,
  ) => {
    try {
      const diagnostics =
        riskDiagnosticsService
          .getDiagnostics();

      response.json({
        success:
          true,

        data:
          diagnostics,
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
              : "Unable to generate risk diagnostics.",
        });
    }
  },
);

/*
 * Version 13.6
 *
 * POST /api/risk/test
 *
 * Example:
 *
 * {
 *   "scenario": "HEALTHY"
 * }
 *
 * Optional:
 *
 * {
 *   "scenario": "HEALTHY",
 *   "capital": 10000,
 *   "market": "BTCUSDT",
 *   "buyExchange": "binance",
 *   "sellExchange": "bybit"
 * }
 *
 * This endpoint NEVER executes a trade.
 * It calls RiskEngine.assess() only.
 */
router.post(
  "/test",
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

      const scenario =
        request.body
          .scenario;

      if (
        !riskDiagnosticsService
          .isScenario(
            scenario,
          )
      ) {
        response
          .status(
            400,
          )
          .json({
            success:
              false,

            message:
              "Invalid scenario.",

            allowedScenarios: [
              "HEALTHY",
              "WARNING",
              "HIGH",
              "BLOCKED_FRESHNESS",
              "BLOCKED_SYNCHRONIZATION",
              "BLOCKED_CAPITAL",
              "BLOCKED_EXPOSURE",
            ],
          });

        return;
      }

      const capital =
        request.body
          .capital ===
        undefined
          ? undefined
          : Number(
              request.body
                .capital,
            );

      if (
        capital !==
          undefined &&
        (
          !Number.isFinite(
            capital,
          ) ||
          capital <=
            0
        )
      ) {
        response
          .status(
            400,
          )
          .json({
            success:
              false,

            message:
              "capital must be a positive finite number when provided.",
          });

        return;
      }

      const result =
        riskDiagnosticsService
          .runScenario({
            scenario,

            capital,

            market:
              request.body
                .market ===
              undefined
                ? undefined
                : String(
                    request.body
                      .market,
                  ),

            buyExchange:
              request.body
                .buyExchange ===
              undefined
                ? undefined
                : String(
                    request.body
                      .buyExchange,
                  ),

            sellExchange:
              request.body
                .sellExchange ===
              undefined
                ? undefined
                : String(
                    request.body
                      .sellExchange,
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
              : "Risk scenario test failed.",
        });
    }
  },
);

export default router;