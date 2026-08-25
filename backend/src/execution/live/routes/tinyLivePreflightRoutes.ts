import {
  Router,
} from "express";

import {
  personalBotRuntimeControlService,
} from "../../../strategies/services/PersonalBotRuntimeControlService";

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

import {
  strategyOneApiPermissionBoundaryService,
} from "../tiny-live/StrategyOneApiPermissionBoundaryService";

import type {
  TinyLivePreflightRequest,
} from "../tiny-live/TinyLivePreflight";

import {
  strategyOneTinyLiveActionAuthorityService,
} from "../tiny-live/StrategyOneTinyLiveActionAuthorityService";

import {
  arbitrageExecutionCoordinator,
} from "../../../arbitrage/execution/ArbitrageExecutionCoordinator";

import {
  opportunityService,
} from "../../../arbitrage/services/OpportunityService";

import {
  isStrategyOneTinyLiveAttemptCount,
  strategyOneTinyLivePreArmService,
} from "../tiny-live/StrategyOneTinyLivePreArmService";

import {
  strategyOneTinyLiveOpportunityAuditService,
} from "../tiny-live/StrategyOneTinyLiveOpportunityAuditService";

import {
  strategyOneTinyLiveAccountModeLeaseService,
} from "../tiny-live/StrategyOneTinyLiveAccountModeLeaseService";

import {
  strategyOneTinyLiveReadinessWaterfallService,
} from "../tiny-live/StrategyOneTinyLiveReadinessWaterfallService";

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

        preflightOnlyScope:
          "THIS_CAPABILITY_ENDPOINT_ONLY",

        stagedReadinessEndpoint:
          "/api/execution/tiny-live/strategy-one-pre-arm",

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
          "This endpoint describes Build 15 tiny-LIVE preflight capability only; it is not the staged Strategy #1 execution-authority report.",

          "The Strategy #1 pre-arm diagnostics expose the separate runtime, PAPER pause, arm, lease, route, authority and final-last-look waterfall.",

          "Reading either endpoint cannot create authority or submit an exchange order.",
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
 * CAT PRO V126
 *
 * Durable, read-only Binance/Bybit Strategy #1 economics audit. This route
 * consumes the existing post-orchestrator evidence stream; it never mutates
 * policy, reserves capital, creates a LIVE session or submits an order.
 */
router.get(
  "/strategy-one-opportunity-audit",
  (
    _request,
    response,
  ) => {
    response.setHeader("Cache-Control", "no-store");

    try {
      response.json({
        success: true,
        data: strategyOneTinyLiveOpportunityAuditService.getReport(),
      });
    } catch (error: unknown) {
      response.status(500).json({
        success: false,
        message: error instanceof Error
          ? error.message
          : "Strategy #1 Tiny-LIVE opportunity audit failed closed.",
      });
    }
  },
);

/*
 * Signed GET evidence only. No permission change, transfer, withdrawal,
 * reservation, session creation, test order or LIVE order is performed.
 */
router.get(
  "/strategy-one-api-permissions",
  (
    _request,
    response,
  ) => {
    response.setHeader(
      "Cache-Control",
      "no-store",
    );

    response.json({
      success:
        true,
      data:
        strategyOneApiPermissionBoundaryService
          .getReport(),
    });
  },
);

