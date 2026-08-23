import {
  resolve,
} from "node:path";

import {
  JsonlSnapshotStore,
} from "../../core/persistence/JsonlSnapshotStore";

import type {
  PaperTrade,
  PaperTradeStatus,
} from "../models/PaperTrade";

export interface PaperTradeStoreDiagnostics {
  persistenceFilePath: string;

  restored: boolean;

  restoredAt: number | null;

  trades: number;

  writes: number;

  writeFailures: number;

  malformedRecordsIgnored: number;

  lastError: string | null;
}

export interface PaperTradeStoreSummary {
  totalStoredRecords: number;
  activeStoredRecords: number;
  closedStoredRecords: number;
  expectedProfitAcrossStoredRecords: number;
  actualProfitAcrossClosedStoredRecords: number;
}

export interface PaperTradePageCursor {
  openedAt: number;
  id: string;
}

export interface PaperTradePage {
  trades: PaperTrade[];
  nextCursor: PaperTradePageCursor | null;
  hasMore: boolean;
  totalStoredRecords: number;
  revision: number;
}

const DEFAULT_PAPER_TRADE_FILE =
  resolve(
    process.cwd(),
    "logs",
    "paper",
    "paper-trades.jsonl",
  );

export class PaperTradeStore {
  private readonly trades =
    new Map<string, PaperTrade>();

  private readonly store:
    JsonlSnapshotStore<PaperTrade>;

  private restored =
    false;

  private restoredAt:
    number | null =
    null;

  private revision =
    0;

  private settledRevision =
    0;

  private readOnlySnapshot:
    readonly PaperTrade[] | null =
    null;

  private orderedReadOnlySnapshot:
    readonly PaperTrade[] | null =
    null;

  private summarySnapshot:
    PaperTradeStoreSummary | null =
    null;

  constructor(
    persistenceFilePath =
      DEFAULT_PAPER_TRADE_FILE,
  ) {
    this.store =
      new JsonlSnapshotStore<PaperTrade>({
        filePath:
          persistenceFilePath,

        isPayload:
          (
            value,
          ): value is PaperTrade =>
            this.isPaperTrade(
              value,
            ),
      });

    this.restore();
  }

  create(
    trade:
      PaperTrade,
  ): PaperTrade {
    const existing =
      this.trades.get(
        trade.id,
      );

    if (
      existing
    ) {
      if (
        this.isEquivalent(
          existing,
          trade,
        )
      ) {
        return structuredClone(
          existing,
        );
      }

      throw new Error(
        `Paper trade already exists with different evidence: ${trade.id}`,
      );
    }

    this.persist(
      trade,
    );

    return structuredClone(
      trade,
    );
  }

  getById(
    id:
      string,
  ): PaperTrade | undefined {
    const trade =
      this.trades.get(
        id,
      );

    return trade
      ? structuredClone(
          trade,
        )
      : undefined;
  }

  getAll(): PaperTrade[] {
    return this.trades.size ===
      0
      ? []
      : this.getRecent(
          this.trades.size,
        );
  }

  /**
   * Fast internal snapshot for trusted synchronous analytics. The returned
   * array is detached from the store, but its trade objects are immutable
   * snapshots owned by the store and must never be mutated by the caller.
   * Public/API consumers must continue to use getAll(), which deep-clones.
   */
  getAllForReadOnlyAggregation(): readonly PaperTrade[] {
    if (
      this.readOnlySnapshot ===
      null
    ) {
      this.readOnlySnapshot =
        Object.freeze(
          Array.from(
            this.trades.values(),
          ),
        );
    }

    return this.readOnlySnapshot;
  }

  /**
   * Bounded public history for operator tables. This deliberately clones only
   * the requested rows instead of cloning the complete durable PAPER ledger on
   * every dashboard poll.
   */
  getRecent(
    limit:
      number,
  ): PaperTrade[] {
    return this.getPage(
      limit,
    ).trades;
  }

