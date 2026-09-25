import {
  Router,
} from "express";

import {
  getLiveOnlyRuntimePolicy,
  isLiveOnlyRuntimeProfile,
} from "../../../config/LiveOnlyRuntimePolicy";

import {
  strategyOneLiveOnlyRunnerService,
} from "./StrategyOneLiveOnlyRunnerService";

import {
  loadRebalancingExecutionConfig,
} from "../../../rebalancing/execution/RebalancingExecutionConfig";

import {
  rebalancingExecutionRunner,
} from "../../../rebalancing/execution/RebalancingExecutionRunner";

import {
  opportunityService,
} from "../../../arbitrage/services/OpportunityService";

import {
  exchangeFleetRegistry,
} from "../../../exchanges/core/ExchangeFleetRegistry";

import {
  strategyOneLiveOnlyPreflightService,
} from "./StrategyOneLiveOnlyPreflightService";

import {
  strategyOneLiveOnlyIntelligenceService,
} from "./StrategyOneLiveOnlyIntelligenceService";

import {
  opportunityCapitalStudyService,
} from "../../../rebalancing/services/OpportunityCapitalStudyService";

import {
  readConfirmationPhrase,
} from "../routes/executionSafetyMetadata";

import {
  normalizedInventorySnapshotService,
} from "../../../rebalancing/services/NormalizedInventorySnapshotService";

import {
  marketCache,
} from "../../../services/cache.service";

import {
  getInrArbitrageScanner,
} from "../../../strategies/inr-arbitrage/InrArbitrageScannerService";

import {
  getInrRouteLiveRunner,
} from "../inr-routes/InrRouteLiveRunner";

import {
  getCoinStudyService,
} from "../../../strategies/inr-arbitrage/CoinStudyService";

import {
  createInventoryValuation,
} from "../../../rebalancing/services/InventoryValuation";

import {
  getOrCreateRouteExitCostService,
} from "../inr-routes/DefaultRouteExitCostSources";

import {
  getRouteRefillService,
} from "../../../rebalancing/services/RouteRefillService";

import {
  getCoinSwitchInrDepthPollerDiagnostics,
} from "../../../exchanges/coinswitch/CoinSwitchInrDepthPoller";

import {
  opportunityNearMissAnalyticsService,
} from "../../../arbitrage/services/OpportunityNearMissAnalyticsService";

import {
  executionHistoryService,
} from "../history/ExecutionHistoryService";

import {
  buildArbitragePnLReport,
} from "../history/ArbitragePnLReport";

import {
  getExchangeTakerFeePercent,
} from "../../../arbitrage/config/fees";

import {
  getStrategyOneTinyLiveCashCostProfile,
} from "../evidence/StrategyOneTinyLiveCashCostService";

const router =
  Router();

router.get(
  "/",
  (
    _request,
    response,
  ) => {
    const rebalancing =
      getCapitalManagerReport();

    response.setHeader(
      "Cache-Control",
      "no-store",
    );

    response.json({
      success:
        true,
      data: {
        profileSelected:
          isLiveOnlyRuntimeProfile(),
        policy:
          getLiveOnlyRuntimePolicy(),
        runner:
          strategyOneLiveOnlyRunnerService
            .getDiagnostics(),
        capitalManager: {
          ...rebalancing,
        },
        capitalStudy:
          opportunityCapitalStudyService
            .getReport(),
      },
    });
  },
);

/*
 * The ONLY endpoint that can release a halt caused by a FAILED attempt that
 * actually reached the exchange (dispatch-touching) rather than a
 * RECOVERY_REQUIRED or safe-pre-dispatch-rejection halt (which have their
 * own, already-existing release paths). Requires the exact
 * CONFIRM_LIVE_ONLY_CLEAN_FAILURE_RELEASE phrase, and the underlying
 * service method itself re-checks that the triggering attempt's own
 * already-computed evidence shows no recovery required and no possible
 * exposure before it will release anything - this route performs no
 * exchange I/O and grants no execution authority beyond letting the
 * already-configured, already-running runner resume watching for its next
 * opportunity.
 */
