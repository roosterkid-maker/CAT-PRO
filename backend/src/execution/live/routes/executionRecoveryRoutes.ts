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

import {
  strategyOneResidualRecoveryAssistantService,
} from "../recovery/StrategyOneResidualRecoveryAssistantService";

import {
  strategyOneResidualRecoveryExecutionService,
} from "../recovery/StrategyOneResidualRecoveryExecutionService";

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

/*
 * CAT PRO V142
 *
 * Evidence-only Strategy #1 residual-recovery assistant. GET is a pure
 * diagnostics read. Explicit inspection may perform known-order status reads
 * through allowNewSubmission=false reconciliation, but it cannot submit,
 * cancel, transfer, withdraw or otherwise mutate exchange state.
 */
router.get(
  "/strategy-one-residual-assistant",
  (
    _request,
    response,
  ) => {
    response.setHeader("Cache-Control", "no-store");
    response.json({
      success: true,
      data: strategyOneResidualRecoveryAssistantService.getDiagnostics(),
    });
  },
);

router.post(
  "/strategy-one-residual-assistant/:sessionId/inspect",
  async (
    request,
    response,
  ) => {
    response.setHeader("Cache-Control", "no-store");

    try {
      const preview =
        await strategyOneResidualRecoveryAssistantService.inspectSession(
          request.params.sessionId,
        );

      response
        .status(preview.state === "BLOCKED" ? 409 : 200)
        .json({success: preview.state !== "BLOCKED", data: preview});
    } catch (error: unknown) {
      response.status(409).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Strategy #1 residual recovery inspection failed closed.",
      });
    }
  },
);

router.put(
  "/strategy-one-residual-assistant/:previewId/approve",
  (
    request,
    response,
  ) => {
    response.setHeader("Cache-Control", "no-store");

    try {
      const preview =
        strategyOneResidualRecoveryAssistantService.approvePreview(
          request.params.previewId,
          typeof request.body?.confirmation === "string"
            ? request.body.confirmation
            : "",
        );

      response.json({success: true, data: preview});
    } catch (error: unknown) {
      response.status(409).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Strategy #1 recovery approval failed closed.",
      });
    }
  },
);

/*
 * CAT PRO V202
 *
 * The GET route is diagnostics-only. POST is the sole explicit one-time
 * residual-recovery submission boundary: it requires a separately approved,
 * still-current preview and its own exact execution phrase. The service
 * journals before gateway I/O and never retries, replaces, cancels, transfers
 * or withdraws automatically.
 */
router.get(
  "/strategy-one-residual-execution",
  (
    _request,
    response,
  ) => {
    response.setHeader("Cache-Control", "no-store");
    response.json({
      success: true,
      data: strategyOneResidualRecoveryExecutionService.getDiagnostics(),
    });
  },
);

router.post(
  "/strategy-one-residual-assistant/:previewId/execute",
  async (
    request,
    response,
  ) => {
    response.setHeader("Cache-Control", "no-store");

    try {
      const result =
        await strategyOneResidualRecoveryExecutionService.execute(
          request.params.previewId,
          typeof request.body?.confirmation === "string"
            ? request.body.confirmation
            : "",
          typeof request.body?.resolutionNote === "string"
            ? request.body.resolutionNote
            : "",
        );

      response
        .status(result.state === "COMPLETED_RESOLVED" ? 200 : 409)
        .json({
          success: result.state === "COMPLETED_RESOLVED",
          data: result,
          recoveryGate: strategyOneTwoLegRestartRecoveryService.getReport(),
        });
    } catch (error: unknown) {
      response.status(409).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "One-time Strategy #1 residual recovery failed closed.",
        recoveryGate: strategyOneTwoLegRestartRecoveryService.getReport(),
      });
    }
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