  /**
   * Stable newest-first cursor page for operator history. The cursor is the
   * final `(openedAt, id)` tuple already observed by the caller, so newly
   * inserted trades at the front cannot shift or duplicate subsequent pages.
   */
  getPage(
    limit:
      number,

    cursor:
      PaperTradePageCursor | null =
        null,
  ): PaperTradePage {
    if (
      !Number.isSafeInteger(
        limit,
      ) ||
      limit <
        1
    ) {
      throw new Error(
        "Recent PAPER trade limit must be a positive safe integer.",
      );
    }

    if (
      cursor !==
        null &&
      (
        !Number.isSafeInteger(
          cursor.openedAt,
        ) ||
        cursor.openedAt <=
          0 ||
        typeof cursor.id !==
          "string" ||
        cursor.id.trim().length ===
          0
      )
    ) {
      throw new Error(
        "PAPER trade cursor must contain a positive openedAt timestamp and non-empty ID.",
      );
    }

    if (
      this.orderedReadOnlySnapshot ===
      null
    ) {
      this.orderedReadOnlySnapshot =
        Object.freeze(
          [
            ...this.trades.values(),
          ].sort(
            comparePaperTradeHistoryOrder,
          ),
        );
    }

    const startIndex =
      cursor ===
        null
        ? 0
        : findFirstTradeAfterCursor(
            this.orderedReadOnlySnapshot,
            cursor,
          );

    const pageWindow =
      this.orderedReadOnlySnapshot
      .slice(
        startIndex,
        startIndex +
          limit +
          1,
      );

    const hasMore =
      pageWindow.length >
        limit;

    const pageTrades =
      pageWindow.slice(
        0,
        limit,
      );

    const lastTrade =
      pageTrades.at(
        -1,
      );

    return {
      trades:
        pageTrades
      .map(
        (
          trade,
        ) =>
          structuredClone(
            trade,
          ),
        ),
      nextCursor:
        hasMore &&
        lastTrade
          ? {
              openedAt:
                lastTrade.openedAt,
              id:
                lastTrade.id,
            }
          : null,
      hasMore,
      totalStoredRecords:
        this.trades.size,
      revision:
        this.revision,
    };
  }

  getSummary(): PaperTradeStoreSummary {
    if (
      this.summarySnapshot !==
      null
    ) {
      return {
        ...this.summarySnapshot,
      };
    }

    let activeStoredRecords =
      0;
    let closedStoredRecords =
      0;
    let expectedProfitAcrossStoredRecords =
      0;
    let actualProfitAcrossClosedStoredRecords =
      0;

    for (
      const trade
      of this.trades.values()
    ) {
      if (
        trade.status ===
          "validated" ||
        trade.status ===
          "open" ||
        trade.status ===
          "monitoring"
      ) {
        activeStoredRecords +=
          1;
      }

      expectedProfitAcrossStoredRecords +=
        trade.expectedProfit;

      if (
        trade.status !==
        "closed"
      ) {
        continue;
      }

      closedStoredRecords +=
        1;
      actualProfitAcrossClosedStoredRecords +=
        trade.actualProfit ??
        0;
    }

    this.summarySnapshot =
      Object.freeze({
        totalStoredRecords:
          this.trades.size,
        activeStoredRecords,
        closedStoredRecords,
        expectedProfitAcrossStoredRecords,
        actualProfitAcrossClosedStoredRecords,
      });

    return {
      ...this.summarySnapshot,
    };
  }

  getByStatus(
    status:
      PaperTradeStatus,
  ): PaperTrade[] {
    return this.getByStatuses(
      [status],
    );
  }

  getByStatuses(
    statuses:
      readonly PaperTradeStatus[],
  ): PaperTrade[] {
    const acceptedStatuses =
      new Set(
        statuses,
      );

    const matchingTrades:
      PaperTrade[] =
      [];

    for (
      const trade
      of this.trades.values()
    ) {
      if (
        !acceptedStatuses.has(
          trade.status,
        )
      ) {
        continue;
      }

      matchingTrades.push(
        structuredClone(
          trade,
        ),
      );
    }

    return matchingTrades.sort(
      (
        first,
        second,
      ) =>
        second.openedAt -
        first.openedAt,
    );
  }

  update(
    id:
      string,

    changes:
      Partial<PaperTrade>,
  ): PaperTrade | undefined {
    const existingTrade =
      this.trades.get(
        id,
      );

    if (
      !existingTrade
    ) {
      return undefined;
    }

    const updatedTrade:
      PaperTrade = {
      ...existingTrade,
      ...changes,
      id:
        existingTrade.id,
    };

    if (
      this.isEquivalent(
        existingTrade,
        updatedTrade,
      )
    ) {
      return structuredClone(
        existingTrade,
      );
    }

    this.persist(
      updatedTrade,
    );

    return structuredClone(
      updatedTrade,
    );
  }