router.post(
  "/strategy-one-api-permissions/refresh",
  async (
    _request,
    response,
  ) => {
    response.setHeader(
      "Cache-Control",
      "no-store",
    );

    try {
      const report =
        await strategyOneApiPermissionBoundaryService
          .refresh();

      response
        .status(
          report.ready
            ? 200
            : 409,
        )
        .json({
          success:
            report.ready,
          data:
            report,
        });
    } catch (
      error: unknown
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
              : "Strategy #1 API permission refresh failed closed.",
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
  "/strategy-one-action",
  (
    _request,
    response,
  ) => {
    response.setHeader("Cache-Control", "no-store");
    response.json({
      success: true,
      data: strategyOneTinyLiveActionAuthorityService.getDiagnostics(),
    });
  },
);

router.post(
  "/strategy-one-action/preview",
  (
    request,
    response,
  ) => {
    response.setHeader("Cache-Control", "no-store");

    try {
      const preview = strategyOneTinyLiveActionAuthorityService.preview(
        typeof request.body?.opportunityId === "string"
          ? request.body.opportunityId
          : "",
      );

      response.status(preview.approvedForAuthorization ? 200 : 409).json({
        success: preview.approvedForAuthorization,
        data: preview,
      });
    } catch (error: unknown) {
      response.status(409).json({
        success: false,
        message: error instanceof Error ? error.message : "Tiny-LIVE preview failed closed.",
      });
    }
  },
);

router.post(
  "/strategy-one-action/:authorityId/authorize",
  (
    request,
    response,
  ) => {
    response.setHeader("Cache-Control", "no-store");

    try {
      const authority = strategyOneTinyLiveActionAuthorityService.authorize(
        request.params.authorityId,
        typeof request.body?.confirmation === "string"
          ? request.body.confirmation
          : "",
      );

      response.json({success: true, data: authority});
    } catch (error: unknown) {
      response.status(409).json({
        success: false,
        message: error instanceof Error ? error.message : "Tiny-LIVE authorization failed closed.",
      });
    }
  },
);

router.post(
  "/strategy-one-action/:authorityId/execute",
  async (
    request,
    response,
  ) => {
    response.setHeader("Cache-Control", "no-store");

    try {
      const authority = strategyOneTinyLiveActionAuthorityService.get(
        request.params.authorityId,
      );

      if (!authority || authority.state !== "AUTHORIZED") {
        throw new Error("A current AUTHORIZED one-time Tiny-LIVE action is required.");
      }

      const opportunity = opportunityService.getOpportunityById(
        authority.opportunityId,
      );

      if (!opportunity) {
        throw new Error("The authorized opportunity expired before execution.");
      }

      const result = await arbitrageExecutionCoordinator.execute(
        opportunity,
        {
          actionAuthorityId: authority.id,
          timeoutMs: 3_000,
          pollingIntervalMs: 100,
          cancelOnTimeout: true,
        },
      );

      response.status(result.status === "BLOCKED" ? 409 : 200).json({
        success: result.success,
        data: result,
      });
    } catch (error: unknown) {
      response.status(409).json({
        success: false,
        message: error instanceof Error ? error.message : "Tiny-LIVE execution failed closed.",
      });
    }
  },
);

router.post(
  "/strategy-one-action/:authorityId/resolve",
  (
    request,
    response,
  ) => {
    response.setHeader("Cache-Control", "no-store");

    try {
      const resolved = strategyOneTinyLiveActionAuthorityService.resolve(
        request.params.authorityId,
        typeof request.body?.confirmation === "string"
          ? request.body.confirmation
          : "",
      );

      response.json({success: true, data: resolved});
    } catch (error: unknown) {
      response.status(409).json({
        success: false,
        message: error instanceof Error ? error.message : "Tiny-LIVE authority resolution failed closed.",
      });
    }
  },
);

/*
 * V125 PRE-ARMED ONE-SHOT
 *
 * Arming stores exact route-bound consent only. It submits no order and moves
 * no funds. A later matching opportunity must still pass the complete fresh
 * action-time preflight before the existing three-second authority and sole
 * execution coordinator can be reached.
 */
router.get(
  "/strategy-one-pre-arm",
  (
    _request,
    response,
  ) => {
    response.setHeader("Cache-Control", "no-store");
    response.json({
      success: true,
      data: {
        ...strategyOneTinyLivePreArmService.getDiagnostics(),
        accountModeLease:
          strategyOneTinyLiveAccountModeLeaseService
            .getDiagnostics(),
        readinessWaterfall:
          strategyOneTinyLiveReadinessWaterfallService
            .getReport(),
      },
    });
  },
);

router.post(
  "/strategy-one-account-mode-lease/:preArmId/activate",
  (
    request,
    response,
  ) => {
    response.setHeader("Cache-Control", "no-store");

    if (personalBotRuntimeControlService.getControl().enabled) {
      return response.status(409).json({
        success: false,
        message: "Pause PAPER automation before activating a Tiny-LIVE account-mode lease.",
      });
    }

    try {
      const record =
        strategyOneTinyLiveAccountModeLeaseService
          .activate(
            request.params.preArmId,
            typeof request.body?.confirmation === "string"
              ? request.body.confirmation
              : "",
          );

      response.status(201).json({
        success: true,
        data: record,
      });
    } catch (error: unknown) {
      response.status(409).json({
        success: false,
        message: error instanceof Error
          ? error.message
          : "Bounded Tiny-LIVE account-mode lease activation failed closed.",
      });
    }
  },
);

router.post(
  "/strategy-one-account-mode-lease/:leaseId/restore",
  (
    request,
    response,
  ) => {
    response.setHeader("Cache-Control", "no-store");

    try {
      const record =
        strategyOneTinyLiveAccountModeLeaseService
          .restore(
            request.params.leaseId,
            typeof request.body?.confirmation === "string"
              ? request.body.confirmation
              : "",
          );

      response.json({
        success: true,
        data: record,
      });
    } catch (error: unknown) {
      response.status(409).json({
        success: false,
        message: error instanceof Error
          ? error.message
          : "Bounded Tiny-LIVE PAPER restore failed closed.",
      });
    }
  },
);

router.post(
  "/strategy-one-pre-arm",
  (
    request,
    response,
  ) => {
    response.setHeader("Cache-Control", "no-store");

    if (personalBotRuntimeControlService.getControl().enabled) {
      return response.status(409).json({
        success: false,
        message: "Pause PAPER automation before creating a Tiny-LIVE arm.",
      });
    }

    try {
      const record = strategyOneTinyLivePreArmService.arm({
        market: typeof request.body?.market === "string"
          ? request.body.market
          : "",
        buyExchange: typeof request.body?.buyExchange === "string"
          ? request.body.buyExchange
          : "",
        sellExchange: typeof request.body?.sellExchange === "string"
          ? request.body.sellExchange
          : "",
        confirmation: typeof request.body?.confirmation === "string"
          ? request.body.confirmation
          : "",
        durationMinutes: typeof request.body?.durationMinutes === "number"
          ? request.body.durationMinutes
          : undefined,
        maximumAttempts: isStrategyOneTinyLiveAttemptCount(
          request.body?.maximumAttempts,
        )
          ? request.body.maximumAttempts
          : 1,
        routePoolId: typeof request.body?.routePoolId === "string"
          ? request.body.routePoolId
          : undefined,
      });

      response.status(201).json({success: true, data: record});
    } catch (error: unknown) {
      response.status(409).json({
        success: false,
        message: error instanceof Error
          ? error.message
          : "Strategy #1 one-shot pre-arm failed closed.",
      });
    }
  },
);

router.post(
  "/strategy-one-pre-arm/:preArmId/disarm",
  (
    request,
    response,
  ) => {
    response.setHeader("Cache-Control", "no-store");

    try {
      const record = strategyOneTinyLivePreArmService.disarm(
        request.params.preArmId,
        typeof request.body?.confirmation === "string"
          ? request.body.confirmation
          : "",
      );

      strategyOneTinyLiveAccountModeLeaseService
        .reconcile();

      response.json({success: true, data: record});
    } catch (error: unknown) {
      response.status(409).json({
        success: false,
        message: error instanceof Error
          ? error.message
          : "Strategy #1 one-shot disarm failed closed.",
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
