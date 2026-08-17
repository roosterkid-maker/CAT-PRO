import type {
  AutomationDashboardModuleState,
  AutomationDashboardStage,
  AutomationPerformanceDashboard,
} from "../models/AutomationPerformanceDashboard";

import {
  adaptivePaperCapitalAllocatorService,
} from "./AdaptivePaperCapitalAllocatorService";

import {
  automatedPaperExecutionControllerService,
} from "./AutomatedPaperExecutionControllerService";

import {
  automationSchedulerService,
} from "./AutomationSchedulerService";

import {
  candidateQualificationService,
} from "./CandidateQualificationService";

import {
  executionCandidateQueueService,
} from "./ExecutionCandidateQueueService";

import {
  multiOpportunityPaperSchedulerService,
} from "./MultiOpportunityPaperSchedulerService";

import {
  opportunityMonitorService,
} from "./OpportunityMonitorService";

import {
  paperAutomationAccountingService,
} from "./PaperAutomationAccountingService";

import {
  shadowExecutionDispatcherService,
} from "./ShadowExecutionDispatcherService";

import {
  shadowPerformanceAnalyticsService,
} from "./ShadowPerformanceAnalyticsService";

import {
  shadowTradeOutcomeTrackerService,
} from "./ShadowTradeOutcomeTrackerService";

