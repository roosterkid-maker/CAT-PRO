export type OpportunityRejectionStage =
  | "EVALUATOR"
  | "MARKET_DATA"
  | "SPREAD"
  | "NET_PROFIT"
  | "QUANTITY"
  | "LIQUIDITY"
  | "FRESHNESS"
  | "FEES"
  | "SPREAD_ANALYSIS"
  | "QUOTE_INTEGRITY"
  | "EXECUTION_ANALYSIS";

export type OpportunityRejectionCode =
  | "STALE_BUY_QUOTE"
  | "STALE_SELL_QUOTE"
  | "STALE_BOTH_QUOTES"
  | "PAIR_NOT_SYNCHRONIZED"
  | "PRICE_RESOLUTION_FAILED"
  | "BUY_FEE_MISSING"
  | "SELL_FEE_MISSING"
  | "INVALID_BUY_PRICE"
  | "INVALID_SELL_PRICE"
  | "INVALID_MARKET_DATA"
  | "SPREAD_BELOW_MINIMUM"
  | "NET_PROFIT_BELOW_MINIMUM"
  | "INVALID_REQUIRED_QUANTITY"
  | "ACCOUNT_CAPITAL_CONVERSION_UNAVAILABLE"
  | "INVALID_EXECUTABLE_QUANTITY"
  | "INSUFFICIENT_LIQUIDITY"
  | "STALE_EXECUTION_QUOTES"
  | "UNACCEPTABLE_FEES"
  | "UNACCEPTABLE_SPREAD"
  | "QUOTE_INTEGRITY_FAILED"
  | "EXECUTION_NOT_ALLOWED"
  | "UNKNOWN";

export interface OpportunityRejectionInput {
  stage:
    OpportunityRejectionStage;

  code:
    OpportunityRejectionCode;

  reason:
    string;

  market:
    string;

  buyExchange:
    string;

  sellExchange:
    string;

  buyPrice?:
    number | null;

  sellPrice?:
    number | null;

  rawSpread?:
    number | null;

  rawSpreadPercent?:
    number | null;

  estimatedFees?:
    number | null;

  netProfit?:
    number | null;

  netProfitPercent?:
    number | null;

  minimumSpreadPercent?:
    number | null;

  minimumNetProfitPercent?:
    number | null;

  requestedQuantity?:
    number | null;

  availableQuantity?:
    number | null;

  executableQuantity?:
    number | null;

  liquidityPercent?:
    number | null;

  buyQuoteAgeMs?:
    number | null;

  sellQuoteAgeMs?:
    number | null;

  maximumQuoteAgeMs?:
    number | null;

  overallScore?:
    number | null;

  metadata?:
    Readonly<
      Record<
        string,
        unknown
      >
    >;
}

export interface OpportunityRejectionRecord {
  readonly id:
    string;

  readonly stage:
    OpportunityRejectionStage;

  readonly code:
    OpportunityRejectionCode;

  readonly reason:
    string;

  readonly market:
    string;

  readonly buyExchange:
    string;

  readonly sellExchange:
    string;

  readonly buyPrice:
    number | null;

  readonly sellPrice:
    number | null;

  readonly rawSpread:
    number | null;

  readonly rawSpreadPercent:
    number | null;

  readonly estimatedFees:
    number | null;

  readonly netProfit:
    number | null;

  readonly netProfitPercent:
    number | null;

  readonly minimumSpreadPercent:
    number | null;

  readonly minimumNetProfitPercent:
    number | null;

  readonly requestedQuantity:
    number | null;

  readonly availableQuantity:
    number | null;

  readonly executableQuantity:
    number | null;

  readonly liquidityPercent:
    number | null;

  readonly buyQuoteAgeMs:
    number | null;

  readonly sellQuoteAgeMs:
    number | null;

  readonly maximumQuoteAgeMs:
    number | null;

  readonly overallScore:
    number | null;

  readonly metadata:
    Readonly<
      Record<
        string,
        unknown
      >
    >;

  readonly rejectedAt:
    number;
}

export interface OpportunityRejectionSummary {
  totalStored:
    number;

  capacity:
    number;

  byStage:
    Partial<
      Record<
        OpportunityRejectionStage,
        number
      >
    >;

  byCode:
    Partial<
      Record<
        OpportunityRejectionCode,
        number
      >
    >;

