import {
  orderBookService,
  type OrderBookMutationResult,
} from "../../orderbook/services/OrderBookService";

import {
  marketCache,
} from "../../services/cache.service";

import {
  coinDCXOrderBookToExecutableQuote,
  normalizeCoinDCXOrderBookDelta,
  normalizeCoinDCXOrderBookSnapshot,
  resolveCoinDCXMarket,
  resolveCoinDCXSourceTimestamp,
  resolveCoinDCXSourceVersion,
} from "./orderBookNormalizer";

import type {
  CoinDCXOrderBookPayload,
} from "./orderBook.types";

export type CoinDCXDepthEventType =
  | "snapshot"
  | "update";

export type CoinDCXGenerationReason =
  | "INITIAL_JOIN"
  | "INITIAL_RETRY"
  | "STALE_RECOVERY"
  | "REPLACEMENT_JOIN"
  | "TEMPORARY_JOIN"
  | "CROSSED_BOOK_RECOVERY";

export type CoinDCXIntegrityRejectionReason =
  | "UNTRACKED_SUBSCRIPTION"
  | "UPDATE_BEFORE_SNAPSHOT"
  | "UPDATE_WITHOUT_BOOK"
  | "STALE_EPOCH_EVENT"
  | "OUT_OF_ORDER_EVENT"
  | "INVALID_PAYLOAD"
  | "INVALID_BOOK"
  | "EMPTY_BOOK"
  | "CROSSED_BOOK";

export interface CoinDCXGenerationStartResult {
  generation:
    number;

  executableInvalidated:
    boolean;
}

export interface CoinDCXIntegrityEventResult {
  accepted:
    boolean;

  market:
    string | null;

  eventType:
    CoinDCXDepthEventType;

  reason:
    "OK" |
    CoinDCXIntegrityRejectionReason;

  recoveryRecommended:
    boolean;
}

export interface CoinDCXOrderBookIntegrityRecord {
  market:
    string;

  generation:
    number;

  generationReason:
    CoinDCXGenerationReason | null;

  generationStartedAt:
    number | null;

  awaitingFreshSnapshot:
    boolean;

  subscriptionGenerationInPayload:
    false;

  lastEventType:
    CoinDCXDepthEventType | null;

  lastEventReceivedAt:
    number | null;

  lastAcceptedSnapshotAt:
    number | null;

  lastAcceptedSnapshotTimestamp:
    number | null;

  lastAcceptedUpdateAt:
    number | null;

  lastAcceptedUpdateTimestamp:
    number | null;

  lastSourceVersion:
    number | null;

  lastSourceTimestamp:
    number | null;

  eventsReceived:
    number;

  snapshotsReceived:
    number;

  updatesReceived:
    number;

  updateBeforeSnapshotRejected:
    number;

  updateWithoutBookRejected:
    number;

  outOfOrderEventRejected:
    number;

  staleEpochEventRejected:
    number;

  crossedBookRejectionCount:
    number;

  executableInvalidationCount:
    number;

  forcedSnapshotRejoinCount:
    number;

  successfulRecoveryCount:
    number;

  lastRejectionReason:
    CoinDCXIntegrityRejectionReason | null;
}

interface MutableCoinDCXOrderBookIntegrityRecord
  extends CoinDCXOrderBookIntegrityRecord {
  generationSourceTimestampFloor:
    number | null;

  recoveryCountedForGeneration:
    boolean;
}

export interface CoinDCXOrderBookIntegrityReport {
  generatedAt:
    number;

  build:
    "4E";

  mode:
    "FEED_INTEGRITY_ONLY";

  mutationScope:
    "COINDCX_PUBLIC_MARKET_DATA";

  liveExecutionAllowed:
    false;

  sourceLimitations: {
    subscriptionGenerationInPayload:
      false;

    sourceSequenceAvailable:
      false;

    staleEpochClassification:
      "ONLY_WHEN_SOURCE_TIMESTAMP_PROVES_PRE_GENERATION_DATA";
  };

  summary: {
    trackedMarkets:
      number;

    awaitingFreshSnapshot:
      number;

    eventsReceived:
      number;

    updateBeforeSnapshotRejected:
      number;

    updateWithoutBookRejected:
      number;

    outOfOrderEventRejected:
      number;

    staleEpochEventRejected:
      number;

    crossedBookRejectionCount:
      number;

    executableInvalidationCount:
      number;

    forcedSnapshotRejoinCount:
      number;

    successfulRecoveryCount:
      number;
  };

  records:
    CoinDCXOrderBookIntegrityRecord[];
}

