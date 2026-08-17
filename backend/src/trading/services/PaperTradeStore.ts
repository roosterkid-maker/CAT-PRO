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
    return Array.from(
      this.trades.values(),
    )
      .sort(
        (
          first,
          second,
        ) =>
          second.openedAt -
          first.openedAt,
      )
      .map(
        (
          trade,
        ) =>
          structuredClone(
            trade,
          ),
      );
  }

  /**
   * Fast internal snapshot for trusted synchronous analytics. The returned
   * array is detached from the store, but its trade objects are immutable
   * snapshots owned by the store and must never be mutated by the caller.
   * Public/API consumers must continue to use getAll(), which deep-clones.
   */
  getAllForReadOnlyAggregation(): readonly PaperTrade[] {
    return Array.from(
      this.trades.values(),
    );
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

export const paperTradeStore =
  new PaperTradeStore();
