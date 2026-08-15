import {
  opportunityAnalyticsService,
} from "../../candidates/services/OpportunityAnalyticsService";

import {
  marketCoverageAnalyticsService,
} from "../../diagnostics/services/MarketCoverageAnalyticsService";

import type {
  OpportunityPipelineBottleneckReport,
  OpportunityPipelineBottleneckStatus,
  OpportunityPipelineStageDiagnostic,
} from "../models/OpportunityPipelineBottleneck";

import {
  candidateQualificationService,
} from "./CandidateQualificationService";

import {
  executionCandidateQueueService,
} from "./ExecutionCandidateQueueService";

import {
  opportunityMonitorService,
} from "./OpportunityMonitorService";

import {
  shadowExecutionDispatcherService,
} from "./ShadowExecutionDispatcherService";

import {
  shadowPerformanceAnalyticsService,
} from "./ShadowPerformanceAnalyticsService";

import {
  shadowTradeOutcomeTrackerService,
} from "./ShadowTradeOutcomeTrackerService";

export class OpportunityPipelineBottleneckService {
  getReport(): OpportunityPipelineBottleneckReport {
    const coverage =
      marketCoverageAnalyticsService
        .getReport();

    const analytics =
      opportunityAnalyticsService
        .getReport();

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

    const shadowPerformance =
      shadowPerformanceAnalyticsService
        .getAnalytics();

    const summary = {
      cachedQuotes:
        coverage.summary
          .cachedQuotes,

      executableQuotes:
        coverage.summary
          .executableQuotes,

      sharedMarkets:
        coverage.summary
          .sharedMarkets,

      pairableMarkets:
        coverage.summary
          .pairableMarkets,

      directionalPairs:
        coverage.summary
          .generatedDirectionalPairs,

      evaluatedPairs:
        analytics.evaluation
          .evaluated,

      acceptedOpportunities:
        analytics.evaluation
          .accepted,

      activeCandidates:
        monitor.activeCandidates,

      qualifiedCandidates:
        qualification.qualified,

      readyQueueItems:
        queue.ready,

      shadowDispatches:
        dispatcher.totalDispatched,

      completedShadowOutcomes:
        shadowPerformance.summary
          .completed,
    };

    const stages:
      OpportunityPipelineStageDiagnostic[] = [
      this.stage(
        "MARKET_CACHE",

        summary.cachedQuotes >
          0,

        summary.cachedQuotes,

        summary.cachedQuotes >
          0
          ? `${summary.cachedQuotes} normalized quotes are cached.`
          : "No normalized market quotes are cached.",
      ),

      this.stage(
        "EXECUTABLE_QUOTES",

        summary.executableQuotes >
          0,

        summary.executableQuotes,

        summary.executableQuotes >
          0
          ? `${summary.executableQuotes} cached quotes are executable.`
          : "No cached quotes are currently executable.",
      ),

      this.stage(
        "PAIRABLE_MARKETS",

        summary.pairableMarkets >
          0 &&
          summary.directionalPairs >
            0,

        summary.directionalPairs,

        summary.pairableMarkets >
          0
          ? `${summary.pairableMarkets} markets generate ${summary.directionalPairs} directional exchange pairs.`
          : "No shared executable market can currently form a cross-exchange pair.",
      ),

      this.stage(
        "OPPORTUNITY_ENGINE",

        summary.evaluatedPairs >
          0,

        summary.evaluatedPairs,

        summary.evaluatedPairs >
          0
          ? `${summary.evaluatedPairs} exchange pairs were evaluated in the latest engine snapshot.`
          : "The latest engine snapshot evaluated zero exchange pairs.",
      ),

      this.stage(
        "ACCEPTED_OPPORTUNITIES",

        summary.acceptedOpportunities >
          0,

        summary.acceptedOpportunities,

        summary.acceptedOpportunities >
          0
          ? `${summary.acceptedOpportunities} opportunities passed the engine.`
          : analytics.primaryBottleneck
            ? `No opportunity passed. Largest recent rejection stage is ${analytics.primaryBottleneck} (${analytics.primaryBottleneckPercent ?? 0}%).`
            : "No opportunity passed and there is not yet enough rejection history to identify a dominant engine gate.",
      ),

      this.stage(
        "PERSISTENCE_MONITOR",

        summary.activeCandidates >
          0,

        summary.activeCandidates,

        summary.activeCandidates >
          0
          ? `${summary.activeCandidates} opportunity candidates are active in the persistence monitor.`
          : "No accepted opportunity is currently surviving as an active persistence candidate.",
      ),

      this.stage(
        "QUALIFICATION",

        summary.qualifiedCandidates >
          0,

        summary.qualifiedCandidates,

        summary.qualifiedCandidates >
          0
          ? `${summary.qualifiedCandidates} candidates are qualified.`
          : `No candidate is qualified; observing=${qualification.observing}, rejected=${qualification.rejected}, expired=${qualification.expired}.`,
      ),

      this.stage(
        "EXECUTION_QUEUE",

        summary.readyQueueItems >
          0,

        summary.readyQueueItems,

        summary.readyQueueItems >
          0
          ? `${summary.readyQueueItems} execution candidates are READY.`
          : "The execution candidate queue has no READY item.",
      ),

      this.stage(
        "SHADOW_DISPATCH",

        summary.shadowDispatches >
          0,

        summary.shadowDispatches,

        summary.shadowDispatches >
          0
          ? `${summary.shadowDispatches} shadow dispatches have been recorded.`
          : "No shadow candidate has been dispatched yet.",
      ),

      this.stage(
        "SHADOW_OUTCOMES",

        summary.completedShadowOutcomes >
          0,

        summary.completedShadowOutcomes,

        summary.completedShadowOutcomes >
          0
          ? `${summary.completedShadowOutcomes} shadow outcomes are complete.`
          : "No completed shadow outcome exists yet.",
      ),
    ];

    const failedChecks =
      this.buildQualificationFailures(
        qualification.qualifications,
      );

    const status =
      this.resolveStatus(
        summary,
      );

    const observations = [
      ...coverage.observations,

      ...analytics.notes,

      `Diagnostic status: ${status}.`,

      "No thresholds, fees, freshness limits, qualification policy, capital policy, paper setting, or LIVE setting are modified by this report.",
    ];

    return {
      generatedAt:
        Date.now(),

      version:
        "17.3",

      build:
        "1",

      mode:
        "DIAGNOSTIC_ONLY",

      tradingPolicyMutationAllowed:
        false,

      liveExecutionAllowed:
        false,

      status,

      primaryBottleneck:
        this.primaryBottleneck(
          status,

          analytics
            .primaryBottleneck,
        ),

      primaryBottleneckPercent:
        analytics
          .primaryBottleneckPercent,

      summary,

      stages,

      engine: {
        rejectionSampleSize:
          analytics
            .rejectionSample
            .returnedRecords,

        primaryRejectionStage:
          analytics
            .primaryBottleneck,

        primaryRejectionPercent:
          analytics
            .primaryBottleneckPercent,

        rejectionStages:
          analytics
            .rejectionSample
            .distributionByStage
            .map(
              (
                item,
              ) => ({
                stage:
                  item.stage,

                count:
                  item.count,

                percent:
                  item.percent,
              }),
            ),

        rejectionCodes:
          analytics
            .rejectionSample
            .distributionByCode
            .map(
              (
                item,
              ) => ({
                code:
                  item.code,

                count:
                  item.count,

                percent:
                  item.percent,
              }),
            ),

        closestToExecution:
          structuredClone(
            analytics
              .closestToExecution,
          ),
      },

      qualification: {
        observing:
          qualification.observing,

        qualified:
          qualification.qualified,

        rejected:
          qualification.rejected,

        expired:
          qualification.expired,

        failedChecks,
      },

      shadow: {
        totalDispatched:
          dispatcher.totalDispatched,

        revalidationFailed:
          dispatcher
            .totalRevalidationFailed,

        duplicatesSuppressed:
          dispatcher
            .totalDuplicatesSuppressed,

        trackedDispatches:
          outcomes.trackedDispatches,

        tracking:
          outcomes.tracking,

        success:
          outcomes.success,

        failed:
          outcomes.failed,

        dataUnavailable:
          outcomes.dataUnavailable,

        completed:
          shadowPerformance
            .summary
            .completed,

        readinessLevel:
          shadowPerformance
            .readiness
            .level,

        readinessScore:
          shadowPerformance
            .readiness
            .score,
      },

      observations:
        Array.from(
          new Set(
            observations,
          ),
        ),
    };
  }

