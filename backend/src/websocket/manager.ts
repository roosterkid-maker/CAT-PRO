import {
  orderBookSubscriptionWatchdogService,
} from "../diagnostics/services/OrderBookSubscriptionWatchdogService";

import {
  BinanceAdapter,
} from "../exchanges/binance/BinanceAdapter";

import {
  BybitAdapter,
} from "../exchanges/bybit/BybitAdapter";

import {
  CoinSwitchAdapter,
} from "../exchanges/coinswitch/CoinSwitchAdapter";

import {
  UnoCoinAdapter,
} from "../exchanges/unocoin/UnoCoinAdapter";

import {
  CoinDCXOrderBookAdapter,
} from "../exchanges/coindcx/CoinDCXOrderBookAdapter";

import {
  CoinDCXDemandSubscriptionService,
} from "../exchanges/coindcx/CoinDCXDemandSubscriptionService";

import {
  coinDCXProtectedRestOrderBookService,
} from "../exchanges/coindcx/CoinDCXProtectedRestOrderBookService";

import {
  loadMarkets,
} from "../exchanges/coindcx/marketLoader";

import {
  marketRegistry,
} from "../exchanges/coindcx/registry";

import {
  CoinDCXWebSocket,
} from "../exchanges/coindcx/websocket";

import {
  exchangeManager,
} from "../exchanges/core/ExchangeManager";

import {
  rankPriceAlignedSharedMarkets,
  selectRotatingDiscoveryWindow,
} from "../exchanges/core/PriceAlignedMarketRanking";

import {
  UNOCOIN,
} from "../exchanges/unocoin/constants";

import {
  marketCache,
} from "../services/cache.service";

import {
  OpportunityRecoveryService,
} from "../recovery/services/OpportunityRecoveryService";

export interface DynamicCoverageRecoveryMetrics {
  running:
    boolean;

  refreshCycles:
    number;

  skippedCycles:
    number;

  failedCycles:
    number;

  binanceRecoveryAttempts:
    number;

  binanceRecoveries:
    number;

  binanceRecoveryFailures:
    number;

  lastBinanceRecoveryAttemptAt:
    number | null;

  lastBinanceRecoveryAt:
    number | null;

  lastBinanceRecoveryError:
    string | null;

  coinSwitchRefreshes:
    number;

  coinDCXRefreshes:
    number;

  unoCoinRefreshes:
    number;

  unoCoinForcedRecoveries:
    number;

  lastRefreshAt:
    number | null;

  lastCoinSwitchCandidateCount:
    number;

  lastUnoCoinCandidateCount:
    number;

  lastCoinSwitchSubscribedMarkets:
    number;

  lastCoinDCXSubscribedMarkets:
    number;

  lastUnoCoinSubscribedMarkets:
    number;

  lastObservedUnoCoinQuarantines:
    number;
}

/*
 * ============================================================
 * CAT PRO V20.9 BUILD 4B
 * DYNAMIC EXECUTABLE MARKET COVERAGE RECOVERY
 * ============================================================
 *
 * PURPOSE
 *
 * CoinSwitch and UnoCoin depth subscriptions were historically
 * selected once during startup after a short warmup.
 *
 * The broader Binance / Bybit / CoinDCX executable universe can
 * continue growing after that startup moment.
 *
 * Build 4B periodically re-evaluates the existing executable
 * cross-exchange market universe and reuses the existing adapter
 * subscribe() contracts.
 *
 * SAFETY
 *
 * This manager does NOT:
 *
 * - fabricate quantities
 * - fabricate order books
 * - weaken freshness
 * - weaken synchronization
 * - change fees
 * - change opportunity thresholds
 * - bypass ExchangePairGenerator
 * - bypass OpportunityEngine
 * - bypass RiskEngine
 * - arm PAPER
 * - enable LIVE
 * - reserve capital
 * - create exchange orders
 *
 * CoinSwitchAdapter and UnoCoinAdapter remain authoritative for:
 *
 * - available-market validation
 * - subscription limits
 * - normalization
 * - order-book validation
 * - executable quote publication
 * - invalidation
 * - bounded failure handling
 */

