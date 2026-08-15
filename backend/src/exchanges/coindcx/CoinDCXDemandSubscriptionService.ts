import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import {
  marketCache,
} from "../../services/cache.service";

import type {
  CoinDCXOrderBookAdapter,
} from "../../exchanges/coindcx/CoinDCXOrderBookAdapter";

export interface CoinDCXDemandSubscriptionMetrics {
  started:
    boolean;

  scans:
    number;

  candidatesSeen:
    number;

  subscriptionRequests:
    number;

  subscriptionAccepted:
    number;

  subscriptionRejected:
    number;

  lastScanAt:
    number | null;
}

interface DemandCandidate {
  market:
    string;

  edgePercent:
    number;
}

export class CoinDCXDemandSubscriptionService {
  private static readonly SCAN_INTERVAL_MS =
    1_000;

  /*
   * This is intentionally only a subscription trigger.
   * It is NOT an execution/profit threshold.
   *
   * CoinDCX lastPrice is non-executable, therefore any
   * apparent edge must be verified using the requested
   * order book before a trade can exist.
   */
  private static readonly MINIMUM_TRIGGER_EDGE_PERCENT =
    0.03;

  private static readonly MAXIMUM_REQUESTS_PER_SCAN =
    3;

  private static readonly TEMPORARY_TTL_MS =
    60_000;

  private timer:
    ReturnType<typeof setInterval> |
    null =
    null;

  private metrics:
    CoinDCXDemandSubscriptionMetrics = {
    started:
      false,

    scans:
      0,

    candidatesSeen:
      0,

    subscriptionRequests:
      0,

    subscriptionAccepted:
      0,

    subscriptionRejected:
      0,

    lastScanAt:
      null,
  };

  constructor(
    private readonly orderBookAdapter:
      CoinDCXOrderBookAdapter,
  ) {}

  start():
    void {
    if (
      this.timer !==
      null
    ) {
      return;
    }

    this.metrics.started =
      true;

    this.timer =
      setInterval(
        () => {
          this.scan();
        },
        CoinDCXDemandSubscriptionService
          .SCAN_INTERVAL_MS,
      );

    console.log(
      "[CoinDCX Demand] Started.",
    );
  }

  stop():
    void {
    if (
      this.timer !==
      null
    ) {
      clearInterval(
        this.timer,
      );

      this.timer =
        null;
    }

    this.metrics.started =
      false;
  }

  getMetrics():
    CoinDCXDemandSubscriptionMetrics {
    return {
      ...this.metrics,
    };
  }

  scan():
    void {
    this.metrics.scans +=
      1;

    this.metrics.lastScanAt =
      Date.now();

    const candidates =
      this.findDemandCandidates();

    this.metrics.candidatesSeen +=
      candidates.length;

    let requested =
      0;

    for (
      const candidate
      of candidates
    ) {
      if (
        requested >=
        CoinDCXDemandSubscriptionService
          .MAXIMUM_REQUESTS_PER_SCAN
      ) {
        break;
      }

      this.metrics.subscriptionRequests +=
        1;

      const accepted =
        this.orderBookAdapter
          .requestTemporarySubscription(
            candidate.market,
            CoinDCXDemandSubscriptionService
              .TEMPORARY_TTL_MS,
          );

      if (
        accepted
      ) {
        this.metrics.subscriptionAccepted +=
          1;

        requested +=
          1;
      } else {
        this.metrics.subscriptionRejected +=
          1;
      }
    }
  }

  private findDemandCandidates():
    DemandCandidate[] {
    const binance =
      this.createQuoteMap(
        marketCache
          .getExecutableByExchange(
            "binance",
          ),
      );

    const bybit =
      this.createQuoteMap(
        marketCache
          .getExecutableByExchange(
            "bybit",
          ),
      );

    const candidates:
      DemandCandidate[] =
      [];

    for (
      const coinDCXQuote
      of marketCache
        .getByExchange(
          "coindcx",
        )
    ) {
      const market =
        this.normalizeMarket(
          coinDCXQuote.market,
        );

      if (
        !market.endsWith(
          "USDT",
        ) ||
        coinDCXQuote.lastPrice ===
          null ||
        !Number.isFinite(
          coinDCXQuote.lastPrice,
        ) ||
        coinDCXQuote.lastPrice <=
          0
      ) {
        continue;
      }

      /*
       * If the CoinDCX book already exists, there is
       * no demand request to make.
       */
      if (
        orderBookService.has(
          "coindcx",
          market,
        ) ||
        this.orderBookAdapter
          .hasOrderBookSubscription(
            market,
          )
      ) {
        continue;
      }

      const externalQuotes = [
        binance.get(
          market,
        ),
        bybit.get(
          market,
        ),
      ].filter(
        (
          quote,
        ): quote is ExecutableQuote =>
          quote !==
          undefined,
      );

      if (
        externalQuotes.length ===
        0
      ) {
        continue;
      }

      let bestPotentialEdgePercent =
        0;

      for (
        const externalQuote
        of externalQuotes
      ) {
        const externalBid =
          externalQuote.bestBidPrice;

        const externalAsk =
          externalQuote.bestAskPrice;

        /*
         * Hypothesis A:
         * CoinDCX might be the BUY exchange.
         *
         * externalBid > CoinDCX lastPrice
         */
        if (
          externalBid !==
            null &&
          externalBid >
            0
        ) {
          const edge =
            (
              (
                externalBid -
                coinDCXQuote.lastPrice
              ) /
              coinDCXQuote.lastPrice
            ) *
            100;

          bestPotentialEdgePercent =
            Math.max(
              bestPotentialEdgePercent,
              edge,
            );
        }

        /*
         * Hypothesis B:
         * CoinDCX might be the SELL exchange.
         *
         * CoinDCX lastPrice > externalAsk
         */
        if (
          externalAsk !==
            null &&
          externalAsk >
            0
        ) {
          const edge =
            (
              (
                coinDCXQuote.lastPrice -
                externalAsk
              ) /
              externalAsk
            ) *
            100;

          bestPotentialEdgePercent =
            Math.max(
              bestPotentialEdgePercent,
              edge,
            );
        }
      }

      if (
        bestPotentialEdgePercent <
        CoinDCXDemandSubscriptionService
          .MINIMUM_TRIGGER_EDGE_PERCENT
      ) {
        continue;
      }

      candidates.push({
        market,

        edgePercent:
          bestPotentialEdgePercent,
      });
    }

    candidates.sort(
      (
        first,
        second,
      ) =>
        second.edgePercent -
        first.edgePercent,
    );

    return candidates;
  }

  private createQuoteMap(
    quotes:
      readonly ExecutableQuote[],
  ): Map<
    string,
    ExecutableQuote
  > {
    const result =
      new Map<
        string,
        ExecutableQuote
      >();

    for (
      const quote
      of quotes
    ) {
      result.set(
        this.normalizeMarket(
          quote.market,
        ),
        quote,
      );
    }

    return result;
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