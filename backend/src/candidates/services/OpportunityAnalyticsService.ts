import {
  defaultArbitragePolicy,
} from "../../arbitrage/config/policy";

import {
  opportunityRejectionStore,
  type OpportunityRejectionRecord,
} from "../../arbitrage/services/OpportunityRejectionStore";

import {
  opportunityService,
} from "../../arbitrage/services/OpportunityService";

import {
  opportunityCandidateBoardService,
  type OpportunityCandidateBoardItem,
} from "./OpportunityCandidateBoardService";

export interface OpportunityAnalyticsEvaluationSummary {
  snapshotGeneratedAt:
    number | null;

  cachedQuotes:
    number;

  marketSnapshots:
    number;

  exchangePairs:
    number;

  evaluated:
    number;

  accepted:
    number;

  rejected:
    number;

  acceptanceRatePercent:
    number;
}

export interface OpportunityAnalyticsRejectionStage {
  stage:
    string;

  count:
    number;

  percent:
    number;
}

export interface OpportunityAnalyticsRejectionCode {
  code:
    string;

  stage:
    string;

  count:
    number;

  percent:
    number;
}

export interface OpportunityAnalyticsMetricSummary {
  sampleCount:
    number;

  average:
    number | null;

  minimum:
    number | null;

  maximum:
    number | null;
}

export interface OpportunityAnalyticsMarketMetrics {
  rawSpreadPercent:
    OpportunityAnalyticsMetricSummary;

  netProfitPercent:
    OpportunityAnalyticsMetricSummary;

  liquidityPercent:
    OpportunityAnalyticsMetricSummary;
}

export interface OpportunityAnalyticsDistanceMetric {
  name:
    string;

  currentValue:
    number | null;

  requiredValue:
    number;

  distance:
    number | null;

  passed:
    boolean | null;
}

export interface OpportunityAnalyticsClosestCandidate {
  rank:
    number;

  candidateId:
    string;

  market:
    string;

  buyExchange:
    string;

  sellExchange:
    string;

  status:
    OpportunityCandidateBoardItem["status"];

  readiness:
    OpportunityCandidateBoardItem["distance"]["readiness"];

  readinessPercent:
    number | null;

  overallScore:
    number | null;

  rawSpreadPercent:
    number | null;

  netProfitPercent:
    number | null;

  liquidityPercent:
    number | null;

  blockingStage:
    string | null;

  blockingReason:
    string | null;

  metrics:
    OpportunityAnalyticsDistanceMetric[];

  observedAt:
    number;
}

export interface OpportunityAnalyticsCurrentBoard {
  totalCandidates:
    number;

  accepted:
    number;

  rejected:
    number;

  ready:
    number;

  nearReady:
    number;

  notReady:
    number;

  unknown:
    number;
}

export interface OpportunityAnalyticsPolicySnapshot {
  minimumSpreadPercent:
    number;

  minimumNetProfitPercent:
    number;

  minimumLiquidityPercent:
    number;

  maximumQuoteAgeMs:
    number;

  maximumCrossExchangePriceRatio:
    number;
}

export interface OpportunityAnalyticsReport {
  generatedAt:
    number;

  evaluation:
    OpportunityAnalyticsEvaluationSummary;

  rejectionSample: {
    requestedRecords:
      number;

    returnedRecords:
      number;

    distributionByStage:
      OpportunityAnalyticsRejectionStage[];

    distributionByCode:
      OpportunityAnalyticsRejectionCode[];
  };

  currentBoard:
    OpportunityAnalyticsCurrentBoard;

  recentRejectedMarketMetrics:
    OpportunityAnalyticsMarketMetrics;

  closestToExecution:
    OpportunityAnalyticsClosestCandidate[];

  policy:
    OpportunityAnalyticsPolicySnapshot;

  primaryBottleneck:
    string | null;

  primaryBottleneckPercent:
    number | null;

  notes:
    string[];
}

const DEFAULT_REJECTION_SAMPLE_LIMIT =
  500;

const MAXIMUM_REJECTION_SAMPLE_LIMIT =
  2_000;

const DEFAULT_CLOSEST_CANDIDATE_LIMIT =
  10;

