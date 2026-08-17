import {
  opportunityRejectionAnalyticsController,
} from "../controllers/OpportunityRejectionAnalyticsController";

import {
  Router,
} from "express";

import {
  livePerformanceEvidencePersistenceService,
} from "../../execution/live/metrics/LivePerformanceEvidencePersistenceService";

import {
  analyticsService,
} from "../services/AnalyticsService";

import {
  evidenceIntegrityAuditService,
} from "../services/EvidenceIntegrityAuditService";

import {
  livePerformanceAnalyticsService,
} from "../services/LivePerformanceAnalyticsService";

import {
  livePerformanceDecisionService,
} from "../services/LivePerformanceDecisionService";

import {
  livePerformanceReadinessService,
} from "../services/LivePerformanceReadinessService";

import {
  strategyOneForensicsBaselineService,
} from "../services/StrategyOneForensicsBaselineService";

const router =
  Router();

router.get(
  "/opportunity-rejections",

  opportunityRejectionAnalyticsController
    .getAnalytics
    .bind(
      opportunityRejectionAnalyticsController,
    ),
);

/*
 * V20.9 BUILD 5
 *
 * Canonical, timestamped Strategy #1 opportunity-forensics baseline.
 * Read-only: this route cannot mutate policy, arm PAPER, enable LIVE,
 * reserve capital or submit an exchange order.
 */
router.get(
  "/strategy-one-baseline",

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
          strategyOneForensicsBaselineService
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

          data: {
            generatedAt:
              Date.now(),

            version:
              "20.9",

            build:
              "5",

            mode:
              "DIAGNOSTIC_ONLY",

            evidenceQuality:
              "INSUFFICIENT_RUNTIME_DATA",

            safety: {
              readOnly:
                true,

              tradingPolicyMutationAllowed:
                false,

              paperArmingAllowed:
                false,

              paperTradeAllowed:
                false,

              liveExecutionAllowed:
                false,

              capitalReservationAllowed:
                false,

              orderSubmissionAllowed:
                false,

              authenticatedOrderEndpointAllowed:
                false,
            },

            error:
              error instanceof Error
                ? error.message
                : "Strategy #1 forensics baseline could not be generated.",
          },
        });
    }
  },
);

router.get(
  "/live-performance",

  async (
    _request,
    response,
  ) => {
    try {
      const report =
        await livePerformanceAnalyticsService
          .getReport();

      response.json({
        success:
          true,

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
              : "Live performance analytics report failed.",
        });
    }
  },
);

router.get(
  "/live-performance/readiness",

  async (
    _request,
    response,
  ) => {
    try {
      const report =
        await livePerformanceReadinessService
          .getReport();

      response.json({
        success:
          true,

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

          data: {
            generatedAt:
              Date.now(),

            version:
              "17.6",

            level:
              "INSUFFICIENT_DATA",

            analyticsOnly:
              true,

            liveTradingEnabled:
              false,

            tinyValidationAuthorized:
              false,

            failClosed:
              true,

            blockers:
              [],

            insufficientEvidence: [
              error instanceof Error
                ? error.message
                : "Live performance readiness could not be evaluated.",
            ],

            notes: [
              "Readiness diagnostics failed closed.",

              "LIVE trading remains disabled.",
            ],
          },
        });
    }
  },
);

router.get(
  "/live-performance/decision",

  async (
    _request,
    response,
  ) => {
    try {
      const report =
        await livePerformanceDecisionService
          .getReport();

      response.json({
        success:
          true,

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

          data: {
            generatedAt:
              Date.now(),

            version:
              "17.6",

            decision:
              "INSUFFICIENT_EVIDENCE",

            analyticsOnly:
              true,

            liveTradingEnabled:
              false,

            liveSubmissionAllowed:
              false,

            tinyValidationAuthorized:
              false,

            failClosed:
              true,

            blockers:
              [],

            insufficientEvidence: [
              error instanceof Error
                ? error.message
                : "Live performance decision could not be generated.",
            ],

            warnings:
              [],

            nextRequirements:
              [],

            notes: [
              "Performance decision failed closed.",

              "LIVE trading remains disabled.",
            ],
          },
        });
    }
  },
);

router.get(
  "/live-performance/evidence-integrity",

  async (
    _request,
    response,
  ) => {
    try {
      const report =
        await evidenceIntegrityAuditService
          .getReport();

      response.json({
        success:
          true,

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

          data: {
            generatedAt:
              Date.now(),

            version:
              "17.6",

            build:
              "6",

            status:
              "DEGRADED",

            analyticsOnly:
              true,

            liveTradingEnabled:
              false,

            liveSubmissionAllowed:
              false,

            failClosed:
              true,

            persistenceFailures: [
              error instanceof Error
                ? error.message
                : "Evidence integrity audit failed.",
            ],

            restartSafetyGaps:
              [],

            notes: [
              "Evidence integrity audit failed closed.",

              "LIVE trading remains disabled.",
            ],
          },
        });
    }
  },
);

/*
 * VERSION 17.6 BUILD 8
 *
 * Persistent execution-performance evidence
 * diagnostics.
 *
 * Read-only.
 *
 * No LIVE state is restored here.
 */
router.get(
  "/live-performance/persistence",

  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data: {
          generatedAt:
            Date.now(),

          version:
            "17.6",

          build:
            "8",

          analyticsOnly:
            true,

          liveTradingEnabled:
            false,

          liveSubmissionAllowed:
            false,

          operationalLiveStateRestored:
            false,

          persistence:
            livePerformanceEvidencePersistenceService
              .getDiagnostics(),

          restoredEvidence: {
            metrics:
              livePerformanceEvidencePersistenceService
                .getRestoredMetricsReport(),

            metricSnapshots:
              livePerformanceEvidencePersistenceService
                .getRestoredMetricSnapshots(
                  20,
                ),

            settlements:
              livePerformanceEvidencePersistenceService
                .getRestoredSettlements(),
          },

          notes: [
            "This endpoint exposes historical analytics evidence only.",

            "LIVE sessions, locks, orders and submission state are not restored.",

            "Malformed or crash-truncated JSONL records are ignored during restore.",

            "LIVE trading remains disabled.",
          ],
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

          data: {
            generatedAt:
              Date.now(),

            version:
              "17.6",

            build:
              "8",

            analyticsOnly:
              true,

            liveTradingEnabled:
              false,

            liveSubmissionAllowed:
              false,

            operationalLiveStateRestored:
              false,

            error:
              error instanceof Error
                ? error.message
                : "Live performance persistence diagnostics failed.",
          },
        });
    }
  },
);

router.get(
  "/",

  (
    _request,
    response,
  ) => {
    try {
      const report =
        analyticsService
          .getReport();

      response.json({
        success:
          true,

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
              : "Analytics report failed.",
        });
    }
  },
);

export default router;
