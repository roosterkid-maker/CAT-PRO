import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";

export const MAXIMUM_DISCOVERY_PRICE_RATIO =
  1.05;

export interface PriceAlignedMarket {
  market: string;

  canonicalMarket: string;

  firstPrice: number;

  secondPrice: number;

  priceRatio: number;
}

export interface RotatingDiscoveryWindow {
  prioritizedMarkets:
    readonly string[];

  nextCursor: number;

  stableMarkets:
    readonly string[];

  explorationMarkets:
    readonly string[];
}

export interface AdaptiveExecutableCoverageCandidate {
  market: string;

  canonicalMarket: string;

  peerExchangeCount: number;

  targetExecutable: boolean;

  grossEdgePercent: number | null;

  feeAdjustedEdgePercent: number | null;

  executableNotional: number;
}

export interface AdaptiveExecutableCoverageOptions {
  targetExchange: string;

  targetDiscoveryQuotes?:
    readonly ExecutableQuote[];

  now?: number;

  maximumExecutableAgeMs?: number;

  maximumDiscoveryAgeMs?: number;

  maximumPriceRatio?: number;

  resolveTakerFeePercent?: (
    exchange: string,
    market: string,
  ) => number | null;
}

interface CoverageBook {
  exchange: string;

  market: string;

  bidPrice: number;

  bidQuantity: number;

  askPrice: number;

  askQuantity: number;

  timestamp: number;
}

const DEFAULT_MAXIMUM_EXECUTABLE_AGE_MS =
  15_000;

const DEFAULT_MAXIMUM_DISCOVERY_AGE_MS =
  120_000;

const EDGE_RANKING_BUCKET_PERCENT =
  0.05;

/**
 * Rank shared ticker markets that are close enough to justify bounded
 * full-depth discovery.
 *
 * Ticker evidence never becomes executable here. It only decides which
 * markets receive real order-book subscriptions; the adapters, freshness
 * checks and opportunity engine remain authoritative after discovery.
 */
export function rankPriceAlignedSharedMarkets(
  firstQuotes:
    readonly ExecutableQuote[],

  secondQuotes:
    readonly ExecutableQuote[],

  maximumPriceRatio =
    MAXIMUM_DISCOVERY_PRICE_RATIO,
): PriceAlignedMarket[] {
  if (
    !Number.isFinite(
      maximumPriceRatio,
    ) ||
    maximumPriceRatio <
      1
  ) {
    return [];
  }

  const secondByMarket =
    new Map<
      string,
      ExecutableQuote
    >();

  for (const quote of secondQuotes) {
    const canonicalMarket =
      canonicalizeMarket(
        quote.market,
      );

    if (
      canonicalMarket &&
      resolveDiscoveryPrice(
        quote,
      ) !==
        null
    ) {
      secondByMarket.set(
        canonicalMarket,
        quote,
      );
    }
  }

  const ranked =
    new Map<
      string,
      PriceAlignedMarket
    >();

  for (const first of firstQuotes) {
    const canonicalMarket =
      canonicalizeMarket(
        first.market,
      );

    const second =
      secondByMarket.get(
        canonicalMarket,
      );

    const firstPrice =
      resolveDiscoveryPrice(
        first,
      );

    const secondPrice =
      second
        ? resolveDiscoveryPrice(
            second,
          )
        : null;

    if (
      !canonicalMarket ||
      firstPrice ===
        null ||
      secondPrice ===
        null
    ) {
      continue;
    }

    const priceRatio =
      Math.max(
        firstPrice,
        secondPrice,
      ) /
      Math.min(
        firstPrice,
        secondPrice,
      );

    if (
      !Number.isFinite(
        priceRatio,
      ) ||
      priceRatio >
        maximumPriceRatio
    ) {
      continue;
    }

    const candidate:
      PriceAlignedMarket = {
      market:
        first.market,
      canonicalMarket,
      firstPrice,
      secondPrice,
      priceRatio,
    };

    const previous =
      ranked.get(
        canonicalMarket,
      );

    if (
      !previous ||
      candidate.priceRatio <
        previous.priceRatio
    ) {
      ranked.set(
        canonicalMarket,
        candidate,
      );
    }
  }

  return [
    ...ranked.values(),
  ].sort(
    (
      first,
      second,
    ) =>
      discoveryOpportunityPriority(
        first,
      ) -
        discoveryOpportunityPriority(
          second,
        ) ||
      /*
       * Among credible books, a larger observed cross-venue separation is
       * more useful to Strategy #1 than a perfectly flat pair. This remains
       * discovery-only: full depth, fees, freshness and qualification still
       * decide whether the route is executable.
       */
      second.priceRatio -
        first.priceRatio ||
      first.canonicalMarket.localeCompare(
        second.canonicalMarket,
      ),
  );
}