  latestRejectionAt:
    number | null;
}

const DEFAULT_CAPACITY =
  500;

export class OpportunityRejectionStore {
  private readonly records:
    OpportunityRejectionRecord[] =
    [];

  /*
   * Logical start of the bounded window. Advancing an index is O(1), unlike
   * shifting the entire array for every rejected route once capacity is full.
   * The backing array is compacted only once per capacity worth of evictions.
   */
  private recordStartIndex =
    0;

  private nextRecordSequence =
    1;

  constructor(
    private readonly capacity:
      number =
        DEFAULT_CAPACITY,
  ) {
    if (
      !Number.isSafeInteger(
        capacity,
      ) ||
      capacity <=
        0
    ) {
      throw new Error(
        "Opportunity rejection store capacity must be a positive integer.",
      );
    }
  }

  record(
    input:
      OpportunityRejectionInput,
  ): OpportunityRejectionRecord {
    const record =
      this.createRecord(
        input,
      );

    this.records.push(
      record,
    );

    this.trimToCapacity();

    return structuredClone(
      record,
    );
  }

  /**
   * Internal trading-hot-path variant. Engine callers do not consume the
   * returned record, so avoid an otherwise unused structured clone while
   * retaining the exact same bounded diagnostic evidence.
   */
  recordHotPath(
    input:
      OpportunityRejectionInput,
  ): void {
    const record =
      this.createRecord(
        input,
      );

    this.records.push(
      record,
    );

    this.trimToCapacity();
  }

  getRecent(
    limit =
      50,
  ): OpportunityRejectionRecord[] {
    const normalizedLimit =
      this.normalizeLimit(
        limit,
      );

    return this.records
      .slice(
        Math.max(
          this.recordStartIndex,
          this.records.length -
            normalizedLimit,
        ),
      )
      .reverse()
      .map(
        (
          record,
        ) =>
          structuredClone(
            record,
          ),
      );
  }

  getAll():
    OpportunityRejectionRecord[] {
    return this.records
      .slice(
        this.recordStartIndex,
      )
      .map(
        (
          record,
        ) =>
          structuredClone(
            record,
          ),
      );
  }

  getByStage(
    stage:
      OpportunityRejectionStage,

    limit =
      50,
  ): OpportunityRejectionRecord[] {
    const normalizedLimit =
      this.normalizeLimit(
        limit,
      );

    return this.records
      .slice(
        this.recordStartIndex,
      )
      .filter(
        (
          record,
        ) =>
          record.stage ===
          stage,
      )
      .slice(
        -normalizedLimit,
      )
      .reverse()
      .map(
        (
          record,
        ) =>
          structuredClone(
            record,
          ),
      );
  }

  getByCode(
    code:
      OpportunityRejectionCode,

    limit =
      50,
  ): OpportunityRejectionRecord[] {
    const normalizedLimit =
      this.normalizeLimit(
        limit,
      );

    return this.records
      .slice(
        this.recordStartIndex,
      )
      .filter(
        (
          record,
        ) =>
          record.code ===
          code,
      )
      .slice(
        -normalizedLimit,
      )
      .reverse()
      .map(
        (
          record,
        ) =>
          structuredClone(
            record,
          ),
      );
  }

  getSummary():
    OpportunityRejectionSummary {
    const byStage:
      OpportunityRejectionSummary["byStage"] =
        {};

    const byCode:
      OpportunityRejectionSummary["byCode"] =
        {};

    for (
      let index =
        this.recordStartIndex;
      index <
        this.records.length;
      index +=
        1
    ) {
      const record =
        this.records[index];

      if (
        !record
      ) {
        continue;
      }
      byStage[
        record.stage
      ] =
        (
          byStage[
            record.stage
          ] ??
          0
        ) +
        1;

      byCode[
        record.code
      ] =
        (
          byCode[
            record.code
          ] ??
          0
        ) +
        1;
    }

    const latest =
      this.records[
        this.records.length -
          1
      ];

    return {
      totalStored:
        this.size(),

      capacity:
        this.capacity,

      byStage,

      byCode,

      latestRejectionAt:
        latest
          ?.rejectedAt ??
        null,
    };
  }

  size():
    number {
    return this.records
      .length -
      this.recordStartIndex;
  }

  clear():
    void {
    this.records.length =
      0;

    this.recordStartIndex =
      0;

  }

