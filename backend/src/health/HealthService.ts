import {
  comparisonEngine,
} from "../arbitrage/ComparisonEngine";

import {
  exchangePairGenerator,
} from "../arbitrage/engines/ExchangePairGenerator";

import {
  opportunityEngine,
} from "../arbitrage/engines/OpportunityEngine";

import {
  opportunityService,
} from "../arbitrage/services/OpportunityService";

import {
  coinDCXSubscriptionAuditService,
} from "../diagnostics/services/CoinDCXSubscriptionAuditService";

import {
  coinDCXProtectedRestOrderBookService,
} from "../exchanges/coindcx/CoinDCXProtectedRestOrderBookService";

import {
  CoinSwitchAdapter,
} from "../exchanges/coinswitch/CoinSwitchAdapter";

import {
  exchangeManager,
} from "../exchanges/core/ExchangeManager";

import {
  UnoCoinAdapter,
} from "../exchanges/unocoin/UnoCoinAdapter";

import {
  marketCache,
} from "../services/cache.service";

import type {
  CoinSwitchFeedHealth,
  ExchangeFeedRecoveryPreflight,
  ExchangeQuoteCount,
  FeedRecoveryPreflightState,
  SystemHealthReport,
  UnoCoinFeedHealth,
} from "./HealthReport";

import {
  tradingReadinessCalculator,
} from "./TradingReadinessCalculator";

/*
 * ============================================================
 * CAT PRO V20.9 BUILD 4A
 * EXCHANGE FEED RECOVERY PREFLIGHT
 * ============================================================
 *
 * Diagnostic only.
 *
 * This service does NOT:
 *
 * - reconnect an exchange
 * - resubscribe a market
 * - widen freshness limits
 * - fabricate executable quantities
 * - modify MarketCache
 * - modify order books
 * - arm PAPER
 * - enable LIVE
 * - place any order
 *
 * Build 4A exists to prove the actual failure mode before
 * Build 4B is allowed to repair market-data recovery.
 */

export class HealthService {
  getReport():
    SystemHealthReport {
    const generatedAt =
      Date.now();

    const memoryUsage =
      process.memoryUsage();

    const quotes =
      marketCache
        .getAll();

    const snapshots =
      comparisonEngine
        .groupByMarket(
          quotes,
        );

    const sharedSnapshots =
      snapshots.filter(
        (snapshot) =>
          Object.keys(
            snapshot.quotes,
          ).length >=
          2,
      );

    const generatedPairs =
      sharedSnapshots.reduce(
        (
          total,
          snapshot,
        ) =>
          total +
          exchangePairGenerator
            .generate(
              snapshot,
            )
            .length,
        0,
      );

    /*
     * Health is a read surface, not a second scanner owner. Consume the
     * event-driven runner's authoritative snapshot so a two-second dashboard
     * poll cannot interrupt the trading hot path with another full scan.
     */
    const opportunities =
      opportunityService
        .getLastOpportunities();

    const diagnostics =
      opportunityService
        .getLastDiagnostics()
        ?.diagnostics ??
      opportunityEngine
        .getDiagnostics();

    const quotesByExchange =
      this.getQuotesByExchange();

    const exchanges =
      exchangeManager
        .getAll()
        .map(
          (exchange) => ({
            name:
              exchange.name,

            connected:
              exchange
                .isConnected(),
          }),
        );

    const connectedExchanges =
      exchanges.filter(
        (exchange) =>
          exchange.connected,
      ).length;

    const diagnosticsHealthy =
      diagnostics
        .engine
        .invalidMarketData ===
        0 &&
      diagnostics
        .engine
        .quantityRejected ===
        0;

    const trading =
      tradingReadinessCalculator
        .calculate({
          connectedExchanges,

          totalExchanges:
            exchanges.length,

          executableQuotes:
            marketCache
              .executableSize(),

          opportunities:
            opportunities.length,

          diagnosticsHealthy,
        });

    const feedRecoveryPreflight =
      this.buildFeedRecoveryPreflight(
        generatedAt,
      );

    return {
      timestamp:
        generatedAt,

      exchanges,

      cache: {
        cachedQuotes:
          quotes.length,

        executableQuotes:
          marketCache
            .executableSize(),

        quotesByExchange,
      },

      engine: {
        markets:
          snapshots.length,

        sharedMarkets:
          sharedSnapshots.length,

        generatedPairs,

        opportunities:
          opportunities.length,

        diagnostics,
      },

      feedRecoveryPreflight,

      process: {
        uptimeSeconds:
          Math.floor(
            process.uptime(),
          ),

        memory: {
          rss:
            memoryUsage.rss,

          heapUsed:
            memoryUsage.heapUsed,

          heapTotal:
            memoryUsage.heapTotal,
        },
      },

      trading,
    };
  }