export class CoinDCXOrderBookIntegrityService {
  static readonly MAXIMUM_FORCED_SNAPSHOT_REJOINS_PER_MARKET =
    2;

  private readonly records =
    new Map<
      string,
      MutableCoinDCXOrderBookIntegrityRecord
    >();

  beginGeneration(
    market:
      string,

    reason:
      CoinDCXGenerationReason,

    now =
      Date.now(),
  ): CoinDCXGenerationStartResult {
    const normalizedMarket =
      this.normalizeMarket(
        market,
      );

    const existing =
      this.records.get(
        normalizedMarket,
      );

    const executableInvalidated =
      this.invalidateMarket(
        normalizedMarket,
      );

    const next =
      existing ??
      this.createRecord(
        normalizedMarket,
      );

    next.generation +=
      1;

    next.generationReason =
      reason;

    next.generationStartedAt =
      now;

    next.awaitingFreshSnapshot =
      true;

    next.generationSourceTimestampFloor =
      next.lastSourceTimestamp;

    next.recoveryCountedForGeneration =
      false;

    if (
      executableInvalidated
    ) {
      next.executableInvalidationCount +=
        1;
    }

    if (
      reason ===
      "CROSSED_BOOK_RECOVERY"
    ) {
      next.forcedSnapshotRejoinCount +=
        1;
    }

    this.records.set(
      normalizedMarket,
      next,
    );

    return {
      generation:
        next.generation,

      executableInvalidated,
    };
  }

  processEvent(
    payload:
      CoinDCXOrderBookPayload,

    eventType:
      CoinDCXDepthEventType,

    now =
      Date.now(),
  ): CoinDCXIntegrityEventResult {
    const resolvedMarket =
      resolveCoinDCXMarket(
        payload,
      );

    if (!resolvedMarket) {
      return {
        accepted:
          false,

        market:
          null,

        eventType,

        reason:
          "INVALID_PAYLOAD",

        recoveryRecommended:
          false,
      };
    }

    const market =
      this.normalizeMarket(
        resolvedMarket,
      );

    const record =
      this.records.get(
        market,
      );

    if (!record) {
      this.invalidateMarket(
        market,
      );

      return {
        accepted:
          false,

        market,

        eventType,

        reason:
          "UNTRACKED_SUBSCRIPTION",

        recoveryRecommended:
          false,
      };
    }

    record.eventsReceived +=
      1;

    record.lastEventType =
      eventType;

    record.lastEventReceivedAt =
      now;

    if (
      eventType ===
      "snapshot"
    ) {
      record.snapshotsReceived +=
        1;
    } else {
      record.updatesReceived +=
        1;
    }

    const sourceVersion =
      resolveCoinDCXSourceVersion(
        payload,
      );

    const sourceTimestamp =
      resolveCoinDCXSourceTimestamp(
        payload,
      );

    if (
      this.isProvablyFromPriorGeneration(
        record,
        sourceTimestamp,
      )
    ) {
      record.staleEpochEventRejected +=
        1;

      return this.reject(
        record,
        eventType,
        "STALE_EPOCH_EVENT",
      );
    }

    if (
      this.isOutOfOrder(
        record,
        sourceTimestamp,
      )
    ) {
      record.outOfOrderEventRejected +=
        1;

      return this.reject(
        record,
        eventType,
        "OUT_OF_ORDER_EVENT",
      );
    }

    if (
      eventType ===
        "update" &&
      record.awaitingFreshSnapshot
    ) {
      record.updateBeforeSnapshotRejected +=
        1;

      return this.reject(
        record,
        eventType,
        "UPDATE_BEFORE_SNAPSHOT",
      );
    }

    if (
      eventType ===
        "update" &&
      !orderBookService.has(
        "coindcx",
        market,
      )
    ) {
      record.awaitingFreshSnapshot =
        true;

      record.updateWithoutBookRejected +=
        1;

      const invalidated =
        this.invalidateMarket(
          market,
        );

      if (invalidated) {
        record.executableInvalidationCount +=
          1;
      }

      return this.reject(
        record,
        eventType,
        "UPDATE_WITHOUT_BOOK",
      );
    }

    const normalizedBook =
      eventType ===
        "snapshot"
        ? normalizeCoinDCXOrderBookSnapshot(
            payload,
          )
        : normalizeCoinDCXOrderBookDelta(
            payload,
          );

    if (!normalizedBook) {
      return this.reject(
        record,
        eventType,
        "INVALID_PAYLOAD",
      );
    }

    const receivedBook = {
      ...normalizedBook,

      /*
       * Source time is still used above for ordering and generation
       * integrity.  Cache freshness is based on locally observed
       * receipt time so small exchange/host clock offsets cannot turn
       * valid CoinDCX books into FUTURE_TIMESTAMP rejects.
       */
      timestamp:
        now,
    };

    const mutation =
      eventType ===
        "snapshot"
        ? orderBookService.replace(
            receivedBook,
          )
        : orderBookService.update(
            receivedBook,
          );

    if (
      !mutation.accepted ||
      !mutation.book
    ) {
      return this.handleRejectedMutation(
        record,
        eventType,
        mutation,
      );
    }

    const executableQuote =
      coinDCXOrderBookToExecutableQuote(
        mutation.book,
      );

    if (!executableQuote) {
      return this.reject(
        record,
        eventType,
        "INVALID_BOOK",
      );
    }

    marketCache.update(
      executableQuote,
    );

    record.awaitingFreshSnapshot =
      false;

    record.lastRejectionReason =
      null;

    if (
      sourceVersion !==
      null
    ) {
      record.lastSourceVersion =
        sourceVersion;
    }

    if (
      sourceTimestamp !==
      null
    ) {
      record.lastSourceTimestamp =
        sourceTimestamp;
    }

    if (
      eventType ===
      "snapshot"
    ) {
      record.lastAcceptedSnapshotAt =
        now;

      record.lastAcceptedSnapshotTimestamp =
        sourceTimestamp;

      if (
        this.isRecoveryGeneration(
          record.generationReason,
        ) &&
        !record.recoveryCountedForGeneration
      ) {
        record.successfulRecoveryCount +=
          1;

        record.recoveryCountedForGeneration =
          true;
      }
    } else {
      record.lastAcceptedUpdateAt =
        now;

      record.lastAcceptedUpdateTimestamp =
        sourceTimestamp;
    }

    return {
      accepted:
        true,

      market,

      eventType,

      reason:
        "OK",

      recoveryRecommended:
        false,
    };
  }

