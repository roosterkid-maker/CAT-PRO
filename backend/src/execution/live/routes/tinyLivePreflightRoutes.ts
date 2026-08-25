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
  strategyOneTinyLiveOpportunityAuditService,
} from "../tiny-live/StrategyOneTinyLiveOpportunityAuditService";

import {
  tradingAccountService,
} from "../../../trading/account/TradingAccountService";

import {
  executionRecoveryEngine,
} from "../recovery/ExecutionRecoveryEngine";

import {
  strategyOneRouteHealthService,
} from "../readiness/StrategyOneRouteHealthService";

import {
  strategyOneControlledLiveRuntimeService,
} from "../dynamic/StrategyOneControlledLiveRuntimeService";

import {
  strategyOneExecutionFunnelService,
} from "../dynamic/StrategyOneExecutionFunnelService";

const router =
  Router();

router.get(
  "/strategy-one-execution-funnel",
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
        strategyOneExecutionFunnelService
          .getReport(),
    });
  },
);

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

router.get(
  "/strategy-one-route-health",
  (
    _request,
    response,
  ) => {
    response.setHeader(
      "Cache-Control",
      "no-store",
    );

    try {
      response.json({
        success:
          true,
        data:
          strategyOneRouteHealthService
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
              : "Strategy #1 route-health evaluation failed closed.",
        });
    }
  },
);

router.get(
  "/strategy-one-dynamic-recommendation",
  (
    _request,
    response,
  ) => {
    response.setHeader(
      "Cache-Control",
      "no-store",
    );

    try {
      const report =
        strategyOneControlledLiveRuntimeService
          .getRecommendation();

      response
        .status(
          report.recommendation?.decision ===
            "EXECUTE_NOW" ||
          report.recommendation?.decision ===
            "REDUCE_QUANTITY"
            ? 200
            : 409,
        )
        .json({
          success:
            report.recommendation !==
            null,
          data:
            report,
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
              : "Strategy #1 dynamic recommendation failed closed.",
        });
    }
  },
);

router.post(
  "/strategy-one-controlled-preflight",
  (
    request,
    response,
  ) => {
    response.setHeader(
      "Cache-Control",
      "no-store",
    );

    try {
      const report =
        strategyOneControlledLiveRuntimeService
          .runCanonicalPreflight(
            typeof request.body?.opportunityId ===
              "string"
              ? request.body.opportunityId
              : "",
            typeof request.body?.confirmation ===
              "string"
              ? request.body.confirmation
              : "",
          );

      response
        .status(
          report.approvedForOneTimeArm
            ? 200
            : 409,
        )
        .json({
          success:
            report.approvedForOneTimeArm,
          data:
            report,
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
              : "Strategy #1 canonical preflight failed closed.",
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

router.get(
  "/strategy-one-emergency-stop",
  (
    _request,
    response,
  ) => {
    response.setHeader(
      "Cache-Control",
      "no-store",
    );

    const account =
      tradingAccountService
        .getAccount();
    const authority =
      strategyOneTinyLiveActionAuthorityService
        .getDiagnostics();
    const recovery =
      executionRecoveryEngine
        .getDiagnostics();

    response.json({
      success:
        true,
      data: {
        generatedAt:
          Date.now(),
        active:
          account.emergencyStop,
        authoritativeSource:
          "TRADING_ACCOUNT_DURABLE_LEDGER",
        affectedAuthorities:
          authority.records.filter(
            (record) =>
              record.state === "CONSUMED" ||
              record.state === "PAIR_BOUND" ||
              (
                record.state === "FINALIZED" &&
                record.requiresRecovery
              ),
          ),
        openRecoveryIncidents:
          recovery.openIncidents,
        acknowledgedRecoveryIncidents:
          recovery.acknowledgedIncidents,
      },
    });
  },
);

router.post(
  "/strategy-one-emergency-stop/activate",
  (
    request,
    response,
  ) => {
    response.setHeader(
      "Cache-Control",
      "no-store",
    );

    if (
      request.body?.confirmation !==
      "ACTIVATE STRATEGY_ONE EMERGENCY STOP"
    ) {
      response
        .status(
          400,
        )
        .json({
          success:
            false,
          message:
            "Exact emergency-stop activation confirmation is required.",
        });
      return;
    }

    tradingAccountService
      .enableEmergencyStop();

    const cancelledAuthorities =
      strategyOneTinyLiveActionAuthorityService
        .cancelUnusedForEmergencyStop();

    response.json({
      success:
        true,
      data: {
        active:
          true,
        cancelledUnusedAuthorityIds:
          cancelledAuthorities.map(
            (authority) =>
              authority.id,
          ),
        unresolvedExposurePreserved:
          true,
      },
    });
  },
);

router.post(
  "/strategy-one-emergency-stop/clear",
  (
    request,
    response,
  ) => {
    response.setHeader(
      "Cache-Control",
      "no-store",
    );

    if (
      request.body?.confirmation !==
      "CLEAR STRATEGY_ONE EMERGENCY STOP"
    ) {
      response
        .status(
          400,
        )
        .json({
          success:
            false,
          message:
            "Exact emergency-stop clear confirmation is required.",
        });
      return;
    }

    const authority =
      strategyOneTinyLiveActionAuthorityService
        .getDiagnostics();
    const recovery =
      executionRecoveryEngine
        .getDiagnostics();
    const unresolvedAuthorities =
      authority.records.filter(
        (record) =>
          record.state === "CONSUMED" ||
          record.state === "PAIR_BOUND" ||
          (
            record.state === "FINALIZED" &&
            record.requiresRecovery
          ),
      );

    if (
      unresolvedAuthorities.length > 0 ||
      recovery.openIncidents > 0 ||
      recovery.acknowledgedIncidents > 0
    ) {
      response
        .status(
          409,
        )
        .json({
          success:
            false,
          message:
            "Emergency stop cannot be cleared while exposure or recovery remains unresolved.",
          data: {
            unresolvedAuthorityIds:
              unresolvedAuthorities.map(
                (record) =>
                  record.id,
              ),
            openRecoveryIncidents:
              recovery.openIncidents,
            acknowledgedRecoveryIncidents:
              recovery.acknowledgedIncidents,
          },
        });
      return;
    }

    tradingAccountService
      .disableEmergencyStop();

    response.json({
      success:
        true,
      data: {
        active:
          false,
      },
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
  "/strategy-one-action/:authorityId/cancel",
  (
    request,
    response,
  ) => {
    response.setHeader(
      "Cache-Control",
      "no-store",
    );

    try {
      const authority =
        strategyOneTinyLiveActionAuthorityService
          .cancel(
            request.params.authorityId,
            typeof request.body?.confirmation ===
              "string"
              ? request.body.confirmation
              : "",
          );

      response.json({
        success:
          true,
        data:
          authority,
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
              : "Tiny-LIVE authority cancellation failed closed.",
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
