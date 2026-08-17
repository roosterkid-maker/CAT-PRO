import {
  io,
  type Socket,
} from "socket.io-client";

import axios from "axios";

import {
  coinDCXSubscriptionAuditService,
} from "../../diagnostics/services/CoinDCXSubscriptionAuditService";

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import {
  marketCache,
} from "../../services/cache.service";

import {
  rankPriceAlignedSharedMarkets,
} from "../core/PriceAlignedMarketRanking";

import {
  CoinDCXOrderBookIntegrityService,
  coinDCXOrderBookIntegrityService,
  type CoinDCXGenerationReason,
} from "./CoinDCXOrderBookIntegrityService";

import {
  COINDCX,
} from "./constants";

import {
  loadMarkets,
  type LoadedCoinDCXMarket,
} from "./marketLoader";

import {
  resolveCoinDCXMarket,
} from "./orderBookNormalizer";

import type {
  CoinDCXOrderBookPayload,
  CoinDCXOrderBookResponse,
} from "./orderBook.types";

export interface CoinDCXOrderBookDiagnostics {
  selectedMarkets:
    number;

  selectedUSDTMarkets:
    number;

  selectedSharedMarkets:
    number;

  selectedBinanceSharedMarkets:
    number;

  selectedBybitSharedMarkets:
    number;

  selectedUnoCoinSharedMarkets:
    number;

  counterpartPriorityMarkets:
    number;

  selectedBothSharedMarkets:
    number;

  selectedFallbackMarkets:
    number;

  selectedProtectedMarkets:
    number;

  sharedUniverseReconciliations:
    number;

  subscribedChannels:
    number;

  temporarySubscriptions:
    number;

  updatesReceived:
    number;

  executableQuotesPublished:
    number;

  fullBooksPublished:
    number;

  invalidPayloads:
    number;

  normalizationFailures:
    number;

  temporarySubscriptionsOpened:
    number;

  temporarySubscriptionsReleased:
    number;

  executableQuotesInvalidated:
    number;

  staleRecoveryAttempts:
    number;

  persistentSilentMarkets:
    number;

  baseSubscriptionReplacements:
    number;

  initialJoinFailures:
    number;

  initialJoinReplacements:
    number;

  crossedBookRecoveryAttempts:
    number;

  integrityQuarantinedMarkets:
    number;

  snapshotBootstrapAttempts:
    number;

  snapshotBootstrapSuccesses:
    number;

  snapshotBootstrapFailures:
    number;

  snapshotBootstrapQueued:
    number;

  lastUpdateAt:
    number | null;
}

interface ExternalMarketCoverage {
  binance:
    Set<string>;

  bybit:
    Set<string>;

  unocoin:
    Set<string>;

  unocoinPriority:
    readonly string[];

  union:
    Set<string>;

  intersection:
    Set<string>;
}

export class CoinDCXOrderBookAdapter {
  private static readonly MAXIMUM_COUNTERPART_PRIORITY_MARKETS =
    20;

  private static readonly SUBSCRIPTION_AUDIT_INTERVAL_MS =
    5_000;

  private static readonly FIRST_DATA_TIMEOUT_MS =
    10_000;

  private static readonly MAXIMUM_SUBSCRIPTION_RETRIES =
    2;

  private static readonly STALE_DATA_AGE_MS =
    30_000;

  /*
   * A subscription that previously delivered genuine
   * data but then remains silent is eligible for a
   * controlled leave/join recovery.
   *
   * This is deliberately much slower than execution
   * freshness. We do not reconnect merely because a
   * quiet market crosses the 6s execution threshold.
   */
  private static readonly STALE_RECOVERY_COOLDOWN_MS =
    15_000;

  private static readonly MAXIMUM_STALE_RECOVERY_ATTEMPTS =
    2;

  private static readonly DEFAULT_TEMPORARY_SUBSCRIPTION_TTL_MS =
    60_000;

  private static readonly MAXIMUM_TEMPORARY_SUBSCRIPTIONS =
    10;

  private static readonly MAXIMUM_CONCURRENT_SNAPSHOT_BOOTSTRAPS =
    6;

  private socket:
    Socket | null =
    null;

  private subscriptionAuditTimer:
    ReturnType<typeof setInterval> | null =
    null;

  private subscribed =
    false;

  private readonly subscribedChannels =
    new Set<string>();

  private readonly baseSubscribedMarkets =
    new Set<string>();

  /*
   * V19.16
   *
   * Markets that previously produced genuine depth,
   * then exhausted stale recovery, remain quarantined
   * for the current socket session.
   */
  private readonly persistentSilentMarkets =
    new Set<string>();

  /*
   * V20.9 Build 4D
   *
   * Markets that NEVER produced a first genuine depth
   * packet after exhausting bounded initial retries.
   *
   * Delayed packets from these retired channels are
   * ignored so they cannot resurrect executable depth.
   */
  private readonly initialSilentMarkets =
    new Set<string>();

  /*
   * V20.9 Build 4E
   *
   * Markets that exhaust bounded crossed-book recovery
   * remain unavailable for the current socket session.
   */
  private readonly integrityFailedMarkets =
    new Set<string>();

  private readonly temporarySubscriptions =
    new Map<
      string,
      number
    >();

  private readonly marketMetadataBySymbol =
    new Map<
      string,
      LoadedCoinDCXMarket
    >();

  private readonly snapshotBootstrapQueue:
    string[] =
    [];

  private readonly snapshotBootstrapScheduled =
    new Set<string>();

  private activeSnapshotBootstraps =
    0;

  private counterpartPriorityMarkets:
    readonly string[] =
    [];

  private diagnostics:
    CoinDCXOrderBookDiagnostics = {
    selectedMarkets:
      0,

    selectedUSDTMarkets:
      0,

    selectedSharedMarkets:
      0,

    selectedBinanceSharedMarkets:
      0,

    selectedBybitSharedMarkets:
      0,

    selectedUnoCoinSharedMarkets:
      0,

    counterpartPriorityMarkets:
      0,

    selectedBothSharedMarkets:
      0,

    selectedFallbackMarkets:
      0,

    selectedProtectedMarkets:
      0,

    sharedUniverseReconciliations:
      0,

    subscribedChannels:
      0,

    temporarySubscriptions:
      0,

    updatesReceived:
      0,

    executableQuotesPublished:
      0,

    fullBooksPublished:
      0,

    invalidPayloads:
      0,

    normalizationFailures:
      0,

    temporarySubscriptionsOpened:
      0,

    temporarySubscriptionsReleased:
      0,

    executableQuotesInvalidated:
      0,

    staleRecoveryAttempts:
      0,

    persistentSilentMarkets:
      0,

    baseSubscriptionReplacements:
      0,

    initialJoinFailures:
      0,

    initialJoinReplacements:
      0,

    crossedBookRecoveryAttempts:
      0,

    integrityQuarantinedMarkets:
      0,

    snapshotBootstrapAttempts:
      0,

    snapshotBootstrapSuccesses:
      0,

    snapshotBootstrapFailures:
      0,

    snapshotBootstrapQueued:
      0,

    lastUpdateAt:
      null,
  };

