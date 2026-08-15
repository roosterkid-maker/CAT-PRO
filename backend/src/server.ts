import http from "node:http";

import "dotenv/config";

import cors from "cors";
import express from "express";

import analyticsRoutes
  from "./analytics/routes/analyticsRoutes";

  import executionClockRoutes
  from "./execution/live/routes/executionClockRoutes";

import {
  arbitragePnLRoutes,
} from "./arbitrage/routes/arbitragePnLRoutes";

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

import automationRoutes
  from "./automation/routes/automationRoutes";

import controlledLiveTradingRoutes
  from "./automation/routes/controlledLiveTradingRoutes";

import opportunityPipelineBottleneckRoutes
  from "./automation/routes/opportunityPipelineBottleneckRoutes";

import productionSafetyDiagnosticsRoutes
  from "./automation/routes/productionSafetyDiagnosticsRoutes";

import {
  automationSchedulerService,
} from "./automation/services/AutomationSchedulerService";

import candidateBoardRoutes
  from "./candidates/routes/candidateBoardRoutes";

import {
  environment,
} from "./config/Environment";

import exchangeFleetRoutes
  from "./exchanges/routes/exchangeFleetRoutes";

import paperShadowReadinessRoutes
  from "./exchanges/routes/paperShadowReadinessRoutes";

import readinessObservationRoutes
  from "./exchanges/routes/readinessObservationRoutes";

import {
  fiveExchangeReadinessObservationService,
} from "./exchanges/services/FiveExchangeReadinessObservationService";

import {
  coinSwitchMarketRuleSynchronizationService,
} from "./exchanges/coinswitch/CoinSwitchMarketRuleSynchronizationService";

import {
  application,
} from "./core/bootstrap/Application";

import coinDCXExecutableDiagnosticsRoutes
  from "./diagnostics/routes/coinDCXExecutableDiagnosticsRoutes";

import coinDCXSubscriptionAuditRoutes
  from "./diagnostics/routes/coinDCXSubscriptionAuditRoutes";

import diagnosticsRoutes
  from "./diagnostics/routes/diagnosticsRoutes";

import marketCoverageRoutes
  from "./diagnostics/routes/marketCoverageRoutes";

import {
  executionMetricsSnapshotScheduler,
} from "./execution/live/metrics/ExecutionMetricsSnapshotScheduler";

import {
  exchangeClockSynchronizationRunner,
} from "./execution/live/time/ExchangeClockSynchronizationRunner";

import {
  productionAlertHistoryService,
} from "./execution/live/alerts/ProductionAlertHistoryService";

import {
  executionHistoryRoutes,
} from "./execution/live/routes/executionHistoryRoutes";

import fiveExchangeGoNoGoRoutes
  from "./execution/live/routes/fiveExchangeGoNoGoRoutes";

import centralStrategyLiveReadinessRoutes
  from "./execution/live/routes/centralStrategyLiveReadinessRoutes";

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

import portfolioRoutes
  from "./portfolio/routes/portfolioRoutes";

import rankingRoutes
  from "./ranking/routes/rankingRoutes";

import riskRoutes
  from "./risk/routes/riskRoutes";

import comparisonRoutes
  from "./routes/comparison";

import liveRoutes
  from "./routes/live";

import opportunityRoutes
  from "./routes/opportunities";

import paperTradingRouter
  from "./routes/paperTrading";

import paperTradeRoutes
  from "./routes/paperTrades";

import spreadRoutes
  from "./routes/spreads";

import systemHealthRoutes
  from "./routes/systemHealth";

import {
  initializeSocket,
} from "./socket/server";

import automatedPaperTradingRoutes
  from "./trading/routes/automatedPaperTradingRoutes";

import {
  exchangeBalanceSynchronizationRunner,
} from "./trading/services/ExchangeBalanceSynchronizationRunner";

import {
  unoCoinAuthenticatedReadVerificationService,
} from "./exchanges/unocoin/UnoCoinAuthenticatedReadVerificationService";

import {
  tradeMonitorRunner,
} from "./trading/services/TradeMonitorRunner";

// backend/src/server.ts