class WebSocketManager {
  private static readonly ORDER_BOOK_WARMUP_MS =
    3_000;

  private static readonly DEFAULT_DYNAMIC_COVERAGE_REFRESH_MS =
    15_000;

  private static readonly MINIMUM_DYNAMIC_COVERAGE_REFRESH_MS =
    15_000;

  private static readonly MAXIMUM_DYNAMIC_COVERAGE_REFRESH_MS =
    15_000;

  private static readonly MINIMUM_BINANCE_RECOVERY_INTERVAL_MS =
    30_000;

  private initialized =
    false;

  private dynamicCoverageRefreshTimer:
    NodeJS.Timeout | null =
    null;

  private dynamicCoverageRefreshInProgress =
    false;

  private binanceRecoveryPending =
    false;

  private lastCoinSwitchCandidateSignature =
    "";

  private lastUnoCoinCandidateSignature =
    "";

  private unoCoinCoinDCXPriorityMarkets:
    readonly string[] =
    [];

  private unoCoinExplorationCursor =
    0;

  private readonly coinDCXOrderBook =
    new CoinDCXOrderBookAdapter();

  private readonly unoCoinMarketData =
    new UnoCoinAdapter();

  private readonly coinSwitchMarketData =
    new CoinSwitchAdapter();

  private readonly coinDCXDemandSubscriptions =
    new CoinDCXDemandSubscriptionService(
      this.coinDCXOrderBook,
    );

  /*
   * Version 12.5
   *
   * Recovery engine shares the same
   * CoinDCX order-book adapter so it can
   * reuse demand-driven subscriptions
   * instead of creating another socket.
   */
  private readonly opportunityRecovery =
    new OpportunityRecoveryService(
      this.coinDCXOrderBook,
    );

  private readonly dynamicCoverageMetrics:
    DynamicCoverageRecoveryMetrics = {
    running:
      false,

    refreshCycles:
      0,

    skippedCycles:
      0,

    failedCycles:
      0,

    binanceRecoveryAttempts:
      0,

    binanceRecoveries:
      0,

    binanceRecoveryFailures:
      0,

    lastBinanceRecoveryAttemptAt:
      null,

    lastBinanceRecoveryAt:
      null,

    lastBinanceRecoveryError:
      null,

    coinSwitchRefreshes:
      0,

    coinDCXRefreshes:
      0,

    unoCoinRefreshes:
      0,

    unoCoinForcedRecoveries:
      0,

    lastRefreshAt:
      null,

    lastCoinSwitchCandidateCount:
      0,

    lastUnoCoinCandidateCount:
      0,

    lastCoinSwitchSubscribedMarkets:
      0,

    lastCoinDCXSubscribedMarkets:
      0,

    lastUnoCoinSubscribedMarkets:
      0,

    lastObservedUnoCoinQuarantines:
      0,
  };