  async connect():
    Promise<void> {
    if (
      this.socket?.connected
    ) {
      return;
    }

    this.socket =
      io(
        COINDCX.SOCKET.URL,
        {
          transports: [
            "websocket",
          ],

          reconnection:
            true,

          reconnectionAttempts:
            Infinity,

          reconnectionDelay:
            2_000,
        },
      );

    this.socket.on(
      "connect",
      () => {
        console.log(
          "[CoinDCX] OrderBook Connected",
        );

        this.resetSubscriptionState();

        /*
         * Socket.IO reconnect creates a new subscription session. Historical
         * retry/generation records cannot prove anything about the new socket,
         * and retaining them can incorrectly classify clean joins as retries
         * or reject their first snapshot against an old generation floor.
         */
        coinDCXSubscriptionAuditService
          .clear();

        coinDCXOrderBookIntegrityService
          .clear();

        void this
          .subscribe()
          .catch(
            (
              error:
                unknown,
            ) => {
              console.error(
                "[CoinDCX] Initial smart order-book subscription failed:",
                error,
              );
            },
          );
      },
    );

    this.socket.on(
      COINDCX.EVENTS
        .DEPTH_SNAPSHOT,
      (
        message:
          CoinDCXOrderBookResponse,
      ) => {
        this.handle(
          message,
          "snapshot",
        );
      },
    );

    this.socket.on(
      COINDCX.EVENTS
        .DEPTH_UPDATE,
      (
        message:
          CoinDCXOrderBookResponse,
      ) => {
        this.handle(
          message,
          "update",
        );
      },
    );

    this.socket.on(
      "disconnect",
      (
        reason,
      ) => {
        console.warn(
          `[CoinDCX] OrderBook Disconnected: ${reason}`,
        );

        this.resetSubscriptionState();
      },
    );

    this.socket.on(
      "connect_error",
      (
        error:
          Error,
      ) => {
        console.error(
          `[CoinDCX] OrderBook connection error: ${error.message}`,
        );
      },
    );

    this.startSubscriptionAuditLoop();
  }

  async disconnect():
    Promise<void> {
    this.stopSubscriptionAuditLoop();

    if (
      !this.socket
    ) {
      this.resetSubscriptionState();

      return;
    }

    for (
      const channelName
      of this.subscribedChannels
    ) {
      this.socket.emit(
        "leave",
        {
          channelName,
        },
      );
    }

    for (
      const market
      of this.temporarySubscriptions.keys()
    ) {
      this.invalidateTemporaryMarket(
        market,
      );
    }

    this.socket.removeAllListeners();

    this.socket.disconnect();

    this.socket =
      null;

    coinDCXSubscriptionAuditService
      .clear();

    coinDCXOrderBookIntegrityService
      .clear();

    this.resetSubscriptionState();
  }

  isConnected():
    boolean {
    return (
      this.socket
        ?.connected ??
      false
    );
  }

  getSubscribedMarketCount():
    number {
    return this
      .subscribedChannels
      .size;
  }

  getTemporarySubscriptionCount():
    number {
    return this
      .temporarySubscriptions
      .size;
  }

  getDiagnostics():
    CoinDCXOrderBookDiagnostics {
    return {
      ...this.diagnostics,

      subscribedChannels:
        this.subscribedChannels
          .size,

      temporarySubscriptions:
        this.temporarySubscriptions
          .size,
    };
  }

  hasOrderBookSubscription(
    market:
      string,
  ): boolean {
    const normalizedMarket =
      this.normalizeMarket(
        market,
      );

    if (
      this.persistentSilentMarkets.has(
        normalizedMarket,
      ) ||
      this.initialSilentMarkets.has(
        normalizedMarket,
      ) ||
      this.integrityFailedMarkets.has(
        normalizedMarket,
      )
    ) {
      return false;
    }

    return (
      this.baseSubscribedMarkets.has(
        normalizedMarket,
      ) ||
      this.temporarySubscriptions.has(
        normalizedMarket,
      )
    );
  }

  requestTemporarySubscription(
    market:
      string,

    ttlMs =
      CoinDCXOrderBookAdapter
        .DEFAULT_TEMPORARY_SUBSCRIPTION_TTL_MS,
  ): boolean {
    if (
      !this.socket
        ?.connected
    ) {
      return false;
    }

    const normalizedMarket =
      this.normalizeMarket(
        market,
      );

    if (
      this.persistentSilentMarkets.has(
        normalizedMarket,
      ) ||
      this.initialSilentMarkets.has(
        normalizedMarket,
      ) ||
      this.integrityFailedMarkets.has(
        normalizedMarket,
      )
    ) {
      return false;
    }

    if (
      this.baseSubscribedMarkets.has(
        normalizedMarket,
      )
    ) {
      return true;
    }

    const metadata =
      this.marketMetadataBySymbol.get(
        normalizedMarket,
      );

    if (
      !metadata
    ) {
      return false;
    }

    if (
      metadata.quoteCurrency !==
      "USDT"
    ) {
      return false;
    }

    const normalizedTtlMs =
      this.normalizeTemporaryTtl(
        ttlMs,
      );

    const expiresAt =
      Date.now() +
      normalizedTtlMs;

    if (
      this.temporarySubscriptions.has(
        normalizedMarket,
      )
    ) {
      this.temporarySubscriptions.set(
        normalizedMarket,
        expiresAt,
      );

      return true;
    }

    if (
      this.temporarySubscriptions
        .size >=
      CoinDCXOrderBookAdapter
        .MAXIMUM_TEMPORARY_SUBSCRIPTIONS
    ) {
      return false;
    }

    const channelName =
      this.createChannelName(
        metadata,
      );

    this.beginMarketGeneration(
      normalizedMarket,
      "TEMPORARY_JOIN",
    );

    this.socket.emit(
      "join",
      {
        channelName,
      },
    );

    this.subscribedChannels.add(
      channelName,
    );

    this.temporarySubscriptions.set(
      normalizedMarket,
      expiresAt,
    );

    coinDCXSubscriptionAuditService
      .recordJoin(
        normalizedMarket,
        channelName,
      );

    this.diagnostics
      .temporarySubscriptionsOpened +=
      1;

    this.diagnostics.temporarySubscriptions =
      this.temporarySubscriptions
        .size;

    this.diagnostics.subscribedChannels =
      this.subscribedChannels
        .size;

    console.log(
      `[CoinDCX] Demand subscription opened: ${normalizedMarket} | temporary=${this.temporarySubscriptions.size}/${CoinDCXOrderBookAdapter.MAXIMUM_TEMPORARY_SUBSCRIPTIONS} | ttlMs=${normalizedTtlMs}`,
    );

    return true;
  }

