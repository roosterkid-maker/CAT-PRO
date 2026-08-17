import {
  Router,
} from "express";

import type {
  ExecutionPlan,
} from "../../../trading/models/ExecutionPlan";

import {
  liveExecutionCoordinator,
} from "../coordinator/LiveExecutionCoordinator";

import {
  executionRestartRecoveryGateService,
} from "../recovery/ExecutionRestartRecoveryGateService";

const router =
  Router();

/*
 * GET /api/execution/coordinator
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
        liveExecutionCoordinator
          .getDiagnostics(),
    });
  },
);

/*
 * VERSION 18 BUILD 4
 *
 * GET /api/execution/coordinator/restart-recovery
 *
 * Read-only startup/restart recovery
 * classification.
 *
 * No order is submitted, cancelled, hedged,
 * unwound or resumed here.
 */
router.get(
  "/restart-recovery",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data: {
        current:
          executionRestartRecoveryGateService
            .getReport(),

        startup:
          executionRestartRecoveryGateService
            .getStartupReport(),
      },
    });
  },
);

/*
 * GET /api/execution/coordinator/:id
 */
router.get(
  "/:id",
  (
    request,
    response,
  ) => {
    const session =
      liveExecutionCoordinator
        .getSession(
          request.params.id,
        );

    if (
      !session
    ) {
      response
        .status(
          404,
        )
        .json({
          success:
            false,

          message:
            "Live execution session not found.",
        });

      return;
    }

    response.json({
      success:
        true,

      data:
        session,
    });
  },
);

/*
 * POST /api/execution/coordinator/prepare
 *
 * VERSION 18 BUILD 4:
 *
 * Before a REAL LIVE session may even be
 * prepared, persisted restart-recovery
 * evidence must be CLEAN.
 *
 * IMPORTANT:
 *
 * This endpoint still does NOT place an
 * exchange order.
 */
router.post(
  "/prepare",
  async (
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
              "Execution plan request body is required.",
          });

        return;
      }

      const recoveryGate =
        executionRestartRecoveryGateService
          .canPrepareNewLiveExecution();

      if (
        !recoveryGate.allowed
      ) {
        response
          .status(
            409,
          )
          .json({
            success:
              false,

            message:
              "New LIVE execution preparation is blocked by the restart-recovery gate.",

            recovery:
              recoveryGate.report,

            reasons:
              recoveryGate.reasons,
          });

        return;
      }

      const result =
        await liveExecutionCoordinator
          .prepare(
            request.body as
              ExecutionPlan,
          );

      response
        .status(
          result.approved
            ? 200
            : 400,
        )
        .json({
          success:
            result.approved,

          data:
            result.session,

          reasons:
            result.reasons,
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
              : "Unable to prepare live execution session.",
        });
    }
  },
);

/*
 * POST /api/execution/coordinator/:id/cancel
 *
 * Only runtime pre-submission sessions can
 * be cancelled here.
 *
 * Historical persisted sessions are NOT
 * automatically restored into coordinator
 * memory.
 */
router.post(
  "/:id/cancel",
  (
    request,
    response,
  ) => {
    try {
      const reason =
        typeof request.body
          ?.reason ===
        "string"
          ? request.body
              .reason
          : "Live execution session cancelled manually.";

      const session =
        liveExecutionCoordinator
          .cancel(
            request.params.id,
            reason,
          );

      response.json({
        success:
          true,

        data:
          session,
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
              : "Unable to cancel live execution session.",
        });
    }
  },
);

export default router;