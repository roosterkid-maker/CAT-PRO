import {
  Router,
} from "express";

import {
  marketCoverageAnalyticsService,
} from "../services/MarketCoverageAnalyticsService";

import {
  strategyOneCoverageFunnelService,
} from "../services/StrategyOneCoverageFunnelService";

import {
  rankPriceAlignedSharedMarkets,
} from "../../exchanges/core/PriceAlignedMarketRanking";

import {
  marketCache,
} from "../../services/cache.service";

const router =
  Router();

/*
 * GET /api/debug/market-coverage
 *
 * Read-only market coverage diagnostics.
 *
 * Shows:
 * - quotes by exchange
 * - executable market coverage
 * - common markets
 * - exchange overlap matrix
 * - generated directional routes
 * - non-pairable shared markets
 * - Strategy #1 coverage funnel
 *
 * SAFETY:
 *
 * This endpoint:
 * - does not place orders
 * - does not arm PAPER
 * - does not enable LIVE
 * - does not change thresholds
 * - does not promote ticker data
 * - does not modify executable state
 */
router.get(
  "/",
  (
    _request,
    response,
  ) => {
    response.setHeader(
      "Cache-Control",
      "no-store",
    );

    try {
      const report =
        marketCoverageAnalyticsService
          .getReport();

      const strategyOneCoverageFunnel =
        strategyOneCoverageFunnelService
          .getReport();

      response.json({
        success:
          true,

        data: {
          ...report,

          strategyOneCoverageFunnel,

          strategyOnePairDiscovery: {
            route:
              "unocoin<->coindcx",

            tickerOnly:
              true,

            executablePromotionAllowed:
              false,

            alignedMarkets:
              rankPriceAlignedSharedMarkets(
                marketCache.getByExchange(
                  "coindcx",
                ),

                marketCache.getByExchange(
                  "unocoin",
                ),
              ).slice(
                0,
                20,
              ),
          },
        },
      });
    } catch (
      error:
        unknown
    ) {
      response
        .status(
          500,
        )
        .json({
          success:
            false,

          error:
            error instanceof Error
              ? error.message
              : "Unable to generate market coverage analytics.",
        });
    }
  },
);

export default router;