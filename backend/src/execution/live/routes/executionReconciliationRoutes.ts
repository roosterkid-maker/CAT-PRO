import {
  Router,
} from "express";

import {
  executionReconciliationEngine,
} from "../reconciliation/ExecutionReconciliationEngine";

const router =
  Router();

/*
 * GET /api/execution/reconciliation
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
        executionReconciliationEngine
          .getDiagnostics(),
    });
  },
);

/*
 * POST /api/execution/reconciliation/scan
 *
 * Read-only remote order-state scan.
 *
 * No cancellation, replacement or order
 * submission occurs.
 */
router.post(
  "/scan",
  async (
    _request,
    response,
  ) => {
    try {
      const checked =
        await executionReconciliationEngine
          .scan();

      response.json({
        success:
          true,

        data: {
          checked,

          diagnostics:
            executionReconciliationEngine
              .getDiagnostics(),
        },
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
              : "Execution reconciliation scan failed.",
        });
    }
  },
);

/*
 * POST /api/execution/reconciliation/order/:orderLifecycleId
 */
router.post(
  "/order/:orderLifecycleId",
  async (
    request,
    response,
  ) => {
    try {
      const record =
        await executionReconciliationEngine
          .reconcileOrder(
            request.params
              .orderLifecycleId,
          );

      response.json({
        success:
          true,

        data:
          record,
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
              : "Unable to reconcile lifecycle order.",
        });
    }
  },
);

/*
 * GET /api/execution/reconciliation/order/:orderLifecycleId
 */
router.get(
  "/order/:orderLifecycleId",
  (
    request,
    response,
  ) => {
    const record =
      executionReconciliationEngine
        .getRecord(
          request.params
            .orderLifecycleId,
        );

    if (
      !record
    ) {
      response
        .status(
          404,
        )
        .json({
          success:
            false,

          message:
            "Reconciliation record not found.",
        });

      return;
    }

    response.json({
      success:
        true,

      data:
        record,
    });
  },
);

/*
 * GET /api/execution/reconciliation/session/:sessionId
 */
router.get(
  "/session/:sessionId",
  (
    request,
    response,
  ) => {
    response.json({
      success:
        true,

      data:
        executionReconciliationEngine
          .getBySession(
            request.params
              .sessionId,
          ),
    });
  },
);

export default router;