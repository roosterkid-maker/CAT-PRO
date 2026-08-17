import {
  Router,
} from "express";

import {
  failureInjectionValidationService,
} from "../validation/FailureInjectionValidationService";

const router =
  Router();

/*
 * VERSION 18 BUILD 14
 *
 * GET /api/execution/validation
 *
 * Capability/status only.
 *
 * Does not run any drill.
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

      data: {
        generatedAt:
          Date.now(),

        version:
          "18.0",

        build:
          "14",

        syntheticOnly:
          true,

        realExchangeCallsMade:
          false,

        realOrdersSubmitted:
          false,

        realOrdersCancelled:
          false,

        realMoneyUsed:
          false,

        liveTradingEnabled:
          false,

        liveSubmissionAllowed:
          false,

        availableDrills: [
          "ORDER_DUPLICATE_RESTART_GUARD",
          "SETTLEMENT_CRASH_WINDOW",
          "ACCOUNTING_IDEMPOTENCY_RESTART",
          "PRE_SUBMISSION_NOT_DUPLICATE",
          "DRY_RUN_NOT_REAL_DUPLICATE",
        ],

        notes: [
          "POST /failure-drills runs isolated synthetic restart/persistence validation.",

          "Temporary validation files are deleted after each run.",

          "No exchange adapter is invoked.",
        ],
      },
    });
  },
);

/*
 * POST
 * /api/execution/validation/failure-drills
 *
 * Runs synthetic failure-injection suite.
 */
router.post(
  "/failure-drills",

  (
    _request,
    response,
  ) => {
    const report =
      failureInjectionValidationService
        .run();

    response
      .status(
        report
          .summary
          .allPassed
          ? 200
          : 500,
      )
      .json({
        success:
          report
            .summary
            .allPassed,

        data:
          report,
      });
  },
);

export default router;