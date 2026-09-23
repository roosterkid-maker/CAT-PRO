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

    response.json({
      success:
        true,
      data: {
        generatedAt:
          snapshot.generatedAt,
        state:
          snapshot.state,
        usdtInr:
          usdtInr !== null &&
          Number.isFinite(usdtInr) &&
          usdtInr > 0
            ? usdtInr
            : null,
        knownTotalValueUsdt:
          snapshot.totals.knownTotalValueUsdt,
        unavailableValuations:
          snapshot.totals.unavailableValuations,
        exchanges:
          snapshot.exchanges.map(
            (exchange) => ({
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
              assets:
                exchange.assets
                  .filter(
                    (asset) =>
                      asset.totalBalance > 0,
                  )
                  .map(
                    (asset) => ({
                      asset:
                        asset.asset,
                      totalBalance:
                        asset.totalBalance,
                      availableAfterReservations:
                        asset.availableAfterReservations,
                      totalValueUsdt:
                        asset.valuation.totalValueUsdt,
                      priceUsdt:
                        asset.valuation.priceUsdt,
                    }),
                  ),
            }),
          ),
      },
    });
  },
);

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
