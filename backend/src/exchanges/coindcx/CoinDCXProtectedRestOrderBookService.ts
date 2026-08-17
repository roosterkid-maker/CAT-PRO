import axios from "axios";

import type {
  OrderBook,
} from "../../orderbook/models/OrderBook";

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import {
  marketCache,
} from "../../services/cache.service";

import {
  marketRegistry,
} from "./registry";

import {
  normalizeCoinDCXFullOrderBook,
} from "./orderBookNormalizer";

import {
  coinDCXOrderBookIntegrityService,
} from "./CoinDCXOrderBookIntegrityService";

import type {
  CoinDCXOrderBookPayload,
} from "./orderBook.types";

export interface CoinDCXProtectedRestOrderBookFetcher {
  fetch(
    pair: string,
  ): Promise<unknown>;
}

export interface CoinDCXProtectedRestOrderBookStore {
  replace(
    book: OrderBook,
  ): {
    readonly accepted: boolean;
    readonly reason: string;
  };

  publishExecutable?(
    book: OrderBook,
  ): void;
}

export interface CoinDCXProtectedRestOrderBookConfiguration {
  readonly market:
    string;

  readonly pair:
    string;

  readonly additionalBooks:
    readonly CoinDCXProtectedRestOrderBookTarget[];

  readonly refreshIntervalMs:
    number;

  readonly strategyOneTargetLimit:
    number;

  readonly maxConcurrentReads:
    number;
}

export interface CoinDCXProtectedRestOrderBookTarget {
  readonly market:
    string;

  readonly pair:
    string;

  readonly purpose:
    | "CAPITAL_VALUATION"
    | "STRATEGY_HEDGE_ANCHOR"
    | "STRATEGY_ONE_DISCOVERY";
}

interface CoinDCXProtectedTargetDiagnostics {
  attempts:
    number;

  accepted:
    number;

  rejected:
    number;

  lastAttemptAt:
    number | null;

  lastSuccessAt:
    number | null;

  lastError:
    string | null;
}

const DEFAULT_STRATEGY_ONE_TARGET_LIMIT =
  24;

const ABSOLUTE_STRATEGY_ONE_TARGET_LIMIT =
  40;

const DEFAULT_MAX_CONCURRENT_READS =
  4;

const ABSOLUTE_MAX_CONCURRENT_READS =
  6;

/*
 * Strategy #1 fallback priority.
 *
 * UnoCoin-specific candidates supplied by WebSocketManager
 * always come first.
 *
 * Remaining unused CoinDCX protected REST slots are filled
 * from already executable counterpart venues.
 */
const STRATEGY_ONE_COUNTERPART_PRIORITY =
  Object.freeze([
    "coinswitch",
    "binance",
    "bybit",
    "unocoin",
  ] as const);

function resolveBoundedPositiveInteger(
  rawValue:
    string | undefined,

  fallback:
    number,

  maximum:
    number,
): number {
  if (
    rawValue ===
      undefined ||
    rawValue
      .trim()
      .length ===
      0
  ) {
    return fallback;
  }

  const parsed =
    Number(
      rawValue,
    );

  if (
    !Number.isSafeInteger(
      parsed,
    ) ||
    parsed <=
      0
  ) {
    return fallback;
  }

  return Math.min(
    parsed,
    maximum,
  );
}

const DEFAULT_CONFIGURATION:
  CoinDCXProtectedRestOrderBookConfiguration = {
  market:
    "USDTINR",

  pair:
    "I-USDT_INR",

  additionalBooks: [
    {
      market:
        "BTCUSDT",

      pair:
        "B-BTC_USDT",

      purpose:
        "STRATEGY_HEDGE_ANCHOR",
    },
  ],

  refreshIntervalMs:
    5_000,

  strategyOneTargetLimit:
    resolveBoundedPositiveInteger(
      process.env
        .COINDCX_STRATEGY_ONE_REST_MARKETS,

      DEFAULT_STRATEGY_ONE_TARGET_LIMIT,

      ABSOLUTE_STRATEGY_ONE_TARGET_LIMIT,
    ),

  maxConcurrentReads:
    resolveBoundedPositiveInteger(
      process.env
        .COINDCX_PROTECTED_REST_MAX_CONCURRENT_READS,

      DEFAULT_MAX_CONCURRENT_READS,

      ABSOLUTE_MAX_CONCURRENT_READS,
    ),
};