  private buildFeedRecoveryPreflight(
    now:
      number,
  ): ExchangeFeedRecoveryPreflight {
    const coinSwitchAdapter =
      exchangeManager
        .get(
          "coinswitch",
        );

    const unoCoinAdapter =
      exchangeManager
        .get(
          "unocoin",
        );

    const coinswitch =
      coinSwitchAdapter instanceof
        CoinSwitchAdapter
        ? this.buildCoinSwitchFeedHealth(
            coinSwitchAdapter,
            now,
          )
        : null;

    const unocoin =
      unoCoinAdapter instanceof
        UnoCoinAdapter
        ? this.buildUnoCoinFeedHealth(
            unoCoinAdapter,
            now,
          )
        : null;

    const observations:
      string[] = [
      "V20.9 Build 4A is diagnostic-only exchange feed recovery preflight.",

      "No reconnect, resubscription, freshness-policy mutation, cache mutation, PAPER action, LIVE action, or exchange order is performed by this report.",
    ];

    if (!coinswitch) {
      observations.push(
        "CoinSwitch runtime adapter is not registered as the expected CoinSwitchAdapter instance.",
      );
    } else {
      observations.push(
        ...this.buildCoinSwitchObservations(
          coinswitch,
        ),
      );
    }

    if (!unocoin) {
      observations.push(
        "UnoCoin runtime adapter is not registered as the expected UnoCoinAdapter instance.",
      );
    } else {
      observations.push(
        ...this.buildUnoCoinObservations(
          unocoin,
        ),
      );
    }

    return {
      generatedAt:
        now,

      version:
        "20.9",

      build:
        "4A",

      mode:
        "DIAGNOSTIC_ONLY",

      mutationAllowed:
        false,

      liveExecutionAllowed:
        false,

      coinswitch,

      unocoin,

      observations,
    };
  }

