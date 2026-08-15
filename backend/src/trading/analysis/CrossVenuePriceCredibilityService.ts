import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";

import {
  freshnessIntegrityService,
} from "../../freshness/services/FreshnessIntegrityService";

import {
  marketCache,
} from "../../services/cache.service";

export const MAXIMUM_CREDIBLE_EXECUTION_PRICE_RATIO =
  1.05;

export const MAXIMUM_CANDIDATE_PRICE_DRIFT_PERCENT =
  1;

export const MAXIMUM_CONSENSUS_DEVIATION_PERCENT =
  3;

const MINIMUM_CONSENSUS_VENUES =
  3;

export type CrossVenuePriceCredibilityFailureCode =
  | "INVALID_INPUT"
  | "BUY_BOOK_UNAVAILABLE"
  | "SELL_BOOK_UNAVAILABLE"
  | "BUY_PRICE_DRIFTED"
  | "SELL_PRICE_DRIFTED"
  | "PRICE_RATIO_EXCEEDED"
  | "BUY_VENUE_OUTLIER"
  | "SELL_VENUE_OUTLIER";

export interface CrossVenuePriceCredibilityInput {
  market: string;

  buyExchange: string;

  sellExchange: string;

  buyPrice: number;

  sellPrice: number;

  now?: number;
}

export interface CrossVenuePriceCredibilityReport {
  acceptable: boolean;

  evaluatedAt: number;

  market: string;

  buyExchange: string;

  sellExchange: string;

  freshVenueCount: number;

  freshVenues: readonly string[];

  currentBuyAsk: number | null;

  currentSellBid: number | null;

  candidatePriceRatio: number | null;

  currentPriceRatio: number | null;

  medianMidPrice: number | null;

  buyDeviationFromMedianPercent: number | null;

  sellDeviationFromMedianPercent: number | null;

  maximumPriceRatio: number;

  maximumCandidatePriceDriftPercent: number;

  maximumConsensusDeviationPercent: number;

  failureCodes: readonly CrossVenuePriceCredibilityFailureCode[];

  reasons: readonly string[];
}

export interface ExecutedPriceCredibilityReport {
  credible: boolean;

  priceRatio: number | null;

  maximumPriceRatio: number;
}

export interface CrossVenuePriceCredibilityDependencies {
  getQuotes(): readonly ExecutableQuote[];
}

const DEFAULT_DEPENDENCIES:
  CrossVenuePriceCredibilityDependencies = {
  getQuotes:
    () =>
      marketCache.getAll(),
};

interface CredibleBook {
  exchange: string;

  bid: number;

  ask: number;

  mid: number;
}

/**
 * Final fail-closed market-price credibility check for automatic PAPER.
 *
 * Pairwise profitability is not enough: an isolated but internally valid
 * venue book can manufacture a very large theoretical spread. This service
 * binds the candidate to the current executable books and, when three or
 * more venues exist, requires both route legs to remain close to the median
 * cross-venue price.
 */
export class CrossVenuePriceCredibilityService {
  private readonly dependencies:
    CrossVenuePriceCredibilityDependencies;

  constructor(
    dependencies:
      Partial<CrossVenuePriceCredibilityDependencies> = {},
  ) {
    this.dependencies = {
      ...DEFAULT_DEPENDENCIES,
      ...dependencies,
    };
  }