  private async subscribe():
    Promise<void> {
    if (
      !this.socket
        ?.connected ||
      this.subscribed
    ) {
      return;
    }

    try {
      const markets =
        await loadMarkets();

      this.rebuildMarketMetadata(
        markets,
      );

      const maximumMarkets =
        this.resolveMaximumMarkets();

      const externalCoverage =
        this.getExternalMarketCoverage();

      const selectedMarkets =
        this.selectMarkets(
          markets,
          maximumMarkets,
          externalCoverage,
        );

      this.applySelectionDiagnostics(
        selectedMarkets,
        externalCoverage,
      );

      this.baseSubscribedMarkets.clear();

      for (
        const market
        of selectedMarkets
      ) {
        this.baseSubscribedMarkets.add(
          this.normalizeMarket(
            market.symbol,
          ),
        );
      }

      const batches =
        this.chunk(
          selectedMarkets,
          COINDCX.ORDER_BOOK
            .SUBSCRIPTION_BATCH_SIZE,
        );

      let subscribedCount =
        0;

      for (
        let batchIndex =
          0;
        batchIndex <
          batches.length;
        batchIndex +=
          1
      ) {
        const batch =
          batches[
            batchIndex
          ];

        if (
          !batch ||
          batch.length ===
            0
        ) {
          continue;
        }

        if (
          !this.socket
            ?.connected
        ) {
          console.warn(
            "[CoinDCX] Socket closed before all smart order-book subscriptions were sent.",
          );

          this.subscribed =
            false;

          return;
        }

        for (
          const market
          of batch
        ) {
          const channelName =
            this.createChannelName(
              market,
            );

          const normalizedMarket =
            this.normalizeMarket(
              market.symbol,
            );

          this.beginMarketGeneration(
            normalizedMarket,
            "INITIAL_JOIN",
          );

          this.socket.emit(
            "join",
            {
              channelName,
            },
          );

          this.subscribedChannels.add(
            channelName,
          );

          coinDCXSubscriptionAuditService
            .recordJoin(
              normalizedMarket,
              channelName,
            );

          subscribedCount +=
            1;
        }

        if (
          batchIndex <
          batches.length -
            1
        ) {
          await this.sleep(
            COINDCX.ORDER_BOOK
              .SUBSCRIPTION_BATCH_DELAY_MS,
          );
        }
      }

      this.subscribed =
        true;

      this.diagnostics.subscribedChannels =
        this.subscribedChannels
          .size;

      console.log(
        `[CoinDCX] Smart order-book selection: subscribed=${subscribedCount} | shared=${this.diagnostics.selectedSharedMarkets} | both=${this.diagnostics.selectedBothSharedMarkets} | binance=${this.diagnostics.selectedBinanceSharedMarkets} | bybit=${this.diagnostics.selectedBybitSharedMarkets} | fallback=${this.diagnostics.selectedFallbackMarkets} | limit=${maximumMarkets}`,
      );
    } catch (
      error
    ) {
      this.subscribed =
        false;

      console.error(
        "[CoinDCX] Unable to subscribe to smart order books:",
        error,
      );
    }
  }

  /**
   * Share the bounded Strategy #1 discovery shortlist with CoinDCX before
   * UnoCoin full-depth publications replace ticker-only indicative prices.
   * These symbols still require genuine CoinDCX order-book packets.
   */
  setCounterpartPriorityMarkets(
    markets:
      readonly string[],
  ): void {
    const unique =
      new Set<string>();

    for (const market of markets) {
      const normalized =
        this.normalizeMarket(
          market,
        );

      if (!normalized) {
        continue;
      }

      unique.add(
        normalized,
      );

      if (
        unique.size >=
          CoinDCXOrderBookAdapter
            .MAXIMUM_COUNTERPART_PRIORITY_MARKETS
      ) {
        break;
      }
    }

    this.counterpartPriorityMarkets = [
      ...unique,
    ];

    this.diagnostics.counterpartPriorityMarkets =
      this.counterpartPriorityMarkets.length;
  }

  /**
   * Re-evaluate the base CoinDCX universe after counterpart market
   * coverage has matured. Startup selection is therefore no longer
   * frozen around a sparse three-second warmup snapshot.
   */
  async refreshSharedMarketSubscriptions():
    Promise<boolean> {
    if (
      !this.socket?.connected ||
      !this.subscribed ||
      this.marketMetadataBySymbol.size ===
        0
    ) {
      return false;
    }

    const coverage =
      this.getExternalMarketCoverage();

    const desiredMarkets =
      this.selectMarkets(
        Array.from(
          this.marketMetadataBySymbol
            .values(),
        ),
        /*
         * Rank the full catalog before excluding session-quarantined symbols.
         * The old order sliced to the configured cap first and filtered
         * failures second. After enough silent channels, a nominal 120-book
         * universe could collapse to ~20 without backfilling healthy markets.
         */
        this.marketMetadataBySymbol.size,
        coverage,
      ).filter(
        (market) => {
          const symbol =
            this.normalizeMarket(
              market.symbol,
            );

          return (
            !this.persistentSilentMarkets.has(
              symbol,
            ) &&
            !this.initialSilentMarkets.has(
              symbol,
            ) &&
            !this.integrityFailedMarkets.has(
              symbol,
            )
          );
        },
      ).slice(
        0,
        this.resolveMaximumMarkets(),
      );

    const desiredSymbols =
      new Set(
        desiredMarkets.map(
          (market) =>
            this.normalizeMarket(
              market.symbol,
            ),
        ),
      );

    let changed =
      false;

    for (
      const symbol
      of [
        ...this.baseSubscribedMarkets,
      ]
    ) {
      if (
        desiredSymbols.has(
          symbol,
        )
      ) {
        continue;
      }

      this.baseSubscribedMarkets.delete(
        symbol,
      );

      if (
        !this.temporarySubscriptions.has(
          symbol,
        )
      ) {
        const metadata =
          this.marketMetadataBySymbol.get(
            symbol,
          );

        if (metadata) {
          const channelName =
            this.createChannelName(
              metadata,
            );

          this.socket.emit(
            "leave",
            {
              channelName,
            },
          );

          this.subscribedChannels.delete(
            channelName,
          );
        }

        this.invalidateMarketEvidence(
          symbol,
        );

        coinDCXSubscriptionAuditService
          .remove(
            symbol,
          );
      }

      changed =
        true;
    }

    for (
      const market
      of desiredMarkets
    ) {
      const symbol =
        this.normalizeMarket(
          market.symbol,
        );

      if (
        this.baseSubscribedMarkets.has(
          symbol,
        )
      ) {
        continue;
      }

      this.baseSubscribedMarkets.add(
        symbol,
      );

      if (
        !this.temporarySubscriptions.has(
          symbol,
        )
      ) {
        const channelName =
          this.createChannelName(
            market,
          );

        this.beginMarketGeneration(
          symbol,
          "REPLACEMENT_JOIN",
        );

        this.socket.emit(
          "join",
          {
            channelName,
          },
        );

        this.subscribedChannels.add(
          channelName,
        );

        coinDCXSubscriptionAuditService
          .recordJoin(
            symbol,
            channelName,
          );
      }

      changed =
        true;
    }

    this.applySelectionDiagnostics(
      desiredMarkets,
      coverage,
    );

    this.diagnostics.subscribedChannels =
      this.subscribedChannels.size;

    if (changed) {
      this.diagnostics
        .sharedUniverseReconciliations +=
        1;

      console.log(
        `[CoinDCX] Shared base universe reconciled: base=${this.baseSubscribedMarkets.size} | shared=${this.diagnostics.selectedSharedMarkets} | protected=${this.diagnostics.selectedProtectedMarkets} | fallback=${this.diagnostics.selectedFallbackMarkets}.`,
      );
    }

    return changed;
  }

  private rebuildMarketMetadata(
    markets:
      readonly LoadedCoinDCXMarket[],
  ): void {
    this.marketMetadataBySymbol.clear();

    for (
      const market
      of markets
    ) {
      const symbol =
        this.normalizeMarket(
          market.symbol,
        );

      if (!symbol) {
        continue;
      }

      this.marketMetadataBySymbol.set(
        symbol,
        market,
      );
    }
  }

