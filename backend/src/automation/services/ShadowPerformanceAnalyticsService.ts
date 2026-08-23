import type {
  ShadowTradeOutcomeRecord,
} from "../models/ShadowTradeOutcome";

import type {
  ShadowExchangePairPerformance,
  ShadowLiveReadinessLevel,
  ShadowPerformanceAnalytics,
  ShadowPerformanceFailureReason,
} from "../models/ShadowPerformanceAnalytics";

import {
  shadowLearningEvidenceArchiveService,
} from "./ShadowLearningEvidenceArchiveService";

import {
  shadowTradeOutcomeTrackerService,
} from "./ShadowTradeOutcomeTrackerService";

export interface ShadowPerformanceAnalyticsConfig {
  minimumCompletedOutcomes: number;

  targetSuccessRatePercent: number;

  targetExecutableRatePercent: number;

  targetProfitableSampleRatePercent: number;

  targetDataAvailabilityPercent: number;

  targetProfitRetentionPercent: number;
}

const DEFAULT_CONFIG:
  ShadowPerformanceAnalyticsConfig = {
  minimumCompletedOutcomes:
    50,

  targetSuccessRatePercent:
    70,

  targetExecutableRatePercent:
    80,

  targetProfitableSampleRatePercent:
    60,

  targetDataAvailabilityPercent:
    90,

  targetProfitRetentionPercent:
    50,
};

export class ShadowPerformanceAnalyticsService {
  private readonly config:
    ShadowPerformanceAnalyticsConfig;

  constructor(
    config:
      Partial<ShadowPerformanceAnalyticsConfig> = {},
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.validateConfig();
  }

