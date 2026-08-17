import {
  Router,
} from "express";

import {
  adaptivePaperCapitalAllocatorService,
} from "../services/AdaptivePaperCapitalAllocatorService";

import {
  automatedPaperExecutionControllerService,
} from "../services/AutomatedPaperExecutionControllerService";

import {
  automationPerformanceDashboardService,
} from "../services/AutomationPerformanceDashboardService";

import {
  automationSchedulerService,
} from "../services/AutomationSchedulerService";

import {
  candidateQualificationService,
} from "../services/CandidateQualificationService";

import {
  executionCandidateQueueService,
} from "../services/ExecutionCandidateQueueService";

import {
  multiOpportunityPaperSchedulerService,
} from "../services/MultiOpportunityPaperSchedulerService";

import {
  opportunityMonitorService,
} from "../services/OpportunityMonitorService";

import {
  paperAutomationAccountingService,
} from "../services/PaperAutomationAccountingService";

import {
  paperPortfolioOptimizerService,
} from "../services/PaperPortfolioOptimizerService";

import {
  paperTradingReadinessService,
} from "../services/PaperTradingReadinessService";

import {
  shadowExecutionDispatcherService,
} from "../services/ShadowExecutionDispatcherService";

import {
  shadowPerformanceAnalyticsService,
} from "../services/ShadowPerformanceAnalyticsService";

import {
  shadowTradeOutcomeTrackerService,
} from "../services/ShadowTradeOutcomeTrackerService";

import {
  unifiedAutomatedExecutionOrchestratorService,
} from "../../workflows/cross-exchange-arbitrage/services/UnifiedAutomatedExecutionOrchestratorService";

import {
  strategyOnePaperRuntimeAcceptanceService,
} from "../../workflows/cross-exchange-arbitrage/services/StrategyOnePaperRuntimeAcceptanceService";

const router =
  Router();

router.get(
  "/paper-runtime-acceptance",
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
        strategyOnePaperRuntimeAcceptanceService
          .getReport(),
    });
  },
);

router.get(
  "/unified-execution",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,
      data:
        unifiedAutomatedExecutionOrchestratorService
          .getDiagnostics(),
    });
  },
);

router.get(
  "/paper-readiness",
  async (
    _request,
    response,
  ) => {
    try {
      response.setHeader(
        "Cache-Control",
        "no-store",
      );

      response.json({
        success:
          true,
        data:
          await paperTradingReadinessService
            .getReport(),
      });
    } catch (
      error:
        unknown
    ) {
      response
        .status(
          503,
        )
        .json({
          success:
            false,
          evidenceStatus:
            "NO_DATA",
          message:
            error instanceof Error
              ? error.message
              : "PAPER readiness evidence is unavailable.",
        });
    }
  },
);

router.get(
  "/dashboard",
  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data:
          automationPerformanceDashboardService
            .getDashboard(),
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
              : "Automation dashboard generation failed.",
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
    response.json({
      success:
        true,

      data:
        automationSchedulerService
          .getDiagnostics(),
    });
  },
);

router.get(
  "/opportunities",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data:
        opportunityMonitorService
          .getDiagnostics(),
    });
  },
);

router.get(
  "/opportunities/active",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data:
        opportunityMonitorService
          .getActiveCandidates(),
    });
  },
);

router.get(
  "/qualifications",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data:
        candidateQualificationService
          .getDiagnostics(),
    });
  },
);

router.get(
  "/qualifications/qualified",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data:
        candidateQualificationService
          .getQualifiedCandidates(),
    });
  },
);

router.get(
  "/qualifications/candidate",
  (
    request,
    response,
  ) => {
    const key =
      typeof request.query.key ===
      "string"
        ? request.query.key
        : "";

    if (
      !key
    ) {
      response
        .status(
          400,
        )
        .json({
          success:
            false,

          message:
            "Candidate key is required.",
        });

      return;
    }

    const qualification =
      candidateQualificationService
        .getQualification(
          key,
        );

    if (
      !qualification
    ) {
      response
        .status(
          404,
        )
        .json({
          success:
            false,

          message:
            "Monitored candidate not found.",
        });

      return;
    }

    response.json({
      success:
        true,

      data:
        qualification,
    });
  },
);

router.get(
  "/queue",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data:
        executionCandidateQueueService
          .getDiagnostics(),
    });
  },
);

router.get(
  "/queue/ready",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data:
        executionCandidateQueueService
          .getReadyItems(),
    });
  },
);

router.get(
  "/queue/next",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data:
        executionCandidateQueueService
          .getNextReady(),
    });
  },
);

router.get(
  "/dispatcher",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data:
        shadowExecutionDispatcherService
          .getDiagnostics(),
    });
  },
);

router.post(
  "/dispatcher/run",
  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data:
          shadowExecutionDispatcherService
            .dispatchAvailable(),
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
              : "Shadow dispatcher failed.",
        });
    }
  },
);

router.get(
  "/outcomes",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data:
        shadowTradeOutcomeTrackerService
          .getDiagnostics(),
    });
  },
);

