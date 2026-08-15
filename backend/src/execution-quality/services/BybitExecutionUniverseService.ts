import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";

import {
  bybitSubscriptionAuditService,
  type BybitSubscriptionEventEvidence,
} from "../../diagnostics/services/BybitSubscriptionAuditService";

import {
  freshnessIntegrityService,
} from "../../freshness/services/FreshnessIntegrityService";

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

export type BybitExecutionEligibilityState =
  | "WARMING_UP"
  | "ELIGIBLE"
  | "INELIGIBLE_NO_BOOK"
  | "INELIGIBLE_CURRENTLY_STALE"
  | "INELIGIBLE_LOW_EVENT_RELIABILITY";

export interface BybitExecutionMarketQuality {
  market: string;

  state: BybitExecutionEligibilityState;

  eligible: boolean;

  messagesReceived: number;

  eventGapSamples: number;

  reliableGapSamples: number;

  unreliableGapSamples: number;

  eventReliabilityPercent: number;

  minimumEventGapSamplesRequired: number;

  minimumEventReliabilityPercent: number;

  p50InterUpdateGapMs: number | null;

  p95InterUpdateGapMs: number | null;

  maximumInterUpdateGapMs: number | null;

  currentBookPresent: boolean;

  currentBookFresh: boolean;

  currentBookAgeMs: number | null;

  maximumQuoteAgeMs: number;

  lastDataAt: number | null;
}

export interface BybitExecutionUniverseReport {
  generatedAt: number;

  mode: "EVENT_BASED_EXECUTION_QUALITY_FILTER";

  marketDataMutationAllowed: false;

  tradingPolicyMutationAllowed: false;

  freshnessThresholdMutationAllowed: false;

  observedMarkets: number;

  executionEligibleMarkets: number;

  executionIneligibleMarkets: number;

  warmingUpMarkets: number;

  minimumEventGapSamplesRequired: number;

  rollingEventGapWindow: number;

  minimumEventReliabilityPercent: number;

  exchangeMaximumQuoteAgeMs: number;

  markets: BybitExecutionMarketQuality[];

  observations: string[];
}

export interface BybitExecutionUniverseFilterResult {
  quotes:
    ExecutableQuote[];

  report:
    BybitExecutionUniverseReport;
}

interface BybitQualityEvidence {
  readonly market: string;

  readonly messagesReceived: number;

  readonly lastDataAt: number | null;

  readonly recentInterUpdateGapsMs:
    readonly number[];

  readonly p50InterUpdateGapMs:
    number | null;

  readonly p95InterUpdateGapMs:
    number | null;

  readonly maximumInterUpdateGapMs:
    number | null;
}

export class BybitExecutionUniverseService {
  /*
   * Event-based warmup.
   *
   * Five real inter-update gaps require at least six
   * genuine successfully-published order-book events.
   */
  private static readonly MINIMUM_EVENT_GAP_SAMPLES_REQUIRED =
    5;

  /*
   * Feed-quality policy, NOT a widened freshness gate.
   *
   * At least 80% of recent genuine inter-update gaps
   * must fit inside the existing Bybit freshness window.
   */
  private static readonly MINIMUM_EVENT_RELIABILITY_PERCENT =
    80;

  private static readonly ROLLING_EVENT_GAP_WINDOW =
    30;

  isExecutionEligible(
    exchange:
      string,

    market:
      string,

    now =
      Date.now(),
  ): boolean {
    if (
      this.normalizeExchange(
        exchange,
      ) !==
      "bybit"
    ) {
      return true;
    }

    return this
      .getMarketQuality(
        market,
        now,
      )
      .eligible;
  }

  filterQuotes(
    quotes:
      readonly ExecutableQuote[],

    now =
      Date.now(),
  ): ExecutableQuote[] {
    return this
      .filterQuotesWithReport(
        quotes,
        now,
      )
      .quotes;
  }

  /**
   * Build the Bybit quality report once per opportunity scan and reuse an
   * O(1) eligibility set for every quote. The old filter rebuilt and searched
   * the complete audit report once for each Bybit quote, turning the hottest
   * Strategy #1 loop into quadratic work.
   */
  filterQuotesWithReport(
    quotes:
      readonly ExecutableQuote[],

    now =
      Date.now(),
  ): BybitExecutionUniverseFilterResult {
    const report =
      this.getReport(
        now,
      );

    const eligibleBybitMarkets =
      new Set(
        report.markets
          .filter(
            (market) =>
              market.eligible,
          )
          .map(
            (market) =>
              this.normalizeMarket(
                market.market,
              ),
          ),
      );

    return {
      quotes:
        quotes.filter(
          (quote) => {
            if (
              this.normalizeExchange(
                quote.exchange,
              ) !==
              "bybit"
            ) {
              return true;
            }

            return eligibleBybitMarkets.has(
              this.normalizeMarket(
                quote.market,
              ),
            );
          },
        ),

      report,
    };
  }

