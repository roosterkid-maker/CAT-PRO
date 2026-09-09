import http from "node:http";

import "dotenv/config";

import cors from "cors";
import express from "express";

  import executionClockRoutes
  from "./execution/live/routes/executionClockRoutes";

import bybitSubscriptionAuditRoutes
  from "./diagnostics/routes/bybitSubscriptionAuditRoutes";

import sharedRecoveryRoutes
  from "./recovery/routes/sharedRecoveryRoutes";

import dynamicOpportunityDiscoveryRoutes
  from "./discovery/routes/dynamicOpportunityDiscoveryRoutes";

import {
  opportunityDiagnosticsRunner,
} from "./arbitrage/services/OpportunityDiagnosticsRunner";

import {
  unoCoinFeeSynchronizationService,
} from "./arbitrage/services/UnoCoinFeeSynchronizationService";

import {
  zebPayFeeSynchronizationService,
} from "./arbitrage/services/ZebPayFeeSynchronizationService";

import {
  coinSwitchFeeSynchronizationService,
} from "./arbitrage/services/CoinSwitchFeeSynchronizationService";

import {
  marketCacheOrderBookReconciliationService,
} from "./freshness/services/MarketCacheOrderBookReconciliationService";

import {
  staleOrderBookEvictionService,
} from "./freshness/services/StaleOrderBookEvictionService";

import {
  opportunityService,
} from "./arbitrage/services/OpportunityService";

import {
  rebalancingExecutionRunner,
} from "./rebalancing/execution/RebalancingExecutionRunner";

import {
  loadRebalancingExecutionConfig,
} from "./rebalancing/execution/RebalancingExecutionConfig";

import {
  environment,
} from "./config/Environment";

import {
  isLiveOnlyRuntimeEnabled,
} from "./config/LiveOnlyRuntimePolicy";

import exchangeFleetRoutes
  from "./exchanges/routes/exchangeFleetRoutes";

import {
  coinSwitchMarketRuleSynchronizationService,
} from "./exchanges/coinswitch/CoinSwitchMarketRuleSynchronizationService";

import {
  exchangeCapabilitySynchronizationService,
} from "./execution/capabilities/services/ExchangeCapabilitySynchronizationService";

import {
  executionRecoveryEngine,
} from "./execution/live/recovery/ExecutionRecoveryEngine";

import {
  executionReconciliationEngine,
} from "./execution/live/reconciliation/ExecutionReconciliationEngine";

import {
  application,
} from "./core/bootstrap/Application";

import coinDCXExecutableDiagnosticsRoutes
  from "./diagnostics/routes/coinDCXExecutableDiagnosticsRoutes";

import coinDCXSubscriptionAuditRoutes
  from "./diagnostics/routes/coinDCXSubscriptionAuditRoutes";

import marketCoverageRoutes
  from "./diagnostics/routes/marketCoverageRoutes";

import {
  executionMetricsSnapshotScheduler,
} from "./execution/live/metrics/ExecutionMetricsSnapshotScheduler";

import {
  exchangeClockSynchronizationRunner,
} from "./execution/live/time/ExchangeClockSynchronizationRunner";

import {
  strategyOneApiPermissionBoundaryService,
} from "./execution/live/tiny-live/StrategyOneApiPermissionBoundaryService";

import {
  productionAlertHistoryService,
} from "./execution/live/alerts/ProductionAlertHistoryService";

import {
  executionHistoryRoutes,
} from "./execution/live/routes/executionHistoryRoutes";

import {
  executionMonitoringRoutes,
} from "./execution/live/routes/executionMonitoringRoutes";

import executionRoutes
  from "./execution/routes/executionRoutes";

import {
  staleExecutableEvictionService,
} from "./freshness/services/StaleExecutableEvictionService";

import capitalRoutes
  from "./modules/capital/routes/capitalRoutes";

import optimizerRoutes
  from "./optimizer/routes/optimizerRoutes";

import rankingRoutes
  from "./ranking/routes/rankingRoutes";

import comparisonRoutes
  from "./routes/comparison";

import liveRoutes
  from "./routes/live";

import opportunityRoutes
  from "./routes/opportunities";

import spreadRoutes
  from "./routes/spreads";

import systemHealthRoutes
  from "./routes/systemHealth";

import {
  initializeSocket,
} from "./socket/server";

import {
  exchangeBalanceSynchronizationRunner,
} from "./trading/services/ExchangeBalanceSynchronizationRunner";