  private selectMarkets(
    markets:
      readonly LoadedCoinDCXMarket[],

    maximumMarkets:
      number,

    coverage:
      ExternalMarketCoverage,
  ): LoadedCoinDCXMarket[] {
    const uniqueMarkets =
      new Map<
        string,
        LoadedCoinDCXMarket
      >();

    for (
      const market
      of markets
    ) {
      const symbol =
        this.normalizeMarket(
          market.symbol,
        );

      if (
        !symbol ||
        !market.pair
      ) {
        continue;
      }

      uniqueMarkets.set(
        symbol,
        market,
      );
    }

    const allMarkets =
      Array.from(
        uniqueMarkets.values(),
      );

    const usdtMarkets =
      allMarkets.filter(
        (
          market,
        ) =>
          market.quoteCurrency ===
          "USDT",
      );

    const protectedSymbols =
      this.getProtectedMarketSymbols();

    const protectedMarkets =
      allMarkets
        .filter(
          (market) =>
            protectedSymbols.has(
              this.normalizeMarket(
                market.symbol,
              ),
            ),
        )
        .sort(
          this.compareMarkets,
        );

    const protectedOrUnoCoinSymbols =
      new Set(
        protectedSymbols,
      );

    const unoCoinPriorityMarkets:
      LoadedCoinDCXMarket[] =
      [];

    for (
      const symbol
      of coverage.unocoinPriority
    ) {
      if (
        protectedOrUnoCoinSymbols.has(
          symbol,
        )
      ) {
        continue;
      }

      const market =
        uniqueMarkets.get(
          symbol,
        );

      if (!market) {
        continue;
      }

      unoCoinPriorityMarkets.push(
        market,
      );

      protectedOrUnoCoinSymbols.add(
        symbol,
      );
    }

    const sharedOnBoth =
      usdtMarkets
        .filter(
          (
            market,
          ) => {
            const symbol =
              this.normalizeMarket(
                market.symbol,
              );

            return (
              coverage.intersection.has(
                symbol,
              ) &&
              !protectedOrUnoCoinSymbols.has(
                symbol,
              )
            );
          },
        )
        .sort(
          this.compareMarkets,
        );

    const sharedOnEither =
      usdtMarkets
        .filter(
          (
            market,
          ) => {
            const symbol =
              this.normalizeMarket(
                market.symbol,
              );

            return (
              coverage.union.has(
                symbol,
              ) &&
              !coverage.intersection.has(
                symbol,
              ) &&
              !protectedOrUnoCoinSymbols.has(
                symbol,
              )
            );
          },
        )
        .sort(
          this.compareMarkets,
        );

    return [
      ...protectedMarkets,
      ...unoCoinPriorityMarkets,
      ...sharedOnBoth,
      ...sharedOnEither,
    ].slice(
      0,
      maximumMarkets,
    );
  }

  private getProtectedMarketSymbols():
    Set<string> {
    const configured = [
      process.env.COINDCX_PROTECTED_MARKETS,
      process.env.CAT_PRO_XEMM_MARKETS,
    ]
      .filter(
        (value): value is string =>
          typeof value ===
            "string",
      )
      .flatMap(
        (value) =>
          value.split(
            /[\s,;]+/,
          ),
      )
      .map(
        (market) =>
          this.normalizeMarket(
            market,
          ),
      )
      .filter(
        Boolean,
      );

    return new Set([
      "BTCUSDT",
      "USDTINR",
      ...configured,
    ]);
  }

  private getExternalMarketCoverage():
    ExternalMarketCoverage {
    const binance =
      new Set(
        marketCache
          .getExecutableByExchange(
            "binance",
          )
          .map(
            (
              quote,
            ) =>
              this.normalizeMarket(
                quote.market,
              ),
          )
          .filter(
            Boolean,
          ),
      );

    const bybit =
      new Set(
        marketCache
          .getExecutableByExchange(
            "bybit",
          )
          .map(
            (
              quote,
            ) =>
              this.normalizeMarket(
                quote.market,
              ),
          )
          .filter(
            Boolean,
          ),
      );

    const unocoinQuotes =
      marketCache.getByExchange(
        "unocoin",
      );

    const unocoin =
      new Set(
        unocoinQuotes
          .map(
            (quote) =>
              this.normalizeMarket(
                quote.market,
              ),
          )
          .filter(
            Boolean,
          ),
      );

    /*
     * Ticker prices only rank bounded order-book discovery. They never
     * become executable depth. The shared ranking rejects obviously
     * distorted/stale indicative prices outside the 1.05x envelope.
     */
    const dynamicallyAlignedUnoCoinMarkets =
      rankPriceAlignedSharedMarkets(
        marketCache.getByExchange(
          "coindcx",
        ),
        unocoinQuotes,
      ).map(
        (candidate) =>
          candidate.canonicalMarket,
      );

    const unocoinPriority = [
      ...new Set([
        ...this.counterpartPriorityMarkets,
        ...dynamicallyAlignedUnoCoinMarkets,
      ]),
    ].slice(
      0,
      CoinDCXOrderBookAdapter
        .MAXIMUM_COUNTERPART_PRIORITY_MARKETS,
    );

    const union =
      new Set<string>([
        ...binance,
        ...bybit,
      ]);

    const intersection =
      new Set<string>();

    for (
      const market
      of binance
    ) {
      if (
        bybit.has(
          market,
        )
      ) {
        intersection.add(
          market,
        );
      }
    }

    console.log(
      `[CoinDCX] Counterpart market discovery: Binance=${binance.size} | Bybit=${bybit.size} | UnoCoin=${unocoin.size} | UnoCoin aligned=${unocoinPriority.length} | union=${union.size} | both=${intersection.size}`,
    );

    return {
      binance,
      bybit,
      unocoin,
      unocoinPriority,
      union,
      intersection,
    };
  }

  private applySelectionDiagnostics(
    selectedMarkets:
      readonly LoadedCoinDCXMarket[],

    coverage:
      ExternalMarketCoverage,
  ): void {
    let selectedUSDTMarkets =
      0;

    let selectedSharedMarkets =
      0;

    let selectedBinanceSharedMarkets =
      0;

    let selectedBybitSharedMarkets =
      0;

    let selectedUnoCoinSharedMarkets =
      0;

    let selectedBothSharedMarkets =
      0;

    let selectedProtectedMarkets =
      0;

    const protectedSymbols =
      this.getProtectedMarketSymbols();

    for (
      const market
      of selectedMarkets
    ) {
      const symbol =
        this.normalizeMarket(
          market.symbol,
        );

      const onBinance =
        coverage.binance.has(
          symbol,
        );

      const onBybit =
        coverage.bybit.has(
          symbol,
        );

      const onUnoCoin =
        coverage.unocoin.has(
          symbol,
        );

      if (
        market.quoteCurrency ===
        "USDT"
      ) {
        selectedUSDTMarkets +=
          1;
      }

      if (
        onBinance
      ) {
        selectedBinanceSharedMarkets +=
          1;
      }

      if (
        onBybit
      ) {
        selectedBybitSharedMarkets +=
          1;
      }

      if (
        onUnoCoin
      ) {
        selectedUnoCoinSharedMarkets +=
          1;
      }

      if (
        onBinance &&
        onBybit
      ) {
        selectedBothSharedMarkets +=
          1;
      }

      if (
        onBinance ||
        onBybit ||
        onUnoCoin
      ) {
        selectedSharedMarkets +=
          1;
      }

      if (
        protectedSymbols.has(
          symbol,
        )
      ) {
        selectedProtectedMarkets +=
          1;
      }
    }

    this.diagnostics.selectedMarkets =
      selectedMarkets.length;

    this.diagnostics.selectedUSDTMarkets =
      selectedUSDTMarkets;

    this.diagnostics.selectedSharedMarkets =
      selectedSharedMarkets;

    this.diagnostics.selectedBinanceSharedMarkets =
      selectedBinanceSharedMarkets;

    this.diagnostics.selectedBybitSharedMarkets =
      selectedBybitSharedMarkets;

    this.diagnostics.selectedUnoCoinSharedMarkets =
      selectedUnoCoinSharedMarkets;

    this.diagnostics.selectedBothSharedMarkets =
      selectedBothSharedMarkets;

    this.diagnostics.selectedFallbackMarkets =
      selectedMarkets.filter(
        (market) => {
          const symbol =
            this.normalizeMarket(
              market.symbol,
            );

          return (
            !coverage.union.has(
              symbol,
            ) &&
            !coverage.unocoin.has(
              symbol,
            ) &&
            !protectedSymbols.has(
              symbol,
            )
          );
        },
      ).length;

    this.diagnostics.selectedProtectedMarkets =
      selectedProtectedMarkets;
  }