/**
 * Keep the strongest markets continuously warm while spending one or more
 * scarce REST-book slots on a bounded rotating exploration pool. The returned
 * tail preserves the original ranking, so quarantined or unavailable markets
 * can still be replaced by the adapter without expanding the active limit.
 */
export function selectRotatingDiscoveryWindow(
  rankedMarkets:
    readonly string[],

  activeMarketLimit: number,

  explorationCursor: number,

  explorationSlotCount =
    1,

  explorationPoolSize =
    12,
): RotatingDiscoveryWindow {
  const uniqueMarkets = [
    ...new Map(
      rankedMarkets
        .map(
          (market) => [
            canonicalizeMarket(
              market,
            ),
            market.trim(),
          ] as const,
        )
        .filter(
          ([canonicalMarket]) =>
            canonicalMarket.length >
              0,
        ),
    ).values(),
  ];

  const boundedActiveLimit =
    Number.isSafeInteger(
      activeMarketLimit,
    )
      ? Math.max(
          0,
          Math.min(
            activeMarketLimit,
            uniqueMarkets.length,
          ),
        )
      : 0;

  const boundedExplorationSlots =
    Number.isSafeInteger(
      explorationSlotCount,
    )
      ? Math.max(
          0,
          Math.min(
            explorationSlotCount,
            boundedActiveLimit,
          ),
        )
      : 0;

  const stableCount =
    boundedActiveLimit -
    boundedExplorationSlots;

  const stableMarkets =
    uniqueMarkets.slice(
      0,
      stableCount,
    );

  const explorationPool =
    uniqueMarkets.slice(
      stableCount,
      stableCount +
        Math.max(
          0,
          Number.isSafeInteger(
            explorationPoolSize,
          )
            ? explorationPoolSize
            : 0,
        ),
    );

  const normalizedCursor =
    explorationPool.length >
      0 &&
    Number.isSafeInteger(
      explorationCursor,
    )
      ? (
          explorationCursor %
            explorationPool.length +
          explorationPool.length
        ) %
          explorationPool.length
      : 0;

  const explorationMarkets:
    string[] = [];

  for (
    let offset = 0;
    offset <
      Math.min(
        boundedExplorationSlots,
        explorationPool.length,
      );
    offset += 1
  ) {
    const market =
      explorationPool[
        (
          normalizedCursor +
          offset
        ) %
          explorationPool.length
      ];

    if (market) {
      explorationMarkets.push(
        market,
      );
    }
  }

  const prioritizedMarkets = [
    ...new Set([
      ...stableMarkets,
      ...explorationMarkets,
      ...uniqueMarkets,
    ]),
  ];

  return {
    prioritizedMarkets,
    stableMarkets,
    explorationMarkets,
    nextCursor:
      explorationPool.length >
        0
        ? (
            normalizedCursor +
            Math.max(
              1,
              explorationMarkets.length,
            )
          ) %
            explorationPool.length
        : 0,
  };
}

/**
 * Rank scarce full-depth subscriptions using only genuine executable peer
 * books plus bounded target-venue ticker discovery. Ticker-only evidence can
 * influence subscription order, but can never become an executable quote or
 * bypass the normal freshness, fee, liquidity and opportunity engines.
 *
 * The comparator intentionally buckets live edge and notional values. This
 * keeps the ranking adaptive without churning subscriptions for insignificant
 * top-of-book noise every refresh cycle.
 */