  private resolveStatus(
    summary:
      OpportunityPipelineBottleneckReport[
        "summary"
      ],
  ): OpportunityPipelineBottleneckStatus {
    if (
      summary.cachedQuotes ===
      0
    ) {
      return "NO_MARKET_DATA";
    }

    if (
      summary.executableQuotes ===
      0
    ) {
      return "NO_EXECUTABLE_MARKET_DATA";
    }

    if (
      summary.pairableMarkets ===
        0 ||
      summary.directionalPairs ===
        0
    ) {
      return "NO_PAIRABLE_MARKETS";
    }

    if (
      summary.evaluatedPairs >
        0 &&
      summary.acceptedOpportunities ===
        0
    ) {
      return "ENGINE_REJECTING";
    }

    if (
      summary.acceptedOpportunities ===
      0
    ) {
      return "NO_ACCEPTED_OPPORTUNITIES";
    }

    if (
      summary.activeCandidates ===
      0
    ) {
      return "NO_PERSISTENT_CANDIDATES";
    }

    if (
      summary.qualifiedCandidates ===
      0
    ) {
      return "QUALIFICATION_BLOCKED";
    }

    if (
      summary.readyQueueItems ===
      0
    ) {
      return "QUEUE_EMPTY";
    }

    if (
      summary.shadowDispatches ===
      0
    ) {
      return "SHADOW_NOT_DISPATCHING";
    }

    if (
      summary.completedShadowOutcomes ===
      0
    ) {
      return "SHADOW_LEARNING";
    }

    return "FLOWING";
  }