  private handle(
    response:
      CoinDCXOrderBookResponse,

    eventType:
      "snapshot" |
      "update",
  ): void {
    this.diagnostics.updatesReceived +=
      1;

    try {
      const payload =
        typeof response.data ===
        "string"
          ? JSON.parse(
              response.data,
            )
          : response.data;

      if (
        !payload ||
        typeof payload !==
          "object" ||
        Array.isArray(
          payload,
        )
      ) {
        this.diagnostics.invalidPayloads +=
          1;

        return;
      }

      const typedPayload =
        payload as CoinDCXOrderBookPayload;

      const resolvedMarket =
        resolveCoinDCXMarket(
          typedPayload,
        );

      if (!resolvedMarket) {
        this.diagnostics.invalidPayloads +=
          1;

        return;
      }

      const normalizedMarket =
        this.normalizeMarket(
          resolvedMarket,
        );

      /*
       * V20.9 Builds 4D / 4E
       *
       * Delayed packets from retired, released or
       * integrity-quarantined channels cannot resurrect
       * executable state.
       */
      if (
        this.persistentSilentMarkets.has(
          normalizedMarket,
        ) ||
        this.initialSilentMarkets.has(
          normalizedMarket,
        ) ||
        this.integrityFailedMarkets.has(
          normalizedMarket,
        ) ||
        (
          !this.baseSubscribedMarkets.has(
            normalizedMarket,
          ) &&
          !this.temporarySubscriptions.has(
            normalizedMarket,
          )
        )
      ) {
        coinDCXOrderBookIntegrityService
          .invalidate(
          normalizedMarket,
        );

        return;
      }

      const result =
        coinDCXOrderBookIntegrityService
          .processEvent(
            typedPayload,
            eventType,
          );

      /*
       * A structurally useful packet proves that the subscription channel is
       * alive even when execution integrity must reject an update that arrived
       * before its initial snapshot. Previously the audit recorded data only
       * after executable publication, so healthy update-only channels were
       * misclassified as NEVER_RECEIVED_DATA and retired after two retries.
       *
       * INVALID_PAYLOAD / INVALID_BOOK / EMPTY_BOOK are intentionally omitted:
       * receiving unusable bytes must not make a broken channel look healthy.
       */
      const provesChannelAlive =
        result.accepted ||
        result.reason ===
          "UPDATE_BEFORE_SNAPSHOT" ||
        result.reason ===
          "UPDATE_WITHOUT_BOOK" ||
        result.reason ===
          "STALE_EPOCH_EVENT" ||
        result.reason ===
          "OUT_OF_ORDER_EVENT" ||
        result.reason ===
          "CROSSED_BOOK";

      if (
        provesChannelAlive
      ) {
        coinDCXSubscriptionAuditService
          .recordData(
            normalizedMarket,
            eventType,
          );
      }

      if (result.accepted) {
        this.diagnostics
          .executableQuotesPublished +=
          1;

        this.diagnostics
          .fullBooksPublished +=
          1;

        this.diagnostics.lastUpdateAt =
          Date.now();

        const acceptedBook =
          orderBookService.get(
            "coindcx",
            normalizedMarket,
          );

        if (
          acceptedBook &&
          (
            this.diagnostics
              .fullBooksPublished ===
              1 ||
            this.diagnostics
              .fullBooksPublished %
              1_000 ===
              0
          )
        ) {
          console.log(
            `[CoinDCX] OrderBook cache updated: ${normalizedMarket} | event=${eventType} | bids=${acceptedBook.bids.length} | asks=${acceptedBook.asks.length} | cached=${orderBookService.size()} | published=${this.diagnostics.fullBooksPublished}`,
          );
        }

        return;
      }

      if (
        result.reason ===
          "UPDATE_BEFORE_SNAPSHOT" ||
        result.reason ===
          "UPDATE_WITHOUT_BOOK"
      ) {
        this.scheduleSnapshotBootstrap(
          normalizedMarket,
        );

        return;
      }

      if (
        result.reason ===
          "INVALID_PAYLOAD" ||
        result.reason ===
          "INVALID_BOOK" ||
        result.reason ===
          "EMPTY_BOOK"
      ) {
        this.diagnostics
          .normalizationFailures +=
          1;
      }

      if (
        result.reason !==
        "CROSSED_BOOK"
      ) {
        return;
      }

      console.warn(
        `[CoinDCX] Crossed book rejected: ${normalizedMarket} | event=${eventType} | recoveryRecommended=${result.recoveryRecommended}`,
      );

      if (
        result.recoveryRecommended &&
        this.recoverCrossedBook(
          normalizedMarket,
        )
      ) {
        return;
      }

      this.quarantineIntegrityFailedMarket(
        normalizedMarket,
      );
    } catch (
      error
    ) {
      this.diagnostics.invalidPayloads +=
        1;

      console.error(
        "[CoinDCX] OrderBook parse error:",
        error,
      );
    }
  }

  private startSubscriptionAuditLoop():
    void {
    this.stopSubscriptionAuditLoop();

    this.subscriptionAuditTimer =
      setInterval(
        () => {
          this.runSubscriptionAudit();
        },
        CoinDCXOrderBookAdapter
          .SUBSCRIPTION_AUDIT_INTERVAL_MS,
      );
  }

  private stopSubscriptionAuditLoop():
    void {
    if (
      this.subscriptionAuditTimer ===
      null
    ) {
      return;
    }

    clearInterval(
      this.subscriptionAuditTimer,
    );

    this.subscriptionAuditTimer =
      null;
  }

