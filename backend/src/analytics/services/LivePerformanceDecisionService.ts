import type {
  LivePerformanceDecision,
  LivePerformanceDecisionReport,
} from "../models/LivePerformanceDecision";

import {
  livePerformanceAnalyticsService,
} from "./LivePerformanceAnalyticsService";

import {
  livePerformanceReadinessService,
} from "./LivePerformanceReadinessService";

export class LivePerformanceDecisionService {
  async getReport():
  Promise<LivePerformanceDecisionReport> {
    const [
      analytics,
      readiness,
    ] =
      await Promise.all([
        livePerformanceAnalyticsService
          .getReport(),

        livePerformanceReadinessService
          .getReport(),
      ]);

    const passingReadinessGates =
      readiness.gates.filter(
        (
          gate,
        ) =>
          gate.state ===
          "PASS",
      );

    const blockedReadinessGates =
      readiness.gates.filter(
        (
          gate,
        ) =>
          gate.state ===
          "BLOCKED",
      );

    const insufficientReadinessGates =
      readiness.gates.filter(
        (
          gate,
        ) =>
          gate.state ===
          "INSUFFICIENT_DATA",
      );

    const matchedLiveCycles =
      readiness
        .metrics
        .matchedLiveCycles;

    const minimumMatchedLiveCycles =
      readiness
        .metrics
        .minimumMatchedLiveCycles;

    const matchedSampleProgressPercent =
      minimumMatchedLiveCycles >
      0
        ? this.round(
            Math.min(
              100,

              matchedLiveCycles /
                minimumMatchedLiveCycles *
                100,
            ),
          )
        : 0;

    const decision =
      this.resolveDecision(
        readiness.level,
      );

    const nextRequirements =
      this.buildNextRequirements(
        readiness.gates,
      );

    const warnings =
      this.buildWarnings(
        analytics
          .execution
          .partialFillRatePercent,

        analytics
          .execution
          .failureRatePercent,

        analytics
          .execution
          .timeoutRatePercent,

        readiness
          .metrics
          .aggregateProfitRetentionPercent,

        readiness
          .metrics
          .averageAdverseSlippagePercent,
      );

    return {
      generatedAt:
        Date.now(),

      version:
        "17.6",

      decision,

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

      summary: {
        readinessLevel:
          readiness.level,

        performanceEvidenceStatus:
          analytics.evidenceStatus,

        totalReadinessGates:
          readiness.gates.length,

        passingReadinessGates:
          passingReadinessGates.length,

        blockedReadinessGates:
          blockedReadinessGates.length,

        insufficientReadinessGates:
          insufficientReadinessGates.length,

        matchedLiveCycles,

        minimumMatchedLiveCycles,

        matchedSampleProgressPercent,

        establishedRoutes:
          readiness
            .metrics
            .establishedRoutes,

        establishedExchangePairs:
          readiness
            .metrics
            .establishedExchangePairs,

        aggregateProfitRetentionPercent:
          readiness
            .metrics
            .aggregateProfitRetentionPercent,

        realizedNetProfit:
          readiness
            .metrics
            .totalRealizedNetProfit,

        fillRatePercent:
          readiness
            .metrics
            .fillRatePercent,

        partialFillRatePercent:
          readiness
            .metrics
            .partialFillRatePercent,

        failureRatePercent:
          readiness
            .metrics
            .failureRatePercent,

        timeoutRatePercent:
          readiness
            .metrics
            .timeoutRatePercent,

        averageExecutionTimeMs:
          readiness
            .metrics
            .averageExecutionTimeMs,

        averageAdverseSlippagePercent:
          readiness
            .metrics
            .averageAdverseSlippagePercent,
      },

      nextRequirements,

      blockers:
        [
          ...new Set(
            readiness.blockers,
          ),
        ],

      insufficientEvidence:
        [
          ...new Set(
            readiness
              .insufficientEvidence,
          ),
        ],

      warnings,

      notes: [
        "Version 17.6 Build 5 is a read-only decision summary.",

        "ANALYTICALLY_READY_FOR_TINY_VALIDATION is not permission to place a LIVE order.",

        "This service cannot enable LIVE trading, arm an execution session, reserve capital, or submit exchange orders.",

        "Readiness continues to depend on the existing Version 17.6 readiness gates and underlying safety systems.",

        "Missing evidence is reported as insufficient evidence rather than assumed to be healthy.",
      ],
    };
  }

  private resolveDecision(
    readinessLevel:
      | "INSUFFICIENT_DATA"
      | "NOT_READY"
      | "READY_FOR_TINY_VALIDATION",
  ): LivePerformanceDecision {
    if (
      readinessLevel ===
      "INSUFFICIENT_DATA"
    ) {
      return "INSUFFICIENT_EVIDENCE";
    }

    if (
      readinessLevel ===
      "NOT_READY"
    ) {
      return "NOT_READY";
    }

    return "ANALYTICALLY_READY_FOR_TINY_VALIDATION";
  }

  private buildNextRequirements(
    gates:
      readonly {
        key: string;

        state:
          | "PASS"
          | "BLOCKED"
          | "INSUFFICIENT_DATA";

        required: boolean;

        message: string;

        reasons: string[];
      }[],
  ): string[] {
    const requirements =
      gates
        .filter(
          (
            gate,
          ) =>
            gate.required &&
            gate.state !==
              "PASS",
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

    return [
      ...new Set(
        requirements,
      ),
    ];
  }

  private buildWarnings(
    partialFillRatePercent:
      number,

    failureRatePercent:
      number,

    timeoutRatePercent:
      number,

    profitRetentionPercent:
      number | null,

    adverseSlippagePercent:
      number,
  ): string[] {
    const warnings:
      string[] = [];

    /*
     * These are observations only.
     *
     * Build 5 intentionally does not invent
     * new hard promotion thresholds.
     */
    if (
      partialFillRatePercent >
      0
    ) {
      warnings.push(
        `Observed partial-fill rate is ${this.round(
          partialFillRatePercent,
        )}%.`,
      );
    }

    if (
      failureRatePercent >
      0
    ) {
      warnings.push(
        `Observed execution failure rate is ${this.round(
          failureRatePercent,
        )}%.`,
      );
    }

    if (
      timeoutRatePercent >
      0
    ) {
      warnings.push(
        `Observed execution timeout rate is ${this.round(
          timeoutRatePercent,
        )}%.`,
      );
    }

    if (
      profitRetentionPercent !==
        null &&
      profitRetentionPercent <
        100
    ) {
      warnings.push(
        `Realized profit retention is ${this.round(
          profitRetentionPercent,
        )}% of modeled expectation.`,
      );
    }

    if (
      adverseSlippagePercent >
      0
    ) {
      warnings.push(
        `Observed average adverse slippage is ${this.round(
          adverseSlippagePercent,
        )}%.`,
      );
    }

    return warnings;
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

export const livePerformanceDecisionService =
  new LivePerformanceDecisionService();