export function rankAdaptiveExecutableCoverageMarkets(
  executableQuotes:
    readonly ExecutableQuote[],

  options:
    AdaptiveExecutableCoverageOptions,
): AdaptiveExecutableCoverageCandidate[] {
  const targetExchange =
    options.targetExchange
      .trim()
      .toLowerCase();

  if (!targetExchange) {
    return [];
  }

  const now =
    Number.isFinite(
      options.now,
    )
      ? options.now as number
      : Date.now();

  const maximumExecutableAgeMs =
    resolvePositiveBound(
      options.maximumExecutableAgeMs,
      DEFAULT_MAXIMUM_EXECUTABLE_AGE_MS,
    );

  const maximumDiscoveryAgeMs =
    resolvePositiveBound(
      options.maximumDiscoveryAgeMs,
      DEFAULT_MAXIMUM_DISCOVERY_AGE_MS,
    );

  const maximumPriceRatio =
    Number.isFinite(
      options.maximumPriceRatio,
    ) &&
    (options.maximumPriceRatio as number) >=
      1
      ? options.maximumPriceRatio as number
      : MAXIMUM_DISCOVERY_PRICE_RATIO;

  const booksByMarket =
    new Map<
      string,
      Map<string, CoverageBook>
    >();

  for (const quote of executableQuotes) {
    const book =
      toFreshCoverageBook(
        quote,
        now,
        maximumExecutableAgeMs,
      );

    if (!book) {
      continue;
    }

    const canonicalMarket =
      canonicalizeMarket(
        book.market,
      );

    if (!canonicalMarket) {
      continue;
    }

    const booksByExchange =
      booksByMarket.get(
        canonicalMarket,
      ) ??
      new Map<string, CoverageBook>();

    const previous =
      booksByExchange.get(
        book.exchange,
      );

    if (
      !previous ||
      book.timestamp >
        previous.timestamp
    ) {
      booksByExchange.set(
        book.exchange,
        book,
      );
    }

    booksByMarket.set(
      canonicalMarket,
      booksByExchange,
    );
  }

  const targetDiscoveryByMarket =
    buildFreshDiscoveryPriceIndex(
      options.targetDiscoveryQuotes ??
        [],
      targetExchange,
      now,
      maximumDiscoveryAgeMs,
    );

  const candidates:
    AdaptiveExecutableCoverageCandidate[] =
    [];

  for (
    const [
      canonicalMarket,
      booksByExchange,
    ]
    of booksByMarket
  ) {
    const targetBook =
      booksByExchange.get(
        targetExchange,
      );

    const peerBooks = [
      ...booksByExchange.values(),
    ].filter(
      (book) =>
        book.exchange !==
        targetExchange,
    );

    if (peerBooks.length === 0) {
      continue;
    }

    let strongestGrossEdge:
      number | null =
      null;

    let strongestFeeAdjustedEdge:
      number | null =
      null;

    let executableNotional =
      0;

    if (targetBook) {
      for (const peerBook of peerBooks) {
        for (
          const [buyBook, sellBook]
          of [
            [targetBook, peerBook],
            [peerBook, targetBook],
          ] as const
        ) {
          const route =
            evaluateExecutableCoverageRoute(
              buyBook,
              sellBook,
              options.resolveTakerFeePercent,
            );

          strongestGrossEdge =
            maxNullable(
              strongestGrossEdge,
              route.grossEdgePercent,
            );

          strongestFeeAdjustedEdge =
            maxNullable(
              strongestFeeAdjustedEdge,
              route.feeAdjustedEdgePercent,
            );

          executableNotional =
            Math.max(
              executableNotional,
              route.executableNotional,
            );
        }
      }
    } else {
      const targetDiscovery =
        targetDiscoveryByMarket.get(
          canonicalMarket,
        );

      if (targetDiscovery) {
        for (const peerBook of peerBooks) {
          const peerPrice =
            (
              peerBook.bidPrice +
              peerBook.askPrice
            ) /
            2;

          const priceRatio =
            Math.max(
              targetDiscovery.price,
              peerPrice,
            ) /
            Math.min(
              targetDiscovery.price,
              peerPrice,
            );

          if (
            !Number.isFinite(
              priceRatio,
            ) ||
            priceRatio >
              maximumPriceRatio
          ) {
            continue;
          }

          const grossEdgePercent =
            (
              priceRatio -
              1
            ) *
            100;

          strongestGrossEdge =
            maxNullable(
              strongestGrossEdge,
              grossEdgePercent,
            );

          const targetFee =
            options.resolveTakerFeePercent?.(
              targetExchange,
              targetDiscovery.market,
            ) ??
            null;

          const peerFee =
            options.resolveTakerFeePercent?.(
              peerBook.exchange,
              peerBook.market,
            ) ??
            null;

          if (
            isNonNegativeFinite(
              targetFee,
            ) &&
            isNonNegativeFinite(
              peerFee,
            )
          ) {
            strongestFeeAdjustedEdge =
              maxNullable(
                strongestFeeAdjustedEdge,
                grossEdgePercent -
                  targetFee -
                  peerFee,
              );
          }
        }
      }

      if (peerBooks.length > 1) {
        for (
          let firstIndex = 0;
          firstIndex <
          peerBooks.length;
          firstIndex += 1
        ) {
          for (
            let secondIndex =
              firstIndex +
              1;
            secondIndex <
            peerBooks.length;
            secondIndex += 1
          ) {
            const first =
              peerBooks[firstIndex];

            const second =
              peerBooks[secondIndex];

            if (!first || !second) {
              continue;
            }

            for (
              const [buyBook, sellBook]
              of [
                [first, second],
                [second, first],
              ] as const
            ) {
              const route =
                evaluateExecutableCoverageRoute(
                  buyBook,
                  sellBook,
                  options.resolveTakerFeePercent,
                );

              strongestGrossEdge =
                maxNullable(
                  strongestGrossEdge,
                  route.grossEdgePercent,
                );

              strongestFeeAdjustedEdge =
                maxNullable(
                  strongestFeeAdjustedEdge,
                  route.feeAdjustedEdgePercent,
                );

              executableNotional =
                Math.max(
                  executableNotional,
                  route.executableNotional,
                );
            }
          }
        }
      }
    }

    candidates.push({
      market:
        peerBooks[0]
          ?.market ??
        canonicalMarket,

      canonicalMarket,

      peerExchangeCount:
        peerBooks.length,

      targetExecutable:
        targetBook !==
        undefined,

      grossEdgePercent:
        strongestGrossEdge,

      feeAdjustedEdgePercent:
        strongestFeeAdjustedEdge,

      executableNotional,
    });
  }

  return candidates.sort(
    (
      first,
      second,
    ) =>
      compareNullableEdgeBucket(
        second.feeAdjustedEdgePercent,
        first.feeAdjustedEdgePercent,
      ) ||
      Number(
        second.targetExecutable,
      ) -
        Number(
          first.targetExecutable,
        ) ||
      compareNullableEdgeBucket(
        second.grossEdgePercent,
        first.grossEdgePercent,
      ) ||
      second.peerExchangeCount -
        first.peerExchangeCount ||
      notionalBucket(
        second.executableNotional,
      ) -
        notionalBucket(
          first.executableNotional,
        ) ||
      first.canonicalMarket.localeCompare(
        second.canonicalMarket,
      ),
  );
}