  private runSubscriptionAudit():
    void {
    if (
      !this.socket
        ?.connected
    ) {
      return;
    }

    const now =
      Date.now();

    this.releaseExpiredTemporarySubscriptions(
      now,
    );

    coinDCXSubscriptionAuditService
      .markStaleByAge(
        CoinDCXOrderBookAdapter
          .STALE_DATA_AGE_MS,
        now,
      );

    const retryCandidates =
      coinDCXSubscriptionAuditService
        .getRetryCandidates(
          CoinDCXOrderBookAdapter
            .FIRST_DATA_TIMEOUT_MS,
          CoinDCXOrderBookAdapter
            .MAXIMUM_SUBSCRIPTION_RETRIES,
          now,
        );

    for (
      const candidate
      of retryCandidates
    ) {
      this.retrySubscription(
        candidate.market,
        candidate.channelName,
        now,
      );
    }

    /*
     * V20.9 Build 4D
     *
     * Initial joins that exhausted their bounded retry
     * budget are retired and their base slots recycled.
     */
    const exhaustedCandidates =
      coinDCXSubscriptionAuditService
        .getExhaustedCandidates(
          CoinDCXOrderBookAdapter
            .FIRST_DATA_TIMEOUT_MS,
          CoinDCXOrderBookAdapter
            .MAXIMUM_SUBSCRIPTION_RETRIES,
          now,
        );

    for (
      const candidate
      of exhaustedCandidates
    ) {
      this.retireInitialSilentSubscription(
        candidate.market,
        candidate.channelName,
        now,
      );
    }

    const staleRecoveryCandidates =
      coinDCXSubscriptionAuditService
        .getStaleRecoveryCandidates(
          CoinDCXOrderBookAdapter
            .STALE_DATA_AGE_MS,
          CoinDCXOrderBookAdapter
            .STALE_RECOVERY_COOLDOWN_MS,
          CoinDCXOrderBookAdapter
            .MAXIMUM_STALE_RECOVERY_ATTEMPTS,
          now,
        );

    for (
      const candidate
      of staleRecoveryCandidates
    ) {
      this.recoverStaleSubscription(
        candidate.market,
        candidate.channelName,
        now,
      );
    }

    const persistentSilentCandidates =
      coinDCXSubscriptionAuditService
        .getPersistentSilentCandidates(
          CoinDCXOrderBookAdapter
            .STALE_DATA_AGE_MS,
          CoinDCXOrderBookAdapter
            .STALE_RECOVERY_COOLDOWN_MS,
          CoinDCXOrderBookAdapter
            .MAXIMUM_STALE_RECOVERY_ATTEMPTS,
          now,
        );

    for (
      const candidate
      of persistentSilentCandidates
    ) {
      this.quarantinePersistentSilentMarket(
        candidate.market,
        candidate.channelName,
        now,
      );
    }
  }

  /*
   * V20.9 Build 4D
   *
   * If the exchange never delivers even the first
   * genuine depth packet after the existing retry budget,
   * the channel is retired for this socket session.
   *
   * Base slots are replaced with the next eligible market.
   */
  private retireInitialSilentSubscription(
    market:
      string,

    channelName:
      string,

    now:
      number,
  ): void {
    if (
      !this.socket?.connected
    ) {
      return;
    }

    const normalizedMarket =
      this.normalizeMarket(
        market,
      );

    if (
      this.initialSilentMarkets.has(
        normalizedMarket,
      )
    ) {
      return;
    }

    const wasBaseSubscription =
      this.baseSubscribedMarkets.has(
        normalizedMarket,
      );

    this.socket.emit(
      "leave",
      {
        channelName,
      },
    );

    this.subscribedChannels.delete(
      channelName,
    );

    this.baseSubscribedMarkets.delete(
      normalizedMarket,
    );

    this.temporarySubscriptions.delete(
      normalizedMarket,
    );

    this.initialSilentMarkets.add(
      normalizedMarket,
    );

    const invalidated =
      this.invalidateMarketEvidence(
        normalizedMarket,
      );

    coinDCXSubscriptionAuditService
      .markFailed(
        normalizedMarket,
      );

    this.diagnostics
      .initialJoinFailures +=
      1;

    this.diagnostics.subscribedChannels =
      this.subscribedChannels.size;

    this.diagnostics.temporarySubscriptions =
      this.temporarySubscriptions.size;

    console.warn(
      `[CoinDCX] Initial silent subscription retired: ${normalizedMarket} | retriesExhausted=true | executableInvalidated=${invalidated}`,
    );

    if (
      wasBaseSubscription &&
      this.promoteBaseReplacement(
        now,
      )
    ) {
      this.diagnostics
        .initialJoinReplacements +=
        1;
    }
  }

  private quarantinePersistentSilentMarket(
    market:
      string,

    channelName:
      string,

    now:
      number,
  ): void {
    if (
      !this.socket?.connected
    ) {
      return;
    }

    const normalizedMarket =
      this.normalizeMarket(
        market,
      );

    if (
      this.persistentSilentMarkets.has(
        normalizedMarket,
      )
    ) {
      return;
    }

    const wasBaseSubscription =
      this.baseSubscribedMarkets.has(
        normalizedMarket,
      );

    this.socket.emit(
      "leave",
      {
        channelName,
      },
    );

    this.subscribedChannels.delete(
      channelName,
    );

    this.baseSubscribedMarkets.delete(
      normalizedMarket,
    );

    this.temporarySubscriptions.delete(
      normalizedMarket,
    );

    this.persistentSilentMarkets.add(
      normalizedMarket,
    );

    const invalidated =
      this.invalidateMarketEvidence(
        normalizedMarket,
      );

    coinDCXSubscriptionAuditService
      .markPersistentlySilent(
        normalizedMarket,
      );

    this.diagnostics
      .persistentSilentMarkets =
      this.persistentSilentMarkets.size;

    console.warn(
      `[CoinDCX] Persistent silent market quarantined: ${normalizedMarket} | staleRecoveriesExhausted=true | executableInvalidated=${invalidated}`,
    );

    if (
      wasBaseSubscription
    ) {
      this.promoteBaseReplacement(
        now,
      );
    }
  }

  private promoteBaseReplacement(
    now:
      number,
  ): boolean {
    if (
      !this.socket?.connected
    ) {
      return false;
    }

    const maximumMarkets =
      this.resolveMaximumMarkets();

    if (
      this.baseSubscribedMarkets.size >=
      maximumMarkets
    ) {
      return false;
    }

    const coverage =
      this.getExternalMarketCoverage();

    const ranked =
      this.selectMarkets(
        Array.from(
          this.marketMetadataBySymbol.values(),
        ),
        this.marketMetadataBySymbol.size,
        coverage,
      );

    const replacement =
      ranked.find(
        (
          market,
        ) => {
          const symbol =
            this.normalizeMarket(
              market.symbol,
            );

          return (
            !this.baseSubscribedMarkets.has(
              symbol,
            ) &&
            !this.temporarySubscriptions.has(
              symbol,
            ) &&
            !this.persistentSilentMarkets.has(
              symbol,
            ) &&
            !this.initialSilentMarkets.has(
              symbol,
            ) &&
            !this.integrityFailedMarkets.has(
              symbol,
            )
          );
        },
      );

    if (
      !replacement
    ) {
      console.warn(
        "[CoinDCX] No eligible replacement market available for silent base slot.",
      );

      return false;
    }

    const normalizedReplacement =
      this.normalizeMarket(
        replacement.symbol,
      );

    const replacementChannel =
      this.createChannelName(
        replacement,
      );

    this.beginMarketGeneration(
      normalizedReplacement,
      "REPLACEMENT_JOIN",
      now,
    );

    this.socket.emit(
      "join",
      {
        channelName:
          replacementChannel,
      },
    );

    this.subscribedChannels.add(
      replacementChannel,
    );

    this.baseSubscribedMarkets.add(
      normalizedReplacement,
    );

    coinDCXSubscriptionAuditService
      .recordJoin(
        normalizedReplacement,
        replacementChannel,
        now,
      );

    this.diagnostics
      .baseSubscriptionReplacements +=
      1;

    this.diagnostics.subscribedChannels =
      this.subscribedChannels.size;

    console.log(
      `[CoinDCX] Base subscription replacement promoted: ${normalizedReplacement} | base=${this.baseSubscribedMarkets.size}/${maximumMarkets}`,
    );

    return true;
  }

