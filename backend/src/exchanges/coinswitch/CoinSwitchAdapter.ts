import {
  io,
  type Socket,
} from "socket.io-client";

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import {
  marketCache,
} from "../../services/cache.service";

import type {
  ExchangeAdapter,
} from "../core/ExchangeAdapter";

import type {
  NormalizedTicker,
} from "../coindcx/types";

import {
  COINSWITCH,
  COINSWITCH_PUBLIC_VENUES,
  type CoinSwitchPublicVenue,
} from "./constants";

import {
  canonicalizeCoinSwitchMarket,
  normalizeCoinSwitchOrderBook,
  normalizeCoinSwitchTicker,
  toCoinSwitchSocketPair,
} from "./normalize";

import {
  coinSwitchPublicApi,
  type CoinSwitchPublicMarketApi,
} from "./CoinSwitchPublicApi";

import type {
  CoinSwitchMarketDescriptor,
  CoinSwitchOrderBookPayload,
  CoinSwitchTicker,
} from "./types";

export interface CoinSwitchAdapterDiagnostics {
  tickerMarkets: number;

  connectedVenues: number;

  subscribedMarkets: number;

  tickerRefreshes: number;

  socketSnapshots: number;

  rejectedSnapshots: number;

  subscriptionAcknowledgements: number;

  socketErrors: number;

  subscriptionAdds: number;

  subscriptionRemovals: number;

  unchangedSubscriptions: number;

  lastSnapshotAt:
    number | null;

  lastSourceTimestamp:
    number | null;

  lastObservedClockOffsetMs:
    number | null;
}

export interface CoinSwitchAdapterOptions {
  api?:
    CoinSwitchPublicMarketApi;

  now?:
    () => number;

  scheduleTimers?:
    boolean;
}

