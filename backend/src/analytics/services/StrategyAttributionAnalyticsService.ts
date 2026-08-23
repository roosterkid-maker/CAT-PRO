import type {
  StrategyId,
} from "../../strategies/models/StrategyMetadata";

import {
  normalizeStrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

import type {
  StrategyAttributionCoverage,
  StrategyAttributionEvidenceSummary,
} from "../../strategies/models/StrategyAttribution";

import type {
  StrategyPerformanceAnalytics,
} from "../../strategies/models/StrategyPerformanceAnalytics";

import type {
  ShadowTradeOutcomeRecord,
} from "../../automation/models/ShadowTradeOutcome";

import type {
  PaperTrade,
} from "../../trading/models/PaperTrade";

import {
  paperTradeStore,
} from "../../trading/services/PaperTradeStore";

import {
  shadowLearningEvidenceArchiveService,
} from "../../automation/services/ShadowLearningEvidenceArchiveService";

import {
  shadowTradeOutcomeTrackerService,
} from "../../automation/services/ShadowTradeOutcomeTrackerService";

export interface StrategyAttributionAnalyticsSources {
  archivedShadowOutcomes():
    readonly ShadowTradeOutcomeRecord[];

  runtimeShadowOutcomes():
    readonly ShadowTradeOutcomeRecord[];

  paperTrades():
    readonly PaperTrade[];

  getRevision?():
    string | number;

  archivedShadowRevision?():
    string | number;

  runtimeShadowRevision?():
    string | number;

  paperRevision?():
    string | number;
}

export class StrategyAttributionAnalyticsService {
  private readonly sources:
    StrategyAttributionAnalyticsSources;

  /*
   * StrategyReadModelService requests coverage and performance with the same
   * authoritative timestamp. Both views consume the same immutable source
   * population, so retain that exact-timestamp snapshot instead of reading,
   * cloning and de-duplicating the complete PAPER/SHADOW history twice in one
   * HTTP request. A different timestamp always forces a fresh read.
   */
  private sourceSnapshot: {
    readonly generatedAt: number;
    readonly revision: string | number | null;
    readonly shadowOutcomes: readonly ShadowTradeOutcomeRecord[];
    readonly paperTrades: readonly PaperTrade[];
  } | null = null;

  private archivedShadowSnapshot: {
    readonly revision: string | number;
    readonly records: readonly ShadowTradeOutcomeRecord[];
  } | null = null;

  private runtimeShadowSnapshot: {
    readonly revision: string | number;
    readonly records: readonly ShadowTradeOutcomeRecord[];
  } | null = null;

  private paperTradeSnapshot: {
    readonly revision: string | number;
    readonly records: readonly PaperTrade[];
  } | null = null;

  constructor(
    sources:
      Partial<StrategyAttributionAnalyticsSources> = {},
  ) {
    const usesDefaultArchivedShadow =
      sources.archivedShadowOutcomes === undefined;
    const usesDefaultRuntimeShadow =
      sources.runtimeShadowOutcomes === undefined;
    const usesDefaultPaperTrades =
      sources.paperTrades === undefined;
    const usesDefaultEvidenceSources =
      usesDefaultArchivedShadow &&
      usesDefaultRuntimeShadow &&
      usesDefaultPaperTrades;

    this.sources = {
      archivedShadowOutcomes:
        sources.archivedShadowOutcomes ??
        (() =>
          shadowLearningEvidenceArchiveService
            .getAnalyticsOutcomeRecords()),

      runtimeShadowOutcomes:
        sources.runtimeShadowOutcomes ??
        (() =>
          shadowTradeOutcomeTrackerService
            .getAnalyticsRecords()),

      paperTrades:
        sources.paperTrades ??
        (() =>
          paperTradeStore
            .getAllForReadOnlyAggregation()),

      getRevision:
        sources.getRevision ??
        (
          usesDefaultEvidenceSources
            ? () => [
                shadowLearningEvidenceArchiveService.getRevision(),
                shadowTradeOutcomeTrackerService.getRevision(),
                paperTradeStore.getRevision(),
              ].join(":")
            : undefined
        ),

      archivedShadowRevision:
        sources.archivedShadowRevision ??
        (
          usesDefaultArchivedShadow
            ? () =>
                shadowLearningEvidenceArchiveService.getRevision()
            : undefined
        ),

      runtimeShadowRevision:
        sources.runtimeShadowRevision ??
        (
          usesDefaultRuntimeShadow
            ? () =>
                shadowTradeOutcomeTrackerService.getRevision()
            : undefined
        ),

      paperRevision:
        sources.paperRevision ??
        (
          usesDefaultPaperTrades
            ? () =>
                paperTradeStore.getRevision()
            : undefined
        ),
    };
  }

  getSummary(
    strategyId: StrategyId,
    now = Date.now(),
  ): StrategyAttributionEvidenceSummary {
    const sourceSnapshot =
      this.getSourceSnapshot(
        now,
      );

    const paperTrades =
      sourceSnapshot
        .paperTrades
        .map(
          (trade) =>
            trade.strategyAttribution,
        );

    return structuredClone({
      generatedAt:
        now,

      strategyId,

      shadowOutcomes:
        this.buildCoverage(
          strategyId,
          sourceSnapshot
            .shadowOutcomes
            .map(
              (record) =>
                record.strategyAttribution,
            ),
        ),

      paperTrades:
        this.buildCoverage(
          strategyId,
          paperTrades,
        ),
    });
  }

  getPerformance(
    strategyId: StrategyId,
    now = Date.now(),
  ): StrategyPerformanceAnalytics {
    const sourceSnapshot =
      this.getSourceSnapshot(
        now,
      );

    const shadowRecords =
      sourceSnapshot
        .shadowOutcomes
        .filter(
          (record) =>
            this.isAttributedTo(
              record.strategyAttribution,
              strategyId,
            ),
        );

    const paperTrades =
      sourceSnapshot
        .paperTrades
        .filter(
          (trade) =>
            this.isAttributedTo(
              trade.strategyAttribution,
              strategyId,
            ),
        );

    const shadow =
      this.buildShadowPerformance(
        shadowRecords,
      );

    const paper =
      this.buildPaperPerformance(
        paperTrades,
      );

    return structuredClone({
      generatedAt:
        now,

      strategyId,

      evidenceStatus:
        shadow.evidenceStatus ===
          "AVAILABLE" ||
        paper.evidenceStatus ===
          "AVAILABLE"
          ? "AVAILABLE"
          : "NO_DATA",

      shadow,

      paper,

      notes: [
        "Only records carrying explicit matching strategy attribution are included.",
        "UNATTRIBUTED_LEGACY and other-strategy records are excluded from these metrics.",
        "Shadow observed profit is evidence quality, not realized P&L.",
        "Paper net profit is reported only from finalized attributed PAPER trades.",
        "These analytics do not grant PAPER or LIVE execution permission.",
      ],
    });
  }

  private getSourceSnapshot(
    now: number,
  ): {
    readonly generatedAt: number;
    readonly revision: string | number | null;
    readonly shadowOutcomes: readonly ShadowTradeOutcomeRecord[];
    readonly paperTrades: readonly PaperTrade[];
  } {
    const revision =
      this.sources
        .getRevision?.() ??
      null;

    if (
      this.sourceSnapshot !== null &&
      (
        revision !== null
          ? this.sourceSnapshot.revision === revision
          : this.sourceSnapshot.generatedAt === now
      )
    ) {
      return this.sourceSnapshot;
    }

    this.sourceSnapshot = {
      generatedAt:
        now,
      revision,
      shadowOutcomes:
        this.getShadowOutcomes(),
      paperTrades:
        this.getPaperTrades(),
    };

    return this.sourceSnapshot;
  }

  private getShadowOutcomes():
    ShadowTradeOutcomeRecord[] {
    const records =
      new Map<
        string,
        ShadowTradeOutcomeRecord
      >();

    for (
      const record
      of this.getArchivedShadowOutcomes()
    ) {
      records.set(
        record.id,
        structuredClone(
          record,
        ),
      );
    }

    // Runtime evidence is authoritative for the same record ID.
    for (
      const record
      of this.getRuntimeShadowOutcomes()
    ) {
      records.set(
        record.id,
        structuredClone(
          record,
        ),
      );
    }

    return [
      ...records.values(),
    ];
  }

  private getArchivedShadowOutcomes():
    readonly ShadowTradeOutcomeRecord[] {
    const revision =
      this.sources.archivedShadowRevision?.() ??
      null;

    if (
      revision !== null &&
      this.archivedShadowSnapshot?.revision === revision
    ) {
      return this.archivedShadowSnapshot.records;
    }

    const records =
      this.sources.archivedShadowOutcomes();

    if (revision !== null) {
      this.archivedShadowSnapshot = {
        revision,
        records,
      };
    }

    return records;
  }

  private getRuntimeShadowOutcomes():
    readonly ShadowTradeOutcomeRecord[] {
    const revision =
      this.sources.runtimeShadowRevision?.() ??
      null;

    if (
      revision !== null &&
      this.runtimeShadowSnapshot?.revision === revision
    ) {
      return this.runtimeShadowSnapshot.records;
    }

    const records =
      this.sources.runtimeShadowOutcomes();

    if (revision !== null) {
      this.runtimeShadowSnapshot = {
        revision,
        records,
      };
    }

    return records;
  }

  private getPaperTrades():
    readonly PaperTrade[] {
    const revision =
      this.sources.paperRevision?.() ??
      null;

    if (
      revision !== null &&
      this.paperTradeSnapshot?.revision === revision
    ) {
      return this.paperTradeSnapshot.records;
    }

    const records =
      this.sources.paperTrades();

    if (revision !== null) {
      this.paperTradeSnapshot = {
        revision,
        records,
      };
    }

    return records;
  }

  private isAttributedTo(
    value: unknown,
    strategyId: StrategyId,
  ): boolean {
    const attribution =
      normalizeStrategyAttribution(
        value,
      );

    return (
      attribution.attributionStatus ===
        "ATTRIBUTED" &&
      attribution.strategyId ===
        strategyId
    );
  }

  private buildShadowPerformance(
    records:
      readonly ShadowTradeOutcomeRecord[],
  ): StrategyPerformanceAnalytics["shadow"] {
    if (
      records.length ===
      0
    ) {
      return {
        evidenceStatus:
          "NO_DATA",
        totalRecords:
          null,
        tracking:
          null,
        completedOutcomes:
          null,
        successfulOutcomes:
          null,
        failedOutcomes:
          null,
        dataUnavailableOutcomes:
          null,
        successRatePercent:
          null,
        averageProfitRetentionPercent:
          null,
      };
    }

    const tracking =
      records.filter(
        (record) =>
          record.status ===
          "TRACKING",
      );

    const successful =
      records.filter(
        (record) =>
          record.status ===
          "SUCCESS",
      );

    const failed =
      records.filter(
        (record) =>
          record.status ===
          "FAILED",
      );

    const dataUnavailable =
      records.filter(
        (record) =>
          record.status ===
          "DATA_UNAVAILABLE",
      );

    const completed =
      successful.length +
      failed.length +
      dataUnavailable.length;

    const measuredOutcomes =
      successful.length +
      failed.length;

    const retention =
      records
        .map(
          (record) => {
            const predicted =
              record.predicted
                .expectedTotalNetProfit;
            const observed =
              record
                .averageObservedNetProfit;

            return observed !==
                null &&
              Number.isFinite(
                observed,
              ) &&
              Number.isFinite(
                predicted,
              ) &&
              predicted >
                0
              ? (
                  observed /
                  predicted
                ) *
                  100
              : null;
          },
        )
        .filter(
          (
            value,
          ): value is number =>
            value !==
            null,
        );

    return {
      evidenceStatus:
        "AVAILABLE",
      totalRecords:
        records.length,
      tracking:
        tracking.length,
      completedOutcomes:
        completed,
      successfulOutcomes:
        successful.length,
      failedOutcomes:
        failed.length,
      dataUnavailableOutcomes:
        dataUnavailable.length,
      successRatePercent:
        measuredOutcomes >
        0
          ? this.round(
              (
                successful.length /
                measuredOutcomes
              ) *
                100,
              2,
            )
          : null,
      averageProfitRetentionPercent:
        retention.length >
        0
          ? this.round(
              retention.reduce(
                (
                  total,
                  value,
                ) =>
                  total +
                  value,
                0,
              ) /
                retention.length,
              4,
            )
          : null,
    };
  }

  private buildPaperPerformance(
    trades:
      readonly PaperTrade[],
  ): StrategyPerformanceAnalytics["paper"] {
    if (
      trades.length ===
      0
    ) {
      return {
        evidenceStatus:
          "NO_DATA",
        totalTrades:
          null,
        openTrades:
          null,
        closedTrades:
          null,
        winningTrades:
          null,
        losingTrades:
          null,
        winRatePercent:
          null,
        netProfit:
          null,
      };
    }

    const closed =
      trades.filter(
        (
          trade,
        ): trade is PaperTrade & {
          actualProfit: number;
        } =>
          trade.status ===
            "closed" &&
          trade.actualProfit !==
            null &&
          Number.isFinite(
            trade.actualProfit,
          ),
      );

    const winning =
      closed.filter(
        (trade) =>
          trade.actualProfit >
          0,
      );

    const losing =
      closed.filter(
        (trade) =>
          trade.actualProfit <
          0,
      );

    return {
      evidenceStatus:
        "AVAILABLE",
      totalTrades:
        trades.length,
      openTrades:
        trades.filter(
          (trade) =>
            trade.status !==
            "closed",
        ).length,
      closedTrades:
        closed.length,
      winningTrades:
        winning.length,
      losingTrades:
        losing.length,
      winRatePercent:
        closed.length >
        0
          ? this.round(
              (
                winning.length /
                closed.length
              ) *
                100,
              2,
            )
          : null,
      netProfit:
        closed.length >
        0
          ? this.round(
              closed.reduce(
                (
                  total,
                  trade,
                ) =>
                  total +
                  trade.actualProfit,
                0,
              ),
              12,
            )
          : null,
    };
  }

  private buildCoverage(
    strategyId: StrategyId,
    values: Iterable<unknown>,
  ): StrategyAttributionCoverage {
    let totalRecords = 0;
    let attributedToStrategy = 0;
    let attributedToOtherStrategies = 0;
    let unattributedLegacy = 0;

    for (const value of values) {
      totalRecords += 1;

      const attribution =
        normalizeStrategyAttribution(
          value,
        );

      if (
        attribution.attributionStatus ===
        "UNATTRIBUTED_LEGACY"
      ) {
        unattributedLegacy += 1;
      } else if (
        attribution.strategyId ===
        strategyId
      ) {
        attributedToStrategy += 1;
      } else {
        attributedToOtherStrategies += 1;
      }
    }

    const attributed =
      attributedToStrategy +
      attributedToOtherStrategies;

    return {
      evidenceStatus:
        totalRecords > 0
          ? "AVAILABLE"
          : "NO_DATA",

      totalRecords,

      attributedToStrategy,

      attributedToOtherStrategies,

      unattributedLegacy,

      attributionCoveragePercent:
        totalRecords > 0
          ? this.round(
              (
                attributed /
                totalRecords
              ) * 100,
              2,
            )
          : null,
    };
  }

  private round(
    value: number,
    decimals: number,
  ): number {
    const multiplier =
      10 ** decimals;

    return Math.round(
      (
        value +
        Number.EPSILON
      ) * multiplier,
    ) / multiplier;
  }
}

export const strategyAttributionAnalyticsService =
  new StrategyAttributionAnalyticsService();
