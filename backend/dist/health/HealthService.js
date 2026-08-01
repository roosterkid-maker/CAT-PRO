"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthService = exports.HealthService = void 0;
const OpportunityService_1 = require("../arbitrage/services/OpportunityService");
const ExchangeManager_1 = require("../exchanges/core/ExchangeManager");
const cache_service_1 = require("../services/cache.service");
class HealthService {
    getReport() {
        const memoryUsage = process.memoryUsage();
        return {
            timestamp: Date.now(),
            exchanges: ExchangeManager_1.exchangeManager.getAll().map((exchange) => ({
                name: exchange.name,
                connected: exchange.isConnected(),
            })),
            cache: {
                cachedQuotes: cache_service_1.marketCache.size(),
            },
            engine: {
                opportunities: OpportunityService_1.opportunityService.getOpportunities().length,
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
exports.HealthService = HealthService;
exports.healthService = new HealthService();
//# sourceMappingURL=HealthService.js.map