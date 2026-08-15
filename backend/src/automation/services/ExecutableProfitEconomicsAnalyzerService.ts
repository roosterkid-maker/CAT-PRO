import {
  getExchangeFees,
} from "../../arbitrage/config/fees";

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

import type {
  ExecutableProfitEconomicsBucket,
  ExecutableProfitEconomicsDistribution,
  ExecutableProfitEconomicsReport,
  ExecutableProfitEconomicsRoute,
} from "../models/ExecutableProfitEconomics";

const SAMPLE_LIMIT =
  500;

const CLOSEST_LIMIT =
  25;

export class ExecutableProfitEconomicsAnalyzerService {
  getReport():
    ExecutableProfitEconomicsReport {
    const records =
      opportunityRejectionStore
        .getRecent(
          SAMPLE_LIMIT,
        );

    const analyzable =
      records
        .map(
          (
            record,
          ) =>
            this.analyzeRecord(
              record,
            ),
        )
        .filter(
          (
            value,
          ): value is ExecutableProfitEconomicsRoute =>
            value !==
            null,
        );

    const currentAcceptedOpportunities =
      opportunityService
        .getLastOpportunitySnapshot()
        ?.opportunities
        .length ??
      0;

    const positiveRawSpread =
      analyzable
        .filter(
          (
            record,
          ) =>
            record
              .rawSpreadPercent >
            0,
        )
        .length;

    const spreadBelowMinimum =
      analyzable
        .filter(
          (
            record,
          ) =>
            record.bucket ===
            "BELOW_SPREAD_GATE",
        )
        .length;

    const spreadPassesButFeesEliminateProfit =
      analyzable
        .filter(
          (
            record,
          ) =>
            record.bucket ===
            "SPREAD_PASSES_FEES_DO_NOT",
        )
        .length;

    const netProfitBelowMinimum =
      analyzable
        .filter(
          (
            record,
          ) =>
            record.bucket ===
            "NET_PROFIT_BELOW_MINIMUM",
        )
        .length;

    const economicallyPassingRejectedLater =
      analyzable
        .filter(
          (
            record,
          ) =>
            record.bucket ===
            "ECONOMICALLY_PASSING_REJECTED_LATER",
        )
        .length;

    const routeMap =
      new Map<
        string,
        {
          count: number;

          rawSpreadTotal: number;

          feeBurdenTotal: number;

          netProfitTotal: number;

          economicallyPassing: number;
        }
      >();

    for (
      const record
      of analyzable
    ) {
      const route =
        `${record.buyExchange}->${record.sellExchange}`;

      const current =
        routeMap.get(
          route,
        ) ??
        {
          count:
            0,

          rawSpreadTotal:
            0,

          feeBurdenTotal:
            0,

          netProfitTotal:
            0,

          economicallyPassing:
            0,
        };

      current.count +=
        1;

      current.rawSpreadTotal +=
        record.rawSpreadPercent;

      current.feeBurdenTotal +=
        record.feeBurdenPercent;

      current.netProfitTotal +=
        record.netProfitPercent;

      if (
        record.netProfitPercent >=
          record.minimumNetProfitPercent &&
        record.rawSpreadPercent >=
          record.minimumSpreadPercent
      ) {
        current.economicallyPassing +=
          1;
      }

      routeMap.set(
        route,
        current,
      );
    }

    const byRoute =
      Array.from(
        routeMap.entries(),
      )
        .map(
          (
            [
              route,
              value,
            ],
          ) => ({
            route,

            count:
              value.count,

            averageRawSpreadPercent:
              value.rawSpreadTotal /
              value.count,

            averageFeeBurdenPercent:
              value.feeBurdenTotal /
              value.count,

            averageNetProfitPercent:
              value.netProfitTotal /
              value.count,

            economicallyPassing:
              value.economicallyPassing,
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

    /*
     * "Closest" means closest to satisfying the
     * configured minimum NET-PROFIT requirement,
     * not simply largest raw spread.
     */
    const closestToProfitability =
      [
        ...analyzable,
      ]
        .filter(
          (
            record,
          ) =>
            record.rawSpreadPercent >
            0,
        )
        .sort(
          (
            first,
            second,
          ) => {
            const firstDistance =
              Math.max(
                0,

                first
                  .distanceToMinimumNetProfitPercent,
              );

            const secondDistance =
              Math.max(
                0,

                second
                  .distanceToMinimumNetProfitPercent,
              );

            if (
              firstDistance !==
              secondDistance
            ) {
              return (
                firstDistance -
                secondDistance
              );
            }

            return (
              second
                .netProfitPercent -
              first
                .netProfitPercent
            );
          },
        )
        .slice(
          0,
          CLOSEST_LIMIT,
        );

    const rawSpreadValues =
      analyzable.map(
        (
          record,
        ) =>
          record.rawSpreadPercent,
      );

    const feeBurdenValues =
      analyzable.map(
        (
          record,
        ) =>
          record.feeBurdenPercent,
      );

    const netProfitValues =
      analyzable.map(
        (
          record,
        ) =>
          record.netProfitPercent,
      );

    const distanceValues =
      analyzable.map(
        (
          record,
        ) =>
          record
            .distanceToMinimumNetProfitPercent,
      );

    const observations:
      string[] =
      [];

    if (
      analyzable.length >
      0
    ) {
      observations.push(
        `${positiveRawSpread}/${analyzable.length} economically analyzable rejection records have a positive raw executable spread.`,
      );

      observations.push(
        `${spreadBelowMinimum} records fail the current raw-spread gate before later execution analysis.`,
      );

      observations.push(
        `${spreadPassesButFeesEliminateProfit + netProfitBelowMinimum} records reach fee-adjusted economics but remain below the configured minimum net-profit requirement.`,
      );
    }

    observations.push(
      "Fee burden is reconstructed from the same taker-fee registry used by OpportunityEvaluator.",

      "Slippage is intentionally NOT fabricated for spread/net-profit rejections because those routes are rejected before ExecutionSimulator runs. Slippage must be measured later from full-depth simulation for candidates that survive the economic pre-filters.",

      "No spread, fee, profit, liquidity, freshness, synchronization, paper, or LIVE threshold is changed by this endpoint.",
    );

    return {
      generatedAt:
        Date.now(),

      version:
        "17.4",

      build:
        "1",

      mode:
        "DIAGNOSTIC_ONLY",

      tradingPolicyMutationAllowed:
        false,

      liveExecutionAllowed:
        false,

      sampleSize:
        records.length,

      economicallyAnalyzableRecords:
        analyzable.length,

      summary: {
        positiveRawSpread,

        spreadBelowMinimum,

        spreadPassesButFeesEliminateProfit,

        netProfitBelowMinimum,

        economicallyPassingRejectedLater,

        currentAcceptedOpportunities,
      },

      economics: {
        rawSpread:
          this.distribution(
            rawSpreadValues,
          ),

        feeBurden:
          this.distribution(
            feeBurdenValues,
          ),

        netProfit:
          this.distribution(
            netProfitValues,
          ),

        distanceToMinimumNetProfit:
          this.distribution(
            distanceValues,
          ),
      },

      byRoute,

      closestToProfitability,

      observations,
    };
  }

  private analyzeRecord(
    record:
      OpportunityRejectionRecord,
  ): ExecutableProfitEconomicsRoute | null {
    const buyPrice =
      record.buyPrice;

    const sellPrice =
      record.sellPrice;

    if (
      buyPrice ===
        null ||
      sellPrice ===
        null ||
      !Number.isFinite(
        buyPrice,
      ) ||
      !Number.isFinite(
        sellPrice,
      ) ||
      buyPrice <=
        0 ||
      sellPrice <=
        0
    ) {
      return null;
    }

    const rawSpreadPercent =
      record.rawSpreadPercent ??
      (
        (
          sellPrice -
          buyPrice
        ) /
        buyPrice
      ) *
        100;

    if (
      !Number.isFinite(
        rawSpreadPercent,
      )
    ) {
      return null;
    }

    let buyFeePercent:
      number;

    let sellFeePercent:
      number;

    try {
      buyFeePercent =
        getExchangeFees(
          record.buyExchange,
          record.market,
        )
          .takerPercent;

      sellFeePercent =
        getExchangeFees(
          record.sellExchange,
          record.market,
        )
          .takerPercent;
    } catch {
      return null;
    }

    /*
     * Match OpportunityEvaluator economics exactly:
     *
     * buy fee  = buyPrice  * taker %
     * sell fee = sellPrice * taker %
     */
    const buyFeeAmount =
      buyPrice *
      (
        buyFeePercent /
        100
      );

    const sellFeeAmount =
      sellPrice *
      (
        sellFeePercent /
        100
      );

    const feeBurdenPercent =
      (
        (
          buyFeeAmount +
          sellFeeAmount
        ) /
        buyPrice
      ) *
      100;

    const netProfitPercent =
      record.netProfitPercent ??
      (
        rawSpreadPercent -
        feeBurdenPercent
      );

    const minimumSpreadPercent =
      record.minimumSpreadPercent ??
      defaultArbitragePolicy
        .minimumSpreadPercent;

    const minimumNetProfitPercent =
      record.minimumNetProfitPercent ??
      defaultArbitragePolicy
        .minimumNetProfitPercent;

    /*
     * Economic break-even required for the
     * configured minimum NET profit.
     *
     * Example:
     *
     * fees ~0.20%
     * desired minimum net = 0.01%
     *
     * required raw spread ≈ 0.21%
     *
     * before slippage.
     */
    const minimumEconomicSpreadPercent =
      feeBurdenPercent +
      minimumNetProfitPercent;

    const distanceToMinimumNetProfitPercent =
      minimumNetProfitPercent -
      netProfitPercent;

    const spreadSurplusAfterFeesPercent =
      rawSpreadPercent -
      feeBurdenPercent;

    const bucket =
      this.resolveBucket(
        record,

        rawSpreadPercent,

        netProfitPercent,

        minimumSpreadPercent,

        minimumNetProfitPercent,
      );

    return {
      market:
        record.market,

      buyExchange:
        record.buyExchange,

      sellExchange:
        record.sellExchange,

      rejectionStage:
        record.stage,

      rejectionCode:
        record.code,

      rawSpreadPercent,

      feeBurdenPercent,

      netProfitPercent,

      minimumSpreadPercent,

      minimumNetProfitPercent,

      minimumEconomicSpreadPercent,

      distanceToMinimumNetProfitPercent,

      spreadSurplusAfterFeesPercent,

      slippageMeasured:
        false,

      bucket,

      rejectedAt:
        record.rejectedAt,
    };
  }

  private resolveBucket(
    record:
      OpportunityRejectionRecord,

    rawSpreadPercent:
      number,

    netProfitPercent:
      number,

    minimumSpreadPercent:
      number,

    minimumNetProfitPercent:
      number,
  ): ExecutableProfitEconomicsBucket {
    if (
      rawSpreadPercent <=
      0
    ) {
      return "NON_POSITIVE_SPREAD";
    }

    if (
      rawSpreadPercent <
      minimumSpreadPercent
    ) {
      return "BELOW_SPREAD_GATE";
    }

    if (
      netProfitPercent <=
      0
    ) {
      return "SPREAD_PASSES_FEES_DO_NOT";
    }

    if (
      netProfitPercent <
      minimumNetProfitPercent
    ) {
      return "NET_PROFIT_BELOW_MINIMUM";
    }

    /*
     * Economics passed, so if the record still
     * exists in rejection history it was rejected
     * by a later gate such as liquidity,
     * quote integrity, execution analysis, etc.
     */
    if (
      record.stage !==
        "SPREAD" &&
      record.stage !==
        "NET_PROFIT"
    ) {
      return "ECONOMICALLY_PASSING_REJECTED_LATER";
    }

    return "ECONOMICALLY_PASSING_REJECTED_LATER";
  }

  private distribution(
    values:
      number[],
  ): ExecutableProfitEconomicsDistribution {
    const sorted =
      values
        .filter(
          Number.isFinite,
        )
        .sort(
          (
            first,
            second,
          ) =>
            first -
            second,
        );

    if (
      sorted.length ===
      0
    ) {
      return {
        count:
          0,

        minimumPercent:
          null,

        p50Percent:
          null,

        p95Percent:
          null,

        averagePercent:
          null,

        maximumPercent:
          null,
      };
    }

    const total =
      sorted.reduce(
        (
          sum,
          value,
        ) =>
          sum +
          value,

        0,
      );

    return {
      count:
        sorted.length,

      minimumPercent:
        sorted[0] ??
        null,

      p50Percent:
        this.percentile(
          sorted,
          0.5,
        ),

      p95Percent:
        this.percentile(
          sorted,
          0.95,
        ),

      averagePercent:
        total /
        sorted.length,

      maximumPercent:
        sorted[
          sorted.length -
          1
        ] ??
        null,
    };
  }

  private percentile(
    sorted:
      number[],

    percentile:
      number,
  ): number | null {
    if (
      sorted.length ===
      0
    ) {
      return null;
    }

    const index =
      Math.min(
        sorted.length -
          1,

        Math.max(
          0,

          Math.ceil(
            sorted.length *
              percentile,
          ) -
            1,
        ),
      );

    return sorted[
      index
    ] ??
      null;
  }
}

export const executableProfitEconomicsAnalyzerService =
  new ExecutableProfitEconomicsAnalyzerService();