router.post(
  "/outcomes/process",
  (
    _request,
    response,
  ) => {
    try {
      shadowTradeOutcomeTrackerService
        .process();

      response.json({
        success:
          true,

        data:
          shadowTradeOutcomeTrackerService
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
              : "Shadow trade outcome processing failed.",
        });
    }
  },
);

router.get(
  "/performance",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data:
        shadowPerformanceAnalyticsService
          .getAnalytics(),
    });
  },
);

router.get(
  "/paper-controller",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data:
        automatedPaperExecutionControllerService
          .getDiagnostics(),
    });
  },
);

router.post(
  "/paper-controller/run",
  async (
    _request,
    response,
  ) => {
    try {
      const result =
        await automatedPaperExecutionControllerService
          .run();

      paperAutomationAccountingService
        .synchronize();

      response.json({
        success:
          true,

        data:
          result,
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
              : "Automated paper execution controller failed.",
        });
    }
  },
);

router.get(
  "/paper-scheduler",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data:
        multiOpportunityPaperSchedulerService
          .getDiagnostics(),
    });
  },
);

router.post(
  "/paper-scheduler/run",
  async (
    _request,
    response,
  ) => {
    try {
      const result =
        await multiOpportunityPaperSchedulerService
          .run();

      paperAutomationAccountingService
        .synchronize();

      response.json({
        success:
          true,

        data:
          result,
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
              : "Multi-opportunity PAPER scheduler failed.",
        });
    }
  },
);

router.get(
  "/paper-capital",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data:
        adaptivePaperCapitalAllocatorService
          .getDiagnostics(),
    });
  },
);

/*
 * Version 16.5
 *
 * GET /api/automation/paper-portfolio
 *
 * Route-level historical portfolio
 * optimization.
 *
 * Read only.
 */
router.get(
  "/paper-portfolio",
  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data:
          paperPortfolioOptimizerService
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
              : "Paper portfolio optimizer diagnostics failed.",
        });
    }
  },
);

router.get(
  "/paper-accounting",
  (
    _request,
    response,
  ) => {
    response.json({
      success:
        true,

      data:
        paperAutomationAccountingService
          .getDiagnostics(),
    });
  },
);

router.post(
  "/paper-accounting/synchronize",
  (
    _request,
    response,
  ) => {
    try {
      response.json({
        success:
          true,

        data:
          paperAutomationAccountingService
            .synchronize(),
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
              : "Paper automation accounting synchronization failed.",
        });
    }
  },
);

router.get(
  "/paper-accounting/:planId",
  (
    request,
    response,
  ) => {
    const entry =
      paperAutomationAccountingService
        .getEntry(
          request.params.planId,
        );

    if (
      !entry
    ) {
      response
        .status(
          404,
        )
        .json({
          success:
            false,

          message:
            "Automated paper accounting entry not found.",
        });

      return;
    }

    response.json({
      success:
        true,

      data:
        entry,
    });
  },
);

router.get(
  "/queue/:id",
  (
    request,
    response,
  ) => {
    const item =
      executionCandidateQueueService
        .getItem(
          request.params.id,
        );

    if (
      !item
    ) {
      response
        .status(
          404,
        )
        .json({
          success:
            false,

          message:
            "Execution queue item not found.",
        });

      return;
    }

    response.json({
      success:
        true,

      data:
        item,
    });
  },
);

router.post(
  "/queue/:id/cancel",
  (
    request,
    response,
  ) => {
    try {
      const reason =
        typeof request.body
          ?.reason ===
        "string"
          ? request.body.reason
          : "Execution queue item cancelled manually.";

      response.json({
        success:
          true,

        data:
          executionCandidateQueueService
            .cancel(
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
              : "Unable to cancel execution queue item.",
        });
    }
  },
);

router.get(
  "/outcomes/dispatch/:dispatchId",
  (
    request,
    response,
  ) => {
    const record =
      shadowTradeOutcomeTrackerService
        .getByDispatch(
          request.params.dispatchId,
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
            "Shadow trade outcome not found for this dispatch.",
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

router.get(
  "/outcomes/:id",
  (
    request,
    response,
  ) => {
    const record =
      shadowTradeOutcomeTrackerService
        .getRecord(
          request.params.id,
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
            "Shadow trade outcome record not found.",
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

router.post(
  "/start",
  (
    _request,
    response,
  ) => {
    automationSchedulerService
      .start();

    response.json({
      success:
        true,

      data:
        automationSchedulerService
          .getDiagnostics(),
    });
  },
);

router.post(
  "/stop",
  (
    _request,
    response,
  ) => {
    automationSchedulerService
      .stop();

    response.json({
      success:
        true,

      data:
        automationSchedulerService
          .getDiagnostics(),
    });
  },
);

router.post(
  "/cycle",
  async (
    _request,
    response,
  ) => {
    try {
      const result =
        await automationSchedulerService
          .runNow();

      response.json({
        success:
          true,

        data:
          result,
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
              : "Automation cycle failed.",
        });
    }
  },
);

export default router;