  private buildCoinSwitchFeedHealth(
    adapter:
      CoinSwitchAdapter,

    now:
      number,
  ): CoinSwitchFeedHealth {
    const diagnostics =
      adapter
        .getDiagnostics();

    const cachedQuotes =
      marketCache
        .sizeByExchange(
          adapter.name,
        );

    const executableQuotes =
      marketCache
        .getExecutableByExchange(
          adapter.name,
        )
        .length;

    const connected =
      adapter
        .isConnected();

    const lastSnapshotAgeMs =
      this.ageMs(
        diagnostics
          .lastSnapshotAt,
        now,
      );

    const reasons:
      string[] = [];

    if (!connected) {
      reasons.push(
        "No CoinSwitch public Socket.IO venue is currently connected.",
      );
    }

    if (
      diagnostics
        .connectedVenues ===
      0
    ) {
      reasons.push(
        "CoinSwitch reports zero connected public venues.",
      );
    }

    if (
      diagnostics
        .tickerMarkets ===
      0
    ) {
      reasons.push(
        "CoinSwitch ticker discovery has not produced a validated market catalog.",
      );
    }

    if (
      diagnostics
        .subscribedMarkets ===
      0
    ) {
      reasons.push(
        "CoinSwitch has zero active full-depth market subscriptions.",
      );
    }

    if (
      diagnostics
        .subscribedMarkets >
        0 &&
      diagnostics
        .socketSnapshots ===
        0
    ) {
      reasons.push(
        "CoinSwitch has subscribed markets but has not published any validated order-book snapshot.",
      );
    }

    if (
      diagnostics
        .rejectedSnapshots >
        0
    ) {
      reasons.push(
        `CoinSwitch rejected ${diagnostics.rejectedSnapshots} received order-book snapshot(s).`,
      );
    }

    if (
      diagnostics
        .socketErrors >
        0
    ) {
      reasons.push(
        `CoinSwitch recorded ${diagnostics.socketErrors} socket error(s).`,
      );
    }

    if (
      diagnostics
        .socketSnapshots >
        0 &&
      executableQuotes ===
        0
    ) {
      reasons.push(
        "CoinSwitch has validated socket snapshots historically, but currently exposes zero executable cached quotes.",
      );
    }

    if (
      diagnostics
        .lastSnapshotAt !==
        null &&
      lastSnapshotAgeMs !==
        null &&
      lastSnapshotAgeMs >
        15_000
    ) {
      reasons.push(
        `CoinSwitch last validated socket snapshot is ${lastSnapshotAgeMs} ms old.`,
      );
    }

    const state =
      this.resolveCoinSwitchState(
        connected,
        diagnostics
          .subscribedMarkets,
        diagnostics
          .socketSnapshots,
        executableQuotes,
        reasons,
      );

    return {
      state,

      connected,

      tickerMarkets:
        diagnostics
          .tickerMarkets,

      connectedVenues:
        diagnostics
          .connectedVenues,

      subscribedMarkets:
        diagnostics
          .subscribedMarkets,

      tickerRefreshes:
        diagnostics
          .tickerRefreshes,

      socketSnapshots:
        diagnostics
          .socketSnapshots,

      rejectedSnapshots:
        diagnostics
          .rejectedSnapshots,

      subscriptionAcknowledgements:
        diagnostics
          .subscriptionAcknowledgements,

      socketErrors:
        diagnostics
          .socketErrors,

      lastSnapshotAt:
        diagnostics
          .lastSnapshotAt,

      lastSnapshotAgeMs,

      cachedQuotes,

      executableQuotes,

      reasons,

      diagnostics,
    };
  }