  getAnalytics():
    ShadowPerformanceAnalytics {
    const records =
      this.mergeOutcomeEvidence();

    const completed =
      records.filter(
        (
          record,
        ) =>
          record.status !==
          "TRACKING",
      );

    const usableCompleted =
      completed.filter(
        (
          record,
        ) =>
          record.status !==
          "DATA_UNAVAILABLE",
      );

    const success =
      completed.filter(
        (
          record,
        ) =>
          record.status ===
          "SUCCESS",
      );

    const failed =
      completed.filter(
        (
          record,
        ) =>
          record.status ===
          "FAILED",
      );

    const dataUnavailable =
      completed.filter(
        (
          record,
        ) =>
          record.status ===
          "DATA_UNAVAILABLE",
      );

    const totalSamples =
      records.reduce(
        (
          total,
          record,
        ) =>
          total +
          record.totalSamples,
        0,
      );

    const freshSamples =
      records.reduce(
        (
          total,
          record,
        ) =>
          total +
          record.freshSamples,
        0,
      );

    const executableSamples =
      records.reduce(
        (
          total,
          record,
        ) =>
          total +
          record.executableSamples,
        0,
      );

    const profitableSamples =
      records.reduce(
        (
          total,
          record,
        ) =>
          total +
          record.profitableSamples,
        0,
      );

    const predictedProfits =
      usableCompleted
        .map(
          (
            record,
          ) =>
            record
              .predicted
              .expectedTotalNetProfit,
        )
        .filter(
          this.isFiniteNumber,
        );

    const observedProfits =
      usableCompleted
        .map(
          (
            record,
          ) =>
            record
              .averageObservedNetProfit,
        )
        .filter(
          (
            value,
          ): value is number =>
            value !==
              null &&
            Number.isFinite(
              value,
            ),
        );

    const successfulProfits =
      success
        .map(
          (
            record,
          ) =>
            record
              .averageObservedNetProfit,
        )
        .filter(
          (
            value,
          ): value is number =>
            value !==
              null &&
            Number.isFinite(
              value,
            ),
        );

    const retentionValues =
      usableCompleted
        .map(
          (
            record,
          ) =>
            this.calculateRetention(
              record,
            ),
        )
        .filter(
          (
            value,
          ): value is number =>
            value !==
            null,
        );

    const successRatePercent =
      this.percent(
        success.length,
        usableCompleted.length,
      );

    const failureRatePercent =
      this.percent(
        failed.length,
        usableCompleted.length,
      );

    const dataAvailabilityRatePercent =
      this.percent(
        completed.length -
          dataUnavailable.length,

        completed.length,
      );

    const executableRatePercent =
      this.percent(
        executableSamples,
        freshSamples,
      );

    const profitableSampleRatePercent =
      this.percent(
        profitableSamples,
        executableSamples,
      );

    const freshnessRatePercent =
      this.percent(
        freshSamples,
        totalSamples,
      );

    const positiveObserved =
      observedProfits.filter(
        (
          value,
        ) =>
          value >
          0,
      ).length;

    const positiveOutcomePercent =
      this.percent(
        positiveObserved,
        observedProfits.length,
      );

    const averageProfitRetentionPercent =
      this.average(
        retentionValues,
      );

    const readiness =
      this.calculateReadiness({
        completed:
          completed.length,

        successRatePercent,

        executableRatePercent,

        profitableSampleRatePercent,

        dataAvailabilityRatePercent,

        averageProfitRetentionPercent,
      });

    return {
      generatedAt:
        Date.now(),

      mode:
        "SHADOW",

      executionAllowed:
        false,

      paperExecutionAllowed:
        false,

      liveExecutionAllowed:
        false,

      sampleRequirement: {
        minimumCompletedOutcomes:
          this.config
            .minimumCompletedOutcomes,

        requirementMet:
          completed.length >=
          this.config
            .minimumCompletedOutcomes,

        remaining:
          Math.max(
            0,

            this.config
              .minimumCompletedOutcomes -
              completed.length,
          ),
      },

      thresholds: {
        successRatePercent:
          this.config
            .targetSuccessRatePercent,
        executableRatePercent:
          this.config
            .targetExecutableRatePercent,
        profitableSampleRatePercent:
          this.config
            .targetProfitableSampleRatePercent,
        dataAvailabilityRatePercent:
          this.config
            .targetDataAvailabilityPercent,
        profitRetentionPercent:
          this.config
            .targetProfitRetentionPercent,
      },

      summary: {
        trackedDispatches:
          records.length,

        tracking:
          records.filter(
            (
              record,
            ) =>
              record.status ===
              "TRACKING",
          ).length,

        completed:
          completed.length,

        success:
          success.length,

        failed:
          failed.length,

        dataUnavailable:
          dataUnavailable.length,

        completionRatePercent:
          this.percent(
            completed.length,
            records.length,
          ),

        successRatePercent,

        failureRatePercent,

        dataAvailabilityRatePercent,
      },

      executionQuality: {
        totalSamples,

        freshSamples,

        executableSamples,

        profitableSamples,

        freshnessRatePercent,

        executableRatePercent,

        profitableSampleRatePercent,
      },

      profitability: {
        averagePredictedNetProfit:
          this.average(
            predictedProfits,
          ),

        averageObservedNetProfit:
          this.average(
            observedProfits,
          ),

        averageSuccessfulNetProfit:
          this.average(
            successfulProfits,
          ),

        averageProfitRetentionPercent,

        positiveOutcomePercent,
      },

      readiness,

      failureReasons:
        this.buildFailureReasons(
          completed,
        ),

      exchangePairs:
        this.buildExchangePairPerformance(
          records,
        ),
    };
  }

  /*
   * VERSION 17.6 BUILD 7
   *
   * Analytics-only restart-safe merge.
   *
   * SAFETY:
   *
   * - Archived TRACKING records are ignored.
   * - Runtime records override the same archived ID.
   * - Tracker state is never mutated.
   * - Queue state is never restored.
   * - Dispatcher state is never restored.
   * - No redispatch occurs.
   * - No synthetic outcome is created.
   */
  private mergeOutcomeEvidence(
  ): ShadowTradeOutcomeRecord[] {
    const merged =
      new Map<
        string,
        ShadowTradeOutcomeRecord
      >();

    shadowLearningEvidenceArchiveService
      .forEachOutcomeRecordForAnalytics(
        (
          record,
        ) => {
          if (
            record.status ===
            "TRACKING"
          ) {
            return;
          }

          merged.set(
            record.id,
            record,
          );
        },
      );

    /*
     * Runtime evidence has precedence.
     *
     * If an outcome already exists in the archive
     * with the same ID, this replaces the archived
     * copy instead of double-counting it.
     */
    shadowTradeOutcomeTrackerService
      .forEachAnalyticsRecord(
        (
          record,
        ) => {
          merged.set(
            record.id,
            record,
          );
        },
      );

    return Array.from(
      merged.values(),
    )
      .sort(
        (
          first,
          second,
        ) =>
          second.dispatchedAt -
          first.dispatchedAt,
      );
  }