  evaluate(
    input:
      CrossVenuePriceCredibilityInput,
  ): CrossVenuePriceCredibilityReport {
    const evaluatedAt =
      input.now ??
      Date.now();

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

    const failureCodes:
      CrossVenuePriceCredibilityFailureCode[] =
      [];

    const reasons:
      string[] =
      [];

    if (
      !market ||
      !buyExchange ||
      !sellExchange ||
      buyExchange ===
        sellExchange ||
      !isPositiveFinite(
        input.buyPrice,
      ) ||
      !isPositiveFinite(
        input.sellPrice,
      ) ||
      !Number.isSafeInteger(
        evaluatedAt,
      ) ||
      evaluatedAt <=
        0
    ) {
      failureCodes.push(
        "INVALID_INPUT",
      );

      reasons.push(
        "PAPER price-credibility input is invalid.",
      );
    }

    const books =
      failureCodes.length ===
        0
        ? this.getFreshBooks(
            market,
            evaluatedAt,
          )
        : [];

    const buy =
      books.find(
        (book) =>
          book.exchange ===
          buyExchange,
      ) ??
      null;

    const sell =
      books.find(
        (book) =>
          book.exchange ===
          sellExchange,
      ) ??
      null;

    if (
      failureCodes.length ===
        0 &&
      !buy
    ) {
      failureCodes.push(
        "BUY_BOOK_UNAVAILABLE",
      );

      reasons.push(
        `Fresh executable buy book is unavailable for ${buyExchange}:${market}.`,
      );
    }

    if (
      failureCodes.length ===
        0 &&
      !sell
    ) {
      failureCodes.push(
        "SELL_BOOK_UNAVAILABLE",
      );

      reasons.push(
        `Fresh executable sell book is unavailable for ${sellExchange}:${market}.`,
      );
    }

    const candidatePriceRatio =
      calculatePriceRatio(
        input.buyPrice,
        input.sellPrice,
      );

    const currentPriceRatio =
      buy &&
      sell
        ? calculatePriceRatio(
            buy.ask,
            sell.bid,
          )
        : null;

    if (
      buy &&
      percentageDeviation(
        input.buyPrice,
        buy.ask,
      ) >
        MAXIMUM_CANDIDATE_PRICE_DRIFT_PERCENT
    ) {
      failureCodes.push(
        "BUY_PRICE_DRIFTED",
      );

      reasons.push(
        `Candidate buy price drifted more than ${MAXIMUM_CANDIDATE_PRICE_DRIFT_PERCENT.toFixed(
          2,
        )}% from the current executable ask.`,
      );
    }

    if (
      sell &&
      percentageDeviation(
        input.sellPrice,
        sell.bid,
      ) >
        MAXIMUM_CANDIDATE_PRICE_DRIFT_PERCENT
    ) {
      failureCodes.push(
        "SELL_PRICE_DRIFTED",
      );

      reasons.push(
        `Candidate sell price drifted more than ${MAXIMUM_CANDIDATE_PRICE_DRIFT_PERCENT.toFixed(
          2,
        )}% from the current executable bid.`,
      );
    }

    if (
      candidatePriceRatio !==
        null &&
      candidatePriceRatio >
        MAXIMUM_CREDIBLE_EXECUTION_PRICE_RATIO
    ) {
      failureCodes.push(
        "PRICE_RATIO_EXCEEDED",
      );

      reasons.push(
        `Candidate price ratio ${candidatePriceRatio.toFixed(
          4,
        )}x exceeds credibility limit ${MAXIMUM_CREDIBLE_EXECUTION_PRICE_RATIO.toFixed(
          4,
        )}x.`,
      );
    }

    if (
      currentPriceRatio !==
        null &&
      currentPriceRatio >
        MAXIMUM_CREDIBLE_EXECUTION_PRICE_RATIO &&
      !failureCodes.includes(
        "PRICE_RATIO_EXCEEDED",
      )
    ) {
      failureCodes.push(
        "PRICE_RATIO_EXCEEDED",
      );

      reasons.push(
        `Current executable price ratio ${currentPriceRatio.toFixed(
          4,
        )}x exceeds credibility limit ${MAXIMUM_CREDIBLE_EXECUTION_PRICE_RATIO.toFixed(
          4,
        )}x.`,
      );
    }

    const medianMidPrice =
      books.length >=
        MINIMUM_CONSENSUS_VENUES
        ? median(
            books.map(
              (book) =>
                book.mid,
            ),
          )
        : null;

    const buyDeviationFromMedianPercent =
      buy &&
      medianMidPrice !==
        null
        ? percentageDeviation(
            buy.mid,
            medianMidPrice,
          )
        : null;

    const sellDeviationFromMedianPercent =
      sell &&
      medianMidPrice !==
        null
        ? percentageDeviation(
            sell.mid,
            medianMidPrice,
          )
        : null;

    if (
      buyDeviationFromMedianPercent !==
        null &&
      buyDeviationFromMedianPercent >
        MAXIMUM_CONSENSUS_DEVIATION_PERCENT
    ) {
      failureCodes.push(
        "BUY_VENUE_OUTLIER",
      );

      reasons.push(
        `${buyExchange} buy book deviates ${buyDeviationFromMedianPercent.toFixed(
          2,
        )}% from the ${books.length}-venue median; limit is ${MAXIMUM_CONSENSUS_DEVIATION_PERCENT.toFixed(
          2,
        )}%.`,
      );
    }

    if (
      sellDeviationFromMedianPercent !==
        null &&
      sellDeviationFromMedianPercent >
        MAXIMUM_CONSENSUS_DEVIATION_PERCENT
    ) {
      failureCodes.push(
        "SELL_VENUE_OUTLIER",
      );

      reasons.push(
        `${sellExchange} sell book deviates ${sellDeviationFromMedianPercent.toFixed(
          2,
        )}% from the ${books.length}-venue median; limit is ${MAXIMUM_CONSENSUS_DEVIATION_PERCENT.toFixed(
          2,
        )}%.`,
      );
    }

    const acceptable =
      failureCodes.length ===
        0;

    if (
      acceptable
    ) {
      reasons.push(
        medianMidPrice ===
          null
          ? `Current route passed the ${MAXIMUM_CREDIBLE_EXECUTION_PRICE_RATIO.toFixed(
              4,
            )}x pairwise credibility limit; fewer than ${MINIMUM_CONSENSUS_VENUES} fresh venues were available.`
          : `Current route passed pairwise and ${books.length}-venue median price-credibility checks.`,
      );
    }

    return {
      acceptable,
      evaluatedAt,
      market,
      buyExchange,
      sellExchange,
      freshVenueCount:
        books.length,
      freshVenues:
        books.map(
          (book) =>
            book.exchange,
        ),
      currentBuyAsk:
        buy?.ask ??
        null,
      currentSellBid:
        sell?.bid ??
        null,
      candidatePriceRatio,
      currentPriceRatio,
      medianMidPrice,
      buyDeviationFromMedianPercent,
      sellDeviationFromMedianPercent,
      maximumPriceRatio:
        MAXIMUM_CREDIBLE_EXECUTION_PRICE_RATIO,
      maximumCandidatePriceDriftPercent:
        MAXIMUM_CANDIDATE_PRICE_DRIFT_PERCENT,
      maximumConsensusDeviationPercent:
        MAXIMUM_CONSENSUS_DEVIATION_PERCENT,
      failureCodes: [
        ...new Set(
          failureCodes,
        ),
      ],
      reasons,
    };
  }