class AxiosCoinDCXProtectedRestOrderBookFetcher
implements CoinDCXProtectedRestOrderBookFetcher {
  async fetch(
    pair:
      string,
  ): Promise<unknown> {
    const response =
      await axios.get(
        "https://public.coindcx.com/market_data/orderbook",
        {
          params: {
            pair,
          },

          timeout:
            5_000,

          validateStatus:
            (
              status,
            ) =>
              status >=
                200 &&
              status <
                300,
        },
      );

    return response.data;
  }
}

const DEFAULT_STORE:
  CoinDCXProtectedRestOrderBookStore = {
  replace:
    (
      book,
    ) =>
      orderBookService
        .replace(
          book,
        ),

  publishExecutable:
    (
      book,
    ) => {
      const bestBid =
        book.bids[
          0
        ];

      const bestAsk =
        book.asks[
          0
        ];

      if (
        !bestBid ||
        !bestAsk
      ) {
        return;
      }

      marketCache.update({
        exchange:
          "coindcx",

        market:
          book.market,

        lastPrice:
          (
            bestBid.price +
            bestAsk.price
          ) /
          2,

        bid:
          bestBid.price,

        ask:
          bestAsk.price,

        bestBidPrice:
          bestBid.price,

        bestBidQty:
          bestBid.quantity,

        bestAskPrice:
          bestAsk.price,

        bestAskQty:
          bestAsk.quantity,

        spread:
          bestAsk.price -
          bestBid.price,

        timestamp:
          book.timestamp,
      });
    },
};

/**
 * CoinDCX bounded public REST order-book coverage.
 *
 * PURPOSE
 *
 * The main CoinDCX ticker universe can be much larger
 * than the quantity-bearing executable-depth universe.
 *
 * This service maintains a small protected Strategy #1
 * REST lane using only real CoinDCX order-book responses.
 *
 * PRIORITY
 *
 * 1. mandatory/base protected books
 * 2. Strategy #1 targets supplied by WebSocketManager
 * 3. automatic cross-exchange fallback targets
 *
 * Fallback discovery does NOT turn ticker data into
 * executable data.
 *
 * A candidate only becomes executable after:
 *
 * CoinDCX REST response
 *        ↓
 * valid two-sided quantity-bearing book
 *        ↓
 * OrderBookService acceptance
 *        ↓
 * MarketCache executable publication
 *
 * SAFETY
 *
 * - public GET only
 * - no credentials
 * - no order placement
 * - no PAPER execution
 * - no LIVE execution
 * - no guessed prices
 * - no guessed quantities
 */
export class CoinDCXProtectedRestOrderBookService {
  private readonly configuration:
    CoinDCXProtectedRestOrderBookConfiguration;

  private readonly baseTargets:
    readonly CoinDCXProtectedRestOrderBookTarget[];

  private suppliedStrategyOneTargets:
    readonly CoinDCXProtectedRestOrderBookTarget[] =
    [];

  private targets:
    readonly CoinDCXProtectedRestOrderBookTarget[];

  private readonly targetDiagnostics =
    new Map<
      string,
      CoinDCXProtectedTargetDiagnostics
    >();

  private timer:
    NodeJS.Timeout | null =
      null;

  private refreshing =
    false;

  private attempts =
    0;

  private accepted =
    0;

  private rejected =
    0;

  private lastAttemptAt:
    number | null =
      null;

  private lastSuccessAt:
    number | null =
      null;

  private lastError:
    string | null =
      null;

  constructor(
    private readonly fetcher:
      CoinDCXProtectedRestOrderBookFetcher =
      new AxiosCoinDCXProtectedRestOrderBookFetcher(),

    private readonly store:
      CoinDCXProtectedRestOrderBookStore =
      DEFAULT_STORE,

    configuration:
      Partial<CoinDCXProtectedRestOrderBookConfiguration> = {},
  ) {
    this.configuration = {
      ...DEFAULT_CONFIGURATION,
      ...configuration,
    };

    this.validateConfiguration();

    this.baseTargets =
      this.normalizeTargets([
        {
          market:
            this.configuration
              .market,

          pair:
            this.configuration
              .pair,

          purpose:
            "CAPITAL_VALUATION",
        },

        ...this.configuration
          .additionalBooks,
      ]);

    this.targets =
      this.baseTargets;

    this.ensureDiagnostics(
      this.targets,
    );
  }