function evaluateExecutableCoverageRoute(
  buyBook: CoverageBook,
  sellBook: CoverageBook,
  resolveTakerFeePercent:
    AdaptiveExecutableCoverageOptions["resolveTakerFeePercent"],
): {
  grossEdgePercent: number;
  feeAdjustedEdgePercent: number | null;
  executableNotional: number;
} {
  const grossEdgePercent =
    (
      sellBook.bidPrice -
      buyBook.askPrice
    ) /
    buyBook.askPrice *
    100;

  const buyFee =
    resolveTakerFeePercent?.(
      buyBook.exchange,
      buyBook.market,
    ) ??
    null;

  const sellFee =
    resolveTakerFeePercent?.(
      sellBook.exchange,
      sellBook.market,
    ) ??
    null;

  return {
    grossEdgePercent,

    feeAdjustedEdgePercent:
      isNonNegativeFinite(
        buyFee,
      ) &&
      isNonNegativeFinite(
        sellFee,
      )
        ? grossEdgePercent -
          buyFee -
          sellFee
        : null,

    executableNotional:
      Math.min(
        buyBook.askPrice *
          buyBook.askQuantity,
        sellBook.bidPrice *
          sellBook.bidQuantity,
      ),
  };
}

function toFreshCoverageBook(
  quote: ExecutableQuote,
  now: number,
  maximumAgeMs: number,
): CoverageBook | null {
  const age =
    now -
    quote.timestamp;

  if (
    !quote.executable ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > maximumAgeMs ||
    !isPositiveFinite(
      quote.bestBidPrice,
    ) ||
    !isPositiveFinite(
      quote.bestBidQty,
    ) ||
    !isPositiveFinite(
      quote.bestAskPrice,
    ) ||
    !isPositiveFinite(
      quote.bestAskQty,
    ) ||
    quote.bestAskPrice <
      quote.bestBidPrice
  ) {
    return null;
  }

  return {
    exchange:
      quote.exchange
        .trim()
        .toLowerCase(),

    market:
      quote.market
        .trim()
        .toUpperCase(),

    bidPrice:
      quote.bestBidPrice,

    bidQuantity:
      quote.bestBidQty,

    askPrice:
      quote.bestAskPrice,

    askQuantity:
      quote.bestAskQty,

    timestamp:
      quote.timestamp,
  };
}