  getReport(
    now =
      Date.now(),
  ): BybitExecutionUniverseReport {
    const markets:
      BybitExecutionMarketQuality[] =
      [];

    /*
     * The audit UI report computes and sorts the same 200 rolling gap
     * distributions. The opportunity hot path needs identical evidence, but
     * not the intermediate audit DTO. Visit the source records once and build
     * the execution-quality report directly.
     */
    bybitSubscriptionAuditService
      .forEachEventEvidence(
        (
          evidence,
        ) => {
          markets.push(
            this.getMarketQualityFromEventEvidence(
              evidence,
              now,
            ),
          );
        },
      );

    markets.sort(
          (
            first,
            second,
          ) => {
            if (
              first.eligible !==
              second.eligible
            ) {
              return first.eligible
                ? 1
                : -1;
            }

            if (
              first.eventReliabilityPercent !==
              second.eventReliabilityPercent
            ) {
              return (
                first.eventReliabilityPercent -
                second.eventReliabilityPercent
              );
            }

            return first.market
              .localeCompare(
                second.market,
              );
          },
        );

    const executionEligibleMarkets =
      markets.filter(
        (
          market,
        ) =>
          market.eligible,
      ).length;

    const warmingUpMarkets =
      markets.filter(
        (
          market,
        ) =>
          market.state ===
          "WARMING_UP",
      ).length;

    return {
      generatedAt:
        now,

      mode:
        "EVENT_BASED_EXECUTION_QUALITY_FILTER",

      marketDataMutationAllowed:
        false,

      tradingPolicyMutationAllowed:
        false,

      freshnessThresholdMutationAllowed:
        false,

      observedMarkets:
        markets.length,

      executionEligibleMarkets,

      executionIneligibleMarkets:
        markets.length -
        executionEligibleMarkets,

      warmingUpMarkets,

      minimumEventGapSamplesRequired:
        BybitExecutionUniverseService
          .MINIMUM_EVENT_GAP_SAMPLES_REQUIRED,

      rollingEventGapWindow:
        BybitExecutionUniverseService
          .ROLLING_EVENT_GAP_WINDOW,

      minimumEventReliabilityPercent:
        BybitExecutionUniverseService
          .MINIMUM_EVENT_RELIABILITY_PERCENT,

      exchangeMaximumQuoteAgeMs:
        freshnessIntegrityService
          .getMaximumQuoteAgeMs(
            "bybit",
          ),

      markets,

      observations: [
        "Quality is measured from genuine successfully-published Bybit order-book events, not one-second timer samples.",

        "A market is eligible only when enough real inter-update gaps have been observed, the rolling event-gap reliability passes, and the current order book is genuinely fresh.",

        "Missing books created by stale-book eviction do not generate artificial negative history samples.",

        "The existing Bybit freshness threshold is unchanged and remains mandatory for the current book.",

        "OpportunityEngine freshness, pair synchronization, liquidity, fees, quote integrity, execution simulation, risk, and last-look remain independent mandatory safety layers.",
      ],
    };
  }

  private getMarketQuality(
    rawMarket:
      string,

    now:
      number,
  ): BybitExecutionMarketQuality {
    const market =
      this.normalizeMarket(
        rawMarket,
      );

    const audit =
      bybitSubscriptionAuditService
        .getReport(
          now,
        );

    const record =
      audit.records.find(
        (
          item,
        ) =>
          this.normalizeMarket(
            item.market,
          ) ===
          market,
      );

    if (
      !record
    ) {
      return this.emptyQuality(
        market,
      );
    }

    return this
      .getMarketQualityFromRecord(
        record,
        now,
      );
  }