export class CoinSwitchAdapter
  implements ExchangeAdapter
{
  readonly name =
    COINSWITCH.NAME;

  private readonly api:
    CoinSwitchPublicMarketApi;

  private readonly now:
    () => number;

  private readonly scheduleTimers:
    boolean;

  private readonly sockets =
    new Map<
      CoinSwitchPublicVenue,
      Socket
    >();

  private readonly availableMarkets =
    new Map<
      string,
      CoinSwitchMarketDescriptor
    >();

  private readonly subscribedMarkets =
    new Map<
      string,
      CoinSwitchMarketDescriptor
    >();

  private readonly publishedMarkets =
    new Set<string>();

  private tickerRefreshTimer:
    NodeJS.Timeout | null =
    null;

  private tickerRefreshInProgress =
    false;

  private lastUpdate =
    0;

  private tickerCallback:
    | ((
        ticker:
          NormalizedTicker,
      ) => void)
    | null =
    null;

  private readonly diagnostics:
    CoinSwitchAdapterDiagnostics = {
    tickerMarkets:
      0,

    connectedVenues:
      0,

    subscribedMarkets:
      0,

    tickerRefreshes:
      0,

    socketSnapshots:
      0,

    rejectedSnapshots:
      0,

    subscriptionAcknowledgements:
      0,

    socketErrors:
      0,

    subscriptionAdds:
      0,

    subscriptionRemovals:
      0,

    unchangedSubscriptions:
      0,

    lastSnapshotAt:
      null,

    lastSourceTimestamp:
      null,

    lastObservedClockOffsetMs:
      null,
  };

  constructor(
    options:
      CoinSwitchAdapterOptions = {},
  ) {
    this.api =
      options.api ??
      coinSwitchPublicApi;

    this.now =
      options.now ??
      (() =>
        Date.now());

    this.scheduleTimers =
      options.scheduleTimers ??
      true;
  }

  async connect():
    Promise<void> {
    if (
      this.isConnected()
    ) {
      return;
    }

    await this.refreshTickerCatalog(
      true,
    );

    const connectionResults =
      await Promise.allSettled(
        COINSWITCH_PUBLIC_VENUES
          .map(
            (venue) =>
              this.connectVenue(
                venue,
              ),
          ),
      );

    const connectedVenues =
      connectionResults
        .filter(
          (result) =>
            result.status ===
            "fulfilled",
        ).length;

    if (
      connectedVenues ===
        0
    ) {
      await this.disconnect();

      throw new Error(
        "CoinSwitch public market-data sockets are unavailable.",
      );
    }

    this.updateConnectedVenueCount();

    this.startTickerRefreshTimer();

    console.log(
      `[${this.name}] Connected ${connectedVenues}/${COINSWITCH_PUBLIC_VENUES.length} public Socket.IO venues with ${this.availableMarkets.size} validated ticker markets. LIVE execution remains unavailable.`,
    );
  }

  async disconnect():
    Promise<void> {
    this.stopTickerRefreshTimer();

    for (
      const socket
      of this.sockets.values()
    ) {
      socket.removeAllListeners();

      socket.disconnect();
    }

    this.sockets.clear();

    for (
      const market
      of this.publishedMarkets
    ) {
      this.invalidateExecutableMarket(
        market,
      );
    }

    this.availableMarkets
      .clear();

    this.subscribedMarkets
      .clear();

    this.publishedMarkets
      .clear();

    this.diagnostics
      .connectedVenues =
      0;

    this.diagnostics
      .subscribedMarkets =
      0;
  }

  async subscribe(
    markets: string[],
  ): Promise<void> {
    if (!this.isConnected()) {
      throw new Error(
        "CoinSwitch public market data is not connected.",
      );
    }

    const selectedMarkets =
      this.selectAvailableMarkets(
        markets,
      );

    const nextMarkets =
      new Map(
        selectedMarkets.map(
          (descriptor) => [
            descriptor.canonicalMarket,
            descriptor,
          ] as const,
        ),
      );

    /*
     * V20.9 Build 4B.1
     *
     * Incremental reconciliation.
     *
     * Unchanged market:
     * - keep the existing socket subscription
     * - do NOT emit another subscribe event
     *
     * Removed market:
     * - unsubscribe once
     * - invalidate executable evidence
     *
     * Added/changed market:
     * - subscribe once
     */
    for (
      const [
        canonicalMarket,
        existingDescriptor,
      ]
      of [
        ...this.subscribedMarkets
          .entries(),
      ]
    ) {
      const nextDescriptor =
        nextMarkets.get(
          canonicalMarket,
        );

      if (!nextDescriptor) {
        this.emitSubscription(
          existingDescriptor,
          "unsubscribe",
        );

        this.diagnostics
          .subscriptionRemovals +=
          1;

        this.subscribedMarkets
          .delete(
            canonicalMarket,
          );

        this.invalidateExecutableMarket(
          existingDescriptor.market,
        );

        continue;
      }

      const unchanged =
        existingDescriptor.venue ===
          nextDescriptor.venue &&
        existingDescriptor.symbol ===
          nextDescriptor.symbol &&
        existingDescriptor.market ===
          nextDescriptor.market;

      if (unchanged) {
        this.diagnostics
          .unchangedSubscriptions +=
          1;

        nextMarkets.delete(
          canonicalMarket,
        );

        continue;
      }

      this.emitSubscription(
        existingDescriptor,
        "unsubscribe",
      );

      this.diagnostics
        .subscriptionRemovals +=
        1;

      this.invalidateExecutableMarket(
        existingDescriptor.market,
      );

      this.subscribedMarkets
        .delete(
          canonicalMarket,
        );
    }

    for (
      const descriptor
      of nextMarkets.values()
    ) {
      this.subscribedMarkets
        .set(
          descriptor
            .canonicalMarket,
          descriptor,
        );

      this.emitSubscription(
        descriptor,
        "subscribe",
      );

      this.diagnostics
        .subscriptionAdds +=
        1;
    }

    this.diagnostics
      .subscribedMarkets =
      this.subscribedMarkets
        .size;

    console.log(
      `[${this.name}] Subscription reconciliation complete: ${this.subscribedMarkets.size} active validated full-depth streams.`,
    );
  }

  async unsubscribe(
    markets: string[],
  ): Promise<void> {
    for (
      const market
      of markets
    ) {
      const canonicalMarket =
        canonicalizeCoinSwitchMarket(
          market,
        );

      const descriptor =
        this.subscribedMarkets
          .get(
            canonicalMarket,
          );

      if (!descriptor) {
        continue;
      }

      this.emitSubscription(
        descriptor,
        "unsubscribe",
      );

      this.diagnostics
        .subscriptionRemovals +=
        1;

      this.subscribedMarkets
        .delete(
          canonicalMarket,
        );

      this.invalidateExecutableMarket(
        descriptor.market,
      );
    }

    this.diagnostics
      .subscribedMarkets =
      this.subscribedMarkets
        .size;
  }

  isConnected():
    boolean {
    return [
      ...this.sockets.values(),
    ].some(
      (socket) =>
        socket.connected,
    );
  }

  getMarketCount():
    number {
    return this.publishedMarkets
      .size;
  }

  getLastUpdate():
    number {
    return this.lastUpdate;
  }

  onTicker(
    callback: (
      ticker:
        NormalizedTicker,
    ) => void,
  ): void {
    this.tickerCallback =
      callback;
  }

  getAvailableMarkets():
    string[] {
    return [
      ...this.availableMarkets
        .values(),
    ]
      .map(
        (market) =>
          market.market,
      )
      .sort(
        (
          first,
          second,
        ) =>
          first.localeCompare(
            second,
          ),
      );
  }

  getPriorityMarkets():
    string[] {
    return [
      ...COINSWITCH
        .PRIORITY_MARKETS,
    ];
  }

  /**
   * Read-only bounded capacity used by the manager's adaptive subscription
   * window. It exposes no socket, credential or execution authority.
   */
  getMaximumSubscribedMarkets():
    number {
    return this.resolveMaximumSubscribedMarkets();
  }

  /**
   * Return only current subscriptions that still own a genuinely fresh,
   * quantity-bearing book. The manager uses this read-only view to keep
   * healthy streams sticky across small counterpart-freshness fluctuations;
   * stale or missing streams remain replaceable on the next reconciliation.
   */
  getFreshSubscribedMarkets():
    string[] {
    const now =
      this.now();

    return [
      ...this.subscribedMarkets
        .values(),
    ]
      .filter(
        (descriptor) => {
          const book =
            orderBookService.get(
              this.name,
              descriptor.market,
            );

          return Boolean(
            book &&
            Number.isFinite(
              book.timestamp,
            ) &&
            now -
              book.timestamp >=
              0 &&
            now -
              book.timestamp <=
              COINSWITCH
                .MAXIMUM_SNAPSHOT_AGE_MS,
          );
        },
      )
      .map(
        (descriptor) =>
          descriptor.market,
      );
  }

  getDiagnostics():
    CoinSwitchAdapterDiagnostics {
    return {
      ...this.diagnostics,
    };
  }

  private async connectVenue(
    venue:
      CoinSwitchPublicVenue,
  ): Promise<void> {
    const existingSocket =
      this.sockets.get(
        venue,
      );

    if (
      existingSocket
        ?.connected
    ) {
      return;
    }

    existingSocket
      ?.removeAllListeners();

    existingSocket
      ?.disconnect();

    const socket =
      io(
        `${COINSWITCH.SOCKET_BASE_URL}/${venue}`,
        {
          path:
            COINSWITCH
              .SOCKET_PATH,

          transports: [
            "websocket",
          ],

          autoConnect:
            false,

          timeout:
            COINSWITCH
              .SOCKET_CONNECT_TIMEOUT_MS,

          reconnection:
            true,
        },
      );

    this.sockets.set(
      venue,
      socket,
    );

    socket.on(
      COINSWITCH
        .ORDER_BOOK_EVENT,
      (
        payload:
          CoinSwitchOrderBookPayload,
      ) => {
        this.handleOrderBookPayload(
          venue,
          payload,
        );
      },
    );

    socket.on(
      "connect",
      () => {
        this.updateConnectedVenueCount();

        this.resubscribeVenue(
          venue,
        );
      },
    );

    socket.on(
      "disconnect",
      () => {
        this.updateConnectedVenueCount();

        this.invalidateVenueBooks(
          venue,
        );
      },
    );

    socket.on(
      "connect_error",
      () => {
        this.diagnostics
          .socketErrors +=
          1;

        this.updateConnectedVenueCount();
      },
    );

    await new Promise<void>(
      (
        resolve,
        reject,
      ) => {
        const timeout =
          setTimeout(
            () => {
              cleanup();

              reject(
                new Error(
                  `CoinSwitch socket connection timed out: ${venue}.`,
                ),
              );
            },
            COINSWITCH
              .SOCKET_CONNECT_TIMEOUT_MS,
          );

        const handleConnect =
          () => {
            cleanup();

            resolve();
          };

        const handleError =
          (
            error: Error,
          ) => {
            cleanup();

            reject(
              error,
            );
          };

        const cleanup =
          () => {
            clearTimeout(
              timeout,
            );

            socket.off(
              "connect",
              handleConnect,
            );

            socket.off(
              "connect_error",
              handleError,
            );
          };

        socket.once(
          "connect",
          handleConnect,
        );

        socket.once(
          "connect_error",
          handleError,
        );

        socket.connect();
      },
    );
  }

  private handleOrderBookPayload(
    venue:
      CoinSwitchPublicVenue,

    payload:
      CoinSwitchOrderBookPayload,
  ): void {
    if (
      !Array.isArray(
        payload.bids,
      ) ||
      !Array.isArray(
        payload.asks,
      )
    ) {
      if (
        payload.success !==
          undefined
      ) {
        this.diagnostics
          .subscriptionAcknowledgements +=
          1;
      }

      return;
    }

    const canonicalMarket =
      canonicalizeCoinSwitchMarket(
        payload.s,
      );

    const descriptor =
      this.subscribedMarkets
        .get(
          canonicalMarket,
        );

    if (
      !descriptor ||
      descriptor.venue !==
        venue
    ) {
      this.diagnostics
        .rejectedSnapshots +=
        1;

      return;
    }

    const book =
      normalizeCoinSwitchOrderBook(
        payload,
        descriptor,
        this.now(),
      );

    if (!book) {
      this.diagnostics
        .rejectedSnapshots +=
        1;

      this.invalidateExecutableMarket(
        descriptor.market,
      );

      return;
    }

    orderBookService
      .replace({
        exchange:
          this.name,

        market:
          book.market,

        bids:
          book.bids,

        asks:
          book.asks,

        timestamp:
          book.timestamp,
      });

    const bestBid =
      book.bids[0];

    const bestAsk =
      book.asks[0];

    if (
      !bestBid ||
      !bestAsk
    ) {
      this.diagnostics
        .rejectedSnapshots +=
        1;

      this.invalidateExecutableMarket(
        descriptor.market,
      );

      return;
    }

    const ticker:
      NormalizedTicker = {
      exchange:
        this.name,

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
    };

    marketCache.update(
      ticker,
    );

    this.tickerCallback?.(
      ticker,
    );

    this.publishedMarkets.add(
      descriptor.market,
    );

    this.lastUpdate =
      Math.max(
        this.lastUpdate,
        book.timestamp,
      );

    this.diagnostics
      .socketSnapshots +=
      1;

    this.diagnostics
      .lastSnapshotAt =
      book.timestamp;

    this.diagnostics
      .lastSourceTimestamp =
      book.sourceTimestamp;

    this.diagnostics
      .lastObservedClockOffsetMs =
      book.sourceTimestamp -
      book.timestamp;
  }

  private async refreshTickerCatalog(
    initial:
      boolean,
  ): Promise<void> {
    if (
      this.tickerRefreshInProgress
    ) {
      return;
    }

    this.tickerRefreshInProgress =
      true;

    try {
      const results =
        await Promise.allSettled(
          COINSWITCH_PUBLIC_VENUES
            .map(
              async (
                venue,
              ) => ({
                venue,

                tickers:
                  await this.api
                    .getTickers(
                      venue,
                    ),
              }),
            ),
        );

      const successfulResults =
        results.filter(
          (
            result,
          ): result is
            PromiseFulfilledResult<{
              venue:
                CoinSwitchPublicVenue;

              tickers:
                Record<
                  string,
                  CoinSwitchTicker
                >;
            }> =>
              result.status ===
              "fulfilled",
        );

      if (
        successfulResults.length ===
          0
      ) {
        throw new Error(
          "CoinSwitch public ticker discovery failed for every supported venue.",
        );
      }

      const receivedAt =
        this.now();

      const nextMarkets =
        initial
          ? new Map<
              string,
              CoinSwitchMarketDescriptor
            >()
          : new Map(
              this.availableMarkets,
            );

      for (
        const result
        of successfulResults
      ) {
        for (
          const [
            responseSymbol,
            incomingTicker,
          ]
          of Object.entries(
            result.value
              .tickers,
          )
        ) {
          const normalized =
            normalizeCoinSwitchTicker(
              result.value
                .venue,
              responseSymbol,
              incomingTicker,
              receivedAt,
            );

          if (!normalized) {
            continue;
          }

          nextMarkets.set(
            normalized
              .descriptor
              .canonicalMarket,
            normalized
              .descriptor,
          );

          marketCache.update(
            normalized.ticker,
          );

          this.tickerCallback?.(
            normalized.ticker,
          );

          this.lastUpdate =
            Math.max(
              this.lastUpdate,
              normalized
                .ticker
                .timestamp,
            );
        }
      }

      if (
        nextMarkets.size ===
          0
      ) {
        throw new Error(
          "CoinSwitch returned no validated public ticker markets.",
        );
      }

      this.availableMarkets
        .clear();

      for (
        const [
          canonicalMarket,
          descriptor,
        ]
        of nextMarkets
      ) {
        this.availableMarkets
          .set(
            canonicalMarket,
            descriptor,
          );
      }

      this.diagnostics
        .tickerMarkets =
        this.availableMarkets
          .size;

      this.diagnostics
        .tickerRefreshes +=
        1;
    } finally {
      this.tickerRefreshInProgress =
        false;
    }
  }

  private selectAvailableMarkets(
    requestedMarkets:
      readonly string[],
  ): CoinSwitchMarketDescriptor[] {
    const selected =
      new Map<
        string,
        CoinSwitchMarketDescriptor
      >();

    for (
      const market
      of requestedMarkets
    ) {
      const canonicalMarket =
        canonicalizeCoinSwitchMarket(
          market,
        );

      const descriptor =
        this.availableMarkets
          .get(
            canonicalMarket,
          );

      if (
        descriptor &&
        this.sockets.get(
          descriptor.venue,
        )?.connected
      ) {
        selected.set(
          canonicalMarket,
          descriptor,
        );
      }
    }

    return [
      ...selected.values(),
    ]
      .sort(
        (
          first,
          second,
        ) =>
          this.getMarketPriority(
            first.market,
          ) -
            this.getMarketPriority(
              second.market,
            ),
      )
      .slice(
        0,
        this.resolveMaximumSubscribedMarkets(),
      );
  }

  private emitSubscription(
    descriptor:
      CoinSwitchMarketDescriptor,

    event:
      "subscribe" |
      "unsubscribe",
  ): void {
    const socket =
      this.sockets.get(
        descriptor.venue,
      );

    if (
      !socket?.connected
    ) {
      return;
    }

    socket.emit(
      COINSWITCH
        .ORDER_BOOK_EVENT,
      {
        event,

        pair:
          toCoinSwitchSocketPair(
            descriptor.symbol,
          ),
      },
    );
  }

  private resubscribeVenue(
    venue:
      CoinSwitchPublicVenue,
  ): void {
    for (
      const descriptor
      of this.subscribedMarkets
        .values()
    ) {
      if (
        descriptor.venue ===
        venue
      ) {
        this.emitSubscription(
          descriptor,
          "subscribe",
        );

        this.diagnostics
          .subscriptionAdds +=
          1;
      }
    }
  }

  private invalidateVenueBooks(
    venue:
      CoinSwitchPublicVenue,
  ): void {
    for (
      const descriptor
      of this.subscribedMarkets
        .values()
    ) {
      if (
        descriptor.venue ===
        venue
      ) {
        this.invalidateExecutableMarket(
          descriptor.market,
        );
      }
    }
  }

  private invalidateExecutableMarket(
    market: string,
  ): void {
    marketCache
      .invalidateExecutable(
        this.name,
        market,
      );

    orderBookService
      .remove(
        this.name,
        market,
      );

    this.publishedMarkets
      .delete(
        market,
      );
  }

  private updateConnectedVenueCount():
    void {
    this.diagnostics
      .connectedVenues =
      [
        ...this.sockets
          .values(),
      ].filter(
        (socket) =>
          socket.connected,
      ).length;
  }

  private getMarketPriority(
    market: string,
  ): number {
    const index =
      COINSWITCH
        .PRIORITY_MARKETS
        .indexOf(
          market as
            typeof COINSWITCH.PRIORITY_MARKETS[number],
        );

    return index >=
      0
      ? index
      : COINSWITCH
          .PRIORITY_MARKETS
          .length;
  }

  private startTickerRefreshTimer():
    void {
    if (
      !this.scheduleTimers ||
      this.tickerRefreshTimer
    ) {
      return;
    }

    this.tickerRefreshTimer =
      setInterval(
        () => {
          void this
            .refreshTickerCatalog(
              false,
            )
            .catch(
              (
                error:
                  unknown,
              ) => {
                console.error(
                  `[${this.name}] Public ticker refresh failed:`,
                  error instanceof Error
                    ? error.message
                    : error,
                );
              },
            );
        },
        this.resolveTickerRefreshMs(),
      );
  }

  private stopTickerRefreshTimer():
    void {
    if (
      !this.tickerRefreshTimer
    ) {
      return;
    }

    clearInterval(
      this.tickerRefreshTimer,
    );

    this.tickerRefreshTimer =
      null;
  }

  private resolveTickerRefreshMs():
    number {
    return this.resolveBoundedInteger(
      process.env
        .COINSWITCH_TICKER_REFRESH_MS,

      COINSWITCH
        .TICKER_REFRESH_MS,

      COINSWITCH
        .MINIMUM_TICKER_REFRESH_MS,

      10 *
        60 *
        1_000,
    );
  }

  private resolveMaximumSubscribedMarkets():
    number {
    return this.resolveBoundedInteger(
      process.env
        .COINSWITCH_MAX_SUBSCRIBED_MARKETS,

      COINSWITCH
        .DEFAULT_MAX_SUBSCRIBED_MARKETS,

      1,

      COINSWITCH
        .ABSOLUTE_MAX_SUBSCRIBED_MARKETS,
    );
  }

  private resolveBoundedInteger(
    rawValue:
      string | undefined,

    fallback:
      number,

    minimum:
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
      )
    ) {
      return fallback;
    }

    return Math.min(
      maximum,
      Math.max(
        minimum,
        parsed,
      ),
    );
  }
}