function buildFreshDiscoveryPriceIndex(
  quotes: readonly ExecutableQuote[],
  targetExchange: string,
  now: number,
  maximumAgeMs: number,
): Map<
  string,
  {
    market: string;
    price: number;
    timestamp: number;
  }
> {
  const index =
    new Map<
      string,
      {
        market: string;
        price: number;
        timestamp: number;
      }
    >();

  for (const quote of quotes) {
    if (
      quote.exchange
        .trim()
        .toLowerCase() !==
      targetExchange
    ) {
      continue;
    }

    const age =
      now -
      quote.timestamp;

    const price =
      resolveDiscoveryPrice(
        quote,
      );

    const canonicalMarket =
      canonicalizeMarket(
        quote.market,
      );

    if (
      !canonicalMarket ||
      price ===
        null ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > maximumAgeMs
    ) {
      continue;
    }

    const previous =
      index.get(
        canonicalMarket,
      );

    if (
      !previous ||
      quote.timestamp >
        previous.timestamp
    ) {
      index.set(
        canonicalMarket,
        {
          market:
            quote.market,

          price,

          timestamp:
            quote.timestamp,
        },
      );
    }
  }

  return index;
}

function compareNullableEdgeBucket(
  first: number | null,
  second: number | null,
): number {
  return edgeBucket(
    first,
  ) -
    edgeBucket(
      second,
    );
}

function edgeBucket(
  value: number | null,
): number {
  return value ===
      null ||
    !Number.isFinite(value)
    ? Number.MIN_SAFE_INTEGER
    : Math.floor(
        value /
          EDGE_RANKING_BUCKET_PERCENT,
      );
}

function notionalBucket(
  value: number,
): number {
  return Number.isFinite(value) &&
    value > 0
    ? Math.floor(
        Math.log10(value),
      )
    : 0;
}

function maxNullable(
  first: number | null,
  second: number | null,
): number | null {
  if (
    second ===
      null ||
    !Number.isFinite(second)
  ) {
    return first;
  }

  return first ===
      null ||
    second > first
    ? second
    : first;
}

function resolvePositiveBound(
  value: number | undefined,
  fallback: number,
): number {
  return Number.isFinite(value) &&
    (value as number) > 0
    ? value as number
    : fallback;
}

function isNonNegativeFinite(
  value: number | null,
): value is number {
  return value !==
      null &&
    Number.isFinite(value) &&
    value >= 0;
}

function discoveryOpportunityPriority(
  candidate:
    PriceAlignedMarket,
): number {
  /*
   * Prefer INR routes for the CoinDCX/UnoCoin fast lane. USDT-denominated
   * markets remain eligible immediately afterwards, so this is a bounded
   * route priority rather than a market exclusion rule.
   */
  return candidate.canonicalMarket.endsWith(
    "INR",
  )
    ? 0
    : 1;
}

function resolveDiscoveryPrice(
  quote:
    ExecutableQuote,
): number | null {
  if (
    isPositiveFinite(
      quote.bestBidPrice,
    ) &&
    isPositiveFinite(
      quote.bestAskPrice,
    ) &&
    quote.bestAskPrice >=
      quote.bestBidPrice
  ) {
    return (
      quote.bestBidPrice +
      quote.bestAskPrice
    ) /
      2;
  }

  return isPositiveFinite(
    quote.lastPrice,
  )
    ? quote.lastPrice
    : null;
}

function canonicalizeMarket(
  market:
    string,
): string {
  return market
    .trim()
    .toUpperCase()
    .replace(
      /[^A-Z0-9]/g,
      "",
    );
}

function isPositiveFinite(
  value:
    number | null,
): value is number {
  return (
    value !==
      null &&
    Number.isFinite(
      value,
    ) &&
    value >
      0
  );
}