export class AutomationPerformanceDashboardService {
  getDashboard():
    AutomationPerformanceDashboard {
    /*
     * Version 16.4 is deliberately
     * aggregation-only.
     *
     * Every call below is diagnostics /
     * analytics only.
     *
     * No order, capital or trading mutation
     * is performed here.
     */
    const scheduler =
      automationSchedulerService
        .getDiagnostics();

    const monitor =
      opportunityMonitorService
        .getDiagnostics();

    const qualification =
      candidateQualificationService
        .getDiagnostics();

    const queue =
      executionCandidateQueueService
        .getDiagnostics();

    const dispatcher =
      shadowExecutionDispatcherService
        .getDiagnostics();

    const outcomes =
      shadowTradeOutcomeTrackerService
        .getDiagnostics();

    const performance =
      shadowPerformanceAnalyticsService
        .getAnalytics();

    const paperController =
      automatedPaperExecutionControllerService
        .getDiagnostics();

    const paperScheduler =
      multiOpportunityPaperSchedulerService
        .getDiagnostics();

    const adaptiveCapital =
      adaptivePaperCapitalAllocatorService
        .getDiagnostics();

    const accounting =
      paperAutomationAccountingService
        .getDiagnostics();

    const accountingIntegrityPassed =
      accounting
        .integrity
        .accountCapitalValid &&
      accounting
        .integrity
        .availableCapitalValid &&
      accounting
        .integrity
        .portfolioCapitalMatchesAccount &&
      accounting
        .integrity
        .automationLedgerMatchesPaperTrades &&
      accounting
        .integrity
        .accountProfitMatchesAutomationLedger !==
        false;

    const shadowReadinessPassed =
      performance
        .readiness
        .readyForPaperAutomation;

    const paperAccountMode =
      accounting.mode ===
      "PAPER";

    const paperAutomationArmed =
      paperController
        .paperExecutionArmed;

    const blockers =
      this.buildBlockers({
        shadowReadinessPassed,

        paperAutomationArmed,

        paperAccountMode,

        accountingIntegrityPassed,

        readinessReasons:
          performance
            .readiness
            .reasons,
      });

    const stage =
      this.resolveStage({
        accountingIntegrityPassed,

        shadowReadinessPassed,

        paperAutomationArmed,

        paperExecutions:
          paperController
            .executed,
      });

    const overallHealthy =
      accountingIntegrityPassed &&
      scheduler.lastError ===
        null;

    const completedShadowOutcomes =
      performance
        .summary
        .completed;

    return {
      generatedAt:
        Date.now(),

      version:
        "16.4",

      mode:
        "AUTOMATION",

      stage,

      overallHealthy,

      /*
       * Version 16.4 can never authorize
       * LIVE execution.
       */
      liveExecutionAllowed:
        false,

      summary: {
        schedulerRunning:
          scheduler.running,

        activeOpportunities:
          monitor
            .activeCandidates,

        qualifiedCandidates:
          qualification
            .qualified,

        readyQueueItems:
          queue.ready,

        shadowDispatches:
          dispatcher
            .totalDispatched,

        completedShadowOutcomes,

        shadowSuccessRatePercent:
          performance
            .summary
            .successRatePercent,

        readinessScore:
          performance
            .readiness
            .score,

        readinessLevel:
          performance
            .readiness
            .level,

        paperExecutionArmed:
          paperAutomationArmed,

        paperExecutionAllowed:
          paperController
            .paperExecutionAllowed,

        paperTradesExecuted:
          paperController
            .executed,

        adaptiveCapitalAllocations:
          adaptiveCapital
            .allocated,

        automationLedgerEntries:
          accounting
            .totalEntries,

        currentPaperCapital:
          accounting
            .account
            .currentCapital,

        availablePaperCapital:
          accounting
            .account
            .availableCapital,

        automationNetProfit:
          accounting
            .totals
            .netProfit,
      },

      safety: {
        shadowReadinessPassed,

        paperAutomationArmed,

        paperAccountMode,

        accountingIntegrityPassed,

        liveExecutionDisabled:
          true,

        blockers,
      },

      pipeline: {
        scannerToAutomation:
          monitor
            .processedSnapshots >
          0,

        persistence:
          true,

        qualification:
          true,

        queue:
          true,

        shadowDispatcher:
          true,

        outcomeTracking:
          true,

        performanceAnalytics:
          true,

        paperController:
          true,

        paperScheduler:
          true,

        adaptiveCapital:
          true,

        accounting:
          accountingIntegrityPassed,
      },

      modules: {
        scheduler:
          this.createModuleState(
            "Scheduler",

            scheduler.running &&
              scheduler
                .snapshotSubscriptionActive &&
              scheduler
                .droppedSnapshotEvents ===
                0 &&
              scheduler.lastError ===
                null,

            !scheduler.running
              ? "STOPPED"
              : !scheduler
                    .snapshotSubscriptionActive
                ? "SNAPSHOT_HANDOFF_INACTIVE"
                : scheduler
                      .droppedSnapshotEvents >
                    0
                  ? "SNAPSHOT_EVENTS_DROPPED"
                  : "RUNNING",

            {
              totalCycles:
                scheduler
                  .totalCycles,

              completedCycles:
                scheduler
                  .completedCycles,

              staleSnapshotCycles:
                scheduler
                  .staleSnapshotCycles,

              missingSnapshotCycles:
                scheduler
                  .missingSnapshotCycles,

              snapshotSubscriptionActive:
                scheduler
                  .snapshotSubscriptionActive,

              snapshotEventsReceived:
                scheduler
                  .snapshotEventsReceived,

              eventTriggeredCycles:
                scheduler
                  .eventTriggeredCycles,

              pendingSnapshotEvents:
                scheduler
                  .pendingSnapshotEvents,

              droppedSnapshotEvents:
                scheduler
                  .droppedSnapshotEvents,

              lastError:
                scheduler
                  .lastError,
            },
          ),

        monitor:
          this.createModuleState(
            "Opportunity Monitor",

            true,

            monitor
              .activeCandidates >
            0
              ? "ACTIVE"
              : "WAITING",

            {
              processedSnapshots:
                monitor
                  .processedSnapshots,

              activeCandidates:
                monitor
                  .activeCandidates,

              disappearedCandidates:
                monitor
                  .disappearedCandidates,

              totalReappearances:
                monitor
                  .totalReappearances,
            },
          ),

        qualification:
          this.createModuleState(
            "Candidate Qualification",

            true,

            qualification
              .qualified >
            0
              ? "QUALIFIED_AVAILABLE"
              : "WAITING",

            {
              totalCandidates:
                qualification
                  .totalCandidates,

              observing:
                qualification
                  .observing,

              qualified:
                qualification
                  .qualified,

              rejected:
                qualification
                  .rejected,

              expired:
                qualification
                  .expired,
            },
          ),

        queue:
          this.createModuleState(
            "Execution Candidate Queue",

            true,

            queue.ready >
            0
              ? "READY_ITEMS"
              : "EMPTY",

            {
              totalItemsCreated:
                queue
                  .totalItemsCreated,

              ready:
                queue.ready,

              expired:
                queue.expired,

              removed:
                queue.removed,

              consumed:
                queue.consumed,

              duplicatePrevention:
                queue
                  .duplicateEnqueueAttemptsPrevented,
            },
          ),

        shadowDispatcher:
          this.createModuleState(
            "Shadow Dispatcher",

            dispatcher
              .liveExecutionAllowed ===
            false,

            dispatcher
              .totalDispatched >
            0
              ? "ACTIVE"
              : "WAITING",

            {
              totalRuns:
                dispatcher
                  .totalRuns,

              totalAttempts:
                dispatcher
                  .totalAttempts,

              totalDispatched:
                dispatcher
                  .totalDispatched,

              duplicateSuppressed:
                dispatcher
                  .totalDuplicatesSuppressed,

              noReadyItemRuns:
                dispatcher
                  .noReadyItemRuns,
            },
          ),

        shadowOutcomes:
          this.createModuleState(
            "Shadow Outcome Tracker",

            outcomes
              .executionAllowed ===
            false,

            outcomes.tracking >
            0
              ? "TRACKING"
              : completedShadowOutcomes >
                  0
                ? "HAS_RESULTS"
                : "WAITING",

            {
              trackedDispatches:
                outcomes
                  .trackedDispatches,

              tracking:
                outcomes
                  .tracking,

              success:
                outcomes
                  .success,

              failed:
                outcomes
                  .failed,

              dataUnavailable:
                outcomes
                  .dataUnavailable,

              totalSamples:
                outcomes
                  .totalSamples,
            },
          ),

        shadowPerformance:
          this.createModuleState(
            "Shadow Performance",

            true,

            performance
              .readiness
              .level,

            {
              completed:
                performance
                  .summary
                  .completed,

              successRatePercent:
                performance
                  .summary
                  .successRatePercent,

              executableRatePercent:
                performance
                  .executionQuality
                  .executableRatePercent,

              profitableSampleRatePercent:
                performance
                  .executionQuality
                  .profitableSampleRatePercent,

              readinessScore:
                performance
                  .readiness
                  .score,

              remainingSamples:
                performance
                  .sampleRequirement
                  .remaining,
            },
          ),

        paperController:
          this.createModuleState(
            "Paper Controller",

            paperController
              .liveExecutionAllowed ===
            false,

            this.resolvePaperControllerStatus(
              paperController
                .paperExecutionAllowed,

              paperController
                .paperExecutionArmed,

              shadowReadinessPassed,
            ),

            {
              paperExecutionArmed:
                paperController
                  .paperExecutionArmed,

              paperExecutionAllowed:
                paperController
                  .paperExecutionAllowed,

              totalCycles:
                paperController
                  .totalCycles,

              executionAttempts:
                paperController
                  .executionAttempts,

              executed:
                paperController
                  .executed,

              executionRejected:
                paperController
                  .executionRejected,
            },
          ),

        paperScheduler:
          this.createModuleState(
            "Multi Opportunity Paper Scheduler",

            paperScheduler
              .liveExecutionAllowed ===
            false,

            paperScheduler
              .lastBatch
              ?.status ??
              "WAITING",

            {
              totalBatches:
                paperScheduler
                  .totalBatches,

              blockedReadiness:
                paperScheduler
                  .blockedReadiness,

              blockedNotArmed:
                paperScheduler
                  .blockedNotArmed,

              totalExecutionAttempts:
                paperScheduler
                  .totalExecutionAttempts,

              totalExecuted:
                paperScheduler
                  .totalExecuted,

              totalRejected:
                paperScheduler
                  .totalRejected,
            },
          ),

        adaptiveCapital:
          this.createModuleState(
            "Adaptive Paper Capital",

            adaptiveCapital
              .liveExecutionAllowed ===
            false,

            adaptiveCapital
              .allocated >
            0
              ? "ALLOCATING"
              : "WAITING",

            {
              totalRequests:
                adaptiveCapital
                  .totalRequests,

              allocated:
                adaptiveCapital
                  .allocated,

              rejectedLimits:
                adaptiveCapital
                  .rejectedLimits,

              rejectedQuality:
                adaptiveCapital
                  .rejectedQuality,

              optimizerRejected:
                adaptiveCapital
                  .optimizerRejected,

              averageAllocatedCapital:
                adaptiveCapital
                  .averageAllocatedCapital,
            },
          ),

        accounting:
          this.createModuleState(
            "Paper Automation Accounting",

            accountingIntegrityPassed,

            accountingIntegrityPassed
              ? "RECONCILED"
              : "INTEGRITY_WARNING",

            {
              totalEntries:
                accounting
                  .totalEntries,

              matched:
                accounting
                  .matched,

              missingPaperTrades:
                accounting
                  .missingPaperTrades,

              incompletePaperTrades:
                accounting
                  .incompletePaperTrades,

              profitMismatches:
                accounting
                  .profitMismatches,

              currentCapital:
                accounting
                  .account
                  .currentCapital,

              automationNetProfit:
                accounting
                  .totals
                  .netProfit,
            },
          ),
      },
    };
  }

