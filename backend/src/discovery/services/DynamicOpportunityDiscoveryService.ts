import {
  createHash,
} from "node:crypto";

import type {
  ExecutableQuote,
} from "../../core/models/ExecutableQuote";

import {
  freshnessIntegrityService,
} from "../../freshness/services/FreshnessIntegrityService";

import {
  marketCache,
} from "../../services/cache.service";

import type {
  CrossExchangeDiscoveryRoute,
  DiscoveryVenueBook,
  DynamicOpportunityDiscoverySnapshot,
  TriangularDiscoveryLeg,
  TriangularDiscoveryPath,
} from "../models/DynamicOpportunityDiscovery";

export interface DynamicOpportunityDiscoveryDependencies {
  getQuotes():
    ExecutableQuote[];

  isFresh(
    quote:
      ExecutableQuote,
    now:
      number,
  ): boolean;
}

const DEFAULT_DEPENDENCIES:
  DynamicOpportunityDiscoveryDependencies = {
  getQuotes:
    () =>
      marketCache.getAll(),

  isFresh:
    (
      quote,
      now,
    ) =>
      freshnessIntegrityService
        .evaluateQuote(
          quote,
          now,
        )
        .fresh,
};

const KNOWN_QUOTE_ASSETS = [
  "FDUSD",
  "USDT",
  "USDC",
  "TUSD",
  "BUSD",
  "DAI",
  "USDP",
  "EUR",
  "GBP",
  "INR",
  "USD",
  "BTC",
  "ETH",
  "BNB",
] as const;

const MAXIMUM_BOOKS =
  10_000;

const MAXIMUM_CROSS_EXCHANGE_ROUTES =
  5_000;

const MAXIMUM_TRIANGULAR_PATHS =
  2_000;

interface DirectedConversionEdge {
  exchange: string;
  market: string;
  fromAsset: string;
  toAsset: string;
  action:
    | "SELL_BASE"
    | "BUY_BASE";
  referenceRate: number;
  maximumInputQuantity: number;
  timestamp: number;
}

export class DynamicOpportunityDiscoveryService {
  private readonly dependencies:
    DynamicOpportunityDiscoveryDependencies;

  constructor(
    dependencies:
      Partial<DynamicOpportunityDiscoveryDependencies> = {},
  ) {
    this.dependencies = {
      ...DEFAULT_DEPENDENCIES,
      ...dependencies,
    };
  }

  getSnapshot(
    now =
      Date.now(),
  ): DynamicOpportunityDiscoverySnapshot {
    const quotes =
      this.dependencies
        .getQuotes()
        .slice(
          0,
          MAXIMUM_BOOKS,
        );

    const books =
      quotes
        .map(
          (quote) =>
            this.toBook(
              quote,
              now,
            ),
        )
        .filter(
          (
            book,
          ): book is DiscoveryVenueBook =>
            book !== null,
        );

    const marketGroups =
      this.groupBooksByMarket(
        books,
      );

    const crossExchangeRoutes =
      this.buildCrossExchangeRoutes(
        marketGroups,
      );

    const triangularPaths =
      this.buildTriangularPaths(
        books,
      );

    const exchangeNames =
      new Set(
        books.map(
          (book) =>
            book.exchange,
        ),
      );

    const sharedSpotMarkets =
      Array.from(
        marketGroups.values(),
      )
        .filter(
          (group) =>
            new Set(
              group.map(
                (book) =>
                  book.exchange,
              ),
            ).size >= 2,
        )
        .length;

    return {
      generatedAt:
        now,
      version:
        "24.0",
      mode:
        "READ_ONLY_DYNAMIC_DISCOVERY",
      summary: {
        cachedQuotes:
          quotes.length,
        freshExecutableBooks:
          books.length,
        rejectedQuotes:
          quotes.length -
          books.length,
        exchanges:
          exchangeNames.size,
        normalizedSpotMarkets:
          marketGroups.size,
        sharedSpotMarkets,
        crossExchangeRoutes:
          crossExchangeRoutes.length,
        triangularPaths:
          triangularPaths.length,
      },
      books,
      crossExchangeRoutes,
      triangularPaths,
      safety: {
        marketCacheMutationAllowed:
          false,
        freshnessThresholdMutationAllowed:
          false,
        profitabilityQualificationAllowed:
          false,
        capitalMutationAllowed:
          false,
        paperExecutionAllowed:
          false,
        liveExecutionAllowed:
          false,
        orderSubmissionAllowed:
          false,
      },
      notes: [
        "Only genuine current quantity-bearing top-of-book evidence enters the shared discovery graph.",
        "Cross-exchange routes are topology candidates; fees, slippage, rules, balances, and risk remain mandatory downstream gates.",
        "Triangular paths describe three-leg conversion topology and reference rates only; they are not profit or execution claims.",
        "The service is strategy-neutral and exposes no cache mutation, capital, PAPER, LIVE, or exchange-order method.",
      ],
    };
  }