router.post(
  "/release-clean-failure-halt",
  (
    request,
    response,
  ) => {
    try {
      const confirmation =
        readConfirmationPhrase(
          request.body,
        );

      const released =
        strategyOneLiveOnlyRunnerService
          .releaseCleanFailureHalt(
            confirmation,
          );

      response.json({
        success:
          true,
        data: {
          released,
          runner:
            strategyOneLiveOnlyRunnerService
              .getDiagnostics(),
        },
      });
    } catch (
      error:
        unknown
    ) {
      response.status(409).json({
        success:
          false,
        message:
          error instanceof Error
            ? error.message
            : "LIVE-only clean-failure halt release failed.",
      });
    }
  },
);

router.get(
  "/intelligence",
  (
    _request,
    response,
  ) => {
    const now =
      Date.now();
    const runtime =
      strategyOneLiveOnlyRunnerService
        .getDiagnostics(
          now,
        );
    const fleet =
      exchangeFleetRegistry
        .getReport();

    response.setHeader(
      "Cache-Control",
      "no-store",
    );

    response.json({
      success:
        true,
      data:
        strategyOneLiveOnlyIntelligenceService
          .build({
            opportunities:
              opportunityService
                .getLastOpportunities(),
            policy:
              getLiveOnlyRuntimePolicy(),
            runtime,
            capitalManager:
              getCapitalManagerReport(),
            capitalStudy:
              opportunityCapitalStudyService
                .getReport(
                  now,
                ),
            recentAttempts:
              runtime.recentAttempts,
            exchangeFoundations:
              fleet.foundationExchanges,
            excludedMarkets:
              runtime.excludedMarkets,
            evaluatePreflight:
              (
                opportunity,
                evaluatedAt,
              ) =>
                strategyOneLiveOnlyPreflightService
                  .evaluate(
                    opportunity,
                    evaluatedAt,
                  ),
            now,
          }),
    });
  },
);

/*
 * Read-only wallet summary for the operator dashboard: per-exchange valued
 * totals and the held assets behind them, from the same normalized
 * inventory truth the runner's pre-fundable check and the Capital Manager
 * use. The CoinDCX USDTINR last price is included only so the dashboard can
 * show an INR estimate; it is null when that quote is not cached. No
 * exchange I/O happens here - it reads already-synchronized snapshots.
 */
router.get(
  "/inventory",
  (
    _request,
    response,
  ) => {
    const snapshot =
      normalizedInventorySnapshotService
        .getSnapshot();
    const usdtInr =
      marketCache.get(
        "coindcx",
        "USDTINR",
      )?.lastPrice ??
      null;

    response.setHeader(
      "Cache-Control",
      "no-store",
    );

    const validUsdtInr =
      usdtInr !== null &&
      Number.isFinite(usdtInr) &&
      usdtInr > 0
        ? usdtInr
        : null;
    const estimatePriceUsdt =
      buildDisplayPriceEstimator(
        snapshot,
        validUsdtInr,
      );
    let estimatedTotalValueUsdt =
      0;
    let unpricedAssets =
      0;

    const exchanges =
      snapshot.exchanges.map(
        (exchange) => {
          let exchangeEstimatedValueUsdt =
            0;

          const assets =
            exchange.assets
              .filter(
                (asset) =>
                  asset.totalBalance > 0,
              )
              .map(
                (asset) => {
                  const venueValue =
                    asset.valuation.totalValueUsdt;
                  const estimatedPrice =
                    venueValue === null
                      ? estimatePriceUsdt(
                          asset.asset,
                        )
                      : null;
                  const estimatedValue =
                    estimatedPrice === null
                      ? null
                      : asset.totalBalance *
                        estimatedPrice;

                  if (
                    estimatedValue !== null
                  ) {
                    exchangeEstimatedValueUsdt +=
                      estimatedValue;
                  } else if (
                    venueValue === null
                  ) {
                    unpricedAssets +=
                      1;
                  }

                  return {
                    asset:
                      asset.asset,
                    totalBalance:
                      asset.totalBalance,
                    availableAfterReservations:
                      asset.availableAfterReservations,
                    totalValueUsdt:
                      venueValue ??
                      estimatedValue,
                    priceUsdt:
                      asset.valuation.priceUsdt ??
                      estimatedPrice,
                    estimated:
                      venueValue === null &&
                      estimatedValue !== null,
                  };
                },
              );

          estimatedTotalValueUsdt +=
            exchangeEstimatedValueUsdt;

          return {
            exchange:
              exchange.exchange,
            displayName:
              exchange.displayName,
            balanceUsableForDecision:
              exchange.balanceUsableForDecision,
            lastSynchronizedAt:
              exchange.lastSynchronizedAt,
            knownTotalValueUsdt:
              exchange.totals.knownTotalValueUsdt,
            estimatedValueUsdt:
              exchangeEstimatedValueUsdt,
            assets,
          };
        },
      );

    response.json({
      success:
        true,
      data: {
        generatedAt:
          snapshot.generatedAt,
        state:
          snapshot.state,
        usdtInr:
          validUsdtInr,
        knownTotalValueUsdt:
          snapshot.totals.knownTotalValueUsdt,
        estimatedValueUsdt:
          estimatedTotalValueUsdt,
        unavailableValuations:
          unpricedAssets,
        exchanges,
      },
    });
  },
);