  async start():
    Promise<void> {
    if (
      this.initialized
    ) {
      return;
    }

    this.initialized =
      true;

    console.log(
      "[Manager] Starting Exchange Services...",
    );

    try {
      await this.bootstrapCoinDCXMarkets();

      /*
       * Connect ticker / market-data adapters first.
       *
       * CoinDCX order-book selection uses the
       * executable Binance + Bybit market universe,
       * so those feeds must get a short opportunity
       * to populate MarketCache before CoinDCX depth
       * subscriptions are selected.
       */
      exchangeManager.register(
        new CoinDCXWebSocket(),
      );

      exchangeManager.register(
        new BinanceAdapter(),
      );

      exchangeManager.register(
        new BybitAdapter(),
      );

      exchangeManager.register(
        this.unoCoinMarketData,
      );

      exchangeManager.register(
        this.coinSwitchMarketData,
      );

      await exchangeManager
        .connectAll();

      console.log(
        `[Manager] Waiting ${WebSocketManager.ORDER_BOOK_WARMUP_MS}ms for cross-exchange market discovery...`,
      );

      await this.sleep(
        WebSocketManager
          .ORDER_BOOK_WARMUP_MS,
      );

      /*
       * Initial coverage selection.
       *
       * Build 4B will continue refreshing this universe
       * after startup instead of freezing it here.
       */
      await this.subscribeUnoCoinSharedMarkets(
        true,
      );

      await this.subscribeCoinSwitchSharedMarkets(
        true,
      );

      await this.coinDCXOrderBook
        .connect();

      /*
       * Standard CoinDCX demand discovery.
       */
      this.coinDCXDemandSubscriptions
        .start();

      /*
       * Version 12.5 recovery starts after
       * demand subscriptions are available.
       */
      this.opportunityRecovery
        .start();

      console.log(
        "[Manager] CoinDCX smart + demand-driven order-book layers started.",
      );

      console.log(
        "[Manager] Opportunity recovery engine started.",
      );

      /*
       * V19.14
       *
       * Start only after all primary market-data
       * layers have been started.
       *
       * The watchdog itself contains another 20s
       * observation warmup before any recovery can
       * occur.
       */
      orderBookSubscriptionWatchdogService
        .start();

      console.log(
        "[Manager] Order-book subscription watchdog started.",
      );

      /*
       * V20.9 Build 4B
       *
       * Continue discovering executable shared markets
       * after startup.
       *
       * This reuses existing CoinSwitchAdapter and
       * UnoCoinAdapter subscribe() contracts.
       */
      this.startDynamicCoverageRefresh();

      console.log(
        `[Manager] Dynamic CoinSwitch/UnoCoin executable coverage recovery started at ${this.resolveDynamicCoverageRefreshMs()} ms interval.`,
      );
    } catch (
      error
    ) {
      this.initialized =
        false;

      this.stopDynamicCoverageRefresh();

      orderBookSubscriptionWatchdogService
        .stop();

      console.error(
        "[Manager] Exchange service startup failed:",
        error,
      );

      throw error;
    }
  }

  async stop():
    Promise<void> {
    if (
      !this.initialized
    ) {
      return;
    }

    console.log(
      "[Manager] Stopping Exchange Services...",
    );

    try {
      /*
       * Stop dynamic market coverage first.
       *
       * It must not resubscribe while the rest of the
       * exchange layer is shutting down.
       */
      this.stopDynamicCoverageRefresh();

      /*
       * Stop the watchdog before normal shutdown so
       * it cannot initiate recovery while adapters
       * are being disconnected.
       */
      orderBookSubscriptionWatchdogService
        .stop();

      /*
       * Stop recovery before destroying
       * the CoinDCX order-book adapter.
       */
      this.opportunityRecovery
        .stop();

      this.coinDCXDemandSubscriptions
        .stop();

      await this.coinDCXOrderBook
        .disconnect();

      await exchangeManager
        .disconnectAll();
    } finally {
      marketRegistry.clear();

      this.lastCoinSwitchCandidateSignature =
        "";

      this.lastUnoCoinCandidateSignature =
        "";

      this.unoCoinCoinDCXPriorityMarkets =
        [];

      this.dynamicCoverageRefreshInProgress =
        false;

      this.binanceRecoveryPending =
        false;

      this.dynamicCoverageMetrics
        .running =
        false;

      this.initialized =
        false;
    }
  }

  getCoinDCXOrderBookDiagnostics() {
    return this.coinDCXOrderBook
      .getDiagnostics();
  }

  getCoinDCXDemandSubscriptionMetrics() {
    return this.coinDCXDemandSubscriptions
      .getMetrics();
  }

  /*
   * Read-only Version 12.5 metrics.
   */
  getOpportunityRecoveryMetrics() {
    return this.opportunityRecovery
      .getMetrics();
  }

  /*
   * V19.14
   *
   * Read-only diagnostic exposure.
   */
  getOrderBookSubscriptionWatchdogReport() {
    return orderBookSubscriptionWatchdogService
      .getReport();
  }

  /*
   * V20.9 Build 4B
   *
   * Read-only dynamic coverage metrics.
   *
   * No mutation can occur through this getter.
   */
  getDynamicCoverageRecoveryMetrics():
    DynamicCoverageRecoveryMetrics {
    return {
      ...this.dynamicCoverageMetrics,
    };
  }

