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
     * This call also refreshes the current
     * opportunity diagnostics.
     */
    const opportunities =
      opportunityService.getOpportunities();

    const quotesByExchange =
      this.getQuotesByExchange();

    return {
      timestamp:
        Date.now(),

      exchanges:
        exchangeManager
          .getAll()
          .map(
            (exchange) => ({
              name:
                exchange.name,

              connected:
                exchange.isConnected(),
            }),
          ),

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

        diagnostics:
          opportunityEngine.getDiagnostics(),
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