  private primaryBottleneck(
    status:
      OpportunityPipelineBottleneckStatus,

    enginePrimary:
      string | null,
  ): string {
    if (
      status ===
        "ENGINE_REJECTING" &&
      enginePrimary
    ) {
      return enginePrimary;
    }

    return status;
  }

  private stage(
    key:
      string,

    healthy:
      boolean,

    count:
      number,

    message:
      string,
  ): OpportunityPipelineStageDiagnostic {
    return {
      key,

      healthy,

      count,

      message,
    };
  }

  private buildQualificationFailures(
    qualifications:
      ReturnType<
        typeof candidateQualificationService.getDiagnostics
      >["qualifications"],
  ): Array<{
    check: string;

    count: number;
  }> {
    const counts =
      new Map<
        string,
        number
      >();

    for (
      const qualification
      of qualifications
    ) {
      for (
        const [
          check,
          result,
        ]
        of Object.entries(
          qualification.checks,
        )
      ) {
        if (
          result.passed
        ) {
          continue;
        }

        counts.set(
          check,

          (
            counts.get(
              check,
            ) ??
            0
          ) +
            1,
        );
      }
    }

    return Array.from(
      counts.entries(),
    )
      .map(
        (
          [
            check,
            count,
          ],
        ) => ({
          check,

          count,
        }),
      )
      .sort(
        (
          first,
          second,
        ) =>
          second.count -
          first.count,
      );
  }
}

export const opportunityPipelineBottleneckService =
  new OpportunityPipelineBottleneckService();