  countOpenTrades(): number {
    return this.countActiveTrades();
  }

  countActiveTrades(): number {
    let activeTrades = 0;

    for (
      const trade
      of this.trades.values()
    ) {
      if (
        trade.status ===
          "validated" ||
        trade.status ===
          "open" ||
        trade.status ===
          "monitoring"
      ) {
        activeTrades +=
          1;
      }
    }

    return activeTrades;
  }

  /**
   * Monotonic in-process revision used by read-only analytics caches. It
   * changes only after the authoritative trade state changes.
   */
  getRevision(): number {
    return this.revision;
  }

  /**
   * Revision for analytics that consume only terminal settlements. Transient
   * detected/validated/open/monitoring updates must not repeatedly rebuild
   * the complete profitability ledger.
   */
  getSettledRevision(): number {
    return this.settledRevision;
  }

  getDiagnostics():
    PaperTradeStoreDiagnostics {
    const foundation =
      this.store
        .getDiagnostics();

    return {
      persistenceFilePath:
        foundation.filePath,

      restored:
        this.restored,

      restoredAt:
        this.restoredAt,

      trades:
        this.trades.size,

      writes:
        foundation.writes,

      writeFailures:
        foundation.writeFailures,

      malformedRecordsIgnored:
        foundation
          .malformedRecordsIgnored,

      lastError:
        foundation.lastError,
    };
  }

  clear(): void {
    this.store.clear();

    if (
      this.trades.size >
      0
    ) {
      this.trades.clear();

      this.revision +=
        1;

      this.settledRevision +=
        1;

      this.invalidateReadSnapshots();
    }

    this.restored =
      false;

    this.restoredAt =
      null;
  }

  private restore():
    void {
    const records =
      this.store
        .readAll();

    for (
      const trade
      of records
    ) {
      this.trades.set(
        trade.id,
        structuredClone(
          trade,
        ),
      );
    }

    if (
      records.length >
      0
    ) {
      this.revision +=
        1;

      this.settledRevision +=
        1;

      this.invalidateReadSnapshots();

      this.restored =
        true;

      this.restoredAt =
        Date.now();
    }
  }

  private persist(
    trade:
      PaperTrade,
  ): void {
    const previousTrade =
      this.trades.get(
        trade.id,
      );

    this.store.append(
      trade,
    );

    this.trades.set(
      trade.id,
      structuredClone(
        trade,
      ),
    );

    this.revision +=
      1;

    this.invalidateReadSnapshots();

    if (
      trade.status ===
        "closed" ||
      previousTrade?.status ===
        "closed"
    ) {
      this.settledRevision +=
        1;
    }
  }

  private invalidateReadSnapshots(): void {
    this.readOnlySnapshot =
      null;
    this.orderedReadOnlySnapshot =
      null;
    this.summarySnapshot =
      null;
  }

  private isEquivalent(
    first:
      PaperTrade,

    second:
      PaperTrade,
  ): boolean {
    return JSON.stringify(
      first,
    ) ===
      JSON.stringify(
        second,
      );
  }