  private async bootstrapCoinDCXMarkets():
    Promise<void> {
    console.log(
      "[CoinDCX] Loading active market metadata...",
    );

    const markets =
      await loadMarkets();

    marketRegistry.clear();

    marketRegistry.registerMany(
      markets,
    );

    console.log(
      `[CoinDCX] Registered ${marketRegistry.size()} active markets.`,
    );

    if (
      marketRegistry.size() ===
        0
    ) {
      throw new Error(
        "CoinDCX market registry is empty.",
      );
    }
  }

  /*
   * ============================================================
   * UNOCOIN COVERAGE
   * ============================================================
   */

  private async subscribeUnoCoinSharedMarkets(
    force:
      boolean,
  ): Promise<boolean> {
    let forceSubscription =
      force;

    if (
      !this.unoCoinMarketData
        .isConnected()
    ) {
      console.warn(
        "[UnoCoin] Public market-data adapter is stale or unavailable; attempting bounded public-feed recovery.",
      );

      try {
        await this.unoCoinMarketData
          .connect();

        if (
          !this.unoCoinMarketData
            .isConnected()
        ) {
          console.warn(
            "[UnoCoin] Public-feed recovery completed without fresh market-data evidence; REST order-book polling remains disabled.",
          );

          return false;
        }

        forceSubscription =
          true;

        this.dynamicCoverageMetrics
          .unoCoinForcedRecoveries +=
          1;

        console.log(
          "[UnoCoin] Public market-data adapter recovered; rebuilding validated REST order-book coverage.",
        );
      } catch (
        error:
          unknown
      ) {
        console.error(
          "[UnoCoin] Public-feed recovery failed; the next bounded coverage cycle will retry:",
          error instanceof Error
            ? error.message
            : error,
        );

        return false;
      }
    }

    const freshlyAlignedCoinDCXMarkets =
      this.uniqueMarketsInOrder([
        /*
         * A route that already has fresh authoritative depth on both venues
         * has stronger evidence than a ticker-only discovery candidate. Keep
         * those proven routes at the front so rotation broadens coverage
         * without evicting a currently executable UnoCoin/CoinDCX market.
         */
        ...this.buildUnoCoinCoinDCXExecutableCandidates(),
        ...this.buildUnoCoinCoinDCXAlignedCandidates(),
      ]);

    const rankedCoinDCXMarkets =
      freshlyAlignedCoinDCXMarkets.length >
        0
        ? freshlyAlignedCoinDCXMarkets
        : this.unoCoinCoinDCXPriorityMarkets;

    const discoveryWindow =
      selectRotatingDiscoveryWindow(
        rankedCoinDCXMarkets,
        this.resolveUnoCoinActiveMarketLimit(),
        this.unoCoinExplorationCursor,
      );

    this.unoCoinExplorationCursor =
      discoveryWindow.nextCursor;

    this.unoCoinCoinDCXPriorityMarkets =
      discoveryWindow
        .prioritizedMarkets
        .slice(
          0,
          UNOCOIN
            .ABSOLUTE_MAX_ORDER_BOOK_MARKETS,
        );

    this.coinDCXOrderBook
      .setCounterpartPriorityMarkets(
        this.unoCoinCoinDCXPriorityMarkets,
      );

    coinDCXProtectedRestOrderBookService
      .setStrategyOneTargets(
        this.unoCoinCoinDCXPriorityMarkets
          .map(
            (market) =>
              marketRegistry.get(
                market,
              ),
          )
          .filter(
            (
              metadata,
            ): metadata is NonNullable<typeof metadata> =>
              metadata !==
                undefined,
          )
          .map(
            (metadata) => ({
              market:
                metadata.symbol,
              pair:
                metadata.pair,
            }),
          ),
      );

    console.log(
      `[Strategy #1 Coverage] CoinDCX-UnoCoin active=${[
        ...discoveryWindow.stableMarkets,
        ...discoveryWindow.explorationMarkets,
      ].join(",") || "NONE"} | rotating=${discoveryWindow.explorationMarkets.join(",") || "NONE"} | ranked=${this.unoCoinCoinDCXPriorityMarkets.length}`,
    );

    const sharedMarketCandidates =
      this.buildExecutableCrossExchangeCandidates(
        this.unoCoinMarketData
          .name,
      );

    this.dynamicCoverageMetrics
      .lastUnoCoinCandidateCount =
      sharedMarketCandidates.length;

    const signature =
      this.buildMarketSignature(
        sharedMarketCandidates,
      );

    if (
      !forceSubscription &&
      signature ===
        this.lastUnoCoinCandidateSignature
    ) {
      this.dynamicCoverageMetrics
        .skippedCycles +=
        1;

      return false;
    }

    await this.unoCoinMarketData
      .subscribe(
        sharedMarketCandidates,
      );

    this.lastUnoCoinCandidateSignature =
      signature;

    const diagnostics =
      this.unoCoinMarketData
        .getDiagnostics();

    this.dynamicCoverageMetrics
      .unoCoinRefreshes +=
      1;

    this.dynamicCoverageMetrics
      .lastUnoCoinSubscribedMarkets =
      diagnostics
        .subscribedMarkets;

    this.dynamicCoverageMetrics
      .lastObservedUnoCoinQuarantines =
      diagnostics
        .quarantinedMarkets;

    console.log(
      `[UnoCoin] Dynamic coverage selected ${diagnostics.subscribedMarkets} validated REST order-book subscriptions from ${sharedMarketCandidates.length} executable cross-exchange candidates${forceSubscription ? " (forced recovery/initial refresh)" : ""}.`,
    );

    return true;
  }

