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
      Math.max(
        stableCount,
        explorationPoolSize,
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