  start():
    void {
    if (
      this.timer
    ) {
      return;
    }

    this.rebuildActiveTargets();

    this.runSafely();

    this.timer =
      setInterval(
        () => {
          /*
           * Re-evaluate spare Strategy #1 slots every cycle.
           *
           * This allows newly executable CoinSwitch /
           * Binance / Bybit markets to enter the protected
           * CoinDCX depth lane automatically.
           */
          this.rebuildActiveTargets();

          this.runSafely();
        },

        this.configuration
          .refreshIntervalMs,
      );

    this.timer
      .unref?.();
  }

  stop():
    void {
    if (
      this.timer
    ) {
      clearInterval(
        this.timer,
      );

      this.timer =
        null;
    }
  }

  /**
   * High-priority Strategy #1 targets.
   *
   * WebSocketManager currently supplies UnoCoin/CoinDCX
   * aligned candidates here.
   *
   * These always retain priority over automatic fallback
   * discovery.
   */
  setStrategyOneTargets(
    targets:
      readonly Omit<
        CoinDCXProtectedRestOrderBookTarget,
        "purpose"
      >[],
  ): void {
    const supplied:
      CoinDCXProtectedRestOrderBookTarget[] =
      [];

    const seen =
      new Set<
        string
      >();

    for (
      const target
      of targets
    ) {
      if (
        supplied.length >=
        this.configuration
          .strategyOneTargetLimit
      ) {
        break;
      }

      const market =
        target.market
          .trim()
          .toUpperCase();

      const pair =
        target.pair
          .trim()
          .toUpperCase();

      if (
        !market ||
        !pair ||
        seen.has(
          market,
        )
      ) {
        continue;
      }

      /*
       * Reject targets CoinDCX itself does not know.
       */
      const metadata =
        marketRegistry.get(
          market,
        );

      if (
        !metadata
      ) {
        continue;
      }

      seen.add(
        market,
      );

      supplied.push({
        market:
          metadata.symbol,

        pair:
          metadata.pair,

        purpose:
          "STRATEGY_ONE_DISCOVERY",
      });
    }

    this.suppliedStrategyOneTargets =
      supplied;

    this.rebuildActiveTargets();
  }

  async refresh(
    now =
      Date.now(),
  ): Promise<boolean> {
    if (
      this.refreshing
    ) {
      return false;
    }

    this.refreshing =
      true;

    this.lastAttemptAt =
      now;

    try {
      /*
       * Capture one immutable cycle target list.
       *
       * Dynamic target rebuilding cannot mutate a cycle
       * already in flight.
       */
      const cycleTargets = [
        ...this.targets,
      ];

      const results =
        await this
          .refreshTargetsBounded(
            cycleTargets,
            now,
          );

      const errors =
        results
          .filter(
            (
              result,
            ) =>
              !result.accepted,
          )
          .map(
            (
              result,
            ) =>
              `${result.market}: ${result.error}`,
          );

      if (
        results.some(
          (
            result,
          ) =>
            result.accepted,
        )
      ) {
        this.lastSuccessAt =
          Date.now();
      }

      this.lastError =
        errors.length >
          0
          ? errors.join(
              " | ",
            )
          : null;

      return (
        errors.length ===
        0
      );
    } finally {
      this.refreshing =
        false;
    }
  }