  /*
   * ============================================================
   * COINSWITCH COVERAGE
   * ============================================================
   */

  private async subscribeCoinSwitchSharedMarkets(
    force:
      boolean,
  ): Promise<boolean> {
    if (
      !this.coinSwitchMarketData
        .isConnected()
    ) {
      console.warn(
        "[CoinSwitch] Public market-data adapter is unavailable; order-book subscriptions remain disabled.",
      );

      return false;
    }

    const sharedMarketCandidates =
      this.buildExecutableCrossExchangeCandidates(
        this.coinSwitchMarketData
          .name,
      );

    this.dynamicCoverageMetrics
      .lastCoinSwitchCandidateCount =
      sharedMarketCandidates.length;

    const requestedMarkets =
      this.uniqueMarketsInOrder([
        ...this.coinSwitchMarketData
          .getPriorityMarkets(),

        /*
         * Preserve a fresh full-depth stream before considering replacements.
         * Previously a transient change in another exchange's executable set
         * reordered the top-N list every 15 seconds, causing unnecessary
         * CoinSwitch leave/join churn and short coverage gaps.
         */
        ...this.coinSwitchMarketData
          .getFreshSubscribedMarkets(),

        ...sharedMarketCandidates,
      ]);

    const signature =
      this.buildMarketSignature(
        requestedMarkets,
      );

    if (
      !force &&
      signature ===
        this.lastCoinSwitchCandidateSignature
    ) {
      this.dynamicCoverageMetrics
        .skippedCycles +=
        1;

      return false;
    }

    await this.coinSwitchMarketData
      .subscribe(
        requestedMarkets,
      );

    this.lastCoinSwitchCandidateSignature =
      signature;

    const diagnostics =
      this.coinSwitchMarketData
        .getDiagnostics();

    this.dynamicCoverageMetrics
      .coinSwitchRefreshes +=
      1;

    this.dynamicCoverageMetrics
      .lastCoinSwitchSubscribedMarkets =
      diagnostics
        .subscribedMarkets;

    console.log(
      `[CoinSwitch] Dynamic coverage selected ${diagnostics.subscribedMarkets} validated public full-depth streams from ${sharedMarketCandidates.length} executable cross-exchange candidates plus bounded priority markets.`,
    );

    return true;
  }

