import {
  randomUUID,
} from "node:crypto";

import type {
  CandidateQualificationRecord,
} from "../models/CandidateQualification";

import type {
  ExecutionCandidateQueueConfig,
  ExecutionCandidateQueueDiagnostics,
  ExecutionCandidateQueueItem,
} from "../models/ExecutionCandidateQueue";

import {
  candidateQualificationService,
} from "./CandidateQualificationService";

import {
  cloneStrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

import {
  compareCandidateExecutionPriority,
} from "./ExecutionCandidateRanking";

const DEFAULT_CONFIG:
  ExecutionCandidateQueueConfig = {
  /*
   * Candidate must be refreshed by a
   * continuing QUALIFIED observation.
   */
  ttlMs:
    15_000,

  maximumQueueSize:
    250,
};

export class ExecutionCandidateQueueService {
  private readonly config:
    ExecutionCandidateQueueConfig;

  private readonly items =
    new Map<
      string,
      ExecutionCandidateQueueItem
    >();

  /*
   * One active queue item per stable route key.
   *
   * MARKET|buyExchange|sellExchange
   */
  private readonly activeByCandidateKey =
    new Map<
      string,
      string
    >();

  private totalItemsCreated =
    0;

  private duplicateEnqueueAttemptsPrevented =
    0;

  private totalRenewals =
    0;

  constructor(
    config:
      Partial<ExecutionCandidateQueueConfig> = {},
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.validateConfig();
  }

  /*
   * Called once per NEW authoritative
   * opportunity snapshot by Version 15.0
   * scheduler.
   *
   * No independent scan loop is created.
   */
  synchronize(
    now =
      Date.now(),

    evaluatedQualifications?:
      readonly CandidateQualificationRecord[],
  ): void {
    this.expireStale(
      now,
    );

    const qualified =
      (
        evaluatedQualifications ??
        candidateQualificationService
          .getQualifiedCandidates()
      )
        .filter(
          (
            qualification,
          ) =>
            qualification.qualified,
        );

    const qualifiedKeys =
      new Set(
        qualified.map(
          (
            record,
          ) =>
            record.key,
        ),
      );

    /*
     * Enqueue or renew all currently
     * qualified candidates.
     */
    for (
      const qualification
      of qualified
    ) {
      this.enqueueOrRenew(
        qualification,
        now,
      );
    }

    /*
     * A candidate that was READY but is no
     * longer QUALIFIED must leave the active
     * execution queue immediately.
     */
    for (
      const [
        candidateKey,
        itemId,
      ]
      of this.activeByCandidateKey
    ) {
      if (
        qualifiedKeys.has(
          candidateKey,
        )
      ) {
        continue;
      }

      const item =
        this.items.get(
          itemId,
        );

      if (
        !item ||
        item.status !==
          "READY"
      ) {
        this.activeByCandidateKey
          .delete(
            candidateKey,
          );

        continue;
      }

      item.status =
        "REMOVED";

      item.removedAt =
        now;

      item.updatedAt =
        now;

      item.reason =
        "Candidate removed because it no longer satisfies Version 15.2 qualification gates.";

      this.activeByCandidateKey
        .delete(
          candidateKey,
        );
    }

    this.trimHistory();
  }

  getReadyItems(
    now =
      Date.now(),
  ): ExecutionCandidateQueueItem[] {
    this.expireStale(
      now,
    );

    return Array.from(
      this.items.values(),
    )
      .filter(
        (
          item,
        ) =>
          item.status ===
          "READY",
      )
      .sort(
        (
          first,
          second,
        ) => {
          const executionPriority =
            compareCandidateExecutionPriority(
              first.qualification,
              second.qualification,
            );

          if (
            executionPriority !==
            0
          ) {
            return executionPriority;
          }

          if (
            first.priorityScore !==
            second.priorityScore
          ) {
            return (
              second.priorityScore -
              first.priorityScore
            );
          }

          if (
            first.enqueuedAt !==
            second.enqueuedAt
          ) {
            return (
              first.enqueuedAt -
              second.enqueuedAt
            );
          }

          return first.id.localeCompare(
            second.id,
          );
        },
      )
      .map(
        (
          item,
        ) =>
          structuredClone(
            item,
          ),
      );
  }

  getNextReady():
    ExecutionCandidateQueueItem | null {
    const ready =
      this.getReadyItems();

    return ready[0] ??
      null;
  }

  getItem(
    id:
      string,
  ): ExecutionCandidateQueueItem | null {
    this.expireStale();

    const item =
      this.items.get(
        id,
      );

    return item
      ? structuredClone(
          item,
        )
      : null;
  }

  cancel(
    id:
      string,

    reason =
      "Execution queue item cancelled manually.",
  ): ExecutionCandidateQueueItem {
    this.expireStale();

    const item =
      this.requireItem(
        id,
      );

    if (
      item.status !==
      "READY"
    ) {
      throw new Error(
        `Only READY queue items may be cancelled. Current status: ${item.status}.`,
      );
    }

    const now =
      Date.now();

    item.status =
      "CANCELLED";

    item.cancelledAt =
      now;

    item.updatedAt =
      now;

    item.reason =
      reason;

    this.removeActiveKey(
      item,
    );

    return structuredClone(
      item,
    );
  }

  /*
   * Reserved for Version 15.4 dispatcher.
   *
   * Version 15.3 exposes no HTTP consume
   * endpoint, so external callers cannot
   * dispatch executions yet.
   */
  consume(
    id:
      string,

    reason =
      "Queue item consumed by execution dispatcher.",
  ): ExecutionCandidateQueueItem {
    this.expireStale();

    const item =
      this.requireItem(
        id,
      );

    if (
      item.status !==
      "READY"
    ) {
      throw new Error(
        `Only READY queue items may be consumed. Current status: ${item.status}.`,
      );
    }

    const now =
      Date.now();

    item.status =
      "CONSUMED";

    item.consumedAt =
      now;

    item.updatedAt =
      now;

    item.reason =
      reason;

    this.removeActiveKey(
      item,
    );

    return structuredClone(
      item,
    );
  }

  getDiagnostics(
    now =
      Date.now(),
  ): ExecutionCandidateQueueDiagnostics {
    this.expireStale(
      now,
    );

    const items =
      Array.from(
        this.items.values(),
      )
        .sort(
          (
            first,
            second,
          ) => {
            if (
              first.status ===
                "READY" &&
              second.status !==
                "READY"
            ) {
              return -1;
            }

            if (
              first.status !==
                "READY" &&
              second.status ===
                "READY"
            ) {
              return 1;
            }

            if (
              first.priorityScore !==
              second.priorityScore
            ) {
              return (
                second.priorityScore -
                first.priorityScore
              );
            }

            return (
              second.updatedAt -
              first.updatedAt
            );
          },
        )
        .map(
          (
            item,
          ) =>
            structuredClone(
              item,
            ),
        );

    const readyItems =
      items.filter(
        (
          item,
        ) =>
          item.status ===
          "READY",
      );

    const readyAges =
      readyItems.map(
        (
          item,
        ) =>
          Math.max(
            0,

            now -
              item.enqueuedAt,
          ),
      );

    return {
      generatedAt:
        now,

      executionAllowed:
        false,

      config:
        structuredClone(
          this.config,
        ),

      totalItemsCreated:
        this.totalItemsCreated,

      activeItems:
        readyItems.length,

      ready:
        readyItems.length,

      expired:
        this.countStatus(
          items,
          "EXPIRED",
        ),

      cancelled:
        this.countStatus(
          items,
          "CANCELLED",
        ),

      removed:
        this.countStatus(
          items,
          "REMOVED",
        ),

      consumed:
        this.countStatus(
          items,
          "CONSUMED",
        ),

      duplicateEnqueueAttemptsPrevented:
        this.duplicateEnqueueAttemptsPrevented,

      totalRenewals:
        this.totalRenewals,

      highestPriority:
        readyItems.length >
        0
          ? readyItems[0]
              .priorityScore
          : null,

      averageReadyAgeMs:
        readyAges.length >
        0
          ? Math.round(
              readyAges.reduce(
                (
                  total,
                  age,
                ) =>
                  total +
                  age,
                0,
              ) /
                readyAges.length,
            )
          : 0,

      oldestReadyAgeMs:
        readyAges.length >
        0
          ? Math.max(
              ...readyAges,
            )
          : 0,

      items,
    };
  }

  /**
   * Internal evidence-archive traversal. Public diagnostics retain defensive
   * cloning and sorting; archival aggregation reads immutable-by-contract
   * references to avoid cloning a large queue history every 100 ms.
   */
  forEachArchiveItem(
    visitor:
      (
        item:
          ExecutionCandidateQueueItem,
      ) => void,
  ): void {
    this.expireStale();

    for (
      const item
      of this.items.values()
    ) {
      visitor(
        item,
      );
    }
  }

  private enqueueOrRenew(
    qualification:
      CandidateQualificationRecord,

    now:
      number,
  ): void {
    if (
      !qualification.qualified
    ) {
      return;
    }

    const existingId =
      this.activeByCandidateKey
        .get(
          qualification.key,
        );

    if (
      existingId
    ) {
      const existing =
        this.items.get(
          existingId,
        );

      if (
        existing &&
        existing.status ===
          "READY"
      ) {
        /*
         * Stable route already exists.
         *
         * Refresh its current market quality
         * instead of adding duplicate queue
         * entries.
         */
        this.duplicateEnqueueAttemptsPrevented +=
          1;

        this.totalRenewals +=
          1;

        existing.priorityScore =
          this.calculatePriority(
            qualification,
          );

        existing.strategyAttribution =
          cloneStrategyAttribution(
            qualification
              .candidate
              .strategyAttribution,
          );

        existing.qualificationScore =
          qualification.score;

        existing.netProfitPercent =
          qualification
            .candidate
            .latest
            .netProfitPercent;

        existing.liquidityScore =
          qualification
            .candidate
            .latest
            .liquidityScore;

        existing.freshnessScore =
          qualification
            .candidate
            .latest
            .freshnessScore;

        existing.persistenceMs =
          this.resolvePersistence(
            qualification,
            now,
          );

        existing.consecutiveObservations =
          qualification
            .candidate
            .consecutiveObservations;

        existing.updatedAt =
          now;

        existing.expiresAt =
          now +
          this.config.ttlMs;

        existing.renewals +=
          1;

        existing.reason =
          "Qualified candidate remained active; queue TTL and priority were refreshed.";

        existing.qualification =
          structuredClone(
            qualification,
          );

        return;
      }

      this.activeByCandidateKey
        .delete(
          qualification.key,
        );
    }

    const item:
      ExecutionCandidateQueueItem = {
      strategyAttribution:
        cloneStrategyAttribution(
          qualification
            .candidate
            .strategyAttribution,
        ),

      id:
        randomUUID(),

      candidateKey:
        qualification.key,

      market:
        qualification.market,

      buyExchange:
        qualification.buyExchange,

      sellExchange:
        qualification.sellExchange,

      status:
        "READY",

      priorityScore:
        this.calculatePriority(
          qualification,
        ),

      qualificationScore:
        qualification.score,

      netProfitPercent:
        qualification
          .candidate
          .latest
          .netProfitPercent,

      liquidityScore:
        qualification
          .candidate
          .latest
          .liquidityScore,

      freshnessScore:
        qualification
          .candidate
          .latest
          .freshnessScore,

      persistenceMs:
        this.resolvePersistence(
          qualification,
          now,
        ),

      consecutiveObservations:
        qualification
          .candidate
          .consecutiveObservations,

      enqueuedAt:
        now,

      updatedAt:
        now,

      expiresAt:
        now +
        this.config.ttlMs,

      consumedAt:
        null,

      cancelledAt:
        null,

      removedAt:
        null,

      expiredAt:
        null,

      renewals:
        0,

      reason:
        "Candidate passed Version 15.2 qualification and entered the execution queue.",

      qualification:
        structuredClone(
          qualification,
        ),
    };

    this.items.set(
      item.id,
      item,
    );

    this.activeByCandidateKey
      .set(
        item.candidateKey,
        item.id,
      );

    this.totalItemsCreated +=
      1;
  }

  private calculatePriority(
    qualification:
      CandidateQualificationRecord,
  ): number {
    const candidate =
      qualification.candidate;

    /*
     * Priority weighting:
     *
     * Qualification quality   35%
     * Net profit strength     25%
     * Liquidity               15%
     * Freshness               15%
     * Persistence             10%
     */

    const qualificationComponent =
      this.clamp100(
        qualification.score,
      );

    /*
     * 0.50% net profit or above receives
     * maximum profit component.
     */
    const profitComponent =
      this.clamp100(
        (
          candidate
            .latest
            .netProfitPercent /
          0.5
        ) *
          100,
      );

    const liquidityComponent =
      this.clamp100(
        candidate
          .latest
          .liquidityScore,
      );

    const freshnessComponent =
      this.clamp100(
        candidate
          .latest
          .freshnessScore,
      );

    /*
     * 30 seconds of persistence receives
     * maximum persistence contribution.
     */
    const persistenceComponent =
      this.clamp100(
        (
          candidate.lifetimeMs /
          30_000
        ) *
          100,
      );

    const score =
      qualificationComponent *
        0.35 +
      profitComponent *
        0.25 +
      liquidityComponent *
        0.15 +
      freshnessComponent *
        0.15 +
      persistenceComponent *
        0.10;

    return this.round(
      score,
      2,
    );
  }

  private resolvePersistence(
    qualification:
      CandidateQualificationRecord,

    now:
      number,
  ): number {
    const candidate =
      qualification.candidate;

    if (
      candidate.status !==
      "ACTIVE"
    ) {
      return candidate
        .lifetimeMs;
    }

    return Math.max(
      candidate.lifetimeMs,

      now -
        candidate.firstSeenAt,
    );
  }

  private expireStale(
    now =
      Date.now(),
  ): number {
    let expired =
      0;

    for (
      const item
      of this.items.values()
    ) {
      if (
        item.status !==
        "READY"
      ) {
        continue;
      }

      if (
        now <=
        item.expiresAt
      ) {
        continue;
      }

      item.status =
        "EXPIRED";

      item.expiredAt =
        now;

      item.updatedAt =
        now;

      item.reason =
        "Execution queue item expired because qualification was not refreshed before TTL.";

      this.removeActiveKey(
        item,
      );

      expired +=
        1;
    }

    return expired;
  }

  private removeActiveKey(
    item:
      ExecutionCandidateQueueItem,
  ): void {
    const currentId =
      this.activeByCandidateKey
        .get(
          item.candidateKey,
        );

    if (
      currentId ===
      item.id
    ) {
      this.activeByCandidateKey
        .delete(
          item.candidateKey,
        );
    }
  }

  private requireItem(
    id:
      string,
  ): ExecutionCandidateQueueItem {
    const item =
      this.items.get(
        id,
      );

    if (
      !item
    ) {
      throw new Error(
        "Execution queue item not found.",
      );
    }

    return item;
  }

  private trimHistory():
    void {
    if (
      this.items.size <=
      this.config.maximumQueueSize
    ) {
      return;
    }

    const removable =
      Array.from(
        this.items.values(),
      )
        .filter(
          (
            item,
          ) =>
            item.status !==
            "READY",
        )
        .sort(
          (
            first,
            second,
          ) =>
            first.updatedAt -
            second.updatedAt,
        );

    while (
      this.items.size >
        this.config.maximumQueueSize &&
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

      this.items.delete(
        oldest.id,
      );
    }
  }

  private countStatus(
    items:
      ExecutionCandidateQueueItem[],

    status:
      ExecutionCandidateQueueItem["status"],
  ): number {
    return items.filter(
      (
        item,
      ) =>
        item.status ===
        status,
    ).length;
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

  private validateConfig():
    void {
    if (
      !Number.isFinite(
        this.config.ttlMs,
      ) ||
      this.config.ttlMs <
        1_000
    ) {
      throw new Error(
        "Execution queue TTL must be at least 1000 ms.",
      );
    }

    if (
      !Number.isInteger(
        this.config
          .maximumQueueSize,
      ) ||
      this.config
        .maximumQueueSize <
        1
    ) {
      throw new Error(
        "Execution queue maximumQueueSize must be a positive integer.",
      );
    }
  }
}

export const executionCandidateQueueService =
  new ExecutionCandidateQueueService();
