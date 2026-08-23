import {
  Router,
} from "express";

import {
  aclaCapitalLoopManager,
  aclaShadowLifecycleService,
  centralStrategyExecutionAdmissionService,
  centralPaperExecutionQueueService,
  crossExchangeMarketMakingStrategyController,
  dynamicMarketMakingStrategyController,
  fundingRateArbitrageStrategyController,
  perpetualPerpetualArbitrageStrategyController,
  spotPerpetualBasisStrategyController,
  statisticalArbitrageStrategyController,
  triangularArbitrageStrategyController,
  strategyRuntimeOperatorConfiguration,
  strategyReadModelService,
} from "../bootstrap/StrategyBootstrap";

import type {
  StrategyReadModelService,
} from "../services/StrategyReadModelService";

import {
  crossExchangeMarketMakingPublicTradeTapeService,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingPublicTradeTapeService";

import {
  statisticalHistoricalDataService,
} from "../statistical-arbitrage/StatisticalHistoricalDataService";

import {
  statisticalWalkForwardValidationService,
} from "../statistical-arbitrage/StatisticalWalkForwardValidationService";

import {
  statisticalPairDiscoveryService,
} from "../statistical-arbitrage/StatisticalPairDiscoveryService";

import {
  statisticalPromotionLifecycleService,
} from "../statistical-arbitrage/StatisticalPromotionLifecycleService";

import {
  derivativeFeeEvidenceService,
} from "../../derivatives/services/DerivativeFeeEvidenceService";

import {
  derivativeAccountEvidenceService,
} from "../../derivatives/services/DerivativeAccountEvidenceService";

import {
  tradingAccountService,
} from "../../trading/account/TradingAccountService";

import {
  centralPaperSimulationJournalService,
} from "../services/CentralPaperSimulationJournalService";

import {
  centralPaperPositionLedgerService,
} from "../services/CentralPaperPositionLedgerService";

import {
  centralPaperExecutionWorkerService,
} from "../services/CentralPaperExecutionWorkerService";

import {
  centralPaperPositionAccountingService,
} from "../services/CentralPaperPositionAccountingService";

import {
  centralPaperIntakeService,
} from "../services/CentralPaperIntakeService";

import {
  centralPaperLifecycleReadModelService,
} from "../services/CentralPaperLifecycleReadModelService";

import {
  centralPaperLifecycleTraceService,
} from "../services/CentralPaperLifecycleTraceService";

import {
  centralPaperSoakAcceptanceService,
} from "../services/CentralPaperSoakAcceptanceService";

import {
  centralPaperOpenPositionLifecycleService,
} from "../services/CentralPaperOpenPositionLifecycleService";

import {
  centralPaperRuntimeEvidenceCollector,
} from "../services/CentralPaperRuntimeEvidenceCollector";

import {
  StatisticalPaperLifecycleObservabilityService,
} from "../services/StatisticalPaperLifecycleObservabilityService";

import {
  eightStrategyPaperReadinessService,
} from "../services/EightStrategyPaperReadinessService";

import {
  personalStrategyOneBotService,
} from "../services/PersonalStrategyOneBotService";

import {
  strategyOneTradeFlowReportService,
} from "../services/StrategyOneTradeFlowReportService";

import {
  strategyOneTradeIntelligenceService,
  type TradeIntelligenceWindowId,
} from "../services/StrategyOneTradeIntelligenceService";

import {
  personalBotRuntimeControlService,
} from "../services/PersonalBotRuntimeControlService";

import {
  strategyOneTinyLivePreArmService,
} from "../../execution/live/tiny-live/StrategyOneTinyLivePreArmService";

import {
  strategyOneTinyLiveAccountModeLeaseService,
} from "../../execution/live/tiny-live/StrategyOneTinyLiveAccountModeLeaseService";

import {
  TriangularPaperClosureObservabilityService,
} from "../triangular-arbitrage/TriangularPaperClosureObservabilityService";

import {
  SpotPerpetualBasisPaperClosureObservabilityService,
} from "../spot-perpetual-basis-arbitrage/SpotPerpetualBasisPaperClosureObservabilityService";

import {
  FundingRatePaperClosureObservabilityService,
} from "../funding-rate-arbitrage/FundingRatePaperClosureObservabilityService";

import {
  PerpetualPerpetualPaperClosureObservabilityService,
} from "../perpetual-perpetual-arbitrage/PerpetualPerpetualPaperClosureObservabilityService";

import {
  DynamicMarketMakingPaperClosureObservabilityService,
} from "../dynamic-market-making/DynamicMarketMakingPaperClosureObservabilityService";

export function createStrategyRoutes(
  readModelService:
    StrategyReadModelService =
      strategyReadModelService,
) {
  const router =
    Router();

  const statisticalPaperLifecycle = new StatisticalPaperLifecycleObservabilityService({
    getConfiguration: () => statisticalArbitrageStrategyController.getConfiguration(),
    getRuntime: (now) => statisticalArbitrageStrategyController.getRuntimeSnapshot(now),
    getEconomics: () => statisticalArbitrageStrategyController.getStatisticalSnapshot(),
    getDiscovery: () => statisticalPairDiscoveryService.getSnapshot(),
    getAccountEvidence: (now) => derivativeAccountEvidenceService.getSnapshot(now),
    getFeeEvidence: (now) => derivativeFeeEvidenceService.getSnapshot(now),
    getSignals: (now) => statisticalArbitrageStrategyController.getSignals(now).filter(
      (signal): signal is import("../models/StrategySignal").StatisticalArbitrageStrategySignal =>
        signal.kind === "STATISTICAL_ARBITRAGE_SHADOW_PAIR",
    ),
    getAdmissions: (now) => centralStrategyExecutionAdmissionService.getDiagnostics(now).recent.filter(
      (record) => record.strategyId === "statistical-arbitrage",
    ),
    getIntake: (now) => centralPaperIntakeService.getDiagnostics(now).recent.filter(
      (record) => record.strategyId === "statistical-arbitrage",
    ),
    getQueueRecords: (now) => centralPaperExecutionQueueService.getDiagnostics(now).recent,
    getQueue: (planId, now) => centralPaperExecutionQueueService.getByPlanId(planId, now),
    preview: (plan, now) => {
      const runtime = centralPaperRuntimeEvidenceCollector.collect(plan, now);
      return {runtime, admission: centralStrategyExecutionAdmissionService.evaluatePaperPlan(plan, runtime.evidence, now)};
    },
  });

  const triangularPaperClosure = new TriangularPaperClosureObservabilityService({
    getConfiguration: () => triangularArbitrageStrategyController.getConfiguration(),
    getRuntime: (now) => triangularArbitrageStrategyController.getRuntimeSnapshot(now),
    getSimulation: () => triangularArbitrageStrategyController.getSimulationSnapshot(),
    getLastEconomicallyEvaluableSimulation: () =>
      triangularArbitrageStrategyController.getLastEconomicallyEvaluableSimulationSnapshot(),
    getAdmissions: (now) => centralStrategyExecutionAdmissionService.getDiagnostics(now).recent,
    getIntake: (now) => centralPaperIntakeService.getDiagnostics(now).recent,
    getQueue: (now) => centralPaperExecutionQueueService.getDiagnostics(now).recent,
    getAclaCapital: (now) => aclaCapitalLoopManager.getReport(now),
    getAclaLifecycle: (now) => aclaShadowLifecycleService.getReport(now),
    getAclaPerformance: () => triangularArbitrageStrategyController.getPerformanceSnapshot(),
  });

  const spotPerpetualBasisPaperClosure =
    new SpotPerpetualBasisPaperClosureObservabilityService({
      getConfiguration: () => spotPerpetualBasisStrategyController.getConfiguration(),
      getRuntime: (now) => spotPerpetualBasisStrategyController.getRuntimeSnapshot(now),
      getEconomics: () => spotPerpetualBasisStrategyController.getEconomicsSnapshot(),
      getAccountEvidence: (now) => derivativeAccountEvidenceService.getSnapshot(now),
      getFeeEvidence: (now) => derivativeFeeEvidenceService.getSnapshot(now),
      getAdmissions: (now) => centralStrategyExecutionAdmissionService.getDiagnostics(now).recent,
      getIntake: (now) => centralPaperIntakeService.getDiagnostics(now).recent,
      getQueue: (now) => centralPaperExecutionQueueService.getDiagnostics(now).recent,
    });

  const fundingRatePaperClosure =
    new FundingRatePaperClosureObservabilityService({
      getConfiguration: () => fundingRateArbitrageStrategyController.getConfiguration(),
      getRuntime: (now) => fundingRateArbitrageStrategyController.getRuntimeSnapshot(now),
      getEconomics: () => fundingRateArbitrageStrategyController.getEconomicsSnapshot(),
      getAccountEvidence: (now) => derivativeAccountEvidenceService.getSnapshot(now),
      getFeeEvidence: (now) => derivativeFeeEvidenceService.getSnapshot(now),
      getAdmissions: (now) => centralStrategyExecutionAdmissionService.getDiagnostics(now).recent,
      getIntake: (now) => centralPaperIntakeService.getDiagnostics(now).recent,
      getQueue: (now) => centralPaperExecutionQueueService.getDiagnostics(now).recent,
    });

  const perpetualPerpetualPaperClosure =
    new PerpetualPerpetualPaperClosureObservabilityService({
      getConfiguration: () => perpetualPerpetualArbitrageStrategyController.getConfiguration(),
      getRuntime: (now) => perpetualPerpetualArbitrageStrategyController.getRuntimeSnapshot(now),
      getEconomics: () => perpetualPerpetualArbitrageStrategyController.getEconomicsSnapshot(),
      getAccountEvidence: (now) => derivativeAccountEvidenceService.getSnapshot(now),
      getFeeEvidence: (now) => derivativeFeeEvidenceService.getSnapshot(now),
      getAdmissions: (now) => centralStrategyExecutionAdmissionService.getDiagnostics(now).recent,
      getIntake: (now) => centralPaperIntakeService.getDiagnostics(now).recent,
      getQueue: (now) => centralPaperExecutionQueueService.getDiagnostics(now).recent,
    });

  const dynamicMarketMakingPaperClosure =
    new DynamicMarketMakingPaperClosureObservabilityService({
      getConfiguration: () => dynamicMarketMakingStrategyController.getConfiguration(),
      getRuntime: (now) => dynamicMarketMakingStrategyController.getRuntimeSnapshot(now),
      getSnapshot: () => dynamicMarketMakingStrategyController.getDynamicSnapshot(),
      getBalances: () => tradingAccountService.getExchangeBalances(),
      getAdmissions: (now) => centralStrategyExecutionAdmissionService.getDiagnostics(now).recent,
      getIntake: (now) => centralPaperIntakeService.getDiagnostics(now).recent,
      getQueue: (now) => centralPaperExecutionQueueService.getDiagnostics(now).recent,
    });

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

      response.json({
        success:
          true,

        data:
          readModelService
            .getAll(),
      });
    },
  );

  router.get(
    "/cross-exchange-market-making/public-trade-tape",
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
          crossExchangeMarketMakingPublicTradeTapeService
            .getDiagnostics(),
      });
    },
  );

  router.get(
    "/triangular-arbitrage/paper-closure",
    (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json({success: true, data: triangularPaperClosure.getReport()});
    },
  );

  router.get(
    "/spot-perpetual-basis-arbitrage/paper-closure",
    (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json({success: true, data: spotPerpetualBasisPaperClosure.getReport()});
    },
  );

  router.get(
    "/funding-rate-arbitrage/paper-closure",
    (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json({success: true, data: fundingRatePaperClosure.getReport()});
    },
  );

  router.get(
    "/perpetual-perpetual-arbitrage/paper-closure",
    (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json({success: true, data: perpetualPerpetualPaperClosure.getReport()});
    },
  );

  router.get(
    "/dynamic-market-making/paper-closure",
    (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json({success: true, data: dynamicMarketMakingPaperClosure.getReport()});
    },
  );

  router.get(
    "/statistical-arbitrage/research-evidence",
    (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      const pairs = statisticalHistoricalDataService.getPairs().map((pair) => {
        const history = statisticalHistoricalDataService.getHistory(pair.pairId, 5_000);
        const fee = derivativeFeeEvidenceService.get(pair.exchange);
        return {
          ...pair,
          sampleCount: history.length,
          costEvidenceStatus: fee ? "AVAILABLE" : "NO_DATA",
          regime: statisticalWalkForwardValidationService.monitorRegime(pair.pairId, history),
          walkForward: fee
            ? statisticalWalkForwardValidationService.validate(pair.pairId, history, {
                roundTripCostPercent: fee.takerPercent * 4,
              })
            : null,
          blocker: fee ? null : "Explicit derivative fee evidence is required before cost-aware walk-forward validation.",
        };
      });
      response.json({success: true, data: {
        generatedAt: Date.now(), version: "35.0", discovery: statisticalPairDiscoveryService.getSnapshot(),
        promotionLifecycle: statisticalPromotionLifecycleService.getDiagnostics(),
        history: statisticalHistoricalDataService.getDiagnostics(),
        pairs, safety: {researchReadOnly: true, costsRequired: true, livePromotionAuthorized: false,
          paperExecutionAllowed: false, liveExecutionAllowed: false, orderSubmissionAllowed: false},
      }});
    },
  );

  router.get(
    "/statistical-arbitrage/paper-lifecycle",
    (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json({success: true, data: statisticalPaperLifecycle.getReport()});
    },
  );

  router.get(
    "/execution-admission/diagnostics",
    (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json({success: true, data: centralStrategyExecutionAdmissionService.getDiagnostics()});
    },
  );

  router.get(
    "/central-paper-queue/diagnostics",
    (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json({success: true, data: centralPaperExecutionQueueService.getDiagnostics()});
    },
  );

  router.get(
    "/central-paper-journal/diagnostics",
    (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json({success: true, data: centralPaperSimulationJournalService.getDiagnostics()});
    },
  );

  router.get(
    "/central-paper-positions/diagnostics",
    (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json({success: true, data: centralPaperPositionLedgerService.getDiagnostics()});
    },
  );

  router.get(
    "/central-paper-worker/diagnostics",
    (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json({success: true, data: centralPaperExecutionWorkerService.getDiagnostics()});
    },
  );

  router.get(
    "/operator-configuration/diagnostics",
    (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json({success: true, data: strategyRuntimeOperatorConfiguration});
    },
  );

  router.get(
    "/central-paper-accounting/diagnostics",
    (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json({success: true, data: centralPaperPositionAccountingService.getDiagnostics()});
    },
  );

  router.get(
    "/central-paper-intake/diagnostics",
    (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json({success: true, data: centralPaperIntakeService.getDiagnostics()});
    },
  );

  router.get(
    "/central-paper-lifecycle",
    (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json({success: true, data: centralPaperLifecycleReadModelService.getSnapshot()});
    },
  );

  router.get(
    "/central-paper-lifecycle-trace",
    (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json({success: true, data: centralPaperLifecycleTraceService.getReport()});
    },
  );

  router.get(
    "/cross-exchange-market-making/inventory-feasibility",
    (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json({
        success: true,
        data: crossExchangeMarketMakingStrategyController.getInventoryFeasibilitySnapshot(),
      });
    },
  );

  router.get(
    "/cross-exchange-market-making/venue-routing",
    (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json({
        success: true,
        data: crossExchangeMarketMakingStrategyController.getVenueRoutingSnapshot(),
      });
    },
  );

  router.get(
    "/central-paper-soak-acceptance",
    (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json({success: true, data: centralPaperSoakAcceptanceService.getReport()});
    },
  );

  router.get(
    "/eight-strategy-paper-readiness",
    (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json({success: true, data: eightStrategyPaperReadinessService.getReport()});
    },
  );

  router.get(
    "/personal-bot/performance-summary",
    (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json({
        success: true,
        data: personalStrategyOneBotService.getPerformanceSummary(),
      });
    },
  );

  router.get(
    "/personal-bot",
    (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json({success: true, data: personalStrategyOneBotService.getReport()});
    },
  );

  router.get(
    "/strategy-one/trade-flow",
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
          strategyOneTradeFlowReportService
            .getReport(),
      });
    },
  );

  router.get(
    "/strategy-one/trade-intelligence",
    (
      request,
      response,
    ) => {
      response.setHeader(
        "Cache-Control",
        "private, max-age=15, stale-while-revalidate=15",
      );

      if (
        request.query.mode !== undefined &&
        request.query.mode !== "PAPER"
      ) {
        return response.status(422).json({
          success: false,
          message:
            "LIVE Trade Intelligence evidence is unavailable. PAPER and LIVE evidence are never mixed.",
        });
      }

      try {
        const window =
          typeof request.query.window === "string"
            ? request.query.window as TradeIntelligenceWindowId
            : undefined;
        const startAt =
          parseOptionalTimestamp(request.query.startAt);
        const endAt =
          parseOptionalTimestamp(request.query.endAt);

        return response.json({
          success: true,
          data: strategyOneTradeIntelligenceService.getReport({
            window,
            startAt,
            endAt,
          }),
        });
      } catch (error: unknown) {
        return response.status(400).json({
          success: false,
          message:
            error instanceof Error
              ? error.message
              : "Trade Intelligence request is invalid.",
        });
      }
    },
  );

  router.post(
    "/personal-bot/control",
    (request, response) => {
      response.setHeader("Cache-Control", "no-store");

      if (typeof request.body?.enabled !== "boolean") {
        return response.status(400).json({
          success: false,
          message: "Personal bot control requires a boolean enabled value.",
        });
      }

      if (request.body.enabled) {
        const account = tradingAccountService.getAccount();
        const tinyLive = strategyOneTinyLivePreArmService.getDiagnostics();
        const accountModeLease =
          strategyOneTinyLiveAccountModeLeaseService.getDiagnostics();

        if (
          account.mode !== "PAPER" ||
          tinyLive.activeArm !== null ||
          accountModeLease.activeLease !== null
        ) {
          return response.status(409).json({
            success: false,
            message: "PAPER automation can start only in PAPER account mode with no active Tiny-LIVE arm or lease.",
          });
        }
      }

      try {
        const control = personalBotRuntimeControlService.setEnabled(request.body.enabled);
        return response.json({
          success: true,
          data: control,
        });
      } catch (error: unknown) {
        return response.status(500).json({
          success: false,
          message: error instanceof Error
            ? error.message
            : "Personal bot control update failed.",
        });
      }
    },
  );

  router.get(
    "/central-paper-position-lifecycle",
    (_request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json({success: true, data: centralPaperOpenPositionLifecycleService.getDiagnostics()});
    },
  );

  router.get(
    "/:id",
    (
      request,
      response,
    ) => {
      response.setHeader(
        "Cache-Control",
        "no-store",
      );

      const strategy =
        readModelService
          .getById(
            request.params.id,
          );

      if (
        !strategy
      ) {
        response
          .status(
            404,
          )
          .json({
            success:
              false,

            evidenceStatus:
              "NO_DATA",

            message:
              "Strategy not found.",
          });

        return;
      }

      response.json({
        success:
          true,

        data:
          strategy,
      });
    },
  );

  return router;
}

function parseOptionalTimestamp(
  value: unknown,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(
      "Trade Intelligence timestamps must be positive epoch-millisecond integers.",
    );
  }

  const timestamp = Number(value);

  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new Error(
      "Trade Intelligence timestamps must be positive epoch-millisecond integers.",
    );
  }

  return timestamp;
}

export default createStrategyRoutes();