  /*
   * ============================================================
   * DYNAMIC COVERAGE RECOVERY
   * ============================================================
   */

  private startDynamicCoverageRefresh():
    void {
    if (
      this.dynamicCoverageRefreshTimer
    ) {
      return;
    }

    this.dynamicCoverageMetrics
      .running =
      true;

    this.dynamicCoverageRefreshTimer =
      setInterval(
        () => {
          void this
            .refreshDynamicCoverage()
            .catch(
              (
                error:
                  unknown,
              ) => {
                this.dynamicCoverageMetrics
                  .failedCycles +=
                  1;

                console.error(
                  "[Manager] Dynamic executable coverage refresh failed:",
                  error instanceof Error
                    ? error.message
                    : error,
                );
              },
            );
        },
        this.resolveDynamicCoverageRefreshMs(),
      );
  }

  private stopDynamicCoverageRefresh():
    void {
    if (
      this.dynamicCoverageRefreshTimer
    ) {
      clearInterval(
        this.dynamicCoverageRefreshTimer,
      );

      this.dynamicCoverageRefreshTimer =
        null;
    }

    this.dynamicCoverageMetrics
      .running =
      false;
  }

  private async refreshDynamicCoverage():
    Promise<void> {
    if (
      !this.initialized ||
      this.dynamicCoverageRefreshInProgress
    ) {
      this.dynamicCoverageMetrics
        .skippedCycles +=
        1;

      return;
    }

    this.dynamicCoverageRefreshInProgress =
      true;

    try {
      this.dynamicCoverageMetrics
        .refreshCycles +=
        1;

      await this.recoverBinanceMarketData();

      const unoCoinDiagnosticsBefore =
        this.unoCoinMarketData
          .getDiagnostics();

      /*
       * UnoCoin quarantine is cumulative evidence.
       *
       * If this counter increases, one or more currently
       * selected markets have reached the adapter's bounded
       * consecutive-failure threshold and were removed from
       * the active polling set.
       *
       * Force a fresh selection from the current executable
       * cross-exchange universe.
       *
       * This does NOT bypass quarantine validation. The same
       * UnoCoinAdapter subscribe() and order-book validator
       * remain authoritative.
       */
      const unoCoinNeedsRecovery =
        unoCoinDiagnosticsBefore
          .quarantinedMarkets >
        this.dynamicCoverageMetrics
          .lastObservedUnoCoinQuarantines;

      if (
        unoCoinNeedsRecovery
      ) {
        this.dynamicCoverageMetrics
          .unoCoinForcedRecoveries +=
          1;

        console.warn(
          `[Manager] UnoCoin quarantine count increased from ${this.dynamicCoverageMetrics.lastObservedUnoCoinQuarantines} to ${unoCoinDiagnosticsBefore.quarantinedMarkets}; scheduling bounded shared-market reselection.`,
        );
      }

      await this.subscribeUnoCoinSharedMarkets(
        unoCoinNeedsRecovery,
      );

      await this.subscribeCoinSwitchSharedMarkets(
        false,
      );

      if (
        await this.coinDCXOrderBook
          .refreshSharedMarketSubscriptions()
      ) {
        this.dynamicCoverageMetrics
          .coinDCXRefreshes +=
          1;
      }

      /*
       * Update quarantine baseline even when no subscription
       * refresh was required.
       */
      this.dynamicCoverageMetrics
        .lastObservedUnoCoinQuarantines =
        this.unoCoinMarketData
          .getDiagnostics()
          .quarantinedMarkets;

      this.dynamicCoverageMetrics
        .lastUnoCoinSubscribedMarkets =
        this.unoCoinMarketData
          .getDiagnostics()
          .subscribedMarkets;

      this.dynamicCoverageMetrics
        .lastCoinSwitchSubscribedMarkets =
        this.coinSwitchMarketData
          .getDiagnostics()
          .subscribedMarkets;

      this.dynamicCoverageMetrics
        .lastCoinDCXSubscribedMarkets =
        this.coinDCXOrderBook
          .getDiagnostics()
          .selectedMarkets;

      this.dynamicCoverageMetrics
        .lastRefreshAt =
        Date.now();
    } finally {
      this.dynamicCoverageRefreshInProgress =
        false;
    }
  }