  private buildBlockers(
    input: {
      shadowReadinessPassed: boolean;

      paperAutomationArmed: boolean;

      paperAccountMode: boolean;

      accountingIntegrityPassed: boolean;

      readinessReasons: string[];
    },
  ): string[] {
    const blockers:
      string[] =
      [];

    if (
      !input
        .shadowReadinessPassed
    ) {
      blockers.push(
        "Shadow performance has not reached READY_FOR_PAPER.",
      );

      for (
        const reason
        of input.readinessReasons
      ) {
        if (
          !blockers.includes(
            reason,
          )
        ) {
          blockers.push(
            reason,
          );
        }
      }
    }

    if (
      !input
        .paperAutomationArmed
    ) {
      blockers.push(
        "Automated PAPER execution is not explicitly armed.",
      );
    }

    if (
      !input
        .paperAccountMode
    ) {
      blockers.push(
        "Trading account is not in PAPER mode.",
      );
    }

    if (
      !input
        .accountingIntegrityPassed
    ) {
      blockers.push(
        "Paper automation accounting integrity checks are not fully passing.",
      );
    }

    if (
      blockers.length ===
      0
    ) {
      blockers.push(
        "No PAPER automation blocker is currently detected.",
      );
    }

    /*
     * LIVE remains deliberately unavailable
     * regardless of PAPER readiness.
     */
    blockers.push(
      "LIVE execution remains disabled in Version 16.4.",
    );

    return blockers;
  }