/*
 * Scan-only INR arbitrage scanner (INR<->USDT, INR<->INR across CoinDCX,
 * UnoCoin, CoinSwitch, Binance, Bybit). Read-only report; the scanner has
 * no order, balance or transfer authority.
 */
router.get(
  "/inr-scanner",
  (
    _request,
    response,
  ) => {
    const report =
      getInrArbitrageScanner()
        ?.getReport() ??
      null;

    response.setHeader(
      "Cache-Control",
      "no-store",
    );

    if (
      !report
    ) {
      response.status(503).json({
        success:
          false,
        message:
          "INR arbitrage scanner has not started (exchange market data not connected yet).",
      });

      return;
    }

    response.json({
      success:
        true,
      data: {
        ...report,
        coinSwitchInrDepth:
          getCoinSwitchInrDepthPollerDiagnostics(),
      },
    });
  },
);

/*
 * Read-only near-miss analytics for the Arbitrage page. The live-only
 * runtime unmounted /api/automation/* (PAPER-era routes), which left this
 * page polling a 404; the report itself only reads the current bounded
 * snapshot and never triggers a scan.
 */
/*
 * Coin study: which coins keep producing valid edges (7 days), direction,
 * hours, and where/how much inventory to hold, against current holdings.
 */
router.get(
  "/coin-study",
  (
    _request,
    response,
  ) => {
    try {
      const valuation = createInventoryValuation();
      const holding = (venue: string, asset: string) => valuation.holdingInr(venue, asset);
      response.setHeader("Cache-Control", "no-store");
      response.json({
        success: true,
        data: getCoinStudyService().getReport(
          getLiveOnlyRuntimePolicy().preferredCapitalPerLegInr,
          holding,
        ),
      });
    } catch (error: unknown) {
      response.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Coin study is unavailable.",
      });
    }
  },
);

/*
 * Capital manager refill plan for the core coin basket: what each route's
 * sell venue (coin) and buy venue (cash) holds against target, and the
 * actions to restore it - AUTO (Binance USDT to a whitelisted exchange,
 * executed by the capital manager) or MANUAL instructions.
 */
router.get(
  "/refill-plan",
  (
    _request,
    response,
  ) => {
    try {
      response.setHeader("Cache-Control", "no-store");
      response.json({
        success: true,
        data: getRouteRefillService().getPlan(),
      });
    } catch (error: unknown) {
      response.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Refill plan is unavailable.",
      });
    }
  },
);

/* Route exit costs: which coins can leave which exchange, and operator marks. */
router.get(
  "/exit-cost",
  async (
    request,
    response,
  ) => {
    const service = getOrCreateRouteExitCostService();
    await service.ensureFresh().catch(() => undefined);
    const coin = typeof request.query.coin === "string" ? request.query.coin.trim().toUpperCase() : "";
    const from = typeof request.query.from === "string" ? request.query.from.trim().toLowerCase() : "";
    const to = typeof request.query.to === "string" ? request.query.to.trim().toLowerCase() : "";
    response.setHeader("Cache-Control", "no-store");
    response.json({
      success: true,
      data: {
        closed: service.closedMarks(),
        exit: coin && from && to ? service.exit(coin, from, to) : null,
      },
    });
  },
);

