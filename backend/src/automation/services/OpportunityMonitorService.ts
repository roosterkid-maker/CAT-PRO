import type {
  ArbitrageOpportunity,
} from "../../arbitrage/models/ArbitrageOpportunity";

import type {
  MonitoredOpportunityCandidate,
  OpportunityMonitorDiagnostics,
} from "../models/OpportunityMonitor";

import {
  cloneStrategyAttribution,
  unattributedLegacyStrategyEvidence,
} from "../../strategies/models/StrategyAttribution";

import type {
  StrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

export interface OpportunityMonitorProcessedSnapshot {
  snapshotGeneratedAt: number;

  opportunityCount: number;

  candidateKeys: string[];
}

export class OpportunityMonitorService {
  private static readonly MAXIMUM_HISTORY =
    500;

  private static readonly MAXIMUM_PROCESSED_SNAPSHOT_HISTORY =
    250;

  private readonly candidates =
    new Map<
      string,
      MonitoredOpportunityCandidate
    >();

  /*
   * VERSION 17.4 BUILD 4
   *
   * Exact snapshots actually consumed by the
   * automation monitor.
   */
  private readonly recentProcessedSnapshots:
    OpportunityMonitorProcessedSnapshot[] =
    [];

  private processedSnapshots =
    0;

  private lastProcessedSnapshotAt:
    number | null =
    null;

  private totalCandidatesCreated =
    0;

  private totalReappearances =
    0;

  private duplicateObservationsCollapsed =
    0;

  observeSnapshot(
    opportunities:
      readonly ArbitrageOpportunity[],

    snapshotGeneratedAt:
      number,

    strategyAttributions:
      ReadonlyMap<string, StrategyAttribution> =
        new Map(),
  ): void {
    const deduplicated =
      new Map<
        string,
        ArbitrageOpportunity
      >();

    for (
      const opportunity
      of opportunities
    ) {
      const key =
        this.createKey(
          opportunity,
        );

      const existing =
        deduplicated.get(
          key,
        );

      if (
        !existing
      ) {
        deduplicated.set(
          key,
          opportunity,
        );

        continue;
      }

      this.duplicateObservationsCollapsed +=
        1;

      if (
        opportunity.netProfitPercent >
        existing.netProfitPercent
      ) {
        deduplicated.set(
          key,
          opportunity,
        );
      }
    }

    const observedKeys =
      new Set(
        deduplicated.keys(),
      );

    for (
      const [
        key,
        opportunity,
      ]
      of deduplicated
    ) {
      const existing =
        this.candidates.get(
          key,
        );

      const strategyAttribution =
        this.resolveStrategyAttribution(
          opportunity.id,
          strategyAttributions,
        );

      if (
        !existing
      ) {
        const candidate =
          this.createCandidate(
            key,
            opportunity,
            snapshotGeneratedAt,
            strategyAttribution,
          );

        this.candidates.set(
          key,
          candidate,
        );

        this.totalCandidatesCreated +=
          1;

        continue;
      }

      const wasDisappeared =
        existing.status ===
        "DISAPPEARED";

      if (
        wasDisappeared
      ) {
        existing.reappearances +=
          1;

        this.totalReappearances +=
          1;

        existing.consecutiveObservations =
          0;

        existing.consecutiveDistinctBookObservations =
          0;
      }

      const distinctBookGeneration =
        existing.latest.buyQuoteTimestamp !==
          opportunity.pair.buy.timestamp ||
        existing.latest.sellQuoteTimestamp !==
          opportunity.pair.sell.timestamp;

      existing.status =
        "ACTIVE";

      existing.strategyAttribution =
        strategyAttribution;

      existing.disappearedAt =
        null;

      existing.latestOpportunityId =
        opportunity.id;

      existing.lastSeenAt =
        snapshotGeneratedAt;

      existing.lifetimeMs =
        Math.max(
          0,

          snapshotGeneratedAt -
            existing.firstSeenAt,
        );

      existing.totalObservations +=
        1;

      existing.consecutiveObservations +=
        1;

      if (
        distinctBookGeneration
      ) {
        existing.consecutiveDistinctBookObservations =
          (
            existing.consecutiveDistinctBookObservations ??
            0
          ) +
          1;
      }

      existing.missedSnapshots =
        0;

      existing.latest = {
        buyPrice:
          opportunity.buyPrice,

        sellPrice:
          opportunity.sellPrice,

        executableQuantity:
          opportunity.executableQty,

        netProfit:
          opportunity.netProfit,

        netProfitPercent:
          opportunity.netProfitPercent,

        estimatedFees:
          opportunity.estimatedFees,

        rawSpread:
          opportunity.rawSpread,

        rawSpreadPercent:
          opportunity.rawSpreadPercent,

        liquidityScore:
          opportunity.liquidityScore,

        freshnessScore:
          opportunity.freshnessScore,

        requestedCapitalInr:
          opportunity.requestedCapitalInr,

        quoteAsset:
          opportunity.quoteAsset,

        requestedQuoteCapital:
          opportunity.requestedQuoteCapital,

        opportunityTimestamp:
          opportunity.timestamp,

        buyQuoteTimestamp:
          opportunity.pair.buy.timestamp,

        sellQuoteTimestamp:
          opportunity.pair.sell.timestamp,

        quotesAreFresh:
          opportunity.quotesAreFresh,

        usedLastPriceFallback:
          opportunity.usedLastPriceFallback,
      };

      if (
        opportunity.netProfitPercent >
        existing
          .best
          .netProfitPercent
      ) {
        existing.best = {
          netProfit:
            opportunity.netProfit,

          netProfitPercent:
            opportunity
              .netProfitPercent,

          observedAt:
            snapshotGeneratedAt,

          opportunityId:
            opportunity.id,
        };
      }
    }

    for (
      const candidate
      of this.candidates.values()
    ) {
      if (
        observedKeys.has(
          candidate.key,
        )
      ) {
        continue;
      }

      if (
        candidate.status !==
        "ACTIVE"
      ) {
        continue;
      }

      candidate.missedSnapshots +=
        1;

      candidate.status =
        "DISAPPEARED";

      candidate.disappearedAt =
        snapshotGeneratedAt;

      candidate.consecutiveObservations =
        0;

      candidate.consecutiveDistinctBookObservations =
        0;

      candidate.lifetimeMs =
        Math.max(
          0,

          candidate.lastSeenAt -
            candidate.firstSeenAt,
        );
    }

    this.processedSnapshots +=
      1;

    this.lastProcessedSnapshotAt =
      snapshotGeneratedAt;

    /*
     * VERSION 17.4 BUILD 4
     *
     * Record exactly what monitor consumed.
     */
    this.recentProcessedSnapshots
      .push({
        snapshotGeneratedAt,

        opportunityCount:
          deduplicated.size,

        candidateKeys:
          Array.from(
            deduplicated.keys(),
          ),
      });

    while (
      this.recentProcessedSnapshots
        .length >
      OpportunityMonitorService
        .MAXIMUM_PROCESSED_SNAPSHOT_HISTORY
    ) {
      this.recentProcessedSnapshots
        .shift();
    }

    this.trimHistory();
  }

  getCandidate(
    key:
      string,
  ): MonitoredOpportunityCandidate | null {
    const candidate =
      this.candidates.get(
        key,
      );

    return candidate
      ? structuredClone(
          candidate,
        )
      : null;
  }

  /**
   * Visit authoritative ACTIVE candidates synchronously without cloning and
   * sorting the whole set first. Internal hot-path consumers must treat each
   * candidate as immutable; public/operator APIs continue using cloned DTOs.
   */
  forEachActiveCandidate(
    visitor:
      (
        candidate:
          MonitoredOpportunityCandidate,
      ) => void,
  ): void {
    for (
      const candidate
      of this.candidates.values()
    ) {
      if (
        candidate.status ===
        "ACTIVE"
      ) {
        visitor(
          candidate,
        );
      }
    }
  }

  getActiveCandidates():
    MonitoredOpportunityCandidate[] {
    return Array.from(
      this.candidates.values(),
    )
      .filter(
        (
          candidate,
        ) =>
          candidate.status ===
          "ACTIVE",
      )
      .sort(
        (
          first,
          second,
        ) =>
          second.latest
            .netProfitPercent -
          first.latest
            .netProfitPercent,
      )
      .map(
        (
          candidate,
        ) =>
          structuredClone(
            candidate,
          ),
      );
  }

  /*
   * VERSION 17.4 BUILD 4
   *
   * Read-only monitor-consumption history.
   */
  getRecentProcessedSnapshots(
    limit =
      100,
  ): OpportunityMonitorProcessedSnapshot[] {
    const normalizedLimit =
      Math.max(
        1,

        Math.min(
          OpportunityMonitorService
            .MAXIMUM_PROCESSED_SNAPSHOT_HISTORY,

          Math.floor(
            limit,
          ),
        ),
      );

    return structuredClone(
      this.recentProcessedSnapshots
        .slice(
          -normalizedLimit,
        ),
    );
  }

  getDiagnostics():
    OpportunityMonitorDiagnostics {
    const candidates =
      Array.from(
        this.candidates.values(),
      )
        .sort(
          (
            first,
            second,
          ) => {
            if (
              first.status !==
              second.status
            ) {
              return first.status ===
                "ACTIVE"
                ? -1
                : 1;
            }

            return (
              second.lastSeenAt -
              first.lastSeenAt
            );
          },
        )
        .map(
          (
            candidate,
          ) =>
            structuredClone(
              candidate,
            ),
        );

    return {
      generatedAt:
        Date.now(),

      processedSnapshots:
        this.processedSnapshots,

      lastProcessedSnapshotAt:
        this.lastProcessedSnapshotAt,

      totalCandidatesCreated:
        this.totalCandidatesCreated,

      activeCandidates:
        candidates.filter(
          (
            candidate,
          ) =>
            candidate.status ===
            "ACTIVE",
        ).length,

      disappearedCandidates:
        candidates.filter(
          (
            candidate,
          ) =>
            candidate.status ===
            "DISAPPEARED",
        ).length,

      totalReappearances:
        this.totalReappearances,

      duplicateObservationsCollapsed:
        this.duplicateObservationsCollapsed,

      candidates,
    };
  }

  private createCandidate(
    key:
      string,

    opportunity:
      ArbitrageOpportunity,

    observedAt:
      number,

    strategyAttribution:
      StrategyAttribution,
  ): MonitoredOpportunityCandidate {
    return {
      strategyAttribution:
        cloneStrategyAttribution(
          strategyAttribution,
        ),

      key,

      market:
        opportunity
          .pair
          .market
          .trim()
          .toUpperCase(),

      buyExchange:
        opportunity
          .pair
          .buy
          .exchange
          .trim()
          .toLowerCase(),

      sellExchange:
        opportunity
          .pair
          .sell
          .exchange
          .trim()
          .toLowerCase(),

      status:
        "ACTIVE",

      latestOpportunityId:
        opportunity.id,

      firstSeenAt:
        observedAt,

      lastSeenAt:
        observedAt,

      disappearedAt:
        null,

      lifetimeMs:
        0,

      totalObservations:
        1,

      consecutiveObservations:
        1,

      consecutiveDistinctBookObservations:
        1,

      missedSnapshots:
        0,

      reappearances:
        0,

      latest: {
        buyPrice:
          opportunity.buyPrice,

        sellPrice:
          opportunity.sellPrice,

        executableQuantity:
          opportunity.executableQty,

        netProfit:
          opportunity.netProfit,

        netProfitPercent:
          opportunity.netProfitPercent,

        estimatedFees:
          opportunity.estimatedFees,

        rawSpread:
          opportunity.rawSpread,

        rawSpreadPercent:
          opportunity.rawSpreadPercent,

        liquidityScore:
          opportunity.liquidityScore,

        freshnessScore:
          opportunity.freshnessScore,

        requestedCapitalInr:
          opportunity.requestedCapitalInr,

        quoteAsset:
          opportunity.quoteAsset,

        requestedQuoteCapital:
          opportunity.requestedQuoteCapital,

        opportunityTimestamp:
          opportunity.timestamp,

        buyQuoteTimestamp:
          opportunity.pair.buy.timestamp,

        sellQuoteTimestamp:
          opportunity.pair.sell.timestamp,

        quotesAreFresh:
          opportunity.quotesAreFresh,

        usedLastPriceFallback:
          opportunity.usedLastPriceFallback,
      },

      best: {
        netProfit:
          opportunity.netProfit,

        netProfitPercent:
          opportunity.netProfitPercent,

        observedAt,

        opportunityId:
          opportunity.id,
      },
    };
  }

  private resolveStrategyAttribution(
    opportunityId:
      string,

    strategyAttributions:
      ReadonlyMap<string, StrategyAttribution>,
  ): StrategyAttribution {
    const attribution =
      strategyAttributions.get(
        opportunityId,
      );

    return attribution
      ? cloneStrategyAttribution(
          attribution,
        )
      : unattributedLegacyStrategyEvidence();
  }

  private createKey(
    opportunity:
      ArbitrageOpportunity,
  ): string {
    return [
      opportunity
        .pair
        .market
        .trim()
        .toUpperCase(),

      opportunity
        .pair
        .buy
        .exchange
        .trim()
        .toLowerCase(),

      opportunity
        .pair
        .sell
        .exchange
        .trim()
        .toLowerCase(),
    ].join(
      "|",
    );
  }

  private trimHistory():
    void {
    if (
      this.candidates.size <=
      OpportunityMonitorService
        .MAXIMUM_HISTORY
    ) {
      return;
    }

    const removable =
      Array.from(
        this.candidates.values(),
      )
        .filter(
          (
            candidate,
          ) =>
            candidate.status ===
            "DISAPPEARED",
        )
        .sort(
          (
            first,
            second,
          ) =>
            first.lastSeenAt -
            second.lastSeenAt,
        );

    while (
      this.candidates.size >
        OpportunityMonitorService
          .MAXIMUM_HISTORY &&
      removable.length >
        0
    ) {
      const oldest =
        removable.shift();

      if (
        !oldest
      ) {
        break;
      }

      this.candidates.delete(
        oldest.key,
      );
    }
  }
}

export const opportunityMonitorService =
  new OpportunityMonitorService();