  /**
   * Re-arm an already tracked websocket generation from a genuine public
   * CoinDCX REST snapshot.
   *
   * CoinDCX can deliver depth updates before the first websocket snapshot
   * after a join/rejoin.  The integrity gate correctly rejects those deltas,
   * but waiting indefinitely for another socket snapshot leaves an otherwise
   * healthy market permanently non-executable.  This method accepts only a
   * full, validated two-sided book fetched from CoinDCX's public order-book
   * endpoint.  It never fabricates depth and it never creates a subscription.
   */
  seedTrackedSnapshot(
    payload:
      CoinDCXOrderBookPayload,

    now =
      Date.now(),
  ): CoinDCXIntegrityEventResult {
    const resolvedMarket =
      resolveCoinDCXMarket(
        payload,
      );

    if (!resolvedMarket) {
      return {
        accepted:
          false,

        market:
          null,

        eventType:
          "snapshot",

        reason:
          "INVALID_PAYLOAD",

        recoveryRecommended:
          false,
      };
    }

    const market =
      this.normalizeMarket(
        resolvedMarket,
      );

    const record =
      this.records.get(
        market,
      );

    if (!record) {
      return {
        accepted:
          false,

        market,

        eventType:
          "snapshot",

        reason:
          "UNTRACKED_SUBSCRIPTION",

        recoveryRecommended:
          false,
      };
    }

    return this.processEvent(
      {
        ...payload,

        s:
          market,

        E:
          now,
      },
      "snapshot",
      now,
    );
  }

  invalidate(
    market:
      string,
  ): boolean {
    const normalizedMarket =
      this.normalizeMarket(
        market,
      );

    const invalidated =
      this.invalidateMarket(
        normalizedMarket,
      );

    const record =
      this.records.get(
        normalizedMarket,
      );

    if (
      record &&
      invalidated
    ) {
      record.executableInvalidationCount +=
        1;
    }

    if (record) {
      record.awaitingFreshSnapshot =
        true;
    }

    return invalidated;
  }

  remove(
    market:
      string,
  ): void {
    const normalizedMarket =
      this.normalizeMarket(
        market,
      );

    this.invalidateMarket(
      normalizedMarket,
    );

    this.records.delete(
      normalizedMarket,
    );
  }

  canScheduleCrossedBookRecovery(
    market:
      string,
  ): boolean {
    const record =
      this.records.get(
        this.normalizeMarket(
          market,
        ),
      );

    return (
      record !==
        undefined &&
      record.forcedSnapshotRejoinCount <
        CoinDCXOrderBookIntegrityService
          .MAXIMUM_FORCED_SNAPSHOT_REJOINS_PER_MARKET
    );
  }