/* Operator-only: mark a coin's withdrawals on an exchange closed, or open again. */
router.post(
  "/exit-cost/mark",
  (
    request,
    response,
  ) => {
    const venue = typeof request.body?.venue === "string" ? request.body.venue.trim().toLowerCase() : "";
    const coin = typeof request.body?.coin === "string" ? request.body.coin.trim().toUpperCase() : "";
    if (!venue || !/^[A-Z0-9]{1,15}$/u.test(coin) || typeof request.body?.closed !== "boolean") {
      response.status(400).json({success: false, message: "venue, coin and closed (boolean) are required."});
      return;
    }
    response.json({
      success: true,
      data: {closed: getOrCreateRouteExitCostService().setClosed(venue, coin, request.body.closed)},
    });
  },
);

/* Operator-only: lift a refill destination's failure pause after fixing its cause. */
router.post(
  "/refill-plan/clear-pause",
  (
    request,
    response,
  ) => {
    const venue =
      typeof request.body?.venue === "string"
        ? request.body.venue.trim().toLowerCase()
        : "";
    if (!venue) {
      response.status(400).json({success: false, message: "venue is required."});
      return;
    }
    response.json({
      success: true,
      data: {
        cleared: getRouteRefillService().clearPause(venue),
        plan: getRouteRefillService().getPlan(),
      },
    });
  },
);

router.get(
  "/inr-executor",
  (
    _request,
    response,
  ) => {
    response.setHeader(
      "Cache-Control",
      "no-store",
    );
    response.json({
      success:
        true,
      data:
        getInrRouteLiveRunner()
          .getDiagnostics(),
    });
  },
);

/*
 * Operator-only: releases an INR executor halt (exposure, recovery or
 * interruption) after the operator has reconciled the orders involved.
 */
router.post(
  "/inr-executor/release-halt",
  (
    request,
    response,
  ) => {
    try {
      const released =
        getInrRouteLiveRunner()
          .releaseHalt(
            readConfirmationPhrase(
              request.body,
            ),
          );
      response.json({
        success:
          true,
        data: {
          released,
          executor:
            getInrRouteLiveRunner()
              .getDiagnostics(),
        },
      });
    } catch (
      error:
        unknown
    ) {
      response.status(409).json({
        success:
          false,
        message:
          error instanceof Error
            ? error.message
            : "INR executor halt release failed.",
      });
    }
  },
);

router.get(
  "/near-misses",
  (
    request,
    response,
  ) => {
    const rawLimit =
      typeof request.query.limit ===
        "string"
        ? Number(
            request.query.limit,
          )
        : 20;

    try {
      response.json({
        success:
          true,
        data:
          opportunityNearMissAnalyticsService
            .getReport(
              Number.isSafeInteger(
                rawLimit,
              )
                ? rawLimit
                : 20,
            ),
      });
    } catch (
      error:
        unknown
    ) {
      response.status(500).json({
        success:
          false,
        message:
          error instanceof Error
            ? error.message
            : "Opportunity near-miss analytics failed.",
      });
    }
  },
);

/*
 * Realized arbitrage P&L from the live order history (paired arb-buy /
 * arb-sell legs) for the Execution tab. Fees are estimated at each venue's
 * taker rate plus GST because venue fee lines are in mixed assets.
 */
router.get(
  "/pnl",
  async (
    request,
    response,
  ) => {
    const rawLimit =
      typeof request.query.limit ===
        "string"
        ? Number(
            request.query.limit,
          )
        : 20;

    try {
      const history =
        await executionHistoryService
          .getRecent(
            500,
          );

      response.setHeader(
        "Cache-Control",
        "no-store",
      );

      response.json(
        buildArbitragePnLReport(
          history.executions,
          (exchange, market, side) => {
            const fee =
              getExchangeTakerFeePercent(
                exchange,
                market,
              );

            if (
              fee === null
            ) {
              return null;
            }

            try {
              return fee *
                (1 +
                  getStrategyOneTinyLiveCashCostProfile(
                    exchange,
                    market,
                    side,
                  ).tradingFeeSurchargeMultiplier);
            } catch {
              return fee;
            }
          },
          Number.isSafeInteger(
            rawLimit,
          )
            ? rawLimit
            : 20,
          Date.now(),
        ),
      );
    } catch (
      error:
        unknown
    ) {
      response.status(500).json({
        success:
          false,
        message:
          error instanceof Error
            ? error.message
            : "Arbitrage P&L report failed.",
      });
    }
  },
);

