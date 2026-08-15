import {
  randomUUID,
} from "node:crypto";

import {
  getExchangeFees,
} from "../../arbitrage/config/fees";

import {
  vwapCalculator,
} from "../../orderbook/calculators/VWAPCalculator";

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import type {
  ShadowDispatchRecord,
} from "../models/ShadowExecutionDispatcher";

import type {
  ShadowTradeOutcomeConfig,
  ShadowTradeOutcomeDiagnostics,
  ShadowTradeOutcomeRecord,
  ShadowTradeOutcomeSample,
} from "../models/ShadowTradeOutcome";

import {
  shadowExecutionDispatcherService,
} from "./ShadowExecutionDispatcherService";

import {
  cloneStrategyAttribution,
} from "../../strategies/models/StrategyAttribution";

const DEFAULT_CONFIG:
  ShadowTradeOutcomeConfig = {
  /*
   * Measure whether the arbitrage remains
   * realistically executable after shadow
   * dispatch.
   */
  trackingWindowMs:
    12_000,

  maximumBookAgeMs:
    3_000,

  minimumProfitableSamples:
    2,

  /*
   * Current observed profit must retain at
   * least 25% of the profit predicted when
   * shadow dispatched.
   */
  minimumProfitRetentionPercent:
    25,

  maximumHistory:
    500,
};

export class ShadowTradeOutcomeTrackerService {
  private readonly config:
    ShadowTradeOutcomeConfig;

  private readonly records =
    new Map<
      string,
      ShadowTradeOutcomeRecord
    >();

  private readonly trackedDispatchIds =
    new Set<string>();

  constructor(
    config:
      Partial<ShadowTradeOutcomeConfig> = {},
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.validateConfig();
  }

  /*
   * Called once per authoritative automation
   * snapshot.
   *
   * 1. Discover newly SHADOW_DISPATCHED records.
   * 2. Register them for outcome tracking.
   * 3. Sample current real market order books.
   * 4. Finalize records after tracking window.
   *
   * Absolutely no execution state is mutated.
   */
  process(
    now =
      Date.now(),
  ): void {
    this.discoverNewDispatches(
      now,
    );

    for (
      const record
      of this.records.values()
    ) {
      if (
        record.status !==
        "TRACKING"
      ) {
        continue;
      }

      this.sample(
        record,
        now,
      );

      if (
        now >=
        record.deadlineAt
      ) {
        this.finalize(
          record,
          now,
        );
      }
    }

    this.trimHistory();
  }

  getRecord(
    id:
      string,
  ): ShadowTradeOutcomeRecord | null {
    const record =
      this.records.get(
        id,
      );

    return record
      ? structuredClone(
          record,
        )
      : null;
  }

  getByDispatch(
    shadowDispatchId:
      string,
  ): ShadowTradeOutcomeRecord | null {
    const record =
      Array.from(
        this.records.values(),
      )
        .find(
          (
            item,
          ) =>
            item.shadowDispatchId ===
            shadowDispatchId,
        );

    return record
      ? structuredClone(
          record,
        )
      : null;
  }