  getDiagnostics(
    now =
      Date.now(),
  ) {
    const strategyOneBooks =
      this.targets
        .filter(
          (
            target,
          ) =>
            target.purpose ===
            "STRATEGY_ONE_DISCOVERY",
        );

    const suppliedMarkets =
      new Set(
        this.suppliedStrategyOneTargets
          .map(
            (
              target,
            ) =>
              target.market,
          ),
      );

    const automaticFallbackBooks =
      strategyOneBooks
        .filter(
          (
            target,
          ) =>
            !suppliedMarkets.has(
              target.market,
            ),
        )
        .length;

    return Object.freeze({
      generatedAt:
        now,

      mode:
        "BOUNDED_PUBLIC_REST_PROTECTED_BOOKS" as const,

      running:
        this.timer !==
        null,

      market:
        this.configuration
          .market,

      pair:
        this.configuration
          .pair,

      books:
        Object.freeze(
          this.targets.map(
            (
              target,
            ) =>
              Object.freeze({
                ...target,

                ...this.targetDiagnostics
                  .get(
                    target.market,
                  ),

                source:
                  target.purpose !==
                    "STRATEGY_ONE_DISCOVERY"
                    ? "BASE_PROTECTED"
                    : suppliedMarkets.has(
                        target.market,
                      )
                      ? "MANAGER_PRIORITY"
                      : "AUTO_CROSS_EXCHANGE_FILL",
              }),
          ),
        ),

      totalActiveBooks:
        this.targets.length,

      activeStrategyOneBooks:
        strategyOneBooks.length,

      suppliedStrategyOneBooks:
        this.suppliedStrategyOneTargets
          .length,

      automaticFallbackBooks,

      unusedStrategyOneSlots:
        Math.max(
          0,

          this.configuration
            .strategyOneTargetLimit -
          strategyOneBooks.length,
        ),

      strategyOneTargetLimit:
        this.configuration
          .strategyOneTargetLimit,

      refreshIntervalMs:
        this.configuration
          .refreshIntervalMs,

      maxConcurrentReads:
        this.configuration
          .maxConcurrentReads,

      counterpartPriority:
        STRATEGY_ONE_COUNTERPART_PRIORITY,

      attempts:
        this.attempts,

      accepted:
        this.accepted,

      rejected:
        this.rejected,

      lastAttemptAt:
        this.lastAttemptAt,

      lastSuccessAt:
        this.lastSuccessAt,

      lastError:
        this.lastError,

      safety:
        Object.freeze({
          publicReadOnly:
            true,

          protectedEvidenceOnly:
            true,

          authenticatedReadAllowed:
            false,

          balanceMutationAllowed:
            false,

          liveExecutionAllowed:
            false,

          orderSubmissionAllowed:
            false,

          tickerPromotionAllowed:
            false,

          guessedDepthAllowed:
            false,

          guessedMarketRulesAllowed:
            false,
        }),
    });
  }

  /**
   * Build the actual protected target universe.
   */
  private rebuildActiveTargets():
    void {
    const unique =
      new Map<
        string,
        CoinDCXProtectedRestOrderBookTarget
      >();

    /*
     * -------------------------------------------------
     * 1. Mandatory/base targets
     * -------------------------------------------------
     */
    for (
      const target
      of this.baseTargets
    ) {
      unique.set(
        target.market,
        target,
      );
    }

    let strategyOneCount =
      0;

    /*
     * -------------------------------------------------
     * 2. Manager-provided Strategy #1 priority
     * -------------------------------------------------
     */
    for (
      const target
      of this.suppliedStrategyOneTargets
    ) {
      if (
        strategyOneCount >=
        this.configuration
          .strategyOneTargetLimit
      ) {
        break;
      }

      const alreadyPresent =
        unique.has(
          target.market,
        );

      unique.set(
        target.market,
        target,
      );

      /*
       * Count it as a Strategy #1 slot even when it
       * replaces a base target. It is intentionally
       * protected for Strategy #1.
       */
      if (
        !alreadyPresent ||
        target.purpose ===
          "STRATEGY_ONE_DISCOVERY"
      ) {
        strategyOneCount +=
          1;
      }
    }

    /*
     * -------------------------------------------------
     * 3. Automatic cross-exchange fill
     * -------------------------------------------------
     *
     * This is the key throughput repair.
     *
     * Previously:
     *
     * configured capacity = 12
     * supplied targets     = 2
     * active strategy #1   = 2
     *
     * Now spare slots are filled only with markets
     * where:
     *
     * - another venue currently has executable depth,
     * - CoinDCX has observed the same market,
     * - CoinDCX registry has authoritative pair metadata.
     */
    if (
      strategyOneCount <
      this.configuration
        .strategyOneTargetLimit
    ) {
      const fallbackTargets =
        this.buildAutomaticStrategyOneTargets(
          new Set(
            unique.keys(),
          ),
        );

      for (
        const target
        of fallbackTargets
      ) {
        if (
          strategyOneCount >=
          this.configuration
            .strategyOneTargetLimit
        ) {
          break;
        }

        if (
          unique.has(
            target.market,
          )
        ) {
          continue;
        }

        unique.set(
          target.market,
          target,
        );

        strategyOneCount +=
          1;
      }
    }

    this.targets = [
      ...unique.values(),
    ];

    this.ensureDiagnostics(
      this.targets,
    );
  }