  private isPaperTrade(
    value:
      unknown,
  ): value is PaperTrade {
    if (
      !this.isRecord(
        value,
      ) ||
      !this.isStrategyAttribution(
        value.strategyAttribution,
      )
    ) {
      return false;
    }

    return (
      (
        value.priceCredibility ===
          undefined ||
        value.priceCredibility ===
          null ||
        this.isPriceCredibilityEvidence(
          value.priceCredibility,
        )
      ) &&
      (
        value.paperExecutionStress ===
          undefined ||
        value.paperExecutionStress ===
          null ||
        this.isPaperExecutionStressEvidence(
          value.paperExecutionStress,
        )
      ) &&
      (
        value.paperVdaTaxWithholding ===
          undefined ||
        value.paperVdaTaxWithholding ===
          null ||
        this.isPaperVdaTaxWithholdingEvidence(
          value.paperVdaTaxWithholding,
        )
      ) &&
      (
        value.capitalConversion ===
          undefined ||
        value.capitalConversion ===
          null ||
        this.isCapitalConversionEvidence(
          value.capitalConversion,
        )
      ) &&
      this.isOptionalNullableFiniteNumber(
        value.quoteCapitalUsed,
      ) &&
      this.isOptionalNullableFiniteNumber(
        value.quoteGrossProfit,
      ) &&
      this.isOptionalNullableFiniteNumber(
        value.quoteTotalFees,
      ) &&
      this.isOptionalNullableFiniteNumber(
        value.quoteNetProfit,
      ) &&
      this.isOptionalNullableFiniteNumber(
        value.quoteTdsWithheld,
      ) &&
      this.isOptionalNullableFiniteNumber(
        value.quoteDeployableCashProfit,
      ) &&
      this.isOptionalNullableFiniteNumber(
        value.tdsWithheld,
      ) &&
      this.isOptionalNullableFiniteNumber(
        value.deployableCashProfit,
      ) &&
      (
        value.executionQuality ===
          undefined ||
        value.executionQuality ===
          null ||
        this.isExecutionQualityEvidence(
          value.executionQuality,
        )
      ) &&
      typeof value.id ===
        "string" &&
      typeof value.market ===
        "string" &&
      typeof value.buyExchange ===
        "string" &&
      typeof value.sellExchange ===
        "string" &&
      [
        "detected",
        "validated",
        "open",
        "monitoring",
        "target-hit",
        "closed",
        "cancelled",
        "failed",
      ].includes(
        String(
          value.status,
        ),
      ) &&
      this.isFiniteNumber(
        value.capital,
      ) &&
      this.isFiniteNumber(
        value.quantity,
      ) &&
      this.isFiniteNumber(
        value.buyPrice,
      ) &&
      this.isFiniteNumber(
        value.sellPrice,
      ) &&
      this.isFiniteNumber(
        value.estimatedFees,
      ) &&
      this.isFiniteNumber(
        value.expectedProfit,
      ) &&
      this.isFiniteNumber(
        value.expectedProfitPercent,
      ) &&
      this.isFiniteNumber(
        value.openedAt,
      ) &&
      this.isNullableFiniteNumber(
        value.closedAt,
      ) &&
      this.isFiniteNumber(
        value.currentPrice,
      ) &&
      this.isFiniteNumber(
        value.currentProfit,
      ) &&
      this.isFiniteNumber(
        value.currentProfitPercent,
      ) &&
      this.isFiniteNumber(
        value.highestProfit,
      ) &&
      this.isFiniteNumber(
        value.lowestProfit,
      ) &&
      this.isFiniteNumber(
        value.lastUpdatedAt,
      ) &&
      this.isNullableFiniteNumber(
        value.actualSellPrice,
      ) &&
      this.isNullableFiniteNumber(
        value.actualProfit,
      ) &&
      this.isNullableFiniteNumber(
        value.actualProfitPercent,
      ) &&
      (
        value.failureReason ===
          null ||
        typeof value.failureReason ===
          "string"
      )
    );
  }

  private isPriceCredibilityEvidence(
    value:
      unknown,
  ): boolean {
    return (
      this.isRecord(
        value,
      ) &&
      value.schemaVersion ===
        1 &&
      value.guard ===
        "CROSS_VENUE_PRICE_CREDIBILITY_V1" &&
      value.outcome ===
        "PASSED" &&
      this.isFiniteNumber(
        value.evaluatedAt,
      ) &&
      typeof value.market ===
        "string" &&
      typeof value.buyExchange ===
        "string" &&
      typeof value.sellExchange ===
        "string" &&
      this.isFiniteNumber(
        value.freshVenueCount,
      ) &&
      Array.isArray(
        value.freshVenues,
      ) &&
      value.freshVenues.every(
        (venue) =>
          typeof venue ===
          "string",
      ) &&
      this.isFiniteNumber(
        value.candidatePriceRatio,
      ) &&
      this.isFiniteNumber(
        value.currentPriceRatio,
      ) &&
      this.isNullableFiniteNumber(
        value.medianMidPrice,
      ) &&
      this.isNullableFiniteNumber(
        value.buyDeviationFromMedianPercent,
      ) &&
      this.isNullableFiniteNumber(
        value.sellDeviationFromMedianPercent,
      ) &&
      this.isFiniteNumber(
        value.maximumPriceRatio,
      ) &&
      this.isFiniteNumber(
        value.maximumCandidatePriceDriftPercent,
      ) &&
      this.isFiniteNumber(
        value.maximumConsensusDeviationPercent,
      ) &&
      Array.isArray(
        value.reasons,
      ) &&
      value.reasons.every(
        (reason) =>
          typeof reason ===
          "string",
      )
    );
  }

