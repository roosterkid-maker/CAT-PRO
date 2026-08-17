import {
  Router,
} from "express";

import {
  executionDryRunHarness,
} from "../dryrun/ExecutionDryRunHarness";

const router =
  Router();

/*
 * POST /api/execution/dry-run
 *
 * {
 *   "scenario": "BALANCED_SUCCESS"
 * }
 *
 * or:
 *
 * {
 *   "scenario": "SELL_FAILED"
 * }
 *
 * ZERO exchange orders are submitted.
 */
router.post(
  "/",
  (
    request,
    response,
  ) => {
    try {
      const scenario =
        request.body
          ?.scenario;

      if (
        !executionDryRunHarness
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
              "Invalid dry-run scenario.",

            allowedScenarios: [
              "BALANCED_SUCCESS",
              "SELL_FAILED",
            ],
          });

        return;
      }

      const result =
        executionDryRunHarness
          .run(
            scenario,
          );

      response
        .status(
          result.passed
            ? 200
            : 409,
        )
        .json({
          success:
            result.passed,

          data:
            result,
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
              : "Execution dry run failed.",
        });
    }
  },
);

/*
 * POST /api/execution/dry-run/suite
 *
 * Runs:
 *
 * BALANCED_SUCCESS
 * SELL_FAILED
 *
 * sequentially.
 */
router.post(
  "/suite",
  (
    _request,
    response,
  ) => {
    try {
      const result =
        executionDryRunHarness
          .runSuite();

      response
        .status(
          result.passed
            ? 200
            : 409,
        )
        .json({
          success:
            result.passed,

          data:
            result,
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
              : "Execution dry-run suite failed.",
        });
    }
  },
);

export default router;