  getReport(
    now =
      Date.now(),
  ): CoinDCXOrderBookIntegrityReport {
    const records =
      Array.from(
        this.records.values(),
      )
        .map(
          (record) =>
            this.toPublicRecord(
              record,
            ),
        )
        .sort(
          (
            first,
            second,
          ) =>
            first.market.localeCompare(
              second.market,
            ),
        );

    const sum = (
      selector:
        (
          record:
            CoinDCXOrderBookIntegrityRecord,
        ) => number,
    ): number =>
      records.reduce(
        (
          total,
          record,
        ) =>
          total +
          selector(
            record,
          ),
        0,
      );

    return {
      generatedAt:
        now,

      build:
        "4E",

      mode:
        "FEED_INTEGRITY_ONLY",

      mutationScope:
        "COINDCX_PUBLIC_MARKET_DATA",

      liveExecutionAllowed:
        false,

      sourceLimitations: {
        subscriptionGenerationInPayload:
          false,

        sourceSequenceAvailable:
          false,

        staleEpochClassification:
          "ONLY_WHEN_SOURCE_TIMESTAMP_PROVES_PRE_GENERATION_DATA",
      },

      summary: {
        trackedMarkets:
          records.length,

        awaitingFreshSnapshot:
          records.filter(
            (record) =>
              record.awaitingFreshSnapshot,
          ).length,

        eventsReceived:
          sum(
            (record) =>
              record.eventsReceived,
          ),

        updateBeforeSnapshotRejected:
          sum(
            (record) =>
              record.updateBeforeSnapshotRejected,
          ),

        updateWithoutBookRejected:
          sum(
            (record) =>
              record.updateWithoutBookRejected,
          ),

        outOfOrderEventRejected:
          sum(
            (record) =>
              record.outOfOrderEventRejected,
          ),

        staleEpochEventRejected:
          sum(
            (record) =>
              record.staleEpochEventRejected,
          ),

        crossedBookRejectionCount:
          sum(
            (record) =>
              record.crossedBookRejectionCount,
          ),

        executableInvalidationCount:
          sum(
            (record) =>
              record.executableInvalidationCount,
          ),

        forcedSnapshotRejoinCount:
          sum(
            (record) =>
              record.forcedSnapshotRejoinCount,
          ),

        successfulRecoveryCount:
          sum(
            (record) =>
              record.successfulRecoveryCount,
          ),
      },

      records,
    };
  }

  clear(): void {
    this.records.clear();
  }

  private handleRejectedMutation(
    record:
      MutableCoinDCXOrderBookIntegrityRecord,

    eventType:
      CoinDCXDepthEventType,

    mutation:
      OrderBookMutationResult,
  ): CoinDCXIntegrityEventResult {
    const reason =
      mutation.reason ===
        "OK"
        ? "INVALID_BOOK"
        : mutation.reason;

    if (
      reason ===
      "CROSSED_BOOK"
    ) {
      record.crossedBookRejectionCount +=
        1;

      record.awaitingFreshSnapshot =
        true;

      const invalidated =
        this.invalidateMarket(
          record.market,
        );

      if (invalidated) {
        record.executableInvalidationCount +=
          1;
      }

      record.lastRejectionReason =
        reason;

      return {
        accepted:
          false,

        market:
          record.market,

        eventType,

        reason,

        recoveryRecommended:
          this.canScheduleCrossedBookRecovery(
            record.market,
          ),
      };
    }

    return this.reject(
      record,
      eventType,
      reason,
    );
  }

  private reject(
    record:
      MutableCoinDCXOrderBookIntegrityRecord,

    eventType:
      CoinDCXDepthEventType,

    reason:
      CoinDCXIntegrityRejectionReason,
  ): CoinDCXIntegrityEventResult {
    record.lastRejectionReason =
      reason;

    return {
      accepted:
        false,

      market:
        record.market,

      eventType,

      reason,

      recoveryRecommended:
        false,
    };
  }

  private isProvablyFromPriorGeneration(
    record:
      MutableCoinDCXOrderBookIntegrityRecord,

    sourceTimestamp:
      number | null,
  ): boolean {
    if (
      !record.awaitingFreshSnapshot ||
      record.generation <=
        1
    ) {
      return false;
    }

    return (
      sourceTimestamp !==
        null &&
      record.generationSourceTimestampFloor !==
        null &&
      sourceTimestamp <=
        record.generationSourceTimestampFloor
    );
  }