  /**
   * Select cross-exchange markets capable of using
   * currently unused CoinDCX protected REST slots.
   */
  private buildAutomaticStrategyOneTargets(
    excludedMarkets:
      ReadonlySet<string>,
  ): CoinDCXProtectedRestOrderBookTarget[] {
    const result:
      CoinDCXProtectedRestOrderBookTarget[] =
      [];

    const seen =
      new Set<
        string
      >(
        excludedMarkets,
      );

    for (
      const counterpartExchange
      of STRATEGY_ONE_COUNTERPART_PRIORITY
    ) {
      const counterpartQuotes =
        marketCache
          .getExecutableByExchange(
            counterpartExchange,
          );

      /*
       * Prefer newest executable counterpart evidence
       * within each exchange.
       *
       * This does not bypass downstream freshness checks;
       * it merely determines which CoinDCX REST books are
       * worth polling first.
       */
      counterpartQuotes.sort(
        (
          first,
          second,
        ) =>
          second.timestamp -
          first.timestamp,
      );

      for (
        const quote
        of counterpartQuotes
      ) {
        if (
          result.length >=
          this.configuration
            .strategyOneTargetLimit
        ) {
          return result;
        }

        const market =
          quote.market
            .trim()
            .toUpperCase();

        if (
          !market ||
          seen.has(
            market,
          )
        ) {
          continue;
        }

        /*
         * CoinDCX must actually have observed the same
         * canonical market.
         *
         * We do not poll arbitrary symbols solely because
         * another exchange lists them.
         */
        const coinDCXQuote =
          marketCache.get(
            "coindcx",
            market,
          );

        if (
          !coinDCXQuote
        ) {
          continue;
        }

        const metadata =
          marketRegistry.get(
            market,
          );

        if (
          !metadata
        ) {
          continue;
        }

        if (
          !metadata.symbol ||
          !metadata.pair
        ) {
          continue;
        }

        seen.add(
          market,
        );

        result.push({
          market:
            metadata.symbol,

          pair:
            metadata.pair,

          purpose:
            "STRATEGY_ONE_DISCOVERY",
        });
      }
    }

    return result;
  }

  private async refreshTargetsBounded(
    targets:
      readonly CoinDCXProtectedRestOrderBookTarget[],

    now:
      number,
  ): Promise<
    Array<{
      readonly market:
        string;

      readonly accepted:
        boolean;

      readonly error:
        string | null;
    }>
  > {
    if (
      targets.length ===
      0
    ) {
      return [];
    }

    const results:
      Array<{
        readonly market:
          string;

        readonly accepted:
          boolean;

        readonly error:
          string | null;
      }> =
      [];

    let nextIndex =
      0;

    const workerCount =
      Math.min(
        this.configuration
          .maxConcurrentReads,

        targets.length,
      );

    const workers =
      Array.from(
        {
          length:
            workerCount,
        },

        async () => {
          while (
            true
          ) {
            const index =
              nextIndex;

            nextIndex +=
              1;

            if (
              index >=
              targets.length
            ) {
              return;
            }

            const target =
              targets[
                index
              ];

            if (
              !target
            ) {
              continue;
            }

            const result =
              await this
                .refreshTarget(
                  target,
                  now,
                );

            results.push(
              result,
            );
          }
        },
      );

    await Promise.all(
      workers,
    );

    return results;
  }