  getDiagnostics():
    ShadowTradeOutcomeDiagnostics {
    const records =
      Array.from(
        this.records.values(),
      )
        .sort(
          (
            first,
            second,
          ) =>
            second.dispatchedAt -
            first.dispatchedAt,
        )
        .map(
          (
            record,
          ) =>
            structuredClone(
              record,
            ),
        );

    const completedSuccess =
      records.filter(
        (
          record,
        ) =>
          record.status ===
          "SUCCESS",
      );

    const successProfits =
      completedSuccess
        .map(
          (
            record,
          ) =>
            record.averageObservedNetProfit,
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

    return {
      generatedAt:
        Date.now(),

      mode:
        "SHADOW",

      executionAllowed:
        false,

      config:
        structuredClone(
          this.config,
        ),

      trackedDispatches:
        records.length,

      tracking:
        this.countStatus(
          records,
          "TRACKING",
        ),

      success:
        this.countStatus(
          records,
          "SUCCESS",
        ),

      failed:
        this.countStatus(
          records,
          "FAILED",
        ),

      dataUnavailable:
        this.countStatus(
          records,
          "DATA_UNAVAILABLE",
        ),

      totalSamples:
        records.reduce(
          (
            total,
            record,
          ) =>
            total +
            record.totalSamples,
          0,
        ),

      profitableSamples:
        records.reduce(
          (
            total,
            record,
          ) =>
            total +
            record.profitableSamples,
          0,
        ),

      executableSamples:
        records.reduce(
          (
            total,
            record,
          ) =>
            total +
            record.executableSamples,
          0,
        ),

      averageSuccessNetProfit:
        successProfits.length >
        0
          ? this.round(
              successProfits.reduce(
                (
                  total,
                  value,
                ) =>
                  total +
                  value,
                0,
              ) /
                successProfits.length,

              12,
            )
          : 0,

      records,
    };
  }

  /**
   * Internal zero-copy analytics traversal. The visitor must treat records as
   * immutable; mutation ownership remains in this tracker. This avoids cloning
   * hundreds of nested sample arrays merely to aggregate readiness counters.
   */
  forEachAnalyticsRecord(
    visitor:
      (
        record:
          ShadowTradeOutcomeRecord,
      ) => void,
  ): void {
    for (
      const record
      of this.records.values()
    ) {
      visitor(
        record,
      );
    }
  }

  private discoverNewDispatches(
    now:
      number,
  ): void {
    const dispatches =
      shadowExecutionDispatcherService
        .getDiagnostics()
        .records;

    for (
      const dispatch
      of dispatches
    ) {
      if (
        dispatch.status !==
        "SHADOW_DISPATCHED"
      ) {
        continue;
      }

      if (
        this.trackedDispatchIds
          .has(
            dispatch.id,
          )
      ) {
        continue;
      }

      const record =
        this.createRecord(
          dispatch,
          now,
        );

      this.records.set(
        record.id,
        record,
      );

      this.trackedDispatchIds
        .add(
          dispatch.id,
        );
    }
  }

  private createRecord(
    dispatch:
      ShadowDispatchRecord,

    now:
      number,
  ): ShadowTradeOutcomeRecord {
    const latest =
      dispatch
        .qualification
        .candidate
        .latest;

    const executableQuantity =
      Math.max(
        0,
        latest.executableQuantity,
      );

    const expectedTotalNetProfit =
      latest.netProfit *
      executableQuantity;

    return {
      strategyAttribution:
        cloneStrategyAttribution(
          dispatch
            .strategyAttribution,
        ),

      id:
        randomUUID(),

      shadowDispatchId:
        dispatch.id,

      candidateGeneration:
        dispatch.candidateGeneration,

      candidateKey:
        dispatch.candidateKey,

      market:
        dispatch.market,

      buyExchange:
        dispatch.buyExchange,

      sellExchange:
        dispatch.sellExchange,

      status:
        "TRACKING",

      dispatchedAt:
        dispatch.dispatchedAt,

      trackingStartedAt:
        now,

      deadlineAt:
        now +
        this.config.trackingWindowMs,

      completedAt:
        null,

      executableQuantity,

      predicted: {
        buyPrice:
          latest.buyPrice,

        sellPrice:
          latest.sellPrice,

        netProfitPerUnit:
          latest.netProfit,

        netProfitPercent:
          latest.netProfitPercent,

        expectedTotalNetProfit:
          this.round(
            expectedTotalNetProfit,
            12,
          ),
      },

      samples: [],

      totalSamples:
        0,

      freshSamples:
        0,

      executableSamples:
        0,

      profitableSamples:
        0,

      bestObservedNetProfit:
        null,

      worstObservedNetProfit:
        null,

      averageObservedNetProfit:
        null,

      finalReason:
        null,
    };
  }

  private sample(
    record:
      ShadowTradeOutcomeRecord,

    now:
      number,
  ): void {
    /*
     * Avoid multiple samples for the exact
     * same millisecond/process call.
     */
    const previous =
      record.samples[
        record.samples.length -
        1
      ];

    if (
      previous &&
      previous.observedAt ===
        now
    ) {
      return;
    }

    const buyBook =
      orderBookService
        .get(
          record.buyExchange,
          record.market,
        );

    const sellBook =
      orderBookService
        .get(
          record.sellExchange,
          record.market,
        );

    const buyBookAgeMs =
      buyBook
        ? Math.max(
            0,
            now -
              buyBook.timestamp,
          )
        : null;

    const sellBookAgeMs =
      sellBook
        ? Math.max(
            0,
            now -
              sellBook.timestamp,
          )
        : null;

    const booksFresh =
      buyBook !==
        null &&
      sellBook !==
        null &&
      buyBookAgeMs !==
        null &&
      sellBookAgeMs !==
        null &&
      buyBookAgeMs <=
        this.config.maximumBookAgeMs &&
      sellBookAgeMs <=
        this.config.maximumBookAgeMs;

    if (
      !buyBook ||
      !sellBook
    ) {
      this.pushSample(
        record,
        {
          sequence:
            record.samples.length +
            1,

          observedAt:
            now,

          buyBookAgeMs,

          sellBookAgeMs,

          booksFresh:
            false,

          buyFillPercent:
            0,

          sellFillPercent:
            0,

          fullyExecutable:
            false,

          buyVWAP:
            null,

          sellVWAP:
            null,

          buyNotional:
            null,

          sellNotional:
            null,

          grossProfit:
            null,

          buyFee:
            null,

          sellFee:
            null,

          totalFees:
            null,

          netProfit:
            null,

          netProfitPercent:
            null,

          profitable:
            false,

          profitRetentionPercent:
            null,

          reason:
            "One or both order books are unavailable.",
        },
      );

      return;
    }

    if (
      !booksFresh
    ) {
      this.pushSample(
        record,
        {
          sequence:
            record.samples.length +
            1,

          observedAt:
            now,

          buyBookAgeMs,

          sellBookAgeMs,

          booksFresh:
            false,

          buyFillPercent:
            0,

          sellFillPercent:
            0,

          fullyExecutable:
            false,

          buyVWAP:
            null,

          sellVWAP:
            null,

          buyNotional:
            null,

          sellNotional:
            null,

          grossProfit:
            null,

          buyFee:
            null,

          sellFee:
            null,

          totalFees:
            null,

          netProfit:
            null,

          netProfitPercent:
            null,

          profitable:
            false,

          profitRetentionPercent:
            null,

          reason:
            "One or both order books exceed the shadow outcome freshness limit.",
        },
      );

      return;
    }

    if (
      !Number.isFinite(
        record.executableQuantity,
      ) ||
      record.executableQuantity <=
        0
    ) {
      this.pushSample(
        record,
        {
          sequence:
            record.samples.length +
            1,

          observedAt:
            now,

          buyBookAgeMs,

          sellBookAgeMs,

          booksFresh:
            true,

          buyFillPercent:
            0,

          sellFillPercent:
            0,

          fullyExecutable:
            false,

          buyVWAP:
            null,

          sellVWAP:
            null,

          buyNotional:
            null,

          sellNotional:
            null,

          grossProfit:
            null,

          buyFee:
            null,

          sellFee:
            null,

          totalFees:
            null,

          netProfit:
            null,

          netProfitPercent:
            null,

          profitable:
            false,

          profitRetentionPercent:
            null,

          reason:
            "Shadow dispatch does not contain a positive executable quantity.",
        },
      );

      return;
    }

    const buyVWAP =
      vwapCalculator
        .calculate(
          buyBook.asks,
          record.executableQuantity,
        );

    const sellVWAP =
      vwapCalculator
        .calculate(
          sellBook.bids,
          record.executableQuantity,
        );

    const fullyExecutable =
      !buyVWAP.partialFill &&
      !sellVWAP.partialFill &&
      buyVWAP.filledQuantity >=
        record.executableQuantity &&
      sellVWAP.filledQuantity >=
        record.executableQuantity;

    if (
      !fullyExecutable
    ) {
      this.pushSample(
        record,
        {
          sequence:
            record.samples.length +
            1,

          observedAt:
            now,

          buyBookAgeMs,

          sellBookAgeMs,

          booksFresh:
            true,

          buyFillPercent:
            this.round(
              buyVWAP.fillPercent,
              4,
            ),

          sellFillPercent:
            this.round(
              sellVWAP.fillPercent,
              4,
            ),

          fullyExecutable:
            false,

          buyVWAP:
            buyVWAP.averagePrice >
            0
              ? buyVWAP.averagePrice
              : null,

          sellVWAP:
            sellVWAP.averagePrice >
            0
              ? sellVWAP.averagePrice
              : null,

          buyNotional:
            buyVWAP.totalCost,

          sellNotional:
            sellVWAP.totalCost,

          grossProfit:
            null,

          buyFee:
            null,

          sellFee:
            null,

          totalFees:
            null,

          netProfit:
            null,

          netProfitPercent:
            null,

          profitable:
            false,

          profitRetentionPercent:
            null,

          reason:
            "Current order-book depth cannot fully execute the original shadow quantity on both exchanges.",
        },
      );

      return;
    }

    const buyFees =
      getExchangeFees(
        record.buyExchange,
        record.market,
      );

    const sellFees =
      getExchangeFees(
        record.sellExchange,
        record.market,
      );

    const buyNotional =
      buyVWAP.totalCost;

    const sellNotional =
      sellVWAP.totalCost;

    const grossProfit =
      sellNotional -
      buyNotional;

    const buyFee =
      buyNotional *
      (
        buyFees.takerPercent /
        100
      );

    const sellFee =
      sellNotional *
      (
        sellFees.takerPercent /
        100
      );

    const totalFees =
      buyFee +
      sellFee;

    const netProfit =
      grossProfit -
      totalFees;

    const netProfitPercent =
      buyNotional >
      0
        ? (
            netProfit /
            buyNotional
          ) *
          100
        : 0;

    const expectedProfit =
      record
        .predicted
        .expectedTotalNetProfit;

    const profitRetentionPercent =
      expectedProfit >
      0
        ? (
            netProfit /
            expectedProfit
          ) *
          100
        : null;

    const profitable =
      netProfit >
        0 &&
      (
        profitRetentionPercent ===
          null ||
        profitRetentionPercent >=
          this.config
            .minimumProfitRetentionPercent
      );

    this.pushSample(
      record,
      {
        sequence:
          record.samples.length +
          1,

        observedAt:
          now,

        buyBookAgeMs,

        sellBookAgeMs,

        booksFresh:
          true,

        buyFillPercent:
          this.round(
            buyVWAP.fillPercent,
            4,
          ),

        sellFillPercent:
          this.round(
            sellVWAP.fillPercent,
            4,
          ),

        fullyExecutable:
          true,

        buyVWAP:
          this.round(
            buyVWAP.averagePrice,
            12,
          ),

        sellVWAP:
          this.round(
            sellVWAP.averagePrice,
            12,
          ),

        buyNotional:
          this.round(
            buyNotional,
            12,
          ),

        sellNotional:
          this.round(
            sellNotional,
            12,
          ),

        grossProfit:
          this.round(
            grossProfit,
            12,
          ),

        buyFee:
          this.round(
            buyFee,
            12,
          ),

        sellFee:
          this.round(
            sellFee,
            12,
          ),

        totalFees:
          this.round(
            totalFees,
            12,
          ),

        netProfit:
          this.round(
            netProfit,
            12,
          ),

        netProfitPercent:
          this.round(
            netProfitPercent,
            6,
          ),

        profitable,

        profitRetentionPercent:
          profitRetentionPercent ===
          null
            ? null
            : this.round(
                profitRetentionPercent,
                4,
              ),

        reason:
          profitable
            ? "Current fresh depth remains fully executable and profitable after taker fees."
            : "Current depth is executable, but shadow profitability did not meet the configured retention gate.",
      },
    );
  }

  private pushSample(
    record:
      ShadowTradeOutcomeRecord,

    sample:
      ShadowTradeOutcomeSample,
  ): void {
    record.samples.push(
      sample,
    );

    record.totalSamples +=
      1;

    if (
      sample.booksFresh
    ) {
      record.freshSamples +=
        1;
    }

    if (
      sample.fullyExecutable
    ) {
      record.executableSamples +=
        1;
    }

    if (
      sample.profitable
    ) {
      record.profitableSamples +=
        1;
    }

    const observedProfits =
      record.samples
        .map(
          (
            item,
          ) =>
            item.netProfit,
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

    if (
      observedProfits.length >
      0
    ) {
      record.bestObservedNetProfit =
        this.round(
          Math.max(
            ...observedProfits,
          ),
          12,
        );

      record.worstObservedNetProfit =
        this.round(
          Math.min(
            ...observedProfits,
          ),
          12,
        );

      record.averageObservedNetProfit =
        this.round(
          observedProfits.reduce(
            (
              total,
              value,
            ) =>
              total +
              value,
            0,
          ) /
            observedProfits.length,
          12,
        );
    }
  }

  private finalize(
    record:
      ShadowTradeOutcomeRecord,

    now:
      number,
  ): void {
    record.completedAt =
      now;

    if (
      record.freshSamples ===
      0
    ) {
      record.status =
        "DATA_UNAVAILABLE";

      record.finalReason =
        "No fresh order-book sample was available during the complete shadow tracking window.";

      return;
    }

    if (
      record.executableSamples ===
      0
    ) {
      record.status =
        "FAILED";

      record.finalReason =
        "The original shadow quantity was never fully executable on both exchanges during the tracking window.";

      return;
    }

    if (
      record.profitableSamples >=
      this.config
        .minimumProfitableSamples
    ) {
      record.status =
        "SUCCESS";

      record.finalReason =
        `Shadow opportunity remained executable and profitable for ${record.profitableSamples} sample(s), meeting the minimum ${this.config.minimumProfitableSamples}.`;

      return;
    }

    record.status =
      "FAILED";

    record.finalReason =
      `Shadow opportunity produced only ${record.profitableSamples} qualifying profitable sample(s); ${this.config.minimumProfitableSamples} required.`;
  }

  private trimHistory():
    void {
    if (
      this.records.size <=
      this.config.maximumHistory
    ) {
      return;
    }

    const removable =
      Array.from(
        this.records.values(),
      )
        .filter(
          (
            record,
          ) =>
            record.status !==
            "TRACKING",
        )
        .sort(
          (
            first,
            second,
          ) =>
            (
              first.completedAt ??
              first.dispatchedAt
            ) -
            (
              second.completedAt ??
              second.dispatchedAt
            ),
        );

    while (
      this.records.size >
        this.config.maximumHistory &&
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

      this.records.delete(
        oldest.id,
      );

      this.trackedDispatchIds
        .delete(
          oldest.shadowDispatchId,
        );
    }
  }

  private countStatus(
    records:
      ShadowTradeOutcomeRecord[],

    status:
      ShadowTradeOutcomeRecord["status"],
  ): number {
    return records.filter(
      (
        record,
      ) =>
        record.status ===
        status,
    ).length;
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

  private validateConfig():
    void {
    if (
      !Number.isFinite(
        this.config.trackingWindowMs,
      ) ||
      this.config.trackingWindowMs <
        1_000
    ) {
      throw new Error(
        "Shadow outcome trackingWindowMs must be at least 1000 ms.",
      );
    }

    if (
      !Number.isFinite(
        this.config.maximumBookAgeMs,
      ) ||
      this.config.maximumBookAgeMs <=
        0
    ) {
      throw new Error(
        "Shadow outcome maximumBookAgeMs must be positive.",
      );
    }

    if (
      !Number.isInteger(
        this.config.minimumProfitableSamples,
      ) ||
      this.config.minimumProfitableSamples <
        1
    ) {
      throw new Error(
        "Shadow outcome minimumProfitableSamples must be a positive integer.",
      );
    }

    if (
      !Number.isFinite(
        this.config.minimumProfitRetentionPercent,
      ) ||
      this.config.minimumProfitRetentionPercent <
        0 ||
      this.config.minimumProfitRetentionPercent >
        100
    ) {
      throw new Error(
        "Shadow outcome minimumProfitRetentionPercent must be between 0 and 100.",
      );
    }

    if (
      !Number.isInteger(
        this.config.maximumHistory,
      ) ||
      this.config.maximumHistory <
        1
    ) {
      throw new Error(
        "Shadow outcome maximumHistory must be a positive integer.",
      );
    }
  }
}

export const shadowTradeOutcomeTrackerService =
  new ShadowTradeOutcomeTrackerService();
