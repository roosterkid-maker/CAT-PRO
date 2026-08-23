import {
  Router,
} from "express";

import {
  productionAlertHistoryService,
} from "../alerts/ProductionAlertHistoryService";

import {
  productionAlertService,
} from "../alerts/ProductionAlertService";

const router =
  Router();

/*
 * VERSION 18 BUILD 11
 *
 * GET /api/execution/alerts
 */
router.get(
  "/",

  (
    _request,
    response,
  ) => {
    const report =
      productionAlertService
        .getReport();

    response
      .status(
        report.systemState ===
          "BLOCKED"
          ? 503
          : 200,
      )
      .json({
        success:
          report.systemState !==
          "BLOCKED",

        data:
          report,
      });
  },
);

/*
 * VERSION 18 BUILD 12
 *
 * GET /api/execution/alerts/history
 */
router.get(
  "/history",

  (
    _request,
    response,
  ) => {
    const report =
      productionAlertHistoryService
        .getReport();

    response
      .status(
        report
          .livePromotionBlocked
          ? 503
          : 200,
      )
      .json({
        success:
          !report
            .livePromotionBlocked,

        data:
          report,
      });
  },
);

/*
 * GET /api/execution/alerts/history/:key
 */
router.get(
  "/history/:key",

  (
    request,
    response,
  ) => {
    const alert =
      productionAlertHistoryService
        .getAlert(
          request.params.key,
        );

    if (
      !alert
    ) {
      response
        .status(
          404,
        )
        .json({
          success:
            false,

          message:
            "Production alert history record not found.",
        });

      return;
    }

    response.json({
      success:
        true,

      data:
        alert,
    });
  },
);

/*
 * POST
 * /api/execution/alerts/history/:key/acknowledge
 *
 * Optional body:
 *
 * {
 *   "note": "Reviewed by operator"
 * }
 */
router.post(
  "/history/:key/acknowledge",

  (
    request,
    response,
  ) => {
    try {
      const note =
        typeof request.body
          ?.note ===
        "string"
          ? request.body.note
          : "";

      response.json({
        success:
          true,

        data:
          productionAlertHistoryService
            .acknowledge(
              request.params.key,

              note,
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
              : "Unable to acknowledge production alert.",
        });
    }
  },
);

/*
 * POST
 * /api/execution/alerts/history/:key/resolve
 *
 * {
 *   "resolutionNote":
 *     "Underlying condition verified clear."
 * }
 *
 * Active conditions cannot be resolved.
 */
router.post(
  "/history/:key/resolve",

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
          productionAlertHistoryService
            .resolve(
              request.params.key,

              resolutionNote,
            ),
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
              : "Unable to resolve production alert.",
        });
    }
  },
);

/*
 * POST /api/execution/alerts/history/resolve-inactive
 *
 * {
 *   "resolutionNote":
 *     "Underlying condition validated clear."
 * }
 *
 * Optional:
 * {
 *   "onlyCritical": true
 * }
 *
 * Resolves all matching inactive history rows.
 */
router.post(
  "/history/resolve-inactive",

  (
    request,
    response,
  ) => {
    try {
      const body =
        request.body ?? {};

      const resolutionNote =
        typeof body
          .resolutionNote ===
          "string"
          ? body.resolutionNote
          : "";

      const onlyCritical =
        typeof body
          .onlyCritical ===
          "boolean"
          ? body.onlyCritical
          : false;

      const resolved =
        productionAlertHistoryService
          .resolveInactive(
            resolutionNote,
            onlyCritical,
          );

      response.json({
        success:
          true,

        data: {
          resolvedCount:
            resolved.length,

          alerts:
            resolved,
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
              : "Unable to resolve inactive production alerts.",
        });
    }
  },
);

export default router;