  private getFreshBooks(
    market:
      string,

    now:
      number,
  ): CredibleBook[] {
    return this.dependencies
      .getQuotes()
      .filter(
        (quote) =>
          quote.market
            .trim()
            .toUpperCase() ===
            market &&
          isExecutableBook(
            quote,
          ) &&
          freshnessIntegrityService
            .evaluateQuote(
              quote,
              now,
            )
            .fresh,
      )
      .map(
        (quote) => ({
          exchange:
            quote.exchange
              .trim()
              .toLowerCase(),
          bid:
            quote.bestBidPrice!,
          ask:
            quote.bestAskPrice!,
          mid:
            (
              quote.bestBidPrice! +
              quote.bestAskPrice!
            ) /
            2,
        }),
      );
  }
}

export function evaluateExecutedPriceCredibility(
  buyPrice:
    number,

  sellPrice:
    number,
): ExecutedPriceCredibilityReport {
  const priceRatio =
    calculatePriceRatio(
      buyPrice,
      sellPrice,
    );

  return {
    credible:
      priceRatio !==
        null &&
      priceRatio <=
        MAXIMUM_CREDIBLE_EXECUTION_PRICE_RATIO,
    priceRatio,
    maximumPriceRatio:
      MAXIMUM_CREDIBLE_EXECUTION_PRICE_RATIO,
  };
}

function isExecutableBook(
  quote:
    ExecutableQuote,
): boolean {
  return (
    quote.executable &&
    isPositiveFinite(
      quote.bestBidPrice,
    ) &&
    isPositiveFinite(
      quote.bestAskPrice,
    ) &&
    isPositiveFinite(
      quote.bestBidQty,
    ) &&
    isPositiveFinite(
      quote.bestAskQty,
    ) &&
    quote.bestBidPrice <=
      quote.bestAskPrice
  );
}

function isPositiveFinite(
  value:
    number | null,
): value is number {
  return (
    typeof value ===
      "number" &&
    Number.isFinite(
      value,
    ) &&
    value >
      0
  );
}

function calculatePriceRatio(
  first:
    number,

  second:
    number,
): number | null {
  if (
    !isPositiveFinite(
      first,
    ) ||
    !isPositiveFinite(
      second,
    )
  ) {
    return null;
  }

  return Math.max(
    first,
    second,
  ) /
    Math.min(
      first,
      second,
    );
}

function percentageDeviation(
  value:
    number,

  reference:
    number,
): number {
  return Math.abs(
    value -
      reference,
  ) /
    reference *
    100;
}

function median(
  values:
    readonly number[],
): number {
  const sorted = [
    ...values,
  ].sort(
    (
      first,
      second,
    ) =>
      first -
      second,
  );

  const middle =
    Math.floor(
      sorted.length /
      2,
    );

  return sorted.length %
    2 ===
    0
    ? (
        sorted[
          middle -
          1
        ]! +
        sorted[
          middle
        ]!
      ) /
        2
    : sorted[
        middle
      ]!;
}

export const crossVenuePriceCredibilityService =
  new CrossVenuePriceCredibilityService();