  private isExecutionQualityEvidence(
    value:
      unknown,
  ): boolean {
    return (
      this.isRecord(
        value,
      ) &&
      value.schemaVersion ===
        1 &&
      this.isFiniteNumber(
        value.buyRequestedPrice,
      ) &&
      this.isFiniteNumber(
        value.buyAverageFillPrice,
      ) &&
      this.isFiniteNumber(
        value.sellRequestedPrice,
      ) &&
      this.isFiniteNumber(
        value.sellAverageFillPrice,
      ) &&
      this.isFiniteNumber(
        value.buyAdverseSlippagePercent,
      ) &&
      this.isFiniteNumber(
        value.sellAdverseSlippagePercent,
      ) &&
      this.isFiniteNumber(
        value.combinedAdverseSlippagePercent,
      )
    );
  }

  private isCapitalConversionEvidence(
    value:
      unknown,
  ): boolean {
    return (
      this.isRecord(
        value,
      ) &&
      value.schemaVersion ===
        1 &&
      value.accountCurrency ===
        "INR" &&
      typeof value.marketQuoteAsset ===
        "string" &&
      value.marketQuoteAsset
        .trim()
        .length >
        0 &&
      this.isFiniteNumber(
        value.requestedCapitalInr,
      ) &&
      value.requestedCapitalInr >
        0 &&
      this.isFiniteNumber(
        value.allocatedQuoteCapital,
      ) &&
      value.allocatedQuoteCapital >
        0 &&
      this.isFiniteNumber(
        value.quoteToInrRate,
      ) &&
      value.quoteToInrRate >
        0 &&
      typeof value.inrToQuoteEvidenceId ===
        "string" &&
      value.inrToQuoteEvidenceId
        .trim()
        .length >
        0 &&
      typeof value.quoteToInrEvidenceId ===
        "string" &&
      value.quoteToInrEvidenceId
        .trim()
        .length >
        0 &&
      this.isFiniteNumber(
        value.generatedAt,
      ) &&
      this.isFiniteNumber(
        value.expiresAt,
      ) &&
      value.expiresAt >=
        value.generatedAt
    );
  }

  private isPaperExecutionStressEvidence(
    value:
      unknown,
  ): boolean {
    if (
      !this.isRecord(
        value,
      ) ||
      value.schemaVersion !==
        1 ||
      value.guard !==
        "STRATEGY_ONE_PAPER_STRESS_V1" ||
      value.outcome !==
        "PASSED" ||
      value.paperOnly !==
        true ||
      value.liveExecutionAllowed !==
        false ||
      value.orderSubmissionAllowed !==
        false ||
      !Array.isArray(
        value.reasons,
      ) ||
      !value.reasons.every(
        (reason) =>
          typeof reason ===
          "string",
      )
    ) {
      return false;
    }

    return [
      "evaluatedAt",
      "sourceOpportunityAgeMs",
      "buyBookTimestamp",
      "sellBookTimestamp",
      "timestampSkewMs",
      "quantity",
      "buyFillPercent",
      "sellFillPercent",
      "buyVwap",
      "sellVwap",
      "buyLimitPrice",
      "sellLimitPrice",
      "combinedDepthSlippagePercent",
      "adverseMoveReservePercentPerLeg",
      "tradingFees",
      "safetyBuffer",
      "postStressNetProfit",
      "postStressNetProfitPercent",
      "minimumNetProfitPercent",
    ].every(
      (key) =>
        this.isFiniteNumber(
          value[key],
        ),
    );
  }

