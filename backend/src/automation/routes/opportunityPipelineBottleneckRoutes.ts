import {
  Router,
} from "express";

import {
  accountFeeVerificationService,
} from "../../arbitrage/services/AccountFeeVerificationService";

import {
  feeAwareStrategyAnalyticsService,
} from "../../arbitrage/services/FeeAwareStrategyAnalyticsService";

import {
  opportunityNearMissAnalyticsService,
} from "../../arbitrage/services/OpportunityNearMissAnalyticsService";

import {
  websocketManager,
} from "../../websocket/manager";

import {
  capitalAwareQualificationEvidenceService,
} from "../services/CapitalAwareQualificationEvidenceService";

import {
  acceptedOpportunityCaptureDiagnosticsService,
} from "../services/AcceptedOpportunityCaptureDiagnosticsService";

import {
  acceptedOpportunityShadowFlowAnalyzerService,
} from "../services/AcceptedOpportunityShadowFlowAnalyzerService";

import {
  candidateEvidenceAccumulatorService,
} from "../services/CandidateEvidenceAccumulatorService";

import {
  capitalSensitivityEconomicsAnalyzerService,
} from "../services/CapitalSensitivityEconomicsAnalyzerService";

import {
  executableProfitEconomicsAnalyzerService,
} from "../services/ExecutableProfitEconomicsAnalyzerService";

import {
  freshnessRootCauseAnalyzerService,
} from "../services/FreshnessRootCauseAnalyzerService";

import {
  liquidityQualificationAuditService,
} from "../services/LiquidityQualificationAuditService";

import {
  opportunityPipelineBottleneckService,
} from "../services/OpportunityPipelineBottleneckService";

import {
  pairSynchronizationRootCauseAnalyzerService,
} from "../services/PairSynchronizationRootCauseAnalyzerService";

import {
  qualificationPersistenceRootCauseAnalyzerService,
} from "../services/QualificationPersistenceRootCauseAnalyzerService";

import {
  qualifiedShadowPipelineTraceService,
} from "../services/QualifiedShadowPipelineTraceService";

import {
  shadowLearningEvidenceArchiveService,
} from "../services/ShadowLearningEvidenceArchiveService";

const router =
  Router();

router.get(
  "/",

  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data:
          opportunityPipelineBottleneckService
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
              : "Opportunity pipeline bottleneck analysis failed.",
        });
    }
  },
);

router.get(
  "/capital-aware-evidence",

  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data:
          capitalAwareQualificationEvidenceService
            .getDiagnostics(),
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
              : "Capital-aware qualification evidence diagnostics failed.",
        });
    }
  },
);

router.get(
  "/freshness",

  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data:
          freshnessRootCauseAnalyzerService
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
              : "Freshness root-cause analysis failed.",
        });
    }
  },
);

router.get(
  "/pair-sync",

  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data:
          pairSynchronizationRootCauseAnalyzerService
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
              : "Pair synchronization root-cause analysis failed.",
        });
    }
  },
);

router.get(
  "/pair-sync-recovery",

  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data:
          websocketManager
            .getOpportunityRecoveryMetrics(),
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
              : "Pair synchronization recovery diagnostics failed.",
        });
    }
  },
);

router.get(
  "/economics",

  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data:
          executableProfitEconomicsAnalyzerService
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
              : "Executable profit economics analysis failed.",
        });
    }
  },
);

router.get(
  "/capital-sensitivity",

  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data:
          capitalSensitivityEconomicsAnalyzerService
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
              : "Capital sensitivity economics analysis failed.",
        });
    }
  },
);

router.get(
  "/shadow-flow",

  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data:
          acceptedOpportunityShadowFlowAnalyzerService
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
              : "Accepted opportunity shadow-flow analysis failed.",
        });
    }
  },
);

router.get(
  "/capture",

  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data:
          acceptedOpportunityCaptureDiagnosticsService
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
              : "Accepted opportunity capture diagnostics failed.",
        });
    }
  },
);

router.get(
  "/qualification",

  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data:
          qualificationPersistenceRootCauseAnalyzerService
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
              : "Qualification persistence root-cause analysis failed.",
        });
    }
  },
);

router.get(
  "/candidate-evidence",

  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data:
          candidateEvidenceAccumulatorService
            .getDiagnostics(),
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
              : "Candidate evidence diagnostics failed.",
        });
    }
  },
);

router.get(
  "/qualified-shadow-trace",

  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data:
          qualifiedShadowPipelineTraceService
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
              : "Qualified shadow pipeline trace failed.",
        });
    }
  },
);

router.get(
  "/shadow-archive",

  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data:
          shadowLearningEvidenceArchiveService
            .getDiagnostics(),
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
              : "Shadow-learning evidence archive diagnostics failed.",
        });
    }
  },
);

/*
 * VERSION 17.4 BUILD 11
 *
 * Qualification liquidity score
 *          VS
 * requested-capital full-depth execution.
 *
 * Read-only diagnostic.
 */
router.get(
  "/liquidity-audit",

  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data:
          liquidityQualificationAuditService
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
              : "Liquidity qualification audit failed.",
        });
    }
  },
);


/*
 * V19.20
 *
 * Current-scan opportunity near-miss analytics.
 *
 * The event-driven diagnostics runner continuously owns the authoritative
 * scan. This endpoint reads that current bounded snapshot/report and must not
 * inject a second scan into the execution pipeline whenever the UI polls.
 *
 * Diagnostic only:
 * no thresholds or execution permissions are changed.
 */
router.get(
  "/near-misses",

  (
    request,
    response,
  ) => {
    try {
      const rawLimit =
        request.query.limit;

      const parsedLimit =
        typeof rawLimit ===
          "string"
          ? Number(
              rawLimit,
            )
          : 20;

      response.json({
        success:
          true,

        data:
          opportunityNearMissAnalyticsService
            .getReport(
              Number.isSafeInteger(
                parsedLimit,
              )
                ? parsedLimit
                : 20,
            ),
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
              : "Opportunity near-miss analytics failed.",
        });
    }
  },
);


/*
 * V19.21
 *
 * Fee-aware strategy economics.
 *
 * Analyzes the current event-driven near-miss snapshot under configured
 * taker/maker fee scenarios without forcing another execution-pipeline scan.
 *
 * Maker scenarios are diagnostic only and never cause
 * passive orders to be submitted.
 */
router.get(
  "/fee-strategy",

  (
    request,
    response,
  ) => {
    try {
      const rawLimit =
        request.query.limit;

      const parsedLimit =
        typeof rawLimit ===
          "string"
          ? Number(
              rawLimit,
            )
          : 10;

      response.json({
        success:
          true,

        data:
          feeAwareStrategyAnalyticsService
            .getReport(
              Number.isSafeInteger(
                parsedLimit,
              )
                ? parsedLimit
                : 10,
            ),
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
              : "Fee-aware strategy analysis failed.",
        });
    }
  },
);


/*
 * V19.22
 *
 * Account-specific fee verification.
 *
 * Read-only:
 * - no fee registry mutation
 * - no order submission
 * - LIVE remains disabled
 */
router.get(
  "/account-fees",

  async (
    request,
    response,
  ) => {
    try {
      const rawSymbol =
        request.query.symbol;

      const symbol =
        typeof rawSymbol ===
          "string" &&
        rawSymbol.trim()
          ? rawSymbol
              .trim()
              .toUpperCase()
          : "BTCUSDT";

      response.json({
        success:
          true,

        data:
          await accountFeeVerificationService
            .getReport(
              symbol,
            ),
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
              : "Account fee verification failed.",
        });
    }
  },
);

export default router;