  /*
   * ============================================================
   * MARKET UNIVERSE
   * ============================================================
   */

  private buildExecutableCrossExchangeCandidates(
    targetExchange:
      string,
  ): string[] {
    const normalizedTargetExchange =
      targetExchange
        .trim()
        .toLowerCase();

    const supportByMarket =
      new Map<
        string,
        Set<string>
      >();

    for (
      const quote
      of marketCache.getExecutable()
    ) {
      const exchange =
        quote.exchange
          .trim()
          .toLowerCase();

      if (
        exchange ===
        normalizedTargetExchange
      ) {
        continue;
      }

      const market =
        quote.market
          .trim()
          .toUpperCase();

      if (!market) {
        continue;
      }

      const exchanges =
        supportByMarket.get(
          market,
        ) ??
        new Set<string>();

      exchanges.add(
        exchange,
      );

      supportByMarket.set(
        market,
        exchanges,
      );
    }

    /*
     * Spend bounded subscription capacity on the markets with the strongest
     * current cross-exchange support. Alphabetical truncation previously
     * crowded out highly pairable markets even though their genuine depth was
     * already available elsewhere.
     */
    const executableCandidates = [
      ...supportByMarket.entries(),
    ]
      .sort(
        (
          first,
          second,
        ) =>
          second[1].size -
            first[1].size ||
          first[0].localeCompare(
            second[0],
          ),
      )
      .map(
        ([
          market,
        ]) =>
          market,
      );

    if (
      normalizedTargetExchange ===
        "unocoin"
    ) {
      const provenUnoCoinMarkets =
        marketCache
          .getExecutableByExchange(
            "unocoin",
          )
          .sort(
            (
              first,
              second,
            ) =>
              second.timestamp -
              first.timestamp,
          )
          .map(
            (quote) =>
              quote.market,
          );

      executableCandidates.unshift(
        ...provenUnoCoinMarkets,
      );
    }

    if (
      normalizedTargetExchange !==
        "unocoin"
    ) {
      return this.uniqueMarketsInOrder(
        executableCandidates,
      );
    }

    /*
     * Strategy #1 needs both sides of the same route to obtain depth.
     * UnoCoin and CoinDCX ticker-only markets are therefore used only to
     * rank bounded discovery. A maximum 1.05x indicative price ratio keeps
     * obviously stale / distorted books out of the scarce UnoCoin polling
     * slots. Real quantity-bearing depth is still mandatory downstream.
     */
    const coinDCXAlignedMarkets =
      this.uniqueMarketsInOrder([
        ...this.unoCoinCoinDCXPriorityMarkets,
        ...this.buildUnoCoinCoinDCXAlignedCandidates(),
      ]);

    return this.uniqueMarketsInOrder([
      ...coinDCXAlignedMarkets,
      ...executableCandidates,
    ]);
  }