  private buildUnoCoinFeedHealth(
    adapter:
      UnoCoinAdapter,

    now:
      number,
  ): UnoCoinFeedHealth {
    const diagnostics =
      adapter
        .getDiagnostics();

    const cachedQuotes =
      marketCache
        .sizeByExchange(
          adapter.name,
        );

    const executableQuotes =
      marketCache
        .getExecutableByExchange(
          adapter.name,
        )
        .length;

    const connected =
      adapter
        .isConnected();

    const lastSuccessfulReadAgeMs =
      this.ageMs(
        diagnostics
          .lastSuccessfulReadAt,
        now,
      );

    const lastBookReceivedAgeMs =
      this.ageMs(
        diagnostics
          .lastBookReceivedAt,
        now,
      );

    const reasons:
      string[] = [];

    if (!connected) {
      reasons.push(
        "UnoCoin public REST market-data adapter is not currently connected/fresh.",
      );
    }

    if (
      diagnostics
        .pairsLoaded ===
      0
    ) {
      reasons.push(
        "UnoCoin has no validated public pair catalog.",
      );
    }

    if (
      diagnostics
        .tickersLoaded ===
      0
    ) {
      reasons.push(
        "UnoCoin has no validated ticker catalog.",
      );
    }

    if (
      diagnostics
        .subscribedMarkets ===
      0
    ) {
      reasons.push(
        "UnoCoin has zero shared-market order-book polling subscriptions.",
      );
    }

    if (
      diagnostics
        .subscribedMarkets >
        0 &&
      diagnostics
        .validBooksPublished ===
        0
    ) {
      reasons.push(
        "UnoCoin is polling subscribed markets but has not published any validated executable order book.",
      );
    }

    if (
      diagnostics
        .rejectedBooks >
        0
    ) {
      reasons.push(
        `UnoCoin rejected ${diagnostics.rejectedBooks} order-book snapshot(s).`,
      );
    }

    if (
      diagnostics
        .failedPublicReads >
        0
    ) {
      reasons.push(
        `UnoCoin recorded ${diagnostics.failedPublicReads} failed public API read(s).`,
      );
    }

    if (
      diagnostics
        .quarantinedMarkets >
        0
    ) {
      reasons.push(
        `UnoCoin has ${diagnostics.quarantinedMarkets} quarantined market(s) after repeated book failures.`,
      );
    }

    if (
      diagnostics
        .validBooksPublished >
        0 &&
      executableQuotes ===
        0
    ) {
      reasons.push(
        "UnoCoin has published validated books historically, but currently exposes zero executable cached quotes.",
      );
    }

    if (
      diagnostics
        .lastBookReceivedAt !==
        null &&
      lastBookReceivedAgeMs !==
        null &&
      lastBookReceivedAgeMs >
        15_000
    ) {
      reasons.push(
        `UnoCoin last validated order book is ${lastBookReceivedAgeMs} ms old.`,
      );
    }

    const state =
      this.resolveUnoCoinState(
        connected,
        diagnostics
          .subscribedMarkets,
        diagnostics
          .validBooksPublished,
        executableQuotes,
        reasons,
      );

    return {
      state,

      connected,

      pairsLoaded:
        diagnostics
          .pairsLoaded,

      tickersLoaded:
        diagnostics
          .tickersLoaded,

      subscribedMarkets:
        diagnostics
          .subscribedMarkets,

      successfulPublicReads:
        diagnostics
          .successfulPublicReads,

      failedPublicReads:
        diagnostics
          .failedPublicReads,

      validBooksPublished:
        diagnostics
          .validBooksPublished,

      rejectedBooks:
        diagnostics
          .rejectedBooks,

      quarantinedMarkets:
        diagnostics
          .quarantinedMarkets,

      lastSuccessfulReadAt:
        diagnostics
          .lastSuccessfulReadAt,

      lastSuccessfulReadAgeMs,

      lastBookReceivedAt:
        diagnostics
          .lastBookReceivedAt,

      lastBookReceivedAgeMs,

      lastBookSourceTimestamp:
        diagnostics
          .lastBookSourceTimestamp,

      cachedQuotes,

      executableQuotes,

      reasons,

      diagnostics,
    };
  }

  private resolveCoinSwitchState(
    connected:
      boolean,

    subscribedMarkets:
      number,

    socketSnapshots:
      number,

    executableQuotes:
      number,

    reasons:
      readonly string[],
  ): FeedRecoveryPreflightState {
    if (
      !connected ||
      subscribedMarkets ===
        0
    ) {
      return "BLOCKED";
    }

    if (
      socketSnapshots ===
        0
    ) {
      return "NO_DATA";
    }

    if (
      executableQuotes ===
        0 ||
      reasons.length >
        0
    ) {
      return "DEGRADED";
    }

    return "HEALTHY";
  }

  private resolveUnoCoinState(
    connected:
      boolean,

    subscribedMarkets:
      number,

    validBooksPublished:
      number,

    executableQuotes:
      number,

    reasons:
      readonly string[],
  ): FeedRecoveryPreflightState {
    if (
      !connected ||
      subscribedMarkets ===
        0
    ) {
      return "BLOCKED";
    }

    if (
      validBooksPublished ===
        0
    ) {
      return "NO_DATA";
    }

    if (
      executableQuotes ===
        0 ||
      reasons.length >
        0
    ) {
      return "DEGRADED";
    }

    return "HEALTHY";
  }

  private buildCoinSwitchObservations(
    report:
      CoinSwitchFeedHealth,
  ): string[] {
    const observations:
      string[] = [];

    observations.push(
      `CoinSwitch feed preflight state is ${report.state}: ${report.connectedVenues} connected venue(s), ${report.subscribedMarkets} subscribed market(s), ${report.socketSnapshots} validated socket snapshot(s), ${report.executableQuotes} executable cached quote(s).`,
    );

    if (
      report
        .subscriptionAcknowledgements >
        0 &&
      report
        .socketSnapshots ===
        0
    ) {
      observations.push(
        "CoinSwitch subscription traffic is being acknowledged, but no validated order-book snapshot has been accepted; inspect event payload/symbol/validation evidence before changing freshness policy.",
      );
    }

    if (
      report
        .rejectedSnapshots >
        report
          .socketSnapshots &&
      report
        .rejectedSnapshots >
        0
    ) {
      observations.push(
        "CoinSwitch rejected snapshots outnumber validated snapshots; normalization/timestamp/symbol validation is a priority investigation target.",
      );
    }

    return observations;
  }