  private recoverStaleSubscription(
    market:
      string,

    channelName:
      string,

    now:
      number,
  ): void {
    if (
      !this.socket
        ?.connected
    ) {
      return;
    }

    const normalizedMarket =
      this.normalizeMarket(
        market,
      );

    const temporaryExpiry =
      this.temporarySubscriptions.get(
        normalizedMarket,
      );

    if (
      temporaryExpiry !==
        undefined &&
      temporaryExpiry <=
        now
    ) {
      return;
    }

    const generation =
      this.beginMarketGeneration(
        normalizedMarket,
        "STALE_RECOVERY",
        now,
      );

    coinDCXSubscriptionAuditService
      .recordStaleRecovery(
        normalizedMarket,
        now,
      );

    this.diagnostics
      .staleRecoveryAttempts +=
      1;

    this.socket.emit(
      "leave",
      {
        channelName,
      },
    );

    this.socket.emit(
      "join",
      {
        channelName,
      },
    );

    console.warn(
      `[CoinDCX] Recovering stale order-book subscription: ${normalizedMarket} | channel=${channelName} | generation=${generation}`,
    );
  }

  /**
   * CoinDCX documents depth-update as a delta, so it must never be promoted
   * directly into a full executable book. When a live channel sends deltas
   * before its first socket snapshot, fetch one genuine public REST snapshot
   * and pass it through the same integrity gate. This is public market data
   * only; it cannot submit an order or use account credentials.
   */
  private scheduleSnapshotBootstrap(
    market:
      string,
  ): void {
    const normalizedMarket =
      this.normalizeMarket(
        market,
      );

    if (
      !this.hasOrderBookSubscription(
        normalizedMarket,
      ) ||
      this.snapshotBootstrapScheduled.has(
        normalizedMarket,
      )
    ) {
      return;
    }

    this.snapshotBootstrapScheduled.add(
      normalizedMarket,
    );

    this.snapshotBootstrapQueue.push(
      normalizedMarket,
    );

    this.diagnostics.snapshotBootstrapQueued =
      this.snapshotBootstrapQueue.length;

    this.drainSnapshotBootstrapQueue();
  }

  private drainSnapshotBootstrapQueue():
    void {
    while (
      this.activeSnapshotBootstraps <
        CoinDCXOrderBookAdapter
          .MAXIMUM_CONCURRENT_SNAPSHOT_BOOTSTRAPS &&
      this.snapshotBootstrapQueue.length >
        0
    ) {
      const market =
        this.snapshotBootstrapQueue.shift();

      if (!market) {
        continue;
      }

      this.activeSnapshotBootstraps +=
        1;

      this.diagnostics.snapshotBootstrapQueued =
        this.snapshotBootstrapQueue.length;

      void this.bootstrapSnapshot(
        market,
      ).finally(
        () => {
          this.activeSnapshotBootstraps -=
            1;

          this.snapshotBootstrapScheduled.delete(
            market,
          );

          this.drainSnapshotBootstrapQueue();
        },
      );
    }
  }

