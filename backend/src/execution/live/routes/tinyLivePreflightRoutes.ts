import {
  Router,
} from "express";

import {
  tinyLivePreflightService,
} from "../tiny-live/TinyLivePreflightService";

import {
  tinyLiveEvidencePackageService,
} from "../tiny-live/TinyLiveEvidencePackageService";

import {
  tinyLiveReadinessClosureService,
} from "../tiny-live/TinyLiveReadinessClosureService";

import {
  strategyOnePilotPreflightService,
} from "../tiny-live/StrategyOnePilotPreflightService";

import type {
  TinyLivePreflightRequest,
} from "../tiny-live/TinyLivePreflight";

const router =
  Router();

/*
 * VERSION 18 BUILD 15
 *
 * GET /api/execution/tiny-live
 *
 * Capability only.
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
          "15",

        mode:
          "TINY_LIVE_PREFLIGHT",

        preflightOnly:
          true,

        minimumCapital:
          100,

        maximumCapital:
          500,

        currency:
          "INR",

        requiredConfirmationToken:
          "RUN_TINY_LIVE_PREFLIGHT_ONLY",

        liveOrderSubmissionPerformed:
          false,

        capitalReserved:
          false,

        liveSessionCreated:
          false,

        notes: [
          "This endpoint describes Build 15 tiny-LIVE preflight capability only.",

          "No exchange order is submitted from Build 15.",
        ],
      },
    });
  },
);

router.get(
  "/evidence-package",
  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,
        data:
          tinyLiveEvidencePackageService
            .buildPreview(),
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
              : "Tiny-LIVE evidence package generation failed.",
        });
    }
  },
);

/*
 * CAT PRO V22.19
 *
 * GET /api/execution/tiny-live/readiness-closure
 *
 * Read-only ordered closure plan.
 */
router.get(
  "/readiness-closure",
  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data:
          tinyLiveReadinessClosureService
            .getReport(),
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
              : "Tiny-LIVE readiness closure evaluation failed.",
        });
    }
  },
);

/*
 * CAT PRO V92
 *
 * Read-only intersection of fresh Strategy #1 opportunities and durable
 * historical routes. This endpoint never runs the core preflight.
 */
router.get(
  "/strategy-one-pilot",
  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,
        data:
          strategyOnePilotPreflightService
            .getPreview(),
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
              : "Strategy #1 pilot preview failed.",
        });
    }
  },
);

/*
 * Explicit action-time preflight only. Even a PASS remains activation-review
 * evidence and cannot submit an order, reserve capital, or create a session.
 */
router.post(
  "/strategy-one-pilot/preflight",
  (
    request,
    response,
  ) => {
    try {
      const body =
        request.body as {
          confirmationToken?: unknown;
          expectedOpportunityId?: unknown;
        };

      const report =
        strategyOnePilotPreflightService
          .run({
            confirmationToken:
              typeof body.confirmationToken ===
                "string"
                ? body.confirmationToken
                : "",
            expectedOpportunityId:
              typeof body.expectedOpportunityId ===
                "string"
                ? body.expectedOpportunityId
                : "",
          });

      response
        .status(
          report.approvedForActivationReview
            ? 200
            : 409,
        )
        .json({
          success:
            report.approvedForActivationReview,
          data:
            report,
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
              : "Strategy #1 pilot preflight failed.",
        });
    }
  },
);

router.get(
  "/evidence-package/archive",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,
      data:
        tinyLiveEvidencePackageService
          .getArchiveReport(),
    });
  },
);

router.post(
  "/evidence-package/seal",
  (
    request,
    response,
  ) => {
    try {
      const body =
        request.body as {
          confirmationToken?: unknown;
        };

      const confirmationToken =
        typeof body
          .confirmationToken ===
          "string"
          ? body.confirmationToken
          : "";

      response
        .status(
          201,
        )
        .json({
          success:
            true,
          data:
            tinyLiveEvidencePackageService
              .seal(
                confirmationToken,
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
              : "Tiny-LIVE evidence package sealing failed.",
        });
    }
  },
);

/*
 * POST /api/execution/tiny-live/preflight
 *
 * Example:
 *
 * {
 *   "requestedCapital": 100,
 *   "market": "BTCUSDT",
 *   "buyExchange": "binance",
 *   "sellExchange": "coindcx",
 *   "confirmationToken":
 *     "RUN_TINY_LIVE_PREFLIGHT_ONLY",
 *   "balanceRequirements": [
 *     {
 *       "exchange": "binance",
 *       "asset": "USDT",
 *       "requiredAmount": 2
 *     },
 *     {
 *       "exchange": "coindcx",
 *       "asset": "BTC",
 *       "requiredAmount": 0.00002
 *     }
 *   ]
 * }
 *
 * IMPORTANT:
 *
 * This remains a PRE-FLIGHT evaluation.
 */
router.post(
  "/preflight",

  (
    request,
    response,
  ) => {
    try {
      const body =
        request.body as
          Partial<
            TinyLivePreflightRequest
          >;

      const report =
        tinyLivePreflightService
          .evaluate({
            requestedCapital:
              Number(
                body
                  .requestedCapital,
              ),

            market:
              typeof body.market ===
              "string"
                ? body.market
                : "",

            buyExchange:
              typeof body
                .buyExchange ===
              "string"
                ? body
                    .buyExchange
                : "",

            sellExchange:
              typeof body
                .sellExchange ===
              "string"
                ? body
                    .sellExchange
                : "",

            confirmationToken:
              typeof body
                .confirmationToken ===
              "string"
                ? body
                    .confirmationToken
                : "",

            balanceRequirements:
              Array.isArray(
                body
                  .balanceRequirements,
              )
                ? body
                    .balanceRequirements
                : [],
          });

      response
        .status(
          report.approved
            ? 200
            : 409,
        )
        .json({
          success:
            report.approved,

          data:
            report,
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
              : "Tiny-LIVE preflight failed.",
        });
    }
  },
);

export default router;
