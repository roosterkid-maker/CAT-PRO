import {
  shadowPerformanceAnalyticsService,
} from "../../automation/services/ShadowPerformanceAnalyticsService";

import {
  executionHealthService,
} from "../../execution/live/health/ExecutionHealthService";

import type {
  LivePerformanceReadinessGate,
  LivePerformanceReadinessLevel,
  LivePerformanceReadinessReport,
} from "../models/LivePerformanceReadiness";

import {
  livePerformanceAnalyticsService,
} from "./LivePerformanceAnalyticsService";

const MINIMUM_MATCHED_LIVE_CYCLES =
  20;

/*
 * Existing ShadowPerformanceAnalyticsService
 * uses 50% as the configured target for
 * predicted-profit retention.
 *
 * Version 17.6 reuses that conservative
 * performance target instead of weakening it.
 */
const MINIMUM_PROFIT_RETENTION_PERCENT =
  50;

export class LivePerformanceReadinessService {
  async getReport():
    Promise<LivePerformanceReadinessReport> {
    const analytics =
      await livePerformanceAnalyticsService
        .getReport();

    const executionHealth =
      executionHealthService
        .getReport();

    const shadow =
      shadowPerformanceAnalyticsService
        .getAnalytics();

    const gates:
      LivePerformanceReadinessGate[] =
      [];

    const matchedLiveCycles =
      analytics
        .expectedVsRealized
        .matchedCycles;

    const sampleRequirementMet =
      matchedLiveCycles >=
      MINIMUM_MATCHED_LIVE_CYCLES;

    gates.push({
      key:
        "LIVE_SAMPLE_SUFFICIENCY",

      state:
        sampleRequirementMet
          ? "PASS"
          : "INSUFFICIENT_DATA",

      required:
        true,

      message:
        sampleRequirementMet
          ? `Matched settled LIVE sample requirement is satisfied (${matchedLiveCycles}/${MINIMUM_MATCHED_LIVE_CYCLES}).`
          : `Only ${matchedLiveCycles}/${MINIMUM_MATCHED_LIVE_CYCLES} matched settled LIVE cycles are available.`,

      reasons:
        sampleRequirementMet
          ? []
          : [
              `At least ${MINIMUM_MATCHED_LIVE_CYCLES} exact session-to-settlement LIVE samples are required before performance-based tiny-validation readiness can be assessed.`,
            ],
    });

    const executionHealthHasEvidence =
      executionHealth.status !==
      "NO_DATA";

    gates.push({
      key:
        "EXECUTION_HEALTH_READY",

      state:
        !executionHealthHasEvidence
          ? "INSUFFICIENT_DATA"
          : executionHealth.status ===
              "HEALTHY"
            ? "PASS"
            : "BLOCKED",

      required:
        true,

      message:
        !executionHealthHasEvidence
          ? "Execution health has insufficient LIVE evidence."
          : executionHealth.status ===
              "HEALTHY"
            ? "Execution health satisfies the existing HEALTHY policy."
            : `Execution health is ${executionHealth.status}.`,

      reasons:
        !executionHealthHasEvidence
          ? [
              "ExecutionHealthService currently reports NO_DATA.",
            ]
          : executionHealth.status ===
              "HEALTHY"
            ? []
            : executionHealth.reasons.length >
                0
              ? [
                  ...executionHealth.reasons,
                ]
              : [
                  `Existing ExecutionHealthService status is ${executionHealth.status}.`,
                ],
    });

    const profitRetention =
      analytics
        .expectedVsRealized
        .aggregateProfitRetentionPercent;

    const profitRetentionAvailable =
      profitRetention !==
      null;

    const profitRetentionPassed =
      profitRetentionAvailable &&
      profitRetention >=
        MINIMUM_PROFIT_RETENTION_PERCENT;

    gates.push({
      key:
        "PROFIT_RETENTION",

      state:
        !profitRetentionAvailable
          ? "INSUFFICIENT_DATA"
          : profitRetentionPassed
            ? "PASS"
            : "BLOCKED",

      required:
        true,

      message:
        !profitRetentionAvailable
          ? "Realized profit-retention evidence is unavailable."
          : profitRetentionPassed
            ? `Aggregate profit retention is acceptable (${this.round(
                profitRetention,
              )}% >= ${MINIMUM_PROFIT_RETENTION_PERCENT}%).`
            : `Aggregate profit retention is below target (${this.round(
                profitRetention,
              )}% < ${MINIMUM_PROFIT_RETENTION_PERCENT}%).`,

      reasons:
        !profitRetentionAvailable
          ? [
              "Expected-versus-realized LIVE P&L evidence is required before profit retention can be assessed.",
            ]
          : profitRetentionPassed
            ? []
            : [
                `Existing conservative profit-retention target is ${MINIMUM_PROFIT_RETENTION_PERCENT}%.`,
              ],
    });

    const realizedProfitEvidenceAvailable =
      matchedLiveCycles >
      0;

    const positiveRealizedProfit =
      analytics
        .expectedVsRealized
        .totalRealizedNetProfit >
      0;

    gates.push({
      key:
        "REALIZED_NET_PROFITABILITY",

      state:
        !realizedProfitEvidenceAvailable
          ? "INSUFFICIENT_DATA"
          : positiveRealizedProfit
            ? "PASS"
            : "BLOCKED",

      required:
        true,

      message:
        !realizedProfitEvidenceAvailable
          ? "Realized LIVE profitability evidence is unavailable."
          : positiveRealizedProfit
            ? `Aggregate realized LIVE net profit is positive (${this.formatMoney(
                analytics
                  .expectedVsRealized
                  .totalRealizedNetProfit,
              )}).`
            : `Aggregate realized LIVE net profit is not positive (${this.formatMoney(
                analytics
                  .expectedVsRealized
                  .totalRealizedNetProfit,
              )}).`,

      reasons:
        !realizedProfitEvidenceAvailable
          ? [
              "No matched settled LIVE cycle is available.",
            ]
          : positiveRealizedProfit
            ? []
            : [
                "Performance-based validation must not be promoted while aggregate realized LIVE net profit is zero or negative.",
              ],
    });

    const establishedRouteEvidence =
      analytics
        .evidence
        .establishedRouteEvidenceAvailable;

    const anyRouteEvidence =
      analytics
        .routePerformance
        .routesObserved >
        0 ||
      analytics
        .routePerformance
        .exchangePairsObserved >
        0;

    gates.push({
      key:
        "ESTABLISHED_ROUTE_EVIDENCE",

      state:
        establishedRouteEvidence
          ? "PASS"
          : anyRouteEvidence
            ? "BLOCKED"
            : "INSUFFICIENT_DATA",

      required:
        true,

      message:
        establishedRouteEvidence
          ? "At least one route or directional exchange pair has ESTABLISHED LIVE evidence."
          : anyRouteEvidence
            ? "Route evidence exists, but none has reached ESTABLISHED sample confidence."
            : "No LIVE route-performance evidence exists yet.",

      reasons:
        establishedRouteEvidence
          ? []
          : [
              `Version 17.6 route analytics requires ${MINIMUM_MATCHED_LIVE_CYCLES} matched samples for ESTABLISHED evidence.`,
            ],
    });

    /*
     * Partial-fill rate and realized adverse
     * slippage are intentionally surfaced here,
     * but no new arbitrary promotion threshold
     * is invented in Build 4.
     *
     * Fill/failure/timeout/latency quality is
     * already evaluated by ExecutionHealthService.
     *
     * Future evidence can justify a dedicated
     * partial-fill/slippage promotion policy.
     */
    const performanceObservabilityAvailable =
      matchedLiveCycles >
        0 &&
      Number.isFinite(
        analytics
          .routePerformance
          .routes.length >
          0
          ? analytics
              .routePerformance
              .routes[0]
              ?.averageAdverseSlippagePercent ??
              0
          : 0,
      );

    gates.push({
      key:
        "PERFORMANCE_OBSERVABILITY",

      state:
        performanceObservabilityAvailable
          ? "PASS"
          : "INSUFFICIENT_DATA",

      required:
        true,

      message:
        performanceObservabilityAvailable
          ? "Partial-fill, failure, latency and adverse-slippage performance metrics are observable."
          : "LIVE performance observability is incomplete.",

      reasons:
        performanceObservabilityAvailable
          ? []
          : [
              "Matched LIVE execution evidence is required before partial-fill and adverse-slippage behavior can be evaluated.",
            ],
    });

    /*
     * Existing SHADOW readiness remains an
     * independent prerequisite.
     *
     * We do not allow LIVE performance analytics
     * to erase or bypass earlier shadow evidence.
     */
    gates.push({
      key:
        "SHADOW_READINESS_PRESERVED",

      state:
        shadow
          .readiness
          .readyForPaperAutomation
          ? "PASS"
          : shadow
                .summary
                .completed <
              shadow
                .sampleRequirement
                .minimumCompletedOutcomes
            ? "INSUFFICIENT_DATA"
            : "BLOCKED",

      required:
        true,

      message:
        shadow
          .readiness
          .readyForPaperAutomation
          ? "Existing shadow readiness policy is satisfied."
          : `Shadow readiness is ${shadow.readiness.level} with score ${shadow.readiness.score}.`,

      reasons:
        shadow
          .readiness
          .readyForPaperAutomation
          ? []
          : [
              ...shadow
                .readiness
                .reasons,
            ],
    });

    const insufficientEvidence =
      gates
        .filter(
          (
            gate,
          ) =>
            gate.required &&
            gate.state ===
              "INSUFFICIENT_DATA",
        )
        .flatMap(
          (
            gate,
          ) =>
            gate.reasons.length >
              0
              ? gate.reasons
              : [
                  gate.message,
                ],
        );

    const blockers =
      gates
        .filter(
          (
            gate,
          ) =>
            gate.required &&
            gate.state ===
              "BLOCKED",
        )
        .flatMap(
          (
            gate,
          ) =>
            gate.reasons.length >
              0
              ? gate.reasons
              : [
                  gate.message,
                ],
        );

    const level =
      this.resolveLevel(
        gates,
      );

    const averageAdverseSlippagePercent =
      this.averageAdverseSlippage(
        analytics
          .routePerformance
          .routes,
      );

    return {
      generatedAt:
        Date.now(),

      version:
        "17.6",

      level,

      analyticsOnly:
        true,

      liveTradingEnabled:
        false,

      /*
       * CRITICAL:
       *
       * Even READY_FOR_TINY_VALIDATION is only an
       * analytical conclusion.
       *
       * It NEVER authorizes an exchange order.
       */
      tinyValidationAuthorized:
        false,

      failClosed:
        true,

      policy: {
        minimumMatchedLiveCycles:
          MINIMUM_MATCHED_LIVE_CYCLES,

        minimumProfitRetentionPercent:
          MINIMUM_PROFIT_RETENTION_PERCENT,

        executionHealthMustBeHealthy:
          true,

        positiveRealizedNetProfitRequired:
          true,

        establishedRouteEvidenceRequired:
          true,

        partialFillRateIsObserved:
          true,

        adverseSlippageIsObserved:
          true,
      },

      metrics: {
        matchedLiveCycles,

        minimumMatchedLiveCycles:
          MINIMUM_MATCHED_LIVE_CYCLES,

        totalExecutions:
          analytics
            .execution
            .totalExecutions,

        fillRatePercent:
          analytics
            .execution
            .fillRatePercent,

        partialFillRatePercent:
          analytics
            .execution
            .partialFillRatePercent,

        failureRatePercent:
          analytics
            .execution
            .failureRatePercent,

        timeoutRatePercent:
          analytics
            .execution
            .timeoutRatePercent,

        averageExecutionTimeMs:
          analytics
            .execution
            .averageExecutionTimeMs,

        averageAdverseSlippagePercent,

        aggregateProfitRetentionPercent:
          profitRetention,

        totalExpectedNetProfit:
          analytics
            .expectedVsRealized
            .totalExpectedNetProfit,

        totalRealizedNetProfit:
          analytics
            .expectedVsRealized
            .totalRealizedNetProfit,

        totalProfitVariance:
          analytics
            .expectedVsRealized
            .totalProfitVariance,

        establishedRoutes:
          analytics
            .routePerformance
            .establishedRoutes,

        establishedExchangePairs:
          analytics
            .routePerformance
            .establishedExchangePairs,
      },

      gates,

      blockers:
        [
          ...new Set(
            blockers,
          ),
        ],

      insufficientEvidence:
        [
          ...new Set(
            insufficientEvidence,
          ),
        ],

      notes: [
        "Version 17.6 Build 4 is analytics-only.",

        "READY_FOR_TINY_VALIDATION does not authorize LIVE trading or an exchange order.",

        "Execution fill-rate, failure-rate, timeout-rate and latency quality reuse the existing ExecutionHealthService policy.",

        "Partial-fill rate and realized adverse slippage are observed but are not assigned invented promotion thresholds in this build.",

        "The existing shadow-readiness requirement remains independent and cannot be bypassed by LIVE analytics.",

        "LIVE submission remains disabled until a later explicit controlled-live enablement build.",
      ],
    };
  }