  private getMarketQualityFromRecord(
    record:
      BybitQualityEvidence,

    now:
      number,
  ): BybitExecutionMarketQuality {
    const market =
      this.normalizeMarket(
        record.market,
      );

    const maximumQuoteAgeMs =
      freshnessIntegrityService
        .getMaximumQuoteAgeMs(
          "bybit",
        );

    const gaps =
      record
        .recentInterUpdateGapsMs
        .slice(
          -BybitExecutionUniverseService
            .ROLLING_EVENT_GAP_WINDOW,
        );

    const reliableGapSamples =
      gaps.filter(
        (
          gapMs,
        ) =>
          gapMs <=
          maximumQuoteAgeMs,
      ).length;

    const unreliableGapSamples =
      gaps.length -
      reliableGapSamples;

    const eventReliabilityPercent =
      gaps.length >
        0
        ? Number(
            (
              reliableGapSamples /
              gaps.length *
              100
            ).toFixed(
              2,
            ),
          )
        : 0;

    const book =
      orderBookService.get(
        "bybit",
        market,
      );

    const freshness =
      book
        ? freshnessIntegrityService
            .evaluateQuote(
              {
                exchange:
                  "bybit",

                market,

                timestamp:
                  book.timestamp,
              },
              now,
            )
        : null;

    const currentBookPresent =
      book !==
      null &&
      book !==
      undefined;

    const currentBookFresh =
      freshness?.fresh ??
      false;

    const currentBookAgeMs =
      freshness?.ageMs ??
      null;

    let state:
      BybitExecutionEligibilityState;

    if (
      gaps.length <
      BybitExecutionUniverseService
        .MINIMUM_EVENT_GAP_SAMPLES_REQUIRED
    ) {
      state =
        "WARMING_UP";
    } else if (
      !currentBookPresent
    ) {
      state =
        "INELIGIBLE_NO_BOOK";
    } else if (
      !currentBookFresh
    ) {
      state =
        "INELIGIBLE_CURRENTLY_STALE";
    } else if (
      eventReliabilityPercent <
      BybitExecutionUniverseService
        .MINIMUM_EVENT_RELIABILITY_PERCENT
    ) {
      state =
        "INELIGIBLE_LOW_EVENT_RELIABILITY";
    } else {
      state =
        "ELIGIBLE";
    }

    return {
      market,

      state,

      eligible:
        state ===
        "ELIGIBLE",

      messagesReceived:
        record.messagesReceived,

      eventGapSamples:
        gaps.length,

      reliableGapSamples,

      unreliableGapSamples,

      eventReliabilityPercent,

      minimumEventGapSamplesRequired:
        BybitExecutionUniverseService
          .MINIMUM_EVENT_GAP_SAMPLES_REQUIRED,

      minimumEventReliabilityPercent:
        BybitExecutionUniverseService
          .MINIMUM_EVENT_RELIABILITY_PERCENT,

      p50InterUpdateGapMs:
        record.p50InterUpdateGapMs,

      p95InterUpdateGapMs:
        record.p95InterUpdateGapMs,

      maximumInterUpdateGapMs:
        record.maximumInterUpdateGapMs,

      currentBookPresent,

      currentBookFresh,

      currentBookAgeMs,

      maximumQuoteAgeMs,

      lastDataAt:
        record.lastDataAt,
    };
  }

  private getMarketQualityFromEventEvidence(
    record:
      BybitSubscriptionEventEvidence,

    now:
      number,
  ): BybitExecutionMarketQuality {
    const gaps =
      record
        .recentInterUpdateGapsMs
        .slice(
          -BybitExecutionUniverseService
            .ROLLING_EVENT_GAP_WINDOW,
        );

    const orderedGaps =
      [...gaps]
        .sort(
          (
            first,
            second,
          ) =>
            first -
            second,
        );

    return this.getMarketQualityFromRecord(
      {
        market:
          record.market,

        messagesReceived:
          record.messagesReceived,

        lastDataAt:
          record.lastDataAt,

        recentInterUpdateGapsMs:
          gaps,

        p50InterUpdateGapMs:
          this.percentileFromOrdered(
            orderedGaps,
            0.5,
          ),

        p95InterUpdateGapMs:
          this.percentileFromOrdered(
            orderedGaps,
            0.95,
          ),

        maximumInterUpdateGapMs:
          orderedGaps.at(
            -1,
          ) ?? null,
      },
      now,
    );
  }

  private percentileFromOrdered(
    ordered:
      readonly number[],

    percentile:
      number,
  ): number | null {
    if (
      ordered.length ===
      0
    ) {
      return null;
    }

    const index =
      Math.min(
        ordered.length -
          1,
        Math.max(
          0,
          Math.ceil(
            percentile *
            ordered.length,
          ) -
            1,
        ),
      );

    return ordered[
      index
    ] ?? null;
  }

  private emptyQuality(
    market:
      string,
  ): BybitExecutionMarketQuality {
    const maximumQuoteAgeMs =
      freshnessIntegrityService
        .getMaximumQuoteAgeMs(
          "bybit",
        );

    return {
      market,

      state:
        "WARMING_UP",

      eligible:
        false,

      messagesReceived:
        0,

      eventGapSamples:
        0,

      reliableGapSamples:
        0,

      unreliableGapSamples:
        0,

      eventReliabilityPercent:
        0,

      minimumEventGapSamplesRequired:
        BybitExecutionUniverseService
          .MINIMUM_EVENT_GAP_SAMPLES_REQUIRED,

      minimumEventReliabilityPercent:
        BybitExecutionUniverseService
          .MINIMUM_EVENT_RELIABILITY_PERCENT,

      p50InterUpdateGapMs:
        null,

      p95InterUpdateGapMs:
        null,

      maximumInterUpdateGapMs:
        null,

      currentBookPresent:
        false,

      currentBookFresh:
        false,

      currentBookAgeMs:
        null,

      maximumQuoteAgeMs,

      lastDataAt:
        null,
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

  private normalizeExchange(
    exchange:
      string,
  ): string {
    return exchange
      .trim()
      .toLowerCase();
  }
}

export const bybitExecutionUniverseService =
  new BybitExecutionUniverseService();
