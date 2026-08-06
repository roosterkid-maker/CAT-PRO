import { comparisonEngine } from "../arbitrage/ComparisonEngine";
import { exchangePairGenerator } from "../arbitrage/engines/ExchangePairGenerator";
import { opportunityEngine } from "../arbitrage/engines/OpportunityEngine";
import { opportunityService } from "../arbitrage/services/OpportunityService";

import { exchangeManager } from "../exchanges/core/ExchangeManager";
import { marketCache } from "../services/cache.service";

import type {
  ExchangeQuoteCount,
  SystemHealthReport,
} from "./HealthReport";

import {
  tradingReadinessCalculator,
} from "./TradingReadinessCalculator";

export class HealthService {
  getReport(): SystemHealthReport {
    const memoryUsage =
      process.memoryUsage();

    const quotes =
      marketCache.getAll();

    const snapshots =
      comparisonEngine.groupByMarket(
        quotes,
      );

    const sharedSnapshots =
      snapshots.filter(
        (snapshot) =>
          Object.keys(
            snapshot.quotes,
          ).length >= 2,
      );

    const generatedPairs =
      sharedSnapshots.reduce(
        (
          total,
          snapshot,
        ) =>
          total +
          exchangePairGenerator.generate(
            snapshot,
          ).length,
        0,
      );

    /*
     * This call refreshes the current
     * opportunity diagnostics.
     */
    const opportunities =
      opportunityService.getOpportunities();

    const diagnostics =
      opportunityEngine.getDiagnostics();

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
              exchange.isConnected(),
          }),
        );

    const connectedExchanges =
      exchanges.filter(
        (exchange) =>
          exchange.connected,
      ).length;

    const diagnosticsHealthy =
      diagnostics.engine
        .invalidMarketData === 0 &&
      diagnostics.engine
        .quantityRejected === 0;

    const trading =
      tradingReadinessCalculator.calculate({
        connectedExchanges,

        totalExchanges:
          exchanges.length,

        executableQuotes:
          marketCache.executableSize(),

        opportunities:
          opportunities.length,

        diagnosticsHealthy,
      });

    return {
      timestamp:
        Date.now(),

      exchanges,

      cache: {
        cachedQuotes:
          quotes.length,

        executableQuotes:
          marketCache.executableSize(),

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

  private getQuotesByExchange():
  ExchangeQuoteCount[] {
    return exchangeManager
      .getAll()
      .map(
        (exchange) => ({
          exchange:
            exchange.name,

          totalQuotes:
            marketCache.sizeByExchange(
              exchange.name,
            ),

          executableQuotes:
            marketCache
              .getExecutableByExchange(
                exchange.name,
              )
              .length,
        }),
      );
  }
}

export const healthService =
  new HealthService();