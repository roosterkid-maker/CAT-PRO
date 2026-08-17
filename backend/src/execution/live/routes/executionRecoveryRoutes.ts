import {
  Router,
} from "express";

import {
  authoritativeRecoveryInspectionService,
} from "../recovery/AuthoritativeRecoveryInspectionService";

import {
  executionRecoveryEngine,
} from "../recovery/ExecutionRecoveryEngine";

import {
  executionRecoveryResolutionService,
} from "../recovery/ExecutionRecoveryResolutionService";

import {
  executionRestartRecoveryGateService,
} from "../recovery/ExecutionRestartRecoveryGateService";

import {
  strategyOneTwoLegRecoveryResolutionService,
} from "../recovery/StrategyOneTwoLegRecoveryResolutionService";

import {
  strategyOneTwoLegRestartRecoveryService,
} from "../recovery/StrategyOneTwoLegRestartRecoveryService";

const router =
  Router();

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
        executionRecoveryEngine
          .getDiagnostics(),
    });
  },
);

/*
 * V18 BUILD 5
 */
router.get(
  "/authoritative-inspection",
  async (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data:
          await authoritativeRecoveryInspectionService
            .inspect(),
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
              : "Authoritative recovery inspection failed.",
        });
    }
  },
);

/*
 * VERSION 18 BUILD 13
 *
 * GET /api/execution/recovery/resolutions
 */
router.get(
  "/resolutions",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data: {
        resolutions:
          executionRecoveryResolutionService
            .getDiagnostics(),

        recoveryGate:
          executionRestartRecoveryGateService
            .getReport(),
      },
    });
  },
);

router.get(
  "/strategy-one-two-leg",
  (
    _request,
    response,
  ) => {
    response.json({
      success: true,
      data: {
        recoveryGate:
          strategyOneTwoLegRestartRecoveryService.getReport(),
        resolutions:
          strategyOneTwoLegRecoveryResolutionService.getDiagnostics(),
      },
    });
  },
);

router.post(
  "/strategy-one-two-leg/:sessionId/resolve",
  async (
    request,
    response,
  ) => {
    try {
      const resolutionNote =
        typeof request.body?.resolutionNote === "string"
          ? request.body.resolutionNote
          : "";
      const resolution =
        await strategyOneTwoLegRecoveryResolutionService.resolveSession(
          request.params.sessionId,
          resolutionNote,
        );

      response.json({
        success: true,
        data: {
          resolution,
          recoveryGate:
            strategyOneTwoLegRestartRecoveryService.getReport(),
        },
      });
    } catch (error: unknown) {
      response.status(409).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Strategy #1 two-leg recovery resolution failed.",
        recoveryGate:
          strategyOneTwoLegRestartRecoveryService.getReport(),
      });
    }
  },
);

/*
 * VERSION 18 BUILD 13
 *
 * POST
 * /api/execution/recovery/resolutions/:sessionId
 *
 * {
 *   "resolutionNote":
 *     "Authoritative exchange state verified."
 * }
 *
 * This endpoint performs status inspection only.
 *
 * No cancel.
 * No hedge.
 * No unwind.
 * No resubmit.
 */
router.post(
  "/resolutions/:sessionId",
  async (
    request,
    response,
  ) => {
    try {
      const resolutionNote =
        typeof request.body
          ?.resolutionNote ===
        "string"
          ? request.body
              .resolutionNote
          : "";

      const resolution =
        await executionRecoveryResolutionService
          .resolveSession(
            request.params
              .sessionId,

            resolutionNote,
          );

      response.json({
        success:
          true,

        data: {
          resolution,

          recoveryGate:
            executionRestartRecoveryGateService
              .getReport(),
        },
      });
    } catch (
      error:
        unknown
    ) {
      response
        .status(
          409,
        )
        .json({
          success:
            false,

          message:
            error instanceof Error
              ? error.message
              : "Recovery resolution failed.",

          recoveryGate:
            executionRestartRecoveryGateService
              .getReport(),
        });
    }
  },
);

router.post(
  "/scan",
  (
    _request,
    response,
  ) => {
    const detections =
      executionRecoveryEngine
        .scan();

    response.json({
      success:
        true,

      data: {
        detections,

        diagnostics:
          executionRecoveryEngine
            .getDiagnostics(),
      },
    });
  },
);

router.get(
  "/session/:sessionId",
  (
    request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data: {
          evaluation:
            executionRecoveryEngine
              .evaluateSession(
                request.params
                  .sessionId,
              ),

          incidents:
            executionRecoveryEngine
              .getBySession(
                request.params
                  .sessionId,
              ),

          durableResolution:
            executionRecoveryResolutionService
              .getResolution(
                request.params
                  .sessionId,
              ),

          durableResolutionCurrentlyValid:
            executionRecoveryResolutionService
              .isSessionResolved(
                request.params
                  .sessionId,
              ),
        },
      });
    } catch (
      error:
        unknown
    ) {
      response
        .status(
          404,
        )
        .json({
          success:
            false,

          message:
            error instanceof Error
              ? error.message
              : "Unable to evaluate execution recovery state.",
        });
    }
  },
);

router.get(
  "/:incidentId",
  (
    request,
    response,
  ) => {
    const incident =
      executionRecoveryEngine
        .getIncident(
          request.params
            .incidentId,
        );

    if (
      !incident
    ) {
      response
        .status(
          404,
        )
        .json({
          success:
            false,

          message:
            "Execution recovery incident not found.",
        });

      return;
    }

    response.json({
      success:
        true,

      data:
        incident,
    });
  },
);

router.post(
  "/:incidentId/acknowledge",
  (
    request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data:
          executionRecoveryEngine
            .acknowledge(
              request.params
                .incidentId,
            ),
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
              : "Unable to acknowledge recovery incident.",
        });
    }
  },
);

/*
 * Legacy runtime incident resolution.
 *
 * IMPORTANT:
 * this does NOT clear persisted Build 13
 * restart-recovery evidence.
 */
router.post(
  "/:incidentId/resolve",
  (
    request,
    response,
  ) => {
    try {
      const resolutionNote =
        typeof request.body
          ?.resolutionNote ===
        "string"
          ? request.body
              .resolutionNote
          : "";

      response.json({
        success:
          true,

        data:
          executionRecoveryEngine
            .resolve(
              request.params
                .incidentId,

              resolutionNote,
            ),

        durableRestartRecoveryCleared:
          false,
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
              : "Unable to resolve execution recovery incident.",
        });
    }
  },
);

export default router;