  private buildUnoCoinObservations(
    report:
      UnoCoinFeedHealth,
  ): string[] {
    const observations:
      string[] = [];

    observations.push(
      `UnoCoin feed preflight state is ${report.state}: ${report.subscribedMarkets} subscribed market(s), ${report.validBooksPublished} validated book publication(s), ${report.rejectedBooks} rejected book(s), ${report.executableQuotes} executable cached quote(s).`,
    );

    if (
      report
        .successfulPublicReads >
        0 &&
      report
        .validBooksPublished ===
        0
    ) {
      observations.push(
        "UnoCoin public HTTP reads are succeeding but no validated order book has been published; order-book response normalization/fallback evidence should be investigated before changing execution eligibility.",
      );
    }

    if (
      report
        .quarantinedMarkets >
        0
    ) {
      observations.push(
        "UnoCoin repeated order-book failures have triggered market quarantine evidence; the failure reason must be fixed rather than bypassing quarantine.",
      );
    }

    return observations;
  }

  private ageMs(
    timestamp:
      number | null,

    now:
      number,
  ): number | null {
    if (
      timestamp ===
        null ||
      !Number.isFinite(
        timestamp,
      ) ||
      timestamp <=
        0
    ) {
      return null;
    }

    return Math.max(
      0,
      now -
        timestamp,
    );
  }

  private getQuotesByExchange():
    ExchangeQuoteCount[] {
    return exchangeManager
      .getAll()
      .map(
        (exchange) => {
          const totalQuotes =
            marketCache
              .sizeByExchange(
                exchange.name,
              );

          const executableQuotes =
            marketCache
              .getExecutableByExchange(
                exchange.name,
              )
              .length;

          return {
            exchange:
              exchange.name,

            totalQuotes,

            quoteBookTargets:
              this.resolveQuoteBookTargets(
                exchange,
                totalQuotes,
                executableQuotes,
              ),

            executableQuotes,
          };
        },
      );
  }

  private resolveQuoteBookTargets(
    exchange:
      ReturnType<
        typeof exchangeManager.getAll
      >[number],

    totalQuotes:
      number,

    executableQuotes:
      number,
  ): number {
    if (
      exchange instanceof
        CoinSwitchAdapter
    ) {
      return Math.max(
        exchange
          .getDiagnostics()
          .subscribedMarkets,
        executableQuotes,
      );
    }

    if (
      exchange instanceof
        UnoCoinAdapter
    ) {
      return Math.max(
        exchange
          .getDiagnostics()
          .subscribedMarkets,
        executableQuotes,
      );
    }

    if (
      exchange.name
        .trim()
        .toLowerCase() ===
      "coindcx"
    ) {
      const targetMarkets =
        new Set<string>();

      for (
        const record
        of coinDCXSubscriptionAuditService
          .getReport()
          .records
      ) {
        if (
          record.state ===
            "FAILED" ||
          record.state ===
            "PERSISTENTLY_SILENT"
        ) {
          continue;
        }

        targetMarkets.add(
          record.market,
        );
      }

      for (
        const book
        of coinDCXProtectedRestOrderBookService
          .getDiagnostics()
          .books
      ) {
        targetMarkets.add(
          book.market,
        );
      }

      return Math.max(
        targetMarkets.size,
        executableQuotes,
      );
    }

    /*
     * Binance and Bybit cache catalogs are the bounded subscribed universes,
     * so the existing total remains the correct depth target denominator.
     */
    return Math.max(
      totalQuotes,
      executableQuotes,
    );
  }
}

export const healthService =
  new HealthService();