  private resolveStage(
    input: {
      accountingIntegrityPassed: boolean;

      shadowReadinessPassed: boolean;

      paperAutomationArmed: boolean;

      paperExecutions: number;
    },
  ): AutomationDashboardStage {
    if (
      !input
        .accountingIntegrityPassed
    ) {
      return "DEGRADED";
    }

    if (
      input.paperExecutions >
      0
    ) {
      return "PAPER_ACTIVE";
    }

    if (
      input
        .shadowReadinessPassed &&
      input
        .paperAutomationArmed
    ) {
      return "PAPER_ARMED";
    }

    if (
      input
        .shadowReadinessPassed
    ) {
      return "READY_FOR_PAPER";
    }

    return "SHADOW_LEARNING";
  }

  private resolvePaperControllerStatus(
    allowed:
      boolean,

    armed:
      boolean,

    readinessPassed:
      boolean,
  ): string {
    if (
      allowed
    ) {
      return "READY";
    }

    if (
      !readinessPassed
    ) {
      return "BLOCKED_READINESS";
    }

    if (
      !armed
    ) {
      return "BLOCKED_NOT_ARMED";
    }

    return "BLOCKED";
  }

  private createModuleState(
    name:
      string,

    healthy:
      boolean,

    status:
      string,

    details:
      Record<
        string,
        string | number | boolean | null
      >,
  ): AutomationDashboardModuleState {
    return {
      name,

      healthy,

      status,

      details,
    };
  }
}

export const automationPerformanceDashboardService =
  new AutomationPerformanceDashboardService();