import operatorSettingsRoutes
  from "./operator-settings/routes/operatorSettingsRoutes";

import strategyRoutes
  from "./strategies/routes/strategyRoutes";

import {
  centralStrategyExecutionAdmissionService,
  strategyAttributionService,
  strategyOrchestrator,
  strategyReadModelService,
} from "./strategies/bootstrap/StrategyBootstrap";

import {
  centralPaperIntakeService,
} from "./strategies/services/CentralPaperIntakeService";

import {
  centralPaperExecutionWorkerService,
} from "./strategies/services/CentralPaperExecutionWorkerService";

import {
  centralPaperOpenPositionLifecycleService,
} from "./strategies/services/CentralPaperOpenPositionLifecycleService";

import {
  centralPaperRecoveryLifecycleService,
} from "./recovery/services/CentralPaperRecoveryLifecycleService";

import {
  dynamicOpportunityDiscoveryRunnerService,
} from "./discovery/services/DynamicOpportunityDiscoveryRunnerService";

import derivativeMarketDataRoutes
  from "./derivatives/routes/derivativeMarketDataRoutes";

import derivativeEvidenceRoutes
  from "./derivatives/routes/derivativeEvidenceRoutes";

import {
  derivativeMarketDataService,
} from "./derivatives/services/DerivativeMarketDataService";

import {
  derivativeDepthService,
} from "./derivatives/services/DerivativeDepthService";

import {
  derivativeEvidenceRefreshCoordinator,
} from "./derivatives/services/DerivativeEvidenceRefreshCoordinator";

import {
  coinDCXProtectedRestOrderBookService,
} from "./exchanges/coindcx/CoinDCXProtectedRestOrderBookService";

import {
  derivativeAccountEvidenceService,
} from "./derivatives/services/DerivativeAccountEvidenceService";

import {
  derivativeFundingSettlementEvidenceService,
} from "./derivatives/services/DerivativeFundingSettlementEvidenceService";

import {
  statisticalHistoricalDataService,
} from "./strategies/statistical-arbitrage/StatisticalHistoricalDataService";

import {
  strategyAttributionAnalyticsService,
} from "./analytics/services/StrategyAttributionAnalyticsService";

import {
  websocketManager,
} from "./websocket/manager";

const app =
  express();

strategyReadModelService
  .setAttributionEvidenceSource(
    strategyAttributionAnalyticsService,
  );

const PORT =
  environment.port;

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

/*
 * V19 BUILD 10
 *
 * Read-only operator settings/configuration surface.
 */
app.use(
  "/api/operator-settings",
  operatorSettingsRoutes,
);

/*
 * CAT PRO V20.0 PHASE 1A
 *
 * Read-only strategy identity, runtime evidence,
 * and immutable signal read models.
 */
app.use(
  "/api/strategies",
  strategyRoutes,
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
  "/api/derivatives/markets",
  derivativeMarketDataRoutes,
);

app.use(
  "/api/derivatives",
  derivativeEvidenceRoutes,
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
  "/api/debug/candidates",
  candidateBoardRoutes,
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
  "/api/debug/diagnostics",
  diagnosticsRoutes,
);

app.use(
  "/api/arbitrage/pnl",
  arbitragePnLRoutes,
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
  "/api/analytics",
  analyticsRoutes,
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
  "/api/optimizer",
  optimizerRoutes,
);

app.use(
  "/api/ranking",
  rankingRoutes,
);

app.use(
  "/api/risk",
  riskRoutes,
);

app.use(
  "/api/portfolio",
  portfolioRoutes,
);

app.use(
  "/api/paper",
  paperTradingRouter,
);

app.use(
  "/api/paper/automated",
  automatedPaperTradingRoutes,
);

app.use(
  "/api/paper-trades",
  paperTradeRoutes,
);

app.use(
  "/api/system-health",
  systemHealthRoutes,
);

app.use(
  "/api/exchanges/fleet",
  exchangeFleetRoutes,
);

app.use(
  "/api/exchanges/paper-shadow-readiness",
  paperShadowReadinessRoutes,
);

app.use(
  "/api/exchanges/readiness-observations",
  readinessObservationRoutes,
);

app.use(
  "/api/execution/five-exchange-go-no-go",
  fiveExchangeGoNoGoRoutes,
);

app.use(
  "/api/execution/strategy-live-readiness",
  centralStrategyLiveReadinessRoutes,
);

/*
 * Version 15.0
 *
 * SHADOW automation scheduler.
 */
app.use(
  "/api/automation",
  automationRoutes,
);

/*
 * Version 17.0+
 *
 * Controlled LIVE framework.
 *
 * LIVE remains disabled unless explicit future
 * safety gates permit otherwise.
 */
app.use(
  "/api/automation/live-control",
  controlledLiveTradingRoutes,
);

/*
 * VERSION 17.5 BUILD 6
 *
 * Unified read-only Production Safety endpoint.
 *
 * This endpoint exposes consolidated safety
 * diagnostics only.
 *
 * It does NOT arm LIVE mode and does NOT submit
 * exchange orders.
 */
app.use(
  "/api/production-safety",
  productionSafetyDiagnosticsRoutes,
);

/*
 * Version 17.3
 *
 * Opportunity pipeline / freshness diagnostics.
 *
 * Diagnostic-only.
 */
app.use(
  "/api/automation/bottleneck",
  opportunityPipelineBottleneckRoutes,
);

const server =
  http.createServer(
    app,
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

      strategyAttributionService
        .start();

      dynamicOpportunityDiscoveryRunnerService
        .start();

      coinDCXProtectedRestOrderBookService
        .start();

      statisticalHistoricalDataService
        .start();

      derivativeEvidenceRefreshCoordinator
        .start();

      derivativeAccountEvidenceService
        .start();

      derivativeFundingSettlementEvidenceService
        .start();

      centralStrategyExecutionAdmissionService
        .start();

      centralPaperIntakeService
        .start();

      centralPaperExecutionWorkerService
        .start();

      centralPaperRecoveryLifecycleService
        .start();

      centralPaperOpenPositionLifecycleService
        .start();

      strategyOrchestrator
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

      fiveExchangeReadinessObservationService
        .start();

      executionMetricsSnapshotScheduler
        .start();

      tradeMonitorRunner
        .start();

      exchangeBalanceSynchronizationRunner
        .start();

      await exchangeClockSynchronizationRunner
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

      /*
       * Version 15.0
       *
       * Safe automation scheduler.
       *
       * Current stage remains SHADOW unless later
       * evidence and explicit controls permit more.
       */
      automationSchedulerService
        .start();

      void websocketManager
        .start()
        .catch(
          (
            error:
              unknown,
          ) => {
            console.error(
              "[WebSocketManager] Startup failed:",
              error,
            );
          },
        );
    } catch (
      error:
        unknown
    ) {
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

    /*
     * Stop producers/automation before network
     * connections and process termination.
     */
    automationSchedulerService
      .stop();

    centralPaperExecutionWorkerService
      .stop();

    centralPaperRecoveryLifecycleService
      .stop();

    centralPaperOpenPositionLifecycleService
      .stop();

    derivativeFundingSettlementEvidenceService
      .stop();

    centralPaperIntakeService
      .stop();

    centralStrategyExecutionAdmissionService
      .stop();

    strategyOrchestrator
      .stop();

    dynamicOpportunityDiscoveryRunnerService
      .stop();

    coinDCXProtectedRestOrderBookService
      .stop();

    statisticalHistoricalDataService
      .stop();

    derivativeEvidenceRefreshCoordinator
      .stop();

    derivativeMarketDataService.stop();
    derivativeDepthService.stop();

    derivativeAccountEvidenceService
      .stop();

    strategyAttributionService
      .stop();

    unoCoinFeeSynchronizationService
      .stop();

    unoCoinAuthenticatedReadVerificationService
      .stop();

    coinSwitchFeeSynchronizationService
      .stop();

    coinSwitchMarketRuleSynchronizationService
      .stop();

    fiveExchangeReadinessObservationService
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

    productionAlertHistoryService
      .stop();

    tradeMonitorRunner
      .stop();

    executionMetricsSnapshotScheduler
      .stop();

    try {
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