  private createRecord(
    input:
      OpportunityRejectionInput,
  ): OpportunityRejectionRecord {
    const market =
      input.market
        .trim()
        .toUpperCase();

    const buyExchange =
      input.buyExchange
        .trim()
        .toLowerCase();

    const sellExchange =
      input.sellExchange
        .trim()
        .toLowerCase();

    const reason =
      input.reason
        .trim();

    if (
      !market
    ) {
      throw new Error(
        "Opportunity rejection record requires a market.",
      );
    }

    if (
      !buyExchange
    ) {
      throw new Error(
        "Opportunity rejection record requires a buy exchange.",
      );
    }

    if (
      !sellExchange
    ) {
      throw new Error(
        "Opportunity rejection record requires a sell exchange.",
      );
    }

    if (
      !reason
    ) {
      throw new Error(
        "Opportunity rejection record requires a reason.",
      );
    }

    const rejectedAt =
      Date.now();

    return {
      id:
        `${rejectedAt.toString(36)}-${(
          this.nextRecordSequence++
        ).toString(36)}`,

      stage:
        input.stage,

      code:
        input.code,

      reason,

      market,

      buyExchange,

      sellExchange,

      buyPrice:
        this.normalizeOptionalNumber(
          input.buyPrice,
        ),

      sellPrice:
        this.normalizeOptionalNumber(
          input.sellPrice,
        ),

      rawSpread:
        this.normalizeOptionalNumber(
          input.rawSpread,
        ),

      rawSpreadPercent:
        this.normalizeOptionalNumber(
          input.rawSpreadPercent,
        ),

      estimatedFees:
        this.normalizeOptionalNumber(
          input.estimatedFees,
        ),

      netProfit:
        this.normalizeOptionalNumber(
          input.netProfit,
        ),

      netProfitPercent:
        this.normalizeOptionalNumber(
          input.netProfitPercent,
        ),

      minimumSpreadPercent:
        this.normalizeOptionalNumber(
          input.minimumSpreadPercent,
        ),

      minimumNetProfitPercent:
        this.normalizeOptionalNumber(
          input.minimumNetProfitPercent,
        ),

      requestedQuantity:
        this.normalizeOptionalNumber(
          input.requestedQuantity,
        ),

      availableQuantity:
        this.normalizeOptionalNumber(
          input.availableQuantity,
        ),

      executableQuantity:
        this.normalizeOptionalNumber(
          input.executableQuantity,
        ),

      liquidityPercent:
        this.normalizeOptionalNumber(
          input.liquidityPercent,
        ),

      buyQuoteAgeMs:
        this.normalizeOptionalNumber(
          input.buyQuoteAgeMs,
        ),

      sellQuoteAgeMs:
        this.normalizeOptionalNumber(
          input.sellQuoteAgeMs,
        ),

      maximumQuoteAgeMs:
        this.normalizeOptionalNumber(
          input.maximumQuoteAgeMs,
        ),

      overallScore:
        this.normalizeOptionalNumber(
          input.overallScore,
        ),

      metadata:
        input.metadata
          ? structuredClone(
              input.metadata,
            )
          : {},

      rejectedAt:
        rejectedAt,
    };
  }

  private trimToCapacity():
    void {
    const overflow =
      this.size() -
      this.capacity;

    if (
      overflow <=
      0
    ) {
      return;
    }

    this.recordStartIndex +=
      overflow;

    if (
      this.recordStartIndex >=
      this.capacity
    ) {
      this.records.splice(
        0,
        this.recordStartIndex,
      );

      this.recordStartIndex =
        0;
    }
  }

  private normalizeLimit(
    limit:
      number,
  ): number {
    if (
      !Number.isSafeInteger(
        limit,
      ) ||
      limit <=
        0
    ) {
      throw new Error(
        "Opportunity rejection query limit must be a positive integer.",
      );
    }

    return Math.min(
      limit,
      this.capacity,
    );
  }

  private normalizeOptionalNumber(
    value:
      number |
      null |
      undefined,
  ): number | null {
    if (
      value ===
        undefined ||
      value ===
        null ||
      !Number.isFinite(
        value,
      )
    ) {
      return null;
    }

    return value;
  }
}

export const opportunityRejectionStore =
  new OpportunityRejectionStore();
