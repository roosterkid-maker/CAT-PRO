import { opportunityService } from "../arbitrage/services/OpportunityService";
import { exchangeManager } from "../exchanges/core/ExchangeManager";
import { marketCache } from "../services/cache.service";

import type { SystemHealthReport } from "./HealthReport";

export class HealthService {
  getReport(): SystemHealthReport {
    const memoryUsage = process.memoryUsage();

    return {
      timestamp: Date.now(),

      exchanges: exchangeManager.getAll().map((exchange) => ({
        name: exchange.name,
        connected: exchange.isConnected(),
      })),

      cache: {
        cachedQuotes: marketCache.size(),
      },

      engine: {
        opportunities:
          opportunityService.getOpportunities().length,
      },

      process: {
        uptimeSeconds: Math.floor(process.uptime()),

        memory: {
          rss: memoryUsage.rss,
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
        },
      },
    };
  }
}

export const healthService = new HealthService();