  private resolveLevel(
    gates:
      readonly LivePerformanceReadinessGate[],
  ): LivePerformanceReadinessLevel {
    const required =
      gates.filter(
        (
          gate,
        ) =>
          gate.required,
      );

    if (
      required.some(
        (
          gate,
        ) =>
          gate.state ===
          "INSUFFICIENT_DATA",
      )
    ) {
      return "INSUFFICIENT_DATA";
    }

    if (
      required.some(
        (
          gate,
        ) =>
          gate.state ===
          "BLOCKED",
      )
    ) {
      return "NOT_READY";
    }

    return "READY_FOR_TINY_VALIDATION";
  }

  private averageAdverseSlippage(
    routes:
      readonly {
        matchedCycles: number;

        averageAdverseSlippagePercent: number;
      }[],
  ): number {
    const totalSamples =
      routes.reduce(
        (
          total,
          route,
        ) =>
          total +
          route.matchedCycles,
        0,
      );

    if (
      totalSamples <=
      0
    ) {
      return 0;
    }

    const weightedTotal =
      routes.reduce(
        (
          total,
          route,
        ) =>
          total +
          route
            .averageAdverseSlippagePercent *
          route
            .matchedCycles,
        0,
      );

    return this.round(
      weightedTotal /
        totalSamples,
    );
  }

  private formatMoney(
    value:
      number,
  ): string {
    return `₹${value.toLocaleString(
      "en-IN",
      {
        maximumFractionDigits:
          4,
      },
    )}`;
  }

  private round(
    value:
      number,
  ): number {
    return Math.round(
      value *
        10_000,
    ) /
      10_000;
  }
}

export const livePerformanceReadinessService =
  new LivePerformanceReadinessService();