const DISPLAY_ESTIMATE_MAX_QUOTE_AGE_MS =
  10 * 60_000;

/*
 * Display-only fallback for assets the holding venue itself cannot value
 * (no cached quote there). Tries, in order: the same asset's valuation on
 * another venue in this snapshot, a fresh cached <ASSET>USDT last price on
 * any venue, a fresh <ASSET>INR last price converted at USDTINR, and INR
 * itself at USDTINR. The result feeds the dashboard net-worth figure only
 * and is flagged `estimated`; it never reaches the inventory snapshot that
 * execution and capital decisions read.
 */
function buildDisplayPriceEstimator(
  snapshot: ReturnType<
    typeof normalizedInventorySnapshotService.getSnapshot
  >,
  usdtInr: number | null,
): (asset: string) => number | null {
  const prices =
    new Map<string, number>();
  const now =
    Date.now();

  for (
    const exchange
    of snapshot.exchanges
  ) {
    for (
      const asset
      of exchange.assets
    ) {
      const price =
        asset.valuation.priceUsdt;

      if (
        price !== null &&
        price > 0 &&
        !prices.has(asset.asset)
      ) {
        prices.set(
          asset.asset,
          price,
        );
      }
    }
  }

  const inrQuoted =
    new Map<string, number>();

  for (
    const quote
    of marketCache.getAll()
  ) {
    const lastPrice =
      quote.lastPrice;

    if (
      lastPrice === null ||
      !Number.isFinite(lastPrice) ||
      lastPrice <= 0 ||
      now - quote.timestamp >
        DISPLAY_ESTIMATE_MAX_QUOTE_AGE_MS
    ) {
      continue;
    }

    const market =
      quote.market
        .toUpperCase()
        .replace(
          /[_\-/]/g,
          "",
        );

    if (
      market.endsWith("USDT") &&
      market.length > 4 &&
      !prices.has(market.slice(0, -4))
    ) {
      prices.set(
        market.slice(0, -4),
        lastPrice,
      );
    } else if (
      market.endsWith("INR") &&
      market.length > 3 &&
      !inrQuoted.has(market.slice(0, -3))
    ) {
      inrQuoted.set(
        market.slice(0, -3),
        lastPrice,
      );
    }
  }

  return (asset) => {
    const normalized =
      asset.toUpperCase();

    if (
      normalized === "USDT"
    ) {
      return 1;
    }

    const direct =
      prices.get(normalized);

    if (
      direct !== undefined
    ) {
      return direct;
    }

    if (
      usdtInr === null
    ) {
      return null;
    }

    if (
      normalized === "INR"
    ) {
      return 1 / usdtInr;
    }

    const inrPrice =
      inrQuoted.get(normalized);

    return inrPrice === undefined
      ? null
      : inrPrice / usdtInr;
  };
}

function getCapitalManagerReport() {
  const rebalancing =
    loadRebalancingExecutionConfig();

  return {
    enabled:
      rebalancing.enabled,
    sameExchangeEnabled:
      rebalancing.sameExchangeEnabled,
    crossExchangeEnabled:
      rebalancing.crossExchangeEnabled,
    maximumPerTransferUsdt:
      rebalancing.maximumPerTransferUsdt,
    maximumPerDaySameExchangeUsdt:
      rebalancing.maximumPerDaySameExchangeUsdt,
    maximumPerDayCrossExchangeUsdt:
      rebalancing.maximumPerDayCrossExchangeUsdt,
    withdrawalWhitelistEntries:
      rebalancing.withdrawalWhitelist.length,
    dedicatedBinanceCredentialsConfigured:
      Boolean(
        process.env.CAT_PRO_REBALANCER_BINANCE_API_KEY
          ?.trim() &&
        process.env.CAT_PRO_REBALANCER_BINANCE_API_SECRET
          ?.trim(),
      ),
    runner:
      rebalancingExecutionRunner
        .getStatus(),
  };
}

export default router;
