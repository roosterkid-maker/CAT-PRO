import type {
  CandidateQualificationRecord,
} from "../models/CandidateQualification";

import type {
  QualificationCheckFailureSummary,
  QualificationPersistenceCandidateTrace,
  QualificationPersistenceRootCauseClassification,
  QualificationPersistenceRootCauseReport,
} from "../models/QualificationPersistenceRootCause";

import {
  candidateQualificationService,
} from "./CandidateQualificationService";

import {
  opportunityMonitorService,
} from "./OpportunityMonitorService";

const TRACE_LIMIT =
  50;

export class QualificationPersistenceRootCauseAnalyzerService {
  getReport():
    QualificationPersistenceRootCauseReport {
    const monitor =
      opportunityMonitorService
        .getDiagnostics();

    const qualification =
      candidateQualificationService
        .getDiagnostics();

    const records =
      qualification.qualifications;

    const failedChecks =
      this.buildFailureSummary(
        records,
      );

    const traces =
      records.map(
        (
          record,
        ) =>
          this.toTrace(
            record,
            qualification.config,
          ),
      );

    const activeCandidates =
      traces
        .filter(
          (
            trace,
          ) =>
            trace.monitorStatus ===
            "ACTIVE",
        )
        .sort(
          (
            first,
            second,
          ) => {
            if (
              first.qualified !==
              second.qualified
            ) {
              return first.qualified
                ? -1
                : 1;
            }

            if (
              first.score !==
              second.score
            ) {
              return (
                second.score -
                first.score
              );
            }

            return (
              second
                .latestNetProfitPercent -
              first
                .latestNetProfitPercent
            );
          },
        )
        .slice(
          0,
          TRACE_LIMIT,
        );

    const recentCandidates =
      [
        ...traces,
      ]
        .sort(
          (
            first,
            second,
          ) => {
            if (
              first.monitorStatus !==
              second.monitorStatus
            ) {
              return first
                .monitorStatus ===
                "ACTIVE"
                ? -1
                : 1;
            }

            return (
              second.score -
              first.score
            );
          },
        )
        .slice(
          0,
          TRACE_LIMIT,
        );

    const candidatesMeetingPersistence =
      records.filter(
        (
          record,
        ) =>
          record
            .checks
            .consecutiveObservations
            .passed &&
          record
            .checks
            .persistence
            .passed,
      ).length;

    const candidatesMeetingQuality =
      records.filter(
        (
          record,
        ) =>
          record
            .checks
            .netProfit
            .passed &&
          record
            .checks
            .liquidity
            .passed &&
          record
            .checks
            .freshness
            .passed &&
          record
            .checks
            .profitStability
            .passed,
      ).length;

    const candidatesMeetingAllChecks =
      records.filter(
        (
          record,
        ) =>
          Object.values(
            record.checks,
          )
            .every(
              (
                check,
              ) =>
                check.passed,
            ),
      ).length;

    const classification =
      this.classify(
        records,
        failedChecks,
        qualification.qualified,
      );

    const primaryBottleneck =
      this.primaryBottleneck(
        classification,
        failedChecks,
      );

    const observations:
      string[] = [
      `OpportunityMonitor has processed ${monitor.processedSnapshots} authoritative snapshot(s), created ${monitor.totalCandidatesCreated} candidate(s), and currently has ${monitor.activeCandidates} ACTIVE candidate(s).`,

      `Qualification currently reports observing=${qualification.observing}, qualified=${qualification.qualified}, rejected=${qualification.rejected}, expired=${qualification.expired}.`,
    ];

    if (
      failedChecks.length >
      0
    ) {
      const worst =
        failedChecks[0];

      if (
        worst
      ) {
        observations.push(
          `Most frequent failed qualification check is ${worst.check}: ${worst.failed}/${records.length} candidate(s) fail it, including ${worst.activeFailed} ACTIVE candidate(s).`,
        );
      }
    }

    if (
      records.length ===
      0
    ) {
      observations.push(
        "No monitored candidate history exists yet, so qualification cannot be diagnosed beyond the capture layer.",
      );
    }

    observations.push(
      `Root-cause classification: ${classification}.`,

      "This analyzer is read-only. It does not change consecutive-observation, persistence, profit, liquidity, freshness, stability, queue, shadow, paper, or LIVE policies.",
    );

    return {
      generatedAt:
        Date.now(),

      version:
        "17.4",

      build:
        "5",

      mode:
        "DIAGNOSTIC_ONLY",

      tradingPolicyMutationAllowed:
        false,

      liveExecutionAllowed:
        false,

      classification,

      primaryBottleneck,

      config:
        structuredClone(
          qualification.config,
        ),

      summary: {
        totalCandidates:
          records.length,

        activeCandidates:
          monitor.activeCandidates,

        disappearedCandidates:
          monitor.disappearedCandidates,

        observing:
          qualification.observing,

        qualified:
          qualification.qualified,

        rejected:
          qualification.rejected,

        expired:
          qualification.expired,

        candidatesMeetingPersistence,

        candidatesMeetingQuality,

        candidatesMeetingAllChecks,
      },

      failedChecks,

      activeCandidates,

      recentCandidates,

      observations,
    };
  }