  /**
   * Binance workers already retry individual socket closes. This bounded
   * top-level reset covers the separate failure mode where every worker is
   * down and the pool never returns to fresh executable publications.
   * It touches public market data only; credentials, PAPER, LIVE and orders
   * are outside this recovery path.
   */
  private async recoverBinanceMarketData():
    Promise<void> {
    const adapter =
      exchangeManager.get(
        "Binance",
      );

    if (!adapter) {
      this.dynamicCoverageMetrics
        .lastBinanceRecoveryError =
        "Binance public market-data adapter is not registered.";

      return;
    }

    if (adapter.isConnected()) {
      if (this.binanceRecoveryPending) {
        this.dynamicCoverageMetrics
          .binanceRecoveries +=
          1;

        this.dynamicCoverageMetrics
          .lastBinanceRecoveryAt =
          Date.now();

        this.dynamicCoverageMetrics
          .lastBinanceRecoveryError =
          null;

        this.binanceRecoveryPending =
          false;

        console.log(
          "[Manager] Binance public market-data recovery restored fresh connectivity.",
        );
      }

      return;
    }

    const now =
      Date.now();

    const previousAttemptAt =
      this.dynamicCoverageMetrics
        .lastBinanceRecoveryAttemptAt;

    if (
      previousAttemptAt !==
        null &&
      now -
        previousAttemptAt <
        WebSocketManager
          .MINIMUM_BINANCE_RECOVERY_INTERVAL_MS
    ) {
      return;
    }

    this.dynamicCoverageMetrics
      .binanceRecoveryAttempts +=
      1;

    this.dynamicCoverageMetrics
      .lastBinanceRecoveryAttemptAt =
      now;

    console.warn(
      "[Manager] Binance public market data is stale/disconnected; starting bounded pool recovery.",
    );

    const recovery =
      await exchangeManager
        .recoverDisconnected(
          "Binance",
        );

    if (
      recovery.status ===
        "RECOVERY_STARTED"
    ) {
      this.binanceRecoveryPending =
        true;

      this.dynamicCoverageMetrics
        .lastBinanceRecoveryError =
        null;

      return;
    }

    if (
      recovery.status ===
        "NOT_REQUIRED"
    ) {
      return;
    }

    this.dynamicCoverageMetrics
      .binanceRecoveryFailures +=
      1;

    this.dynamicCoverageMetrics
      .lastBinanceRecoveryError =
      recovery.reason;

    this.binanceRecoveryPending =
      false;
  }

  private buildUnoCoinCoinDCXAlignedCandidates():
    string[] {
    return rankPriceAlignedSharedMarkets(
      marketCache.getByExchange(
        "coindcx",
      ),
      marketCache.getByExchange(
        "unocoin",
      ),
    ).map(
      (candidate) =>
        candidate.market,
    );
  }

  private buildUnoCoinCoinDCXExecutableCandidates():
    string[] {
    const executableQuotes =
      marketCache.getExecutable();

    return rankPriceAlignedSharedMarkets(
      executableQuotes.filter(
        (quote) =>
          quote.exchange
            .trim()
            .toLowerCase() ===
          "coindcx",
      ),
      executableQuotes.filter(
        (quote) =>
          quote.exchange
            .trim()
            .toLowerCase() ===
          "unocoin",
      ),
    ).map(
      (candidate) =>
        candidate.market,
    );
  }

  private uniqueMarketsInOrder(
    markets:
      readonly string[],
  ): string[] {
    const unique =
      new Map<
        string,
        string
      >();

    for (const market of markets) {
      const normalized =
        market
          .trim()
          .toUpperCase();

      if (
        normalized.length ===
          0 ||
        unique.has(
          normalized,
        )
      ) {
        continue;
      }

      unique.set(
        normalized,
        market.trim(),
      );
    }

    return [
      ...unique.values(),
    ];
  }

  private buildMarketSignature(
    markets:
      readonly string[],
  ): string {
    return markets
      .map(
        (market) =>
          market
            .trim()
            .toUpperCase(),
      )
      .join(
        "|",
      );
  }

  /*
   * ============================================================
   * CONFIG
   * ============================================================
   */

  private resolveDynamicCoverageRefreshMs():
    number {
    return this.resolveBoundedInteger(
      process.env
        .CAT_PRO_DYNAMIC_COVERAGE_REFRESH_MS,

      WebSocketManager
        .DEFAULT_DYNAMIC_COVERAGE_REFRESH_MS,

      WebSocketManager
        .MINIMUM_DYNAMIC_COVERAGE_REFRESH_MS,

      WebSocketManager
        .MAXIMUM_DYNAMIC_COVERAGE_REFRESH_MS,
    );
  }

  private resolveUnoCoinActiveMarketLimit():
    number {
    return this.resolveBoundedInteger(
      process.env
        .UNOCOIN_MAX_ORDER_BOOK_MARKETS,

      UNOCOIN
        .DEFAULT_MAX_ORDER_BOOK_MARKETS,

      1,

      UNOCOIN
        .ABSOLUTE_MAX_ORDER_BOOK_MARKETS,
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

export const websocketManager =
  new WebSocketManager();