  private isOutOfOrder(
    record:
      MutableCoinDCXOrderBookIntegrityRecord,

    sourceTimestamp:
      number | null,
  ): boolean {
    return (
      sourceTimestamp !==
        null &&
      record.lastSourceTimestamp !==
        null &&
      sourceTimestamp <
        record.lastSourceTimestamp
    );
  }

  private isRecoveryGeneration(
    reason:
      CoinDCXGenerationReason | null,
  ): boolean {
    return (
      reason ===
        "INITIAL_RETRY" ||
      reason ===
        "STALE_RECOVERY" ||
      reason ===
        "CROSSED_BOOK_RECOVERY"
    );
  }

  private invalidateMarket(
    market:
      string,
  ): boolean {
    orderBookService.remove(
      "coindcx",
      market,
    );

    return marketCache.invalidateExecutable(
      "coindcx",
      market,
    );
  }

  private createRecord(
    market:
      string,
  ): MutableCoinDCXOrderBookIntegrityRecord {
    return {
      market,

      generation:
        0,

      generationReason:
        null,

      generationStartedAt:
        null,

      awaitingFreshSnapshot:
        true,

      subscriptionGenerationInPayload:
        false,

      lastEventType:
        null,

      lastEventReceivedAt:
        null,

      lastAcceptedSnapshotAt:
        null,

      lastAcceptedSnapshotTimestamp:
        null,

      lastAcceptedUpdateAt:
        null,

      lastAcceptedUpdateTimestamp:
        null,

      lastSourceVersion:
        null,

      lastSourceTimestamp:
        null,

      eventsReceived:
        0,

      snapshotsReceived:
        0,

      updatesReceived:
        0,

      updateBeforeSnapshotRejected:
        0,

      updateWithoutBookRejected:
        0,

      outOfOrderEventRejected:
        0,

      staleEpochEventRejected:
        0,

      crossedBookRejectionCount:
        0,

      executableInvalidationCount:
        0,

      forcedSnapshotRejoinCount:
        0,

      successfulRecoveryCount:
        0,

      lastRejectionReason:
        null,

      generationSourceTimestampFloor:
        null,

      recoveryCountedForGeneration:
        false,
    };
  }

  private toPublicRecord(
    record:
      MutableCoinDCXOrderBookIntegrityRecord,
  ): CoinDCXOrderBookIntegrityRecord {
    return {
      market:
        record.market,

      generation:
        record.generation,

      generationReason:
        record.generationReason,

      generationStartedAt:
        record.generationStartedAt,

      awaitingFreshSnapshot:
        record.awaitingFreshSnapshot,

      subscriptionGenerationInPayload:
        false,

      lastEventType:
        record.lastEventType,

      lastEventReceivedAt:
        record.lastEventReceivedAt,

      lastAcceptedSnapshotAt:
        record.lastAcceptedSnapshotAt,

      lastAcceptedSnapshotTimestamp:
        record.lastAcceptedSnapshotTimestamp,

      lastAcceptedUpdateAt:
        record.lastAcceptedUpdateAt,

      lastAcceptedUpdateTimestamp:
        record.lastAcceptedUpdateTimestamp,

      lastSourceVersion:
        record.lastSourceVersion,

      lastSourceTimestamp:
        record.lastSourceTimestamp,

      eventsReceived:
        record.eventsReceived,

      snapshotsReceived:
        record.snapshotsReceived,

      updatesReceived:
        record.updatesReceived,

      updateBeforeSnapshotRejected:
        record.updateBeforeSnapshotRejected,

      updateWithoutBookRejected:
        record.updateWithoutBookRejected,

      outOfOrderEventRejected:
        record.outOfOrderEventRejected,

      staleEpochEventRejected:
        record.staleEpochEventRejected,

      crossedBookRejectionCount:
        record.crossedBookRejectionCount,

      executableInvalidationCount:
        record.executableInvalidationCount,

      forcedSnapshotRejoinCount:
        record.forcedSnapshotRejoinCount,

      successfulRecoveryCount:
        record.successfulRecoveryCount,

      lastRejectionReason:
        record.lastRejectionReason,
    };
  }

  private normalizeMarket(
    market:
      string,
  ): string {
    return market
      .trim()
      .toUpperCase()
      .replace(
        /[\s_\-/]+/g,
        "",
      );
  }
}

export const coinDCXOrderBookIntegrityService =
  new CoinDCXOrderBookIntegrityService();