  private calculateReadiness(
    input: {
      completed: number;

      successRatePercent: number;

      executableRatePercent: number;

      profitableSampleRatePercent: number;

      dataAvailabilityRatePercent: number;

      averageProfitRetentionPercent: number;
    },
  ):
  ShadowPerformanceAnalytics["readiness"] {
    const sampleConfidence =
      this.clamp100(
        (
          input.completed /
          this.config
            .minimumCompletedOutcomes
        ) *
          100,
      );

    const successComponent =
      this.targetScore(
        input.successRatePercent,

        this.config
          .targetSuccessRatePercent,
      );

    const executableComponent =
      this.targetScore(
        input.executableRatePercent,

        this.config
          .targetExecutableRatePercent,
      );

    const profitabilityComponent =
      this.average([
        this.targetScore(
          input.profitableSampleRatePercent,

          this.config
            .targetProfitableSampleRatePercent,
        ),

        this.targetScore(
          input.averageProfitRetentionPercent,

          this.config
            .targetProfitRetentionPercent,
        ),
      ]);

    const dataQualityComponent =
      this.targetScore(
        input.dataAvailabilityRatePercent,

        this.config
          .targetDataAvailabilityPercent,
      );

    const rawScore =
      sampleConfidence *
        0.20 +
      successComponent *
        0.25 +
      executableComponent *
        0.20 +
      profitabilityComponent *
        0.25 +
      dataQualityComponent *
        0.10;

    const score =
      input.completed <
      this.config
        .minimumCompletedOutcomes
        ? Math.min(
            rawScore,
            sampleConfidence,
          )
        : rawScore;

    const roundedScore =
      this.round(
        score,
        2,
      );

    const level =
      this.resolveReadinessLevel(
        roundedScore,
        input.completed,
      );

    const readyForPaperAutomation =
      level ===
      "READY_FOR_PAPER";

    const reasons:
      string[] =
      [];

    if (
      input.completed <
      this.config
        .minimumCompletedOutcomes
    ) {
      reasons.push(
        `Only ${input.completed} completed shadow outcomes are available; ${this.config.minimumCompletedOutcomes} are required before paper-automation readiness can be considered.`,
      );
    }

    if (
      input.successRatePercent <
      this.config
        .targetSuccessRatePercent
    ) {
      reasons.push(
        `Shadow success rate ${this.round(
          input.successRatePercent,
          2,
        )}% is below target ${this.config.targetSuccessRatePercent}%.`,
      );
    }

    if (
      input.executableRatePercent <
      this.config
        .targetExecutableRatePercent
    ) {
      reasons.push(
        `Full executability rate ${this.round(
          input.executableRatePercent,
          2,
        )}% is below target ${this.config.targetExecutableRatePercent}%.`,
      );
    }

    if (
      input.profitableSampleRatePercent <
      this.config
        .targetProfitableSampleRatePercent
    ) {
      reasons.push(
        `Profitable executable-sample rate ${this.round(
          input.profitableSampleRatePercent,
          2,
        )}% is below target ${this.config.targetProfitableSampleRatePercent}%.`,
      );
    }

    if (
      input.dataAvailabilityRatePercent <
      this.config
        .targetDataAvailabilityPercent
    ) {
      reasons.push(
        `Shadow data availability ${this.round(
          input.dataAvailabilityRatePercent,
          2,
        )}% is below target ${this.config.targetDataAvailabilityPercent}%.`,
      );
    }

    if (
      input.averageProfitRetentionPercent <
      this.config
        .targetProfitRetentionPercent
    ) {
      reasons.push(
        `Average predicted-profit retention ${this.round(
          input.averageProfitRetentionPercent,
          2,
        )}% is below target ${this.config.targetProfitRetentionPercent}%.`,
      );
    }

    if (
      reasons.length ===
      0
    ) {
      reasons.push(
        "Shadow performance currently satisfies the configured paper-automation readiness gates.",
      );

      reasons.push(
        "This does not authorize live trading.",
      );
    }

    return {
      score:
        roundedScore,

      level,

      readyForPaperAutomation,

      reasons,

      components: {
        sampleConfidence:
          this.round(
            sampleConfidence,
            2,
          ),

        successRate:
          this.round(
            successComponent,
            2,
          ),

        executableRate:
          this.round(
            executableComponent,
            2,
          ),

        profitabilityRate:
          this.round(
            profitabilityComponent,
            2,
          ),

        dataQuality:
          this.round(
            dataQualityComponent,
            2,
          ),
      },
    };
  }

  private resolveReadinessLevel(
    score:
      number,

    completed:
      number,
  ):
  ShadowLiveReadinessLevel {
    if (
      completed <
      this.config
        .minimumCompletedOutcomes
    ) {
      return "INSUFFICIENT_DATA";
    }

    if (
      score >=
      85
    ) {
      return "READY_FOR_PAPER";
    }

    if (
      score >=
      70
    ) {
      return "PROMISING";
    }

    if (
      score >=
      50
    ) {
      return "CAUTION";
    }

    return "NOT_READY";
  }

  private buildFailureReasons(
    records:
      ShadowTradeOutcomeRecord[],
  ):
  ShadowPerformanceFailureReason[] {
    const failures =
      records.filter(
        (
          record,
        ) =>
          record.status ===
            "FAILED" ||
          record.status ===
            "DATA_UNAVAILABLE",
      );

    const counts =
      new Map<
        string,
        number
      >();

    for (
      const record
      of failures
    ) {
      const reason =
        record.finalReason
          ?.trim() ||
        "Unknown failure reason.";

      counts.set(
        reason,

        (
          counts.get(
            reason,
          ) ??
          0
        ) +
          1,
      );
    }

    return Array.from(
      counts.entries(),
    )
      .map(
        (
          [
            reason,
            count,
          ],
        ) => ({
          reason,

          count,

          percent:
            this.percent(
              count,
              failures.length,
            ),
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

  private buildExchangePairPerformance(
    records:
      ShadowTradeOutcomeRecord[],
  ):
  ShadowExchangePairPerformance[] {
    const grouped =
      new Map<
        string,
        ShadowTradeOutcomeRecord[]
      >();

    for (
      const record
      of records
    ) {
      const key =
        [
          record.buyExchange,
          record.sellExchange,
        ].join(
          "|",
        );

      const existing =
        grouped.get(
          key,
        );

      if (
        existing
      ) {
        existing.push(
          record,
        );
      } else {
        grouped.set(
          key,
          [
            record,
          ],
        );
      }
    }

    return Array.from(
      grouped.entries(),
    )
      .map(
        (
          [
            key,
            pairRecords,
          ],
        ) =>
          this.calculatePair(
            key,
            pairRecords,
          ),
      )
      .sort(
        (
          first,
          second,
        ) => {
          if (
            first.successRatePercent !==
            second.successRatePercent
          ) {
            return (
              second.successRatePercent -
              first.successRatePercent
            );
          }

          return (
            second.completed -
            first.completed
          );
        },
      );
  }

  private calculatePair(
    key:
      string,

    records:
      ShadowTradeOutcomeRecord[],
  ):
  ShadowExchangePairPerformance {
    const first =
      records[0];

    const completed =
      records.filter(
        (
          record,
        ) =>
          record.status !==
          "TRACKING",
      );

    const success =
      completed.filter(
        (
          record,
        ) =>
          record.status ===
          "SUCCESS",
      );

    const failed =
      completed.filter(
        (
          record,
        ) =>
          record.status ===
          "FAILED",
      );

    const dataUnavailable =
      completed.filter(
        (
          record,
        ) =>
          record.status ===
          "DATA_UNAVAILABLE",
      );

    const usable =
      completed.filter(
        (
          record,
        ) =>
          record.status !==
          "DATA_UNAVAILABLE",
      );

    const freshSamples =
      records.reduce(
        (
          total,
          record,
        ) =>
          total +
          record.freshSamples,
        0,
      );

    const executableSamples =
      records.reduce(
        (
          total,
          record,
        ) =>
          total +
          record.executableSamples,
        0,
      );

    const profitableSamples =
      records.reduce(
        (
          total,
          record,
        ) =>
          total +
          record.profitableSamples,
        0,
      );

    const observedProfits =
      usable
        .map(
          (
            record,
          ) =>
            record
              .averageObservedNetProfit,
        )
        .filter(
          (
            value,
          ): value is number =>
            value !==
              null &&
            Number.isFinite(
              value,
            ),
        );

    const predictedProfits =
      usable
        .map(
          (
            record,
          ) =>
            record
              .predicted
              .expectedTotalNetProfit,
        )
        .filter(
          this.isFiniteNumber,
        );

    const retention =
      usable
        .map(
          (
            record,
          ) =>
            this.calculateRetention(
              record,
            ),
        )
        .filter(
          (
            value,
          ): value is number =>
            value !==
            null,
        );

    return {
      key,

      buyExchange:
        first
          ?.buyExchange ??
        "",

      sellExchange:
        first
          ?.sellExchange ??
        "",

      total:
        records.length,

      completed:
        completed.length,

      success:
        success.length,

      failed:
        failed.length,

      dataUnavailable:
        dataUnavailable.length,

      successRatePercent:
        this.percent(
          success.length,
          usable.length,
        ),

      executableSampleRatePercent:
        this.percent(
          executableSamples,
          freshSamples,
        ),

      profitableSampleRatePercent:
        this.percent(
          profitableSamples,
          executableSamples,
        ),

      averageObservedNetProfit:
        this.average(
          observedProfits,
        ),

      averagePredictedNetProfit:
        this.average(
          predictedProfits,
        ),

      averageProfitRetentionPercent:
        this.average(
          retention,
        ),
    };
  }

  private calculateRetention(
    record:
      ShadowTradeOutcomeRecord,
  ): number | null {
    const predicted =
      record
        .predicted
        .expectedTotalNetProfit;

    const observed =
      record
        .averageObservedNetProfit;

    if (
      observed ===
        null ||
      !Number.isFinite(
        observed,
      ) ||
      !Number.isFinite(
        predicted,
      ) ||
      predicted <=
        0
    ) {
      return null;
    }

    return this.round(
      (
        observed /
        predicted
      ) *
        100,

      4,
    );
  }

  private targetScore(
    actual:
      number,

    target:
      number,
  ): number {
    if (
      target <=
      0
    ) {
      return 100;
    }

    return this.clamp100(
      (
        actual /
        target
      ) *
        100,
    );
  }

  private percent(
    numerator:
      number,

    denominator:
      number,
  ): number {
    if (
      denominator <=
      0
    ) {
      return 0;
    }

    return this.round(
      (
        numerator /
        denominator
      ) *
        100,

      2,
    );
  }

  private average(
    values:
      number[],
  ): number {
    if (
      values.length ===
      0
    ) {
      return 0;
    }

    return this.round(
      values.reduce(
        (
          total,
          value,
        ) =>
          total +
          value,
        0,
      ) /
        values.length,

      12,
    );
  }

  private clamp100(
    value:
      number,
  ): number {
    if (
      !Number.isFinite(
        value,
      )
    ) {
      return 0;
    }

    return Math.max(
      0,

      Math.min(
        100,
        value,
      ),
    );
  }

  private round(
    value:
      number,

    digits:
      number,
  ): number {
    if (
      !Number.isFinite(
        value,
      )
    ) {
      return 0;
    }

    const multiplier =
      10 **
      digits;

    return (
      Math.round(
        (
          value +
          Number.EPSILON
        ) *
          multiplier,
      ) /
      multiplier
    );
  }

  private readonly isFiniteNumber =
    (
      value:
        number,
    ): boolean =>
      Number.isFinite(
        value,
      );

  private validateConfig():
    void {
    if (
      !Number.isInteger(
        this.config
          .minimumCompletedOutcomes,
      ) ||
      this.config
        .minimumCompletedOutcomes <
        1
    ) {
      throw new Error(
        "minimumCompletedOutcomes must be a positive integer.",
      );
    }

    const percentages = [
      this.config
        .targetSuccessRatePercent,

      this.config
        .targetExecutableRatePercent,

      this.config
        .targetProfitableSampleRatePercent,

      this.config
        .targetDataAvailabilityPercent,

      this.config
        .targetProfitRetentionPercent,
    ];

    if (
      percentages.some(
        (
          value,
        ) =>
          !Number.isFinite(
            value,
          ) ||
          value <
            0 ||
          value >
            100,
      )
    ) {
      throw new Error(
        "Shadow analytics percentage targets must be between 0 and 100.",
      );
    }
  }
}

export const shadowPerformanceAnalyticsService =
  new ShadowPerformanceAnalyticsService();