  private toBook(
    quote:
      ExecutableQuote,

    now:
      number,
  ): DiscoveryVenueBook | null {
    if (
      !quote.executable ||
      !this.dependencies
        .isFresh(
          quote,
          now,
        ) ||
      !this.positive(
        quote.bestBidPrice,
      ) ||
      !this.positive(
        quote.bestBidQty,
      ) ||
      !this.positive(
        quote.bestAskPrice,
      ) ||
      !this.positive(
        quote.bestAskQty,
      ) ||
      quote.bestBidPrice >=
        quote.bestAskPrice
    ) {
      return null;
    }

    const identity =
      this.parseMarket(
        quote.market,
      );

    if (
      !identity
    ) {
      return null;
    }

    return {
      exchange:
        quote.exchange
          .trim()
          .toLowerCase(),
      market:
        `${identity.baseAsset}${identity.quoteAsset}`,
      baseAsset:
        identity.baseAsset,
      quoteAsset:
        identity.quoteAsset,
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

  private parseMarket(
    rawMarket:
      string,
  ): {
    baseAsset: string;
    quoteAsset: string;
  } | null {
    const separated =
      rawMarket
        .trim()
        .toUpperCase()
        .split(
          /[-_/:]/,
        )
        .filter(
          Boolean,
        );

    if (
      separated.length === 2 &&
      separated[0] &&
      separated[1]
    ) {
      return {
        baseAsset:
          separated[0],
        quoteAsset:
          separated[1],
      };
    }

    const compact =
      rawMarket
        .trim()
        .toUpperCase()
        .replace(
          /[^A-Z0-9]/g,
          "",
        );

    for (
      const quoteAsset
      of KNOWN_QUOTE_ASSETS
    ) {
      if (
        compact.endsWith(
          quoteAsset,
        ) &&
        compact.length >
          quoteAsset.length
      ) {
        return {
          baseAsset:
            compact.slice(
              0,
              -quoteAsset.length,
            ),
          quoteAsset,
        };
      }
    }

    return null;
  }

  private groupBooksByMarket(
    books:
      readonly DiscoveryVenueBook[],
  ): Map<
    string,
    DiscoveryVenueBook[]
  > {
    const groups =
      new Map<
        string,
        DiscoveryVenueBook[]
      >();

    for (
      const book
      of books
    ) {
      const current =
        groups.get(
          book.market,
        ) ?? [];

      current.push(
        book,
      );

      groups.set(
        book.market,
        current,
      );
    }

    return groups;
  }

  private buildCrossExchangeRoutes(
    groups:
      ReadonlyMap<
        string,
        readonly DiscoveryVenueBook[]
      >,
  ): CrossExchangeDiscoveryRoute[] {
    const routes:
      CrossExchangeDiscoveryRoute[] =
      [];

    for (
      const [
        market,
        books,
      ]
      of groups
    ) {
      for (
        const buy
        of books
      ) {
        for (
          const sell
          of books
        ) {
          if (
            buy.exchange ===
            sell.exchange
          ) {
            continue;
          }

          routes.push({
            id:
              this.id(
                "cross",
                market,
                buy.exchange,
                sell.exchange,
                String(
                  Math.max(
                    buy.timestamp,
                    sell.timestamp,
                  ),
                ),
              ),
            kind:
              "CROSS_EXCHANGE_SPOT_ROUTE",
            market,
            buyExchange:
              buy.exchange,
            sellExchange:
              sell.exchange,
            buyAskPrice:
              buy.askPrice,
            buyAskQuantity:
              buy.askQuantity,
            sellBidPrice:
              sell.bidPrice,
            sellBidQuantity:
              sell.bidQuantity,
            maximumTopOfBookQuantity:
              Math.min(
                buy.askQuantity,
                sell.bidQuantity,
              ),
            grossSpreadPercent:
              this.round(
                (
                  sell.bidPrice -
                  buy.askPrice
                ) /
                  buy.askPrice *
                  100,
                8,
              ),
            economicallyQualified:
              false,
            executionAuthorized:
              false,
          });

          if (
            routes.length >=
            MAXIMUM_CROSS_EXCHANGE_ROUTES
          ) {
            return routes;
          }
        }
      }
    }

    return routes;
  }

  private buildTriangularPaths(
    books:
      readonly DiscoveryVenueBook[],
  ): TriangularDiscoveryPath[] {
    const booksByExchange =
      new Map<
        string,
        DiscoveryVenueBook[]
      >();

    for (
      const book
      of books
    ) {
      const exchangeBooks =
        booksByExchange.get(
          book.exchange,
        ) ?? [];

      exchangeBooks.push(
        book,
      );

      booksByExchange.set(
        book.exchange,
        exchangeBooks,
      );
    }

    const paths:
      TriangularDiscoveryPath[] =
      [];

    const seen =
      new Set<string>();

    for (
      const [
        exchange,
        exchangeBooks,
      ]
      of booksByExchange
    ) {
      const edges =
        exchangeBooks.flatMap(
          (book) =>
            this.toEdges(
              book,
            ),
        );

      const outgoing =
        new Map<
          string,
          DirectedConversionEdge[]
        >();

      for (
        const edge
        of edges
      ) {
        const current =
          outgoing.get(
            edge.fromAsset,
          ) ?? [];

        current.push(
          edge,
        );

        outgoing.set(
          edge.fromAsset,
          current,
        );
      }

      for (
        const first
        of edges
      ) {
        for (
          const second
          of outgoing.get(
            first.toAsset,
          ) ?? []
        ) {
          if (
            second.market ===
            first.market ||
            second.toAsset ===
            first.fromAsset
          ) {
            continue;
          }

          for (
            const third
            of outgoing.get(
              second.toAsset,
            ) ?? []
          ) {
            if (
              third.toAsset !==
                first.fromAsset ||
              third.market ===
                first.market ||
              third.market ===
                second.market
            ) {
              continue;
            }

            const cycleAssets = [
              first.fromAsset,
              first.toAsset,
              second.toAsset,
            ];

            /*
             * A triangle's start asset defines the
             * sizing unit. Alphabetical rotation can
             * make one unit mean 1 USDT on one path
             * and 1 BTC on another. Prefer a liquid
             * quote anchor so downstream notional and
             * risk sizing stay economically meaningful.
             */
            const canonicalStart =
              [
                "USDT",
                "USDC",
                "INR",
                "BTC",
                "ETH",
              ].find(
                (
                  asset,
                ) =>
                  cycleAssets.includes(
                    asset,
                  ),
              ) ??
              [...cycleAssets]
                .sort()[0];

            if (
              first.fromAsset !==
              canonicalStart
            ) {
              continue;
            }

            const key =
              [
                exchange,
                first.fromAsset,
                first.toAsset,
                second.toAsset,
              ].join(
                "|",
              );

            if (
              seen.has(
                key,
              )
            ) {
              continue;
            }

            seen.add(
              key,
            );

            const legs = [
              this.toLeg(
                first,
              ),
              this.toLeg(
                second,
              ),
              this.toLeg(
                third,
              ),
            ] as const;

            paths.push({
              id:
                this.id(
                  "triangle",
                  key,
                  ...legs.map(
                    (leg) =>
                      String(
                        leg.timestamp,
                      ),
                  ),
                ),
              kind:
                "TRIANGULAR_SPOT_PATH",
              exchange,
              startAsset:
                first.fromAsset,
              assets: [
                first.fromAsset,
                first.toAsset,
                second.toAsset,
                first.fromAsset,
              ],
              legs,
              referenceGrossMultiplier:
                this.round(
                  first.referenceRate *
                  second.referenceRate *
                  third.referenceRate,
                  12,
                ),
              feesApplied:
                false,
              marketRulesApplied:
                false,
              economicallyQualified:
                false,
              executionAuthorized:
                false,
            });

            if (
              paths.length >=
              MAXIMUM_TRIANGULAR_PATHS
            ) {
              return paths;
            }
          }
        }
      }
    }

    return paths;
  }

  private toEdges(
    book:
      DiscoveryVenueBook,
  ): DirectedConversionEdge[] {
    return [
      {
        exchange:
          book.exchange,
        market:
          book.market,
        fromAsset:
          book.baseAsset,
        toAsset:
          book.quoteAsset,
        action:
          "SELL_BASE",
        referenceRate:
          book.bidPrice,
        maximumInputQuantity:
          book.bidQuantity,
        timestamp:
          book.timestamp,
      },
      {
        exchange:
          book.exchange,
        market:
          book.market,
        fromAsset:
          book.quoteAsset,
        toAsset:
          book.baseAsset,
        action:
          "BUY_BASE",
        referenceRate:
          1 /
          book.askPrice,
        maximumInputQuantity:
          book.askPrice *
          book.askQuantity,
        timestamp:
          book.timestamp,
      },
    ];
  }

  private toLeg(
    edge:
      DirectedConversionEdge,
  ): TriangularDiscoveryLeg {
    return {
      market:
        edge.market,
      fromAsset:
        edge.fromAsset,
      toAsset:
        edge.toAsset,
      action:
        edge.action,
      referenceRate:
        edge.referenceRate,
      maximumInputQuantity:
        edge.maximumInputQuantity,
      timestamp:
        edge.timestamp,
    };
  }

  private positive(
    value:
      number | null,
  ): value is number {
    return Number.isFinite(
      value,
    ) &&
      value !== null &&
      value > 0;
  }

  private id(
    ...parts:
      string[]
  ): string {
    return createHash(
      "sha256",
    )
      .update(
        parts.join(
          "|",
        ),
      )
      .digest(
        "hex",
      )
      .slice(
        0,
        32,
      );
  }

  private round(
    value: number,
    digits: number,
  ): number {
    const multiplier =
      10 ** digits;

    return Math.round(
      (
        value +
        Number.EPSILON
      ) *
      multiplier,
    ) /
      multiplier;
  }
}

export const dynamicOpportunityDiscoveryService =
  new DynamicOpportunityDiscoveryService();