  private async bootstrapSnapshot(
    market:
      string,
  ): Promise<void> {
    const metadata =
      this.marketMetadataBySymbol.get(
        market,
      );

    if (
      !metadata ||
      !this.hasOrderBookSubscription(
        market,
      )
    ) {
      return;
    }

    this.diagnostics.snapshotBootstrapAttempts +=
      1;

    try {
      const response =
        await axios.get<unknown>(
          "https://public.coindcx.com/market_data/orderbook",
          {
            params: {
              pair:
                metadata.pair,
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

      if (
        !response.data ||
        typeof response.data !==
          "object" ||
        Array.isArray(
          response.data,
        ) ||
        !this.hasOrderBookSubscription(
          market,
        )
      ) {
        throw new Error(
          "CoinDCX snapshot bootstrap returned invalid or retired evidence.",
        );
      }

      const receivedAt =
        Date.now();

      const result =
        coinDCXOrderBookIntegrityService
          .seedTrackedSnapshot(
            {
              ...(response.data as CoinDCXOrderBookPayload),

              s:
                market,

              E:
                receivedAt,
            },
            receivedAt,
          );

      if (!result.accepted) {
        throw new Error(
          `CoinDCX snapshot bootstrap rejected: ${result.reason}.`,
        );
      }

      this.diagnostics.snapshotBootstrapSuccesses +=
        1;
    } catch (
      error:
        unknown
    ) {
      this.diagnostics.snapshotBootstrapFailures +=
        1;

      console.warn(
        `[CoinDCX] Snapshot bootstrap failed for ${market}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private recoverCrossedBook(
    market:
      string,
  ): boolean {
    if (
      !this.socket?.connected
    ) {
      return false;
    }

    const normalizedMarket =
      this.normalizeMarket(
        market,
      );

    if (
      this.integrityFailedMarkets.has(
        normalizedMarket,
      ) ||
      !coinDCXOrderBookIntegrityService
        .canScheduleCrossedBookRecovery(
          normalizedMarket,
        )
    ) {
      return false;
    }

    const metadata =
      this.marketMetadataBySymbol.get(
        normalizedMarket,
      );

    if (!metadata) {
      return false;
    }

    const channelName =
      this.createChannelName(
        metadata,
      );

    const generation =
      this.beginMarketGeneration(
        normalizedMarket,
        "CROSSED_BOOK_RECOVERY",
      );

    this.socket.emit(
      "leave",
      {
        channelName,
      },
    );

    this.socket.emit(
      "join",
      {
        channelName,
      },
    );

    this.diagnostics
      .crossedBookRecoveryAttempts +=
      1;

    console.warn(
      `[CoinDCX] Forced bounded snapshot recovery: ${normalizedMarket} | channel=${channelName} | generation=${generation} | attempt=${this.getIntegrityForcedRecoveryCount(normalizedMarket)}/${CoinDCXOrderBookIntegrityService.MAXIMUM_FORCED_SNAPSHOT_REJOINS_PER_MARKET}`,
    );

    return true;
  }

  private quarantineIntegrityFailedMarket(
    market:
      string,
  ): void {
    if (
      !this.socket?.connected
    ) {
      return;
    }

    const normalizedMarket =
      this.normalizeMarket(
        market,
      );

    if (
      this.integrityFailedMarkets.has(
        normalizedMarket,
      )
    ) {
      return;
    }

    const wasBaseSubscription =
      this.baseSubscribedMarkets.has(
        normalizedMarket,
      );

    const metadata =
      this.marketMetadataBySymbol.get(
        normalizedMarket,
      );

    if (metadata) {
      const channelName =
        this.createChannelName(
          metadata,
        );

      this.socket.emit(
        "leave",
        {
          channelName,
        },
      );

      this.subscribedChannels.delete(
        channelName,
      );
    }

    this.baseSubscribedMarkets.delete(
      normalizedMarket,
    );

    this.temporarySubscriptions.delete(
      normalizedMarket,
    );

    this.integrityFailedMarkets.add(
      normalizedMarket,
    );

    const invalidated =
      this.invalidateMarketEvidence(
        normalizedMarket,
      );

    coinDCXSubscriptionAuditService
      .markFailed(
        normalizedMarket,
      );

    this.diagnostics.integrityQuarantinedMarkets =
      this.integrityFailedMarkets.size;

    this.diagnostics.subscribedChannels =
      this.subscribedChannels.size;

    this.diagnostics.temporarySubscriptions =
      this.temporarySubscriptions.size;

    console.error(
      `[CoinDCX] Integrity-failed market quarantined: ${normalizedMarket} | crossedRecoveryBudgetExhausted=true | executableInvalidated=${invalidated}`,
    );

    if (wasBaseSubscription) {
      this.promoteBaseReplacement(
        Date.now(),
      );
    }
  }

  private beginMarketGeneration(
    market:
      string,

    reason:
      CoinDCXGenerationReason,

    now =
      Date.now(),
  ): number {
    const result =
      coinDCXOrderBookIntegrityService
        .beginGeneration(
          market,
          reason,
          now,
        );

    if (
      result.executableInvalidated
    ) {
      this.diagnostics
        .executableQuotesInvalidated +=
        1;
    }

    return result.generation;
  }

  private invalidateMarketEvidence(
    market:
      string,
  ): boolean {
    const invalidated =
      coinDCXOrderBookIntegrityService
        .invalidate(
          market,
        );

    if (invalidated) {
      this.diagnostics
        .executableQuotesInvalidated +=
        1;
    }

    return invalidated;
  }

  private getIntegrityForcedRecoveryCount(
    market:
      string,
  ): number {
    return coinDCXOrderBookIntegrityService
      .getReport()
      .records.find(
        (record) =>
          record.market ===
          this.normalizeMarket(
            market,
          ),
      )
      ?.forcedSnapshotRejoinCount ??
      0;
  }

  private retrySubscription(
    market:
      string,

    channelName:
      string,

    now:
      number,
  ): void {
    if (
      !this.socket
        ?.connected
    ) {
      return;
    }

    const normalizedMarket =
      this.normalizeMarket(
        market,
      );

    const temporaryExpiry =
      this.temporarySubscriptions.get(
        normalizedMarket,
      );

    if (
      temporaryExpiry !==
        undefined &&
      temporaryExpiry <=
        now
    ) {
      return;
    }

    const generation =
      this.beginMarketGeneration(
        normalizedMarket,
        "INITIAL_RETRY",
        now,
      );

    coinDCXSubscriptionAuditService
      .recordRetry(
        normalizedMarket,
        now,
      );

    this.socket.emit(
      "leave",
      {
        channelName,
      },
    );

    this.socket.emit(
      "join",
      {
        channelName,
      },
    );

    console.warn(
      `[CoinDCX] Retrying order-book subscription: ${normalizedMarket} | channel=${channelName} | generation=${generation}`,
    );
  }

  private releaseExpiredTemporarySubscriptions(
    now:
      number,
  ): void {
    if (
      !this.socket
        ?.connected
    ) {
      return;
    }

    for (
      const [
        market,
        expiresAt,
      ]
      of Array.from(
        this.temporarySubscriptions
          .entries(),
      )
    ) {
      if (
        expiresAt >
        now
      ) {
        continue;
      }

      this.releaseTemporarySubscription(
        market,
      );
    }
  }

  private releaseTemporarySubscription(
    market:
      string,
  ): void {
    const normalizedMarket =
      this.normalizeMarket(
        market,
      );

    if (
      this.baseSubscribedMarkets.has(
        normalizedMarket,
      )
    ) {
      this.temporarySubscriptions.delete(
        normalizedMarket,
      );

      return;
    }

    const metadata =
      this.marketMetadataBySymbol.get(
        normalizedMarket,
      );

    if (
      metadata &&
      this.socket?.connected
    ) {
      const channelName =
        this.createChannelName(
          metadata,
        );

      this.socket.emit(
        "leave",
        {
          channelName,
        },
      );

      this.subscribedChannels.delete(
        channelName,
      );
    }

    this.temporarySubscriptions.delete(
      normalizedMarket,
    );

    const invalidated =
      this.invalidateMarketEvidence(
        normalizedMarket,
      );

    coinDCXSubscriptionAuditService
      .remove(
        normalizedMarket,
      );

    this.diagnostics
      .temporarySubscriptionsReleased +=
      1;

    this.diagnostics.temporarySubscriptions =
      this.temporarySubscriptions
        .size;

    this.diagnostics.subscribedChannels =
      this.subscribedChannels
        .size;

    console.log(
      `[CoinDCX] Demand subscription released: ${normalizedMarket} | executableInvalidated=${invalidated} | temporary=${this.temporarySubscriptions.size}/${CoinDCXOrderBookAdapter.MAXIMUM_TEMPORARY_SUBSCRIPTIONS}`,
    );
  }

  private invalidateTemporaryMarket(
    market:
      string,
  ): void {
    const normalizedMarket =
      this.normalizeMarket(
        market,
      );

    this.invalidateMarketEvidence(
      normalizedMarket,
    );

    coinDCXSubscriptionAuditService
      .remove(
        normalizedMarket,
      );
  }

  private createChannelName(
    market:
      LoadedCoinDCXMarket,
  ): string {
    return `${market.pair}@orderbook@${COINDCX.ORDER_BOOK.DEPTH}`;
  }

  private normalizeTemporaryTtl(
    ttlMs:
      number,
  ): number {
    if (
      !Number.isFinite(
        ttlMs,
      ) ||
      ttlMs <=
        0
    ) {
      return CoinDCXOrderBookAdapter
        .DEFAULT_TEMPORARY_SUBSCRIPTION_TTL_MS;
    }

    return Math.min(
      5 *
        60_000,
      Math.max(
        10_000,
        Math.floor(
          ttlMs,
        ),
      ),
    );
  }

  private resolveMaximumMarkets():
    number {
    const rawValue =
      process.env
        .COINDCX_ORDER_BOOK_MAX_MARKETS;

    if (
      rawValue ===
        undefined ||
      rawValue
        .trim()
        .length ===
        0
    ) {
      return COINDCX.ORDER_BOOK
        .DEFAULT_MAX_MARKETS;
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
      console.warn(
        `[CoinDCX] Invalid COINDCX_ORDER_BOOK_MAX_MARKETS="${rawValue}". Using default ${COINDCX.ORDER_BOOK.DEFAULT_MAX_MARKETS}.`,
      );

      return COINDCX.ORDER_BOOK
        .DEFAULT_MAX_MARKETS;
    }

    return Math.min(
      parsed,
      COINDCX.ORDER_BOOK
        .ABSOLUTE_MAX_MARKETS,
    );
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

  private readonly compareMarkets = (
    first:
      LoadedCoinDCXMarket,

    second:
      LoadedCoinDCXMarket,
  ): number =>
    first.symbol
      .localeCompare(
        second.symbol,
      );

  private resetSubscriptionState():
    void {
    this.subscribed =
      false;

    this.subscribedChannels.clear();

    this.baseSubscribedMarkets.clear();

    this.persistentSilentMarkets.clear();

    this.initialSilentMarkets.clear();

    this.integrityFailedMarkets.clear();

    this.temporarySubscriptions.clear();

    this.snapshotBootstrapQueue.length =
      0;

    this.snapshotBootstrapScheduled.clear();

    this.activeSnapshotBootstraps =
      0;

    this.diagnostics.subscribedChannels =
      0;

    this.diagnostics.temporarySubscriptions =
      0;

    this.diagnostics.persistentSilentMarkets =
      0;

    this.diagnostics.integrityQuarantinedMarkets =
      0;

    this.diagnostics.snapshotBootstrapQueued =
      0;
  }

  private chunk<T>(
    items:
      readonly T[],

    size:
      number,
  ): T[][] {
    if (
      !Number.isSafeInteger(
        size,
      ) ||
      size <=
        0
    ) {
      throw new Error(
        "CoinDCX subscription batch size must be a positive integer.",
      );
    }

    const result:
      T[][] =
      [];

    for (
      let index =
        0;
      index <
        items.length;
      index +=
        size
    ) {
      result.push(
        items.slice(
          index,
          index +
            size,
        ),
      );
    }

    return result;
  }

  private sleep(
    milliseconds:
      number,
  ): Promise<void> {
    return new Promise(
      (
        resolve,
      ) => {
        setTimeout(
          resolve,
          milliseconds,
        );
      },
    );
  }
}
