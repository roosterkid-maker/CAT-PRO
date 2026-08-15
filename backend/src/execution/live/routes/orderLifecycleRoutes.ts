import {
  Router,
} from "express";

import {
  orderLifecycleManager,
} from "../lifecycle/OrderLifecycleManager";

import {
  orderLifecycleEvidenceService,
} from "../lifecycle/OrderLifecycleEvidenceService";

import type {
  OrderLifecycleLeg,
} from "../lifecycle/OrderLifecycleRecord";

const router =
  Router();

/*
 * GET /api/execution/lifecycle
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
        orderLifecycleManager
          .getDiagnostics(),
    });
  },
);

/*
 * GET /api/execution/lifecycle/session/:sessionId
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
        orderLifecycleManager
          .getBySession(
            request.params
              .sessionId,
          ),
    });
  },
);

/*
 * VERSION 18 BUILD 3
 *
 * GET /api/execution/lifecycle/persistence
 *
 * Historical order-lifecycle evidence only.
 *
 * No order submission, cancellation or
 * automatic restart recovery occurs here.
 */
router.get(
  "/persistence",
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
          "3",

        liveTradingEnabled:
          false,

        liveSubmissionAllowed:
          false,

        automaticOrderResumeAllowed:
          false,

        automaticOrderResubmissionAllowed:
          false,

        evidence:
          orderLifecycleEvidenceService
            .getDiagnostics(),
      },
    });
  },
);

/*
 * GET /api/execution/lifecycle/:id
 */
router.get(
  "/:id",
  (
    request,
    response,
  ) => {
    const order =
      orderLifecycleManager
        .getOrder(
          request.params.id,
        );

    if (
      !order
    ) {
      response
        .status(
          404,
        )
        .json({
          success:
            false,

          message:
            "Order lifecycle record not found.",
        });

      return;
    }

    response.json({
      success:
        true,

      data:
        order,
    });
  },
);

/*
 * POST /api/execution/lifecycle/prepare
 *
 * {
 *   "sessionId": "...",
 *   "leg": "BUY"
 * }
 *
 * IMPORTANT:
 * no live order is submitted here.
 */
router.post(
  "/prepare",
  (
    request,
    response,
  ) => {
    try {
      const sessionId =
        typeof request.body
          ?.sessionId ===
        "string"
          ? request.body
              .sessionId
              .trim()
          : "";

      const rawLeg =
        typeof request.body
          ?.leg ===
        "string"
          ? request.body
              .leg
              .trim()
              .toUpperCase()
          : "";

      if (
        !sessionId
      ) {
        response
          .status(
            400,
          )
          .json({
            success:
              false,

            message:
              "sessionId is required.",
          });

        return;
      }

      if (
        rawLeg !==
          "BUY" &&
        rawLeg !==
          "SELL"
      ) {
        response
          .status(
            400,
          )
          .json({
            success:
              false,

            message:
              "leg must be BUY or SELL.",
          });

        return;
      }

      const result =
        orderLifecycleManager
          .prepare(
            sessionId,

            rawLeg as
              OrderLifecycleLeg,
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
            result.order,

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
              : "Unable to prepare order lifecycle.",
        });
    }
  },
);

/*
 * POST /api/execution/lifecycle/:id/abort
 *
 * Only PREPARED records can be aborted.
 */
router.post(
  "/:id/abort",
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
          : "Prepared order lifecycle aborted manually.";

      response.json({
        success:
          true,

        data:
          orderLifecycleManager
            .abortPrepared(
              request.params.id,
              reason,
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
              : "Unable to abort order lifecycle.",
        });
    }
  },
);

export default router;