import {
  unoCoinAuthenticatedReadVerificationService,
} from "./exchanges/unocoin/UnoCoinAuthenticatedReadVerificationService";

import {
  zebPayAuthenticatedReadVerificationService,
} from "./exchanges/zebpay/ZebPayAuthenticatedReadVerificationService";

import {
  giottusAuthenticatedReadVerificationService,
} from "./exchanges/giottus/GiottusAuthenticatedReadVerificationService";

import {
  liveExecutionService,
} from "./execution/live/LiveExecutionService";

import {
  dynamicOpportunityDiscoveryRunnerService,
} from "./discovery/services/DynamicOpportunityDiscoveryRunnerService";

import {
  coinDCXProtectedRestOrderBookService,
} from "./exchanges/coindcx/CoinDCXProtectedRestOrderBookService";

import {
  websocketManager,
} from "./websocket/manager";

import {
  exchangeManager,
} from "./exchanges/core/ExchangeManager";

import {
  evaluateApplicationReadiness,
  type ApplicationInitializationState,
} from "./health/ApplicationReadiness";

import {
  authenticatedPrivateFillStreamService,
} from "./execution/live/fills/AuthenticatedPrivateFillStreamService";

import {
  coinDCXAuthenticatedPrivateFillStreamService,
} from "./execution/live/fills/CoinDCXAuthenticatedPrivateFillStreamService";

import {
  strategyOneExecutionTimingEvidenceService,
} from "./arbitrage/execution/StrategyOneExecutionTimingEvidenceService";

import {
  authenticatedPrivateFillEventOwner,
} from "./execution/live/fills/AuthenticatedPrivateFillEventOwner";

import {
  centralLiveOrderExecutionGateway,
} from "./execution/live/central/CentralLiveOrderExecutionGateway";

import liveOnlyRuntimeRoutes
  from "./execution/live/live-only/liveOnlyRuntimeRoutes";

import {
  strategyOneLiveOnlyRunnerService,
} from "./execution/live/live-only/StrategyOneLiveOnlyRunnerService";

import {
  opportunityCapitalStudyService,
} from "./rebalancing/services/OpportunityCapitalStudyService";

import {
  tradingAccountService,
} from "./trading/account/TradingAccountService";

const app =
  express();

if (
  environment.runtimeProfile !==
    "live-only"
) {
  throw new Error(
    "This CAT PRO build is LIVE-only. Start it with the explicit live-only compose overlay and confirmation.",
  );
}

authenticatedPrivateFillEventOwner
  .setTimingObserver(
    strategyOneExecutionTimingEvidenceService,
  );

centralLiveOrderExecutionGateway
  .setTimingEvidence(
    strategyOneExecutionTimingEvidenceService,
  );

const PORT =
  environment.port;

let applicationInitializationState:
  ApplicationInitializationState =
    "STARTING";

app.use(
  cors({
    origin:
      environment.frontendOrigin,

    credentials:
      true,
  }),
);

app.use(
  express.json(),
);

app.use(
  "/api/execution/clock",
  executionClockRoutes,
);

app.use(
  "/api/debug/bybit/subscriptions",
  bybitSubscriptionAuditRoutes,
);

app.use(
  "/api/recovery/shared",
  sharedRecoveryRoutes,
);

app.use(
  "/api/discovery/opportunities",
  dynamicOpportunityDiscoveryRoutes,
);

app.use(
  "/api/debug/coindcx/subscriptions",
  coinDCXSubscriptionAuditRoutes,
);

app.use(
  "/api/debug/market-coverage",
  marketCoverageRoutes,
);

app.use(
  "/api/debug/coindcx/executable-diagnostics",
  coinDCXExecutableDiagnosticsRoutes,
);

app.use(
  (
    request,
    _response,
    next,
  ) => {
    if (
      environment.logLevel
        .trim()
        .toLowerCase() ===
      "debug"
    ) {
      console.log(
        `[HTTP] ${request.method} ${request.originalUrl}`,
      );
    }

    next();
  },
);

app.get(
  "/",

  (
    _request,
    response,
  ) => {
    response.send(
      "Crypto Arbitrage Server Running",
    );
  },
);

app.get(
  "/health/live",

  (
    _request,
    response,
  ) => {
    response.json({
      status:
        "ALIVE",
    });
  },
);

app.get(
  "/health/ready",

  (
    _request,
    response,
  ) => {
    const readiness =
      evaluateApplicationReadiness(
        applicationInitializationState,
        exchangeManager
          .getAll()
          .map(
            (
              exchange,
            ) => ({
              name:
                exchange.name,
              connected:
                exchange.isConnected(),
            }),
          ),
      );
    const liveOnlyBlockers:
      string[] =
      [];

    if (
      environment.runtimeProfile ===
        "live-only"
    ) {
      const runner =
        strategyOneLiveOnlyRunnerService
          .getDiagnostics();
      const rebalancing =
        loadRebalancingExecutionConfig();
      const dedicatedCredentialsConfigured =
        Boolean(
          process.env.CAT_PRO_REBALANCER_BINANCE_API_KEY
            ?.trim() &&
          process.env.CAT_PRO_REBALANCER_BINANCE_API_SECRET
            ?.trim(),
        );

      if (
        !isLiveOnlyRuntimeEnabled()
      ) {
        liveOnlyBlockers.push(
          "LIVE-only runtime confirmation is incomplete.",
        );
      }

      if (
        !runner.running
      ) {
        liveOnlyBlockers.push(
          "LIVE-only opportunity runner is not running.",
        );
      }

      if (
        runner.halted
      ) {
        liveOnlyBlockers.push(
          runner.haltedReason ??
            "LIVE-only opportunity runner is halted.",
        );
      }

      if (
        !rebalancing.enabled ||
        !rebalancingExecutionRunner
          .isRunning()
      ) {
        liveOnlyBlockers.push(
          "Capital Manager fund movement is not enabled and running.",
        );
      }

      if (
        (
          rebalancing.sameExchangeEnabled ||
          rebalancing.crossExchangeEnabled
        ) &&
        !dedicatedCredentialsConfigured
      ) {
        liveOnlyBlockers.push(
          "Dedicated Capital Manager Binance credentials are missing.",
        );
      }

      if (
        rebalancing.crossExchangeEnabled &&
        rebalancing.withdrawalWhitelist.length ===
          0
      ) {
        liveOnlyBlockers.push(
          "Cross-exchange Capital Manager movement has no whitelisted destination.",
        );
      }
    }

    const liveOnlyOperationalReady =
      environment.runtimeProfile ===
        "live-only"
        ? liveOnlyBlockers.length ===
          0
        : null;

    response
      .status(
        readiness.ready
          ? 200
          : 503,
      )
      .json({
        ...readiness,
        liveOnlyOperationalReady,
        liveOnlyBlockers,
      });
  },
);

app.get(
  "/api/debug/opportunities",

  (
    _request,
    response,
  ) => {
    const opportunities =
      opportunityService
        .getLastOpportunities();

    response.json({
      total:
        opportunities.length,

      opportunities,
    });
  },
);

app.use(
  "/api/execution/history",
  executionHistoryRoutes,
);

app.use(
  "/api/execution",
  executionMonitoringRoutes,
);

app.use(
  "/api/live",
  liveRoutes,
);

app.use(
  "/api/capital",
  capitalRoutes,
);

app.use(
  "/api/comparison",
  comparisonRoutes,
);

app.use(
  "/api/spreads",
  spreadRoutes,
);

app.use(
  "/api/opportunities",
  opportunityRoutes,
);

app.use(
  "/api/execution",
  executionRoutes,
);

app.use(
  "/api/live-only",
  liveOnlyRuntimeRoutes,
);

app.use(
  "/api/optimizer",
  optimizerRoutes,
);

app.use(
  "/api/ranking",
  rankingRoutes,
);

app.use(
  "/api/system-health",
  systemHealthRoutes,
);

app.use(
  "/api/exchanges/fleet",
  exchangeFleetRoutes,
);

const server =
  http.createServer(
    app,
  );

/*
 * ZebPay has a PAPER-extension market/rule/fee lane. Register authenticated
 * read readiness without registering a LIVE order adapter or execution route.
 */
liveExecutionService
  .registerReadOnlyReadinessProvider(
    "zebpay",
    () =>
      zebPayAuthenticatedReadVerificationService
        .getReadiness(),
  );

/*
 * Giottus is authenticated-read only. Registration here exposes current
 * signed wallet evidence without granting market-data, rule or order authority.
 */
liveExecutionService
  .registerReadOnlyReadinessProvider(
    "giottus",
    () =>
      giottusAuthenticatedReadVerificationService
        .getReadiness(),
  );

initializeSocket(
  server,
);

server.listen(
  PORT,

  environment.backendHost,

  async () => {
    console.log(
      `Server running at http://${environment.backendHost}:${PORT}`,
    );

    try {
      await application
        .initialize();

      tradingAccountService
        .transitionToLiveOnlyRuntime(
          process.env
            .CAT_PRO_LIVE_ONLY_CONFIRMATION ??
            "",
        );

      dynamicOpportunityDiscoveryRunnerService
        .start();

      coinDCXProtectedRestOrderBookService
        .start();

      try {
        await unoCoinFeeSynchronizationService
          .synchronize();
      } catch (
        error:
          unknown
      ) {
        console.error(
          "[UnoCoin Fees] Initial synchronization failed; UnoCoin fee-dependent routes remain blocked:",
          error instanceof Error
            ? error.message
            : error,
        );
      }

      unoCoinFeeSynchronizationService
        .start();

      try {
        await zebPayFeeSynchronizationService
          .synchronize();
      } catch (
        error:
          unknown
      ) {
        console.error(
          "[ZebPay Fees] Initial synchronization failed; ZebPay fee-dependent routes remain blocked:",
          error instanceof Error
            ? error.message
            : error,
        );
      }

      zebPayFeeSynchronizationService
        .start();

      try {
        await unoCoinAuthenticatedReadVerificationService
          .verify();
      } catch (
        error:
          unknown
      ) {
        console.error(
          "[UnoCoin Authenticated Read] Verification failed; authenticated readiness remains blocked:",
          error instanceof Error
            ? error.message
            : error,
        );
      }

      unoCoinAuthenticatedReadVerificationService
        .start();

      try {
        await zebPayAuthenticatedReadVerificationService
          .verify();
      } catch (
        error:
          unknown
      ) {
        console.error(
          "[ZebPay Authenticated Read] Verification failed; ZebPay remains observation-only and execution-blocked:",
          error instanceof Error
            ? error.message
            : error,
        );
      }

      zebPayAuthenticatedReadVerificationService
        .start();

      try {
        await giottusAuthenticatedReadVerificationService
          .verify();
      } catch (
        error:
          unknown
      ) {
        console.error(
          "[Giottus Authenticated Read] Verification failed; Giottus remains execution-blocked:",
          error instanceof Error
            ? error.message
            : error,
        );
      }

      giottusAuthenticatedReadVerificationService
        .start();

      try {
        await coinSwitchFeeSynchronizationService
          .synchronize();
      } catch (
        error:
          unknown
      ) {
        console.error(
          "[CoinSwitch Fees] Initial synchronization failed; CoinSwitch fee-dependent routes remain blocked:",
          error instanceof Error
            ? error.message
            : error,
        );
      }

      coinSwitchFeeSynchronizationService
        .start();

      try {
        await coinSwitchMarketRuleSynchronizationService
          .synchronize();
      } catch (
        error:
          unknown
      ) {
        console.error(
          "[CoinSwitch Rules] Initial synchronization failed; rule-dependent paper routes remain blocked:",
          error instanceof Error
            ? error.message
            : error,
        );
      }

      coinSwitchMarketRuleSynchronizationService
        .start();

      /*
       * Binance/Bybit/CoinDCX/ZebPay execution adapters validate against
       * exchangeCapabilityService's cache (see
       * BinanceExecutionAdapter.validateAgainstExchangeCapability and its
       * siblings) via a cache-only synchronous read - deliberately never a
       * live network fetch on the order-submission hot path. Without this,
       * that cache is never populated and their exchange-rule validation
       * stays inert. Mirrors the CoinSwitch rule-synchronization pattern
       * immediately above.
       */
      try {
        await exchangeCapabilitySynchronizationService
          .synchronize();
      } catch (
        error:
          unknown
      ) {
        console.error(
          "[Exchange Capability Sync] Initial synchronization failed; exchange-rule validation remains inert until the next periodic attempt:",
          error instanceof Error
            ? error.message
            : error,
        );
      }

      exchangeCapabilitySynchronizationService
        .start();

      /*
       * Engine lifecycle belongs to startup, never route-module imports.
       */
      executionRecoveryEngine
        .start();

      executionReconciliationEngine
        .start();

      executionMetricsSnapshotScheduler
        .start();

      exchangeBalanceSynchronizationRunner
        .start();

      await exchangeClockSynchronizationRunner
        .start();

      strategyOneApiPermissionBoundaryService
        .start();

      /*
       * V95 startup ordering invariant:
       * persisted production-alert monitoring must
       * not sample clock safety until the initial
       * authoritative clock synchronization has
       * completed. This prevents false critical
       * reopenings during a backend restart.
       */
      productionAlertHistoryService
        .start();

      opportunityDiagnosticsRunner
        .start();

      /*
       * VERSION 17.3 BUILD 3
       *
       * Stale executable quotes must not remain
       * executable indefinitely.
       *
       * The service uses the SAME
       * FreshnessIntegrityService policy as the
       * opportunity evaluator.
       */
      staleExecutableEvictionService
        .start();
        marketCacheOrderBookReconciliationService
  .start();

      staleOrderBookEvictionService
  .start();

      strategyOneExecutionTimingEvidenceService
        .start();

      /*
       * Automated Capital Rebalancer (Phase D). Starting this timer is
       * always safe: RebalancingExecutionService checks
       * CAT_PRO_REBALANCER_ENABLED (and the same/cross-exchange phase
       * flags) on every tick before touching any exchange, and both
       * default OFF. Nothing moves until the operator has provisioned the
       * dedicated withdrawal-capable Binance key and populated the
       * withdrawal whitelist.
       */
      opportunityCapitalStudyService
        .start();

      rebalancingExecutionRunner
        .start();

      await websocketManager
        .start();

      authenticatedPrivateFillStreamService
        .start();

      coinDCXAuthenticatedPrivateFillStreamService
        .start();

      /*
       * LIVE-only execution is the final producer to start. Recovery,
       * reconciliation, balances, clocks, permission evidence and private
       * fill ownership are already running before it can observe a candidate.
       */
      strategyOneLiveOnlyRunnerService
        .start();

      applicationInitializationState =
        "READY";
    } catch (
      error:
        unknown
    ) {
      applicationInitializationState =
        "FAILED";

      console.error(
        "[Application] Initialization failed:",
        error,
      );
    }
  },
);

const shutdown =
  async (
    signal:
      string,
  ) => {
    console.log(
      `[Shutdown] Received ${signal}.`,
    );

    strategyOneLiveOnlyRunnerService
      .stop();

    opportunityCapitalStudyService
      .stop();

    /*
     * Stop producers/automation before network
     * connections and process termination.
     */
    strategyOneExecutionTimingEvidenceService
      .stop();

    dynamicOpportunityDiscoveryRunnerService
      .stop();

    coinDCXProtectedRestOrderBookService
      .stop();

    unoCoinFeeSynchronizationService
      .stop();

    zebPayFeeSynchronizationService
      .stop();

    unoCoinAuthenticatedReadVerificationService
      .stop();

    zebPayAuthenticatedReadVerificationService
      .stop();

    giottusAuthenticatedReadVerificationService
      .stop();

    coinSwitchFeeSynchronizationService
      .stop();

    coinSwitchMarketRuleSynchronizationService
      .stop();

    exchangeCapabilitySynchronizationService
      .stop();

    executionRecoveryEngine
      .stop();

    executionReconciliationEngine
      .stop();

    /*
     * VERSION 17.3 BUILD 3
     *
     * Stop freshness eviction cleanly.
     */
    staleOrderBookEvictionService
  .stop();

marketCacheOrderBookReconciliationService
  .stop();
    staleExecutableEvictionService
      .stop();

    opportunityDiagnosticsRunner
      .stop();

    exchangeBalanceSynchronizationRunner
      .stop();

    exchangeClockSynchronizationRunner
      .stop();

    strategyOneApiPermissionBoundaryService
      .stop();

    productionAlertHistoryService
      .stop();

    executionMetricsSnapshotScheduler
      .stop();

    try {
      authenticatedPrivateFillStreamService
        .stop();

      coinDCXAuthenticatedPrivateFillStreamService
        .stop();

      await websocketManager
        .stop();
    } catch (
      error:
        unknown
    ) {
      console.error(
        "[Shutdown] WebSocket manager stop failed:",
        error,
      );
    }

    server.close(
      (
        error,
      ) => {
        if (
          error
        ) {
          console.error(
            "[Shutdown] HTTP server close failed:",
            error,
          );

          process.exit(
            1,
          );
        }

        process.exit(
          0,
        );
      },
    );
  };

process.on(
  "SIGINT",
  () => {
    void shutdown(
      "SIGINT",
    );
  },
);

process.on(
  "SIGTERM",
  () => {
    void shutdown(
      "SIGTERM",
    );
  },
);