  private async refreshTarget(
    target:
      CoinDCXProtectedRestOrderBookTarget,

    now:
      number,
  ): Promise<{
    readonly market:
      string;

    readonly accepted:
      boolean;

    readonly error:
      string | null;
  }> {
    this.ensureDiagnostics([
      target,
    ]);

    const diagnostics =
      this.targetDiagnostics
        .get(
          target.market,
        );

    if (
      !diagnostics
    ) {
      return {
        market:
          target.market,

        accepted:
          false,

        error:
          "Protected target diagnostics are unavailable.",
      };
    }

    this.attempts +=
      1;

    diagnostics.attempts +=
      1;

    diagnostics.lastAttemptAt =
      now;

    try {
      const raw =
        await this.fetcher
          .fetch(
            target.pair,
          );

      const receivedAt =
        Date.now();

      if (
        !raw ||
        typeof raw !==
          "object" ||
        Array.isArray(
          raw,
        )
      ) {
        throw new Error(
          "CoinDCX protected REST order book returned an invalid payload.",
        );
      }

      const payload =
        raw as
          CoinDCXOrderBookPayload;

      const book =
        normalizeCoinDCXFullOrderBook({
          ...payload,

          s:
            target.market,

          E:
            receivedAt,
        });

      if (
        !book
      ) {
        throw new Error(
          "CoinDCX protected REST order book has no valid two-sided depth.",
        );
      }

      const result =
        this.store
          .replace(
            book,
          );

      if (
        !result.accepted
      ) {
        throw new Error(
          `CoinDCX protected REST order book was rejected: ${result.reason}.`,
        );
      }

      this.store
        .publishExecutable?.(
          book,
        );

      /*
       * If this market is also tracked by the CoinDCX websocket adapter,
       * use the same genuine REST snapshot to establish its current
       * generation. Subsequent websocket deltas can then merge immediately
       * instead of remaining trapped behind UPDATE_BEFORE_SNAPSHOT.
       *
       * Untracked REST-only books remain owned by this service; the integrity
       * service returns UNTRACKED_SUBSCRIPTION and performs no mutation.
       */
      coinDCXOrderBookIntegrityService
        .seedTrackedSnapshot(
          {
            ...payload,

            s:
              target.market,

            E:
              receivedAt,
          },
          receivedAt,
        );

      this.accepted +=
        1;

      diagnostics.accepted +=
        1;

      diagnostics.lastSuccessAt =
        receivedAt;

      diagnostics.lastError =
        null;

      return {
        market:
          target.market,

        accepted:
          true,

        error:
          null,
      };
    } catch (
      error:
        unknown
    ) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown CoinDCX protected REST failure.";

      this.rejected +=
        1;

      diagnostics.rejected +=
        1;

      diagnostics.lastError =
        message;

      return {
        market:
          target.market,

        accepted:
          false,

        error:
          message,
      };
    }
  }

  private ensureDiagnostics(
    targets:
      readonly CoinDCXProtectedRestOrderBookTarget[],
  ): void {
    for (
      const target
      of targets
    ) {
      if (
        this.targetDiagnostics
          .has(
            target.market,
          )
      ) {
        continue;
      }

      this.targetDiagnostics
        .set(
          target.market,
          {
            attempts:
              0,

            accepted:
              0,

            rejected:
              0,

            lastAttemptAt:
              null,

            lastSuccessAt:
              null,

            lastError:
              null,
          },
        );
    }
  }

  private normalizeTargets(
    targets:
      readonly CoinDCXProtectedRestOrderBookTarget[],
  ): readonly CoinDCXProtectedRestOrderBookTarget[] {
    const unique =
      new Map<
        string,
        CoinDCXProtectedRestOrderBookTarget
      >();

    for (
      const target
      of targets
    ) {
      const market =
        target.market
          .trim()
          .toUpperCase();

      const pair =
        target.pair
          .trim()
          .toUpperCase();

      if (
        !market ||
        !pair
      ) {
        continue;
      }

      unique.set(
        market,
        {
          market,

          pair,

          purpose:
            target.purpose,
        },
      );
    }

    return [
      ...unique.values(),
    ];
  }

  private validateConfiguration():
    void {
    if (
      !Number.isSafeInteger(
        this.configuration
          .refreshIntervalMs,
      ) ||
      this.configuration
        .refreshIntervalMs <=
        0
    ) {
      throw new Error(
        "CoinDCX protected REST refresh interval must be positive.",
      );
    }

    if (
      !Number.isSafeInteger(
        this.configuration
          .strategyOneTargetLimit,
      ) ||
      this.configuration
        .strategyOneTargetLimit <=
        0 ||
      this.configuration
        .strategyOneTargetLimit >
        ABSOLUTE_STRATEGY_ONE_TARGET_LIMIT
    ) {
      throw new Error(
        `CoinDCX Strategy #1 protected REST target limit must be between 1 and ${ABSOLUTE_STRATEGY_ONE_TARGET_LIMIT}.`,
      );
    }

    if (
      !Number.isSafeInteger(
        this.configuration
          .maxConcurrentReads,
      ) ||
      this.configuration
        .maxConcurrentReads <=
        0 ||
      this.configuration
        .maxConcurrentReads >
        ABSOLUTE_MAX_CONCURRENT_READS
    ) {
      throw new Error(
        `CoinDCX protected REST concurrency must be between 1 and ${ABSOLUTE_MAX_CONCURRENT_READS}.`,
      );
    }
  }

  private runSafely():
    void {
    void this
      .refresh()
      .catch(
        (
          error:
            unknown,
        ) => {
          this.lastError =
            error instanceof Error
              ? error.message
              : "Unexpected CoinDCX protected REST cycle failure.";

          console.error(
            "[CoinDCX Protected REST]",
            this.lastError,
          );
        },
      );
  }
}

export const coinDCXProtectedRestOrderBookService =
  new CoinDCXProtectedRestOrderBookService();