export class OpportunityAnalyticsService {
  getReport(
    rejectionSampleLimit =
      DEFAULT_REJECTION_SAMPLE_LIMIT,

    closestCandidateLimit =
      DEFAULT_CLOSEST_CANDIDATE_LIMIT,
  ): OpportunityAnalyticsReport {
    const normalizedRejectionLimit =
      this.normalizeRejectionLimit(
        rejectionSampleLimit,
      );

    const normalizedClosestLimit =
      this.normalizeClosestLimit(
        closestCandidateLimit,
      );

    /*
     * Latest pipeline diagnostics.
     *
     * This is read-only and does NOT trigger
     * another opportunity scan.
     */
    const pipeline =
      opportunityService
        .getLastDiagnostics();

    /*
     * Bounded rejection history.
     */
    const rejectionRecords =
      opportunityRejectionStore
        .getRecent(
          normalizedRejectionLimit,
        );

    /*
     * Candidate Board is also read-only.
     *
     * Ask for up to 100 so closest-candidate
     * analysis has a useful working set.
     */
    const board =
      opportunityCandidateBoardService
        .getBoard(
          100,
        );

    const engine =
      pipeline
        ?.diagnostics
        .engine;

    const evaluated =
      engine
        ?.evaluated ??
      0;

    const accepted =
      engine
        ?.accepted ??
      pipeline
        ?.acceptedOpportunities ??
      0;

    const rejected =
      Math.max(
        0,
        evaluated -
          accepted,
      );

    const acceptanceRatePercent =
      evaluated >
        0
        ? (
            accepted /
            evaluated
          ) *
          100
        : 0;

    const distributionByStage =
      this.buildStageDistribution(
        rejectionRecords,
      );

    const distributionByCode =
      this.buildCodeDistribution(
        rejectionRecords,
      );

    const primaryBottleneck =
      distributionByStage[0] ??
      null;

    const closestToExecution =
      board
        .candidates
        .filter(
          (candidate) =>
            candidate.status ===
            "REJECTED",
        )
        .slice(
          0,
          normalizedClosestLimit,
        )
        .map(
          (candidate) =>
            this.toClosestCandidate(
              candidate,
            ),
        );

    return {
      generatedAt:
        Date.now(),

      evaluation: {
        snapshotGeneratedAt:
          pipeline
            ?.generatedAt ??
          null,

        cachedQuotes:
          pipeline
            ?.cachedQuotes ??
          0,

        marketSnapshots:
          pipeline
            ?.marketSnapshots ??
          0,

        exchangePairs:
          pipeline
            ?.exchangePairs ??
          0,

        evaluated,

        accepted,

        rejected,

        acceptanceRatePercent:
          this.round(
            acceptanceRatePercent,
            6,
          ),
      },

      rejectionSample: {
        requestedRecords:
          normalizedRejectionLimit,

        returnedRecords:
          rejectionRecords.length,

        distributionByStage,

        distributionByCode,
      },

      currentBoard: {
        totalCandidates:
          board.totalCandidates,

        accepted:
          board.acceptedCount,

        rejected:
          board.rejectedCount,

        ready:
          board.readyCount,

        nearReady:
          board.nearReadyCount,

        notReady:
          board.notReadyCount,

        unknown:
          board.unknownReadinessCount,
      },

      recentRejectedMarketMetrics:
        this.buildMarketMetrics(
          rejectionRecords,
        ),

      closestToExecution,

      policy: {
        minimumSpreadPercent:
          defaultArbitragePolicy
            .minimumSpreadPercent,

        minimumNetProfitPercent:
          defaultArbitragePolicy
            .minimumNetProfitPercent,

        minimumLiquidityPercent:
          defaultArbitragePolicy
            .minimumLiquidityPercent,

        maximumQuoteAgeMs:
          defaultArbitragePolicy
            .maximumQuoteAgeMs,

        maximumCrossExchangePriceRatio:
          defaultArbitragePolicy
            .maximumCrossExchangePriceRatio,
      },

      primaryBottleneck:
        primaryBottleneck
          ?.stage ??
        null,

      primaryBottleneckPercent:
        primaryBottleneck
          ?.percent ??
        null,

      notes: [
        "Evaluation summary represents the latest opportunity-engine scan snapshot, not lifetime totals.",
        "Rejection distribution represents the bounded recent rejection sample and may contain repeated market directions across scan cycles.",
        "Candidate Board analytics are read-only and do not trigger a second opportunity scan.",
        "Thresholds are reported for diagnosis only; this service does not modify trading policy.",
      ],
    };
  }