  private toTrace(
    record:
      CandidateQualificationRecord,

    config:
      QualificationPersistenceRootCauseReport[
        "config"
      ],
  ): QualificationPersistenceCandidateTrace {
    const failedChecks =
      Object.entries(
        record.checks,
      )
        .filter(
          (
            [
              ,
              check,
            ],
          ) =>
            !check.passed,
        )
        .map(
          (
            [
              name,
            ],
          ) =>
            name,
        );

    return {
      key:
        record.key,

      market:
        record.market,

      buyExchange:
        record.buyExchange,

      sellExchange:
        record.sellExchange,

      monitorStatus:
        record.candidate.status,

      qualificationStatus:
        record.status,

      qualified:
        record.qualified,

      score:
        record.score,

      lifetimeMs:
        record
          .candidate
          .lifetimeMs,

      consecutiveObservations:
        record
          .candidate
          .consecutiveObservations,

      totalObservations:
        record
          .candidate
          .totalObservations,

      reappearances:
        record
          .candidate
          .reappearances,

      latestNetProfitPercent:
        record
          .candidate
          .latest
          .netProfitPercent,

      bestNetProfitPercent:
        record
          .candidate
          .best
          .netProfitPercent,

      profitDrawdownPercent:
        record
          .profitDrawdownPercent,

      liquidityScore:
        record
          .candidate
          .latest
          .liquidityScore,

      freshnessScore:
        record
          .candidate
          .latest
          .freshnessScore,

      failedChecks,

      remaining: {
        consecutiveObservations:
          Math.max(
            0,

            config
              .minimumConsecutiveObservations -
              record
                .candidate
                .consecutiveObservations,
          ),

        persistenceMs:
          Math.max(
            0,

            config
              .minimumPersistenceMs -
              record
                .candidate
                .lifetimeMs,
          ),

        netProfitPercent:
          Math.max(
            0,

            config
              .minimumNetProfitPercent -
              record
                .candidate
                .latest
                .netProfitPercent,
          ),

        liquidityScore:
          Math.max(
            0,

            config
              .minimumLiquidityScore -
              record
                .candidate
                .latest
                .liquidityScore,
          ),

        freshnessScore:
          Math.max(
            0,

            config
              .minimumFreshnessScore -
              record
                .candidate
                .latest
                .freshnessScore,
          ),

        profitStabilityPercent:
          Math.max(
            0,

            record
              .profitDrawdownPercent -
              config
                .maximumProfitDrawdownPercent,
          ),
      },

      reasons:
        structuredClone(
          record.reasons,
        ),
    };
  }

  private buildFailureSummary(
    records:
      CandidateQualificationRecord[],
  ): QualificationCheckFailureSummary[] {
    const counts =
      new Map<
        string,
        {
          failed: number;

          activeFailed: number;
        }
      >();

    for (
      const record
      of records
    ) {
      for (
        const [
          name,
          check,
        ]
        of Object.entries(
          record.checks,
        )
      ) {
        if (
          check.passed
        ) {
          continue;
        }

        const current =
          counts.get(
            name,
          ) ??
          {
            failed:
              0,

            activeFailed:
              0,
          };

        current.failed +=
          1;

        if (
          record
            .candidate
            .status ===
          "ACTIVE"
        ) {
          current.activeFailed +=
            1;
        }

        counts.set(
          name,
          current,
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
            value,
          ],
        ) => ({
          check,

          failed:
            value.failed,

          activeFailed:
            value.activeFailed,

          percentOfCandidates:
            records.length >
            0
              ? (
                  value.failed /
                  records.length
                ) *
                100
              : 0,
        }),
      )
      .sort(
        (
          first,
          second,
        ) => {
          if (
            second.activeFailed !==
            first.activeFailed
          ) {
            return (
              second.activeFailed -
              first.activeFailed
            );
          }

          return (
            second.failed -
            first.failed
          );
        },
      );
  }

  private classify(
    records:
      CandidateQualificationRecord[],

    failedChecks:
      QualificationCheckFailureSummary[],

    qualifiedCount:
      number,
  ): QualificationPersistenceRootCauseClassification {
    if (
      records.length ===
      0
    ) {
      return "NO_CANDIDATES";
    }

    if (
      qualifiedCount >
      0
    ) {
      return "QUALIFICATION_HEALTHY";
    }

    const activeFailures =
      failedChecks.filter(
        (
          item,
        ) =>
          item.activeFailed >
          0,
      );

    const source =
      activeFailures.length >
      0
        ? activeFailures
        : failedChecks;

    const first =
      source[0];

    if (
      !first
    ) {
      return "QUALIFICATION_HEALTHY";
    }

    const second =
      source[1];

    if (
      second &&
      second.activeFailed ===
        first.activeFailed &&
      second.failed ===
        first.failed
    ) {
      return "MIXED_QUALITY_FAILURES";
    }

    switch (
      first.check
    ) {
      case "consecutiveObservations":

      case "persistence":

      case "active":
        return "PERSISTENCE_DOMINANT";

      case "netProfit":
        return "PROFIT_DOMINANT";

      case "liquidity":
        return "LIQUIDITY_DOMINANT";

      case "freshness":
        return "FRESHNESS_DOMINANT";

      case "profitStability":
        return "PROFIT_STABILITY_DOMINANT";

      default:
        return "MIXED_QUALITY_FAILURES";
    }
  }

  private primaryBottleneck(
    classification:
      QualificationPersistenceRootCauseClassification,

    failedChecks:
      QualificationCheckFailureSummary[],
  ): string {
    const first =
      failedChecks.find(
        (
          item,
        ) =>
          item.activeFailed >
          0,
      ) ??
      failedChecks[0];

    if (
      first
    ) {
      return first.check;
    }

    return classification;
  }
}

export const qualificationPersistenceRootCauseAnalyzerService =
  new QualificationPersistenceRootCauseAnalyzerService();