  private isPaperVdaTaxWithholdingEvidence(
    value:
      unknown,
  ): boolean {
    if (
      !this.isRecord(
        value,
      ) ||
      value.schemaVersion !==
        1 ||
      value.policy !==
        "MODELED_SECTION_194S_V1" ||
      value.thresholdTreatment !==
        "ASSUMED_EXCEEDED_FOR_CONSERVATIVE_PAPER" ||
      value.ratePercent !==
        1 ||
      value.claimableTaxCredit !==
        true ||
      value.economicProfitDeduction !==
        0 ||
      value.paperOnly !==
        true ||
      value.liveExecutionAllowed !==
        false ||
      value.orderSubmissionAllowed !==
        false ||
      typeof value.currency !==
        "string" ||
      !value.currency.trim() ||
      !this.isFiniteNumber(
        value.totalWithheld,
      ) ||
      value.totalWithheld <
        0 ||
      !this.isFiniteNumber(
        value.generatedAt,
      ) ||
      !Array.isArray(
        value.legs,
      )
    ) {
      return false;
    }

    return value.legs.every(
      (
        leg:
          unknown,
      ) =>
        this.isRecord(
          leg,
        ) &&
        [
          "BUY",
          "SELL",
        ].includes(
          String(
            leg.side,
          ),
        ) &&
        typeof leg.exchange ===
          "string" &&
        typeof leg.applicable ===
          "boolean" &&
        typeof leg.basis ===
          "string" &&
        typeof leg.reason ===
          "string" &&
        this.isFiniteNumber(
          leg.consideration,
        ) &&
        this.isFiniteNumber(
          leg.ratePercent,
        ) &&
        this.isFiniteNumber(
          leg.withheld,
        ),
    );
  }

  private isStrategyAttribution(
    value:
      unknown,
  ): boolean {
    if (
      !this.isRecord(
        value,
      )
    ) {
      return false;
    }

    if (
      value.attributionStatus ===
        "UNATTRIBUTED_LEGACY"
    ) {
      return (
        value.strategyId ===
          null &&
        value.signalId ===
          null &&
        value.intentId ===
          null
      );
    }

    return (
      value.attributionStatus ===
        "ATTRIBUTED" &&
      typeof value.strategyId ===
        "string" &&
      value.strategyId
        .trim()
        .length >
        0 &&
      typeof value.signalId ===
        "string" &&
      value.signalId
        .trim()
        .length >
        0 &&
      (
        value.intentId ===
          null ||
        (
          typeof value.intentId ===
            "string" &&
          value.intentId
            .trim()
            .length >
            0
        )
      )
    );
  }

  private isFiniteNumber(
    value:
      unknown,
  ): value is number {
    return (
      typeof value ===
        "number" &&
      Number.isFinite(
        value,
      )
    );
  }

  private isNullableFiniteNumber(
    value:
      unknown,
  ): value is
    number | null {
    return (
      value ===
        null ||
      this.isFiniteNumber(
        value,
      )
    );
  }

  private isOptionalNullableFiniteNumber(
    value:
      unknown,
  ): value is
    number | null | undefined {
    return (
      value ===
        undefined ||
      this.isNullableFiniteNumber(
        value,
      )
    );
  }

  private isRecord(
    value:
      unknown,
  ): value is
    Record<string, unknown> {
    return (
      typeof value ===
        "object" &&
      value !==
        null &&
      !Array.isArray(
        value,
      )
    );
  }
}

function comparePaperTradeHistoryOrder(
  first:
    PaperTrade,

  second:
    PaperTrade,
): number {
  const timestampDifference =
    second.openedAt -
    first.openedAt;

  return timestampDifference !==
    0
    ? timestampDifference
    : second.id.localeCompare(
        first.id,
      );
}

function isStrictlyAfterCursor(
  trade:
    PaperTrade,

  cursor:
    PaperTradePageCursor,
): boolean {
  return trade.openedAt <
    cursor.openedAt ||
    (
      trade.openedAt ===
        cursor.openedAt &&
      trade.id.localeCompare(
        cursor.id,
      ) <
        0
    );
}

function findFirstTradeAfterCursor(
  trades:
    readonly PaperTrade[],

  cursor:
    PaperTradePageCursor,
): number {
  let lower =
    0;
  let upper =
    trades.length;

  while (
    lower <
    upper
  ) {
    const middle =
      lower +
      Math.floor(
        (upper - lower) /
          2,
      );

    if (
      isStrictlyAfterCursor(
        trades[middle],
        cursor,
      )
    ) {
      upper =
        middle;
    } else {
      lower =
        middle +
        1;
    }
  }

  return lower;
}

export const paperTradeStore =
  new PaperTradeStore();