  private buildStageDistribution(
    records:
      readonly OpportunityRejectionRecord[],
  ): OpportunityAnalyticsRejectionStage[] {
    const counts =
      new Map<
        string,
        number
      >();

    for (
      const record
      of records
    ) {
      counts.set(
        record.stage,
        (
          counts.get(
            record.stage,
          ) ??
          0
        ) +
          1,
      );
    }

    const total =
      records.length;

    return Array.from(
      counts.entries(),
    )
      .map(
        (
          [
            stage,
            count,
          ],
        ): OpportunityAnalyticsRejectionStage => ({
          stage,

          count,

          percent:
            total >
              0
              ? this.round(
                  (
                    count /
                    total
                  ) *
                    100,
                  4,
                )
              : 0,
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

  private buildCodeDistribution(
    records:
      readonly OpportunityRejectionRecord[],
  ): OpportunityAnalyticsRejectionCode[] {
    const counts =
      new Map<
        string,
        {
          stage:
            string;

          count:
            number;
        }
      >();

    for (
      const record
      of records
    ) {
      const existing =
        counts.get(
          record.code,
        );

      if (existing) {
        existing.count +=
          1;

        continue;
      }

      counts.set(
        record.code,
        {
          stage:
            record.stage,

          count:
            1,
        },
      );
    }

    const total =
      records.length;

    return Array.from(
      counts.entries(),
    )
      .map(
        (
          [
            code,
            value,
          ],
        ): OpportunityAnalyticsRejectionCode => ({
          code,

          stage:
            value.stage,

          count:
            value.count,

          percent:
            total >
              0
              ? this.round(
                  (
                    value.count /
                    total
                  ) *
                    100,
                  4,
                )
              : 0,
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

  private buildMarketMetrics(
    records:
      readonly OpportunityRejectionRecord[],
  ): OpportunityAnalyticsMarketMetrics {
    return {
      rawSpreadPercent:
        this.summarizeNumbers(
          records.map(
            (record) =>
              record.rawSpreadPercent,
          ),
        ),

      netProfitPercent:
        this.summarizeNumbers(
          records.map(
            (record) =>
              record.netProfitPercent,
          ),
        ),

      liquidityPercent:
        this.summarizeNumbers(
          records.map(
            (record) =>
              record.liquidityPercent,
          ),
        ),
    };
  }

  private summarizeNumbers(
    values:
      readonly (
        number |
        null
      )[],
  ): OpportunityAnalyticsMetricSummary {
    const usable =
      values.filter(
        (
          value,
        ): value is number =>
          value !==
            null &&
          Number.isFinite(
            value,
          ),
      );

    if (
      usable.length ===
      0
    ) {
      return {
        sampleCount:
          0,

        average:
          null,

        minimum:
          null,

        maximum:
          null,
      };
    }

    const total =
      usable.reduce(
        (
          sum,
          value,
        ) =>
          sum +
          value,
        0,
      );

    return {
      sampleCount:
        usable.length,

      average:
        this.round(
          total /
            usable.length,
          6,
        ),

      minimum:
        this.round(
          Math.min(
            ...usable,
          ),
          6,
        ),

      maximum:
        this.round(
          Math.max(
            ...usable,
          ),
          6,
        ),
    };
  }

  private toClosestCandidate(
    candidate:
      OpportunityCandidateBoardItem,
  ): OpportunityAnalyticsClosestCandidate {
    return {
      rank:
        candidate.rank,

      candidateId:
        candidate.id,

      market:
        candidate.market,

      buyExchange:
        candidate.buyExchange,

      sellExchange:
        candidate.sellExchange,

      status:
        candidate.status,

      readiness:
        candidate
          .distance
          .readiness,

      readinessPercent:
        candidate
          .distance
          .readinessPercent,

      overallScore:
        candidate.overallScore,

      rawSpreadPercent:
        candidate.rawSpreadPercent,

      netProfitPercent:
        candidate.netProfitPercent,

      liquidityPercent:
        candidate.liquidityPercent,

      blockingStage:
        candidate
          .distance
          .blockingStage,

      blockingReason:
        candidate
          .distance
          .blockingReason,

      metrics:
        candidate
          .distance
          .metrics
          .map(
            (metric) => ({
              name:
                metric.name,

              currentValue:
                metric.currentValue,

              requiredValue:
                metric.requiredValue,

              distance:
                metric.distance,

              passed:
                metric.passed,
            }),
          ),

      observedAt:
        candidate.observedAt,
    };
  }

  private normalizeRejectionLimit(
    limit:
      number,
  ): number {
    if (
      !Number.isSafeInteger(
        limit,
      ) ||
      limit <= 0
    ) {
      throw new Error(
        "Rejection sample limit must be a positive integer.",
      );
    }

    return Math.min(
      limit,
      MAXIMUM_REJECTION_SAMPLE_LIMIT,
    );
  }

  private normalizeClosestLimit(
    limit:
      number,
  ): number {
    if (
      !Number.isSafeInteger(
        limit,
      ) ||
      limit <= 0
    ) {
      throw new Error(
        "Closest candidate limit must be a positive integer.",
      );
    }

    return Math.min(
      limit,
      100,
    );
  }

  private round(
    value:
      number,

    decimalPlaces:
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
      decimalPlaces;

    return (
      Math.round(
        value *
          multiplier,
      ) /
      multiplier
    );
  }
}

export const opportunityAnalyticsService =
  new OpportunityAnalyticsService();