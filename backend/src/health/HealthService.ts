import { comparisonEngine } from "../arbitrage/ComparisonEngine";
import { exchangePairGenerator } from "../arbitrage/engines/ExchangePairGenerator";
import { opportunityService } from "../arbitrage/services/OpportunityService";
import { exchangeManager } from "../exchanges/core/ExchangeManager";
import { marketCache } from "../services/cache.service";
import { opportunityEngine } from "../arbitrage/engines/OpportunityEngine";

import type {
  ExchangeQuoteCount,
  SystemHealthReport,
} from "./HealthReport";

export class HealthService {
  getReport(): SystemHealthReport {
    const memoryUsage = process.memoryUsage();

    const quotes = marketCache.getAll();

    const snapshots =
      comparisonEngine.groupByMarket(
        quotes,
      );

    const sharedSnapshots =
      snapshots.filter(
        (snapshot) =>
          Object.keys(snapshot.quotes)
            .length >= 2,
      );

    const generatedPairs =
      sharedSnapshots.reduce(
        (total, snapshot) =>
          total +
          exchangePairGenerator.generate(
            snapshot,
          ).length,
        0,
      );

    const quotesByExchange =
      this.getQuotesByExchange();

    return {
      timestamp: Date.now(),

      exchanges: exchangeManager
        .getAll()
        .map((exchange) => ({
          name: exchange.name,
          connected:
            exchange.isConnected(),
        })),

      cache: {
        cachedQuotes:
          quotes.length,

        executableQuotes:
          marketCache.executableSize(),

        quotesByExchange,
      },

      engine: {
        diagnostics:
  opportunityEngine.getDiagnostics(),
        markets:
          snapshots.length,

        sharedMarkets:
          sharedSnapshots.length,

        generatedPairs,

        opportunities:
          opportunityService
            .getOpportunities()
            .length,
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
      .map((exchange) => ({
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
      }));
  }
}

export const healthService =
  new HealthService();