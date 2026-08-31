import {
  spawnSync,
} from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import {
  tmpdir,
} from "node:os";
import {
  join,
  resolve,
  sep,
} from "node:path";

import {
  parse as parseDotenv,
} from "dotenv";

const DETERMINISTIC_TESTS = [
  "agents/sakhondra/tests/testAgentSakhondraService.js",
  "arbitrage/execution/tests/testArbitrageExecutionPreflight.js",
  "arbitrage/execution/tests/testStrategyOneOrderTimeSafety.js",
  "arbitrage/execution/tests/testStrategyOneExecutionTimingEvidence.js",
  "arbitrage/execution/tests/testStrategyOnePilotEquivalentPaperEvidence.js",
  "arbitrage/execution/tests/testStrategyOneTimingCalibration.js",
  "arbitrage/execution/tests/testStrategyOneTinyLiveBasketPolicy.js",
  "arbitrage/tests/testArbitragePnLPersistence.js",
  "arbitrage/tests/testArbitragePnLService.js",
  "arbitrage/tests/testOpportunityEventAdmission.js",
  "arbitrage/tests/testOpportunityIncrementalRefresh.js",
  "arbitrage/tests/testOpportunityRejectionLogVolume.js",
  "analytics/tests/testStrategyOneForensicsBaseline.js",
  "arbitrage/tests/testUnoCoinFeeEvidenceService.js",
  "automation/tests/testAutomationOpportunitySnapshotHandoff.js",
  "automation/tests/testAutomationEvidenceRetention.js",
  "automation/tests/testCandidateExecutableQualification.js",
  "automation/tests/testCandidateEvidenceBoundedPersistence.js",
  "automation/tests/testPaperTradingReadinessService.js",
  "workflows/cross-exchange-arbitrage/tests/testUnifiedAutomatedExecutionOrchestrator.js",
  "workflows/cross-exchange-arbitrage/tests/testStrategyOnePaperRuntimeAcceptance.js",
  "core/persistence/tests/testJsonlArchiveStore.js",
  "core/persistence/tests/testJsonlTailReader.js",
  "discovery/tests/testDynamicOpportunityDiscoveryService.js",
  "derivatives/tests/testDerivativeMarketDataService.js",
  "derivatives/tests/testDerivativeVenueExpansion.js",
  "derivatives/tests/testDerivativeEvidenceRefreshCoordinator.js",
  "derivatives/tests/testDerivativeAccountEvidenceService.js",
  "derivatives/tests/testBinanceUsdMCredentialBoundary.js",
  "derivatives/tests/testDerivativeFundingSettlementEvidenceService.js",
  "exchanges/coinswitch/tests/testCoinSwitchAuthenticatedFeeRead.js",
  "exchanges/coinswitch/tests/testCoinSwitchDepthApi.js",
  "exchanges/coinswitch/tests/testCoinSwitchPublicIntegration.js",
  "exchanges/binance/api/testBinanceTimestampResynchronization.js",
  "exchanges/binance/api/testBinanceRateLimitCooldown.js",
  "exchanges/coindcx/tests/testCoinDCXCrossedBookIntegrity.js",
  "exchanges/coindcx/tests/testCoinDCXSharedMarketSelection.js",
  "exchanges/coindcx/tests/testCoinDCXProtectedRestOrderBookService.js",
  "exchanges/tests/testBinanceCapabilityBulkSynchronization.js",
  "exchanges/tests/testBybitMarketUniverseSelection.js",
  "exchanges/tests/testSpotMarketUniverseSelection.js",
  "exchanges/tests/testBybitMarketRulesIntegration.js",
  "exchanges/tests/testExchangeFleetRegistry.js",
  "exchanges/tests/testExchangeManagerConnectionRetry.js",
  "exchanges/tests/testFiveExchangePaperShadowSafety.js",
  "exchanges/tests/testFiveExchangeBalanceRead.js",
  "exchanges/tests/testFiveExchangeReadinessObservationService.js",
  "exchanges/unocoin/tests/testUnoCoinAuthenticatedReadVerification.js",
  "exchanges/unocoin/tests/testUnoCoinOrderBookFallback.js",
  "exchanges/unocoin/tests/testUnoCoinPublicIntegration.js",
  "exchanges/unocoin/tests/testUnoCoinStaleConnectionRecovery.js",
  "exchanges/zebpay/tests/testZebPayObservationIntegration.js",
  "exchanges/zebpay/tests/testZebPayAuthenticatedReadIntegration.js",
  "exchanges/zebpay/tests/testZebPayExecutionIntegration.js",
  "execution/capabilities/tests/testExchangeCapabilityServiceRefresh.js",
  "execution/live/tests/testBybitAuthenticatedReadVerification.js",
  "execution/live/tests/testBybitExecutionAdapterFoundation.js",
  "execution/live/tests/testBinancePostOnlyOrderContract.js",
  "execution/live/tests/testCoinSwitchExecutionAdapterFoundation.js",
  "execution/live/tests/testCoinDCXGtcExecutionContract.js",
  "execution/live/tests/testLivePerformanceBoundedCheckpoint.js",
  "execution/live/tests/testUnoCoinExecutionAdapterFoundation.js",
  "execution/live/tests/testExecutionAdapterVerificationService.js",
  "execution/live/tests/testExecutionHealthService.js",
  "execution/live/tests/testExchangeClockSynchronizationRunner.js",
  "execution/live/tests/testFiveExchangeGoNoGoService.js",
  "execution/live/tests/testLiveExecutionAdapterRegistration.js",
  "execution/live/tests/testSuccessfulDemoSimulationIsolation.js",
  "execution/live/tests/testTinyLiveEvidencePackageService.js",
  "execution/live/tests/testTinyLiveReadinessClosureService.js",
  "execution/live/tests/testTinyLiveRouteAlertScope.js",
  "execution/live/tests/testStrategyOneApiPermissionBoundaryService.js",
  "execution/live/tests/testStrategyOnePilotPreflightService.js",
  "execution/live/tests/testCentralStrategyLiveReadinessService.js",
  "execution/live/tests/testCentralSpotMakerLifecycleService.js",
  "execution/live/tests/testCentralLiveExecutionAdmissionQueue.js",
  "execution/live/tests/testSequentialThreeLegLiveLifecycleHandler.js",
  "execution/live/tests/testTwoSidedPassiveMakerLiveLifecycleHandler.js",
  "execution/live/tests/testPassiveMakerThenHedgeLiveLifecycleHandler.js",
  "execution/live/tests/testDerivativeOrderContracts.js",
  "execution/live/tests/testParallelDerivativeLiveLifecycleHandler.js",
  "execution/live/tests/testOrderFillFeeEvidenceService.js",
  "execution/live/tests/testAuthenticatedPrivateFillEventOwner.js",
  "execution/live/tests/testAuthenticatedPrivateFillStreamService.js",
  "execution/live/tests/testCoinDCXAuthenticatedPrivateFillStreamService.js",
  "execution/live/tests/testOrderLifecycleNonLiveEvidenceReclassification.js",
  "execution/live/tests/testExecutionReconciliationBoundedHistoryRace.js",
  "execution/live/tests/testCentralLiveOrderExecutionGateway.js",
  "execution/live/tests/testStrategyOneLiveVenueContractRegistry.js",
  "execution/live/tests/testStrategyOneTwoLegLiveExecutionService.js",
  "execution/live/tests/testStrategyOneTwoLegRestartRecovery.js",
  "execution/live/tests/testStrategyOneResidualRecoveryAssistant.js",
  "execution/live/tests/testStrategyOneResidualRecoveryExecution.js",
  "execution/live/tests/testStrategyOneTinyLiveActionAuthority.js",
  "execution/live/tests/testStrategyOneTinyLiveAccountModeLease.js",
  "execution/live/tests/testStrategyOneTinyLiveEmergencyStopRecovery.js",
  "execution/live/tests/testStrategyOneTinyLiveBasketPreArm.js",
  "execution/live/tests/testStrategyOneTinyLiveReadinessWaterfall.js",
  "execution/live/tests/testStrategyOneActionTimeBookRefresh.js",
  "execution/live/tests/testCentralLiveLifecycleEvidenceStore.js",
  "execution/live/tests/testCentralLiveRuntimeEvidenceCollector.js",
  "execution/live/tests/testCentralLiveExecutionSystem.js",
  "execution/live/tests/testCentralLiveProductionLifecyclePorts.js",
  "recovery/tests/testSharedRecoveryIntentService.js",
  "recovery/tests/testCentralLiveSharedRecoveryBridge.js",
  "risk/tests/testRiskEngineAuthoritativeDailyLimits.js",
  "strategies/tests/testCrossExchangeArbitrageStrategyController.js",
  "strategies/tests/testCentralStrategyExecutionAdmission.js",
  "strategies/tests/testCentralStrategyExecutionPlanCompiler.js",
  "strategies/tests/testCentralPaperPlanAdmission.js",
  "strategies/tests/testCentralPaperExecutionQueue.js",
  "strategies/tests/testCentralMultiLegPaperSimulator.js",
  "recovery/tests/testCentralPaperSharedRecoveryBridge.js",
  "recovery/tests/testCentralPaperRecoveryLifecycle.js",
  "strategies/tests/testCentralPaperSimulationJournal.js",
  "strategies/tests/testCentralPaperPositionLedger.js",
  "strategies/tests/testCentralPaperExecutionWorker.js",
  "strategies/tests/testCentralPaperPositionClose.js",
  "strategies/tests/testCentralPaperPositionAccounting.js",
  "strategies/tests/testStrategyRuntimeOperatorConfiguration.js",
  "strategies/tests/testStrategyBlockerDiagnostics.js",
  "strategies/tests/testCentralPaperRuntimeEvidenceCollector.js",
  "strategies/tests/testCentralPaperCapitalValuation.js",
  "strategies/tests/testCentralPaperCapitalAllocation.js",
  "strategies/tests/testCentralPaperIntake.js",
  "strategies/tests/testCentralPaperSimulationEvidenceProvider.js",
  "strategies/tests/testCentralPaperLifecycleReadModel.js",
  "strategies/tests/testCentralPaperSoakAcceptance.js",
  "strategies/tests/testCentralPaperLifecycleTrace.js",
  "strategies/tests/testEightStrategyPaperReadiness.js",
  "strategies/tests/testEightStrategyBlockerConvergence.js",
  "strategies/tests/testTriangularPaperClosureObservability.js",
  "strategies/tests/testSpotPerpetualBasisPaperClosureObservability.js",
  "strategies/tests/testFundingRatePaperClosureObservability.js",
  "strategies/tests/testPerpetualPerpetualPaperClosureObservability.js",
  "strategies/tests/testDynamicMarketMakingPaperClosureObservability.js",
  "strategies/tests/testCentralPaperTriangularCycleAccounting.js",
  "strategies/tests/testCentralPaperFundingRateLifecycle.js",
  "strategies/tests/testCentralPaperPerpetualPerpetualLifecycle.js",
  "strategies/tests/testCentralPaperDynamicMarketMakingLifecycle.js",
  "strategies/tests/testCentralPaperStatisticalArbitrageLifecycle.js",
  "strategies/tests/testCentralPaperExitEvidenceProvider.js",
  "strategies/tests/testCentralPaperOpenPositionLifecycle.js",
  "strategies/tests/testCrossExchangeMarketMakingFoundation.js",
  "strategies/tests/testCrossExchangeMarketMakingFillAndHedge.js",
  "strategies/tests/testCrossExchangeMarketMakingLifecycle.js",
  "strategies/tests/testCrossExchangeMarketMakingPricing.js",
  "strategies/tests/testCrossExchangeMarketMakingInventoryRouteSelector.js",
  "strategies/tests/testCrossExchangeMarketMakingVenueRouteSelector.js",
  "strategies/tests/testPersonalStrategyOneBotService.js",
  "strategies/tests/testStrategyOneCapitalPlacementService.js",
  "strategies/tests/testStrategyOneTradeFlowReportService.js",
  "strategies/tests/testStrategyOneTradeIntelligenceService.js",
  "strategies/tests/testPersonalOpportunityConversionService.js",
  "strategies/tests/testPersonalBotRuntimeControl.js",
  "strategies/tests/testCrossExchangeMarketMakingQueueAwarePartialFill.js",
  "strategies/tests/testCrossExchangeMarketMakingShadowAnalytics.js",
  "strategies/tests/testHedgeInventoryBasisRisk.js",
  "strategies/tests/testHedgeInventoryCapitalReservation.js",
  "strategies/tests/testHedgeInventoryIntentProposal.js",
  "strategies/tests/testHedgeInventoryIntentPersistence.js",
  "strategies/tests/testHedgeInventoryIntentLifecycle.js",
  "strategies/tests/testHedgeInventoryIntentLastLook.js",
  "strategies/tests/testHedgeInventoryShadowExecutionPlan.js",
  "strategies/tests/testHedgeInventoryShadowFillSimulation.js",
  "strategies/tests/testHedgeInventoryResidualReconciliation.js",
  "strategies/tests/testHedgeInventoryShadowRecoveryProposal.js",
  "strategies/tests/testHedgeInventoryRecoveryProposalLifecycle.js",
  "strategies/tests/testHedgeInventoryShadowRecoveryActionHandoff.js",
  "strategies/tests/testHedgeInventoryRiskApproval.js",
  "strategies/tests/testHedgeInventoryExposureAssessment.js",
  "strategies/tests/testHedgeInventoryManagementFoundation.js",
  "strategies/tests/testHedgeInventoryMarketRules.js",
  "strategies/tests/testHedgeInventoryPostRuleEconomics.js",
  "strategies/tests/testHedgeInventoryRouteEconomics.js",
  "strategies/tests/testHedgeInventoryShadowTargets.js",
  "strategies/tests/testStrategyAttributionFoundation.js",
  "strategies/tests/testStrategyIntentService.js",
  "strategies/tests/testStrategyPerformanceAnalytics.js",
  "strategies/tests/testStrategyRegistry.js",
  "strategies/tests/testActualStrategyArchitectureContract.js",
  "strategies/tests/testStrategySafetyIsolation.js",
  "strategies/tests/testDynamicMarketMakingFoundation.js",
  "strategies/tests/testFundingRateArbitrageFoundation.js",
  "strategies/tests/testPerpetualPerpetualArbitrageFoundation.js",
  "strategies/tests/testSpotPerpetualBasisFoundation.js",
  "strategies/tests/testStatisticalArbitrageFoundation.js",
  "strategies/tests/testStatisticalHistoricalDataService.js",
  "strategies/tests/testStatisticalWalkForwardValidation.js",
  "strategies/tests/testStatisticalPairDiscovery.js",
  "strategies/tests/testStatisticalPromotionLifecycle.js",
  "strategies/tests/testStatisticalPaperLifecycleObservability.js",
  "strategies/tests/testStatisticalArbitragePaperClosureObservability.js",
  "strategies/tests/testTriangularArbitrageFoundation.js",
  "strategies/tests/testAclaCapitalLoopManager.js",
  "strategies/tests/testAclaShadowLifecycle.js",
  "strategies/tests/testAclaDepthQualification.js",
  "trading/capital/tests/testPaperCapitalConfigurationService.js",
  "trading/capital/tests/testAtomicExchangeAssetReservation.js",
  "trading/execution/tests/testPaperTwoLegExecutionLifecycle.js",
  "trading/execution/tests/testPaperExecutionRestartSafeAccounting.js",
  "trading/execution/tests/testCrossExchangeExecutableQuantityNormalizer.js",
  "trading/execution/tests/testStrategyOneFundedRouteService.js",
  "trading/policy/tests/testStrategyOneExecutionPolicyService.js",
  "trading/analysis/tests/testCrossVenuePriceCredibility.js",
  "trading/account/tests/testTradingAccountOperatorControls.js",
  "trading/account/tests/testExchangeBalanceSynchronizationIsolation.js",
  "portfolio/tests/testPortfolioCredibilityAdjustedSummary.js",
  "rebalancing/tests/testNormalizedInventorySnapshotService.js",
  "rebalancing/tests/testCapitalAllocationAndImbalanceService.js",
  "rebalancing/tests/testInventoryRebalancingScoreService.js",
  "rebalancing/tests/testRebalancingDecisionEngine.js",
  "trading/services/tests/testPostGuardProfitValidationLedger.js",
  "trading/services/tests/testPaperTradeCursorPagination.js",
] as const;

const EXECUTION_CONFIRMATION_VARIABLES = [
  "ARBITRAGE_LIVE_EXECUTION_CONFIRMATION",
  "AUTOMATED_PAPER_TRADING_CONFIRMATION",
  "BINANCE_LIVE_ORDER_CONFIRM",
  "COINDCX_LIVE_ORDER_CONFIRM",
  "LIVE_EXECUTION_CONFIRMATION",
  "LIVE_TRADING_CONFIRMATION",
  "TINY_LIVE_CONFIRMATION",
] as const;

function main(): void {
  const compiledRoot =
    resolve(
      __dirname,
      "..",
    );

  const dotenvPath =
    resolve(
      process.cwd(),
      ".env",
    );

  const fileEnvironment =
    existsSync(
      dotenvPath,
    )
      ? parseDotenv(
          readFileSync(
            dotenvPath,
          ),
        )
      : {};

  const environment = {
    ...fileEnvironment,
    ...process.env,
  };

  for (
    const variable
    of EXECUTION_CONFIRMATION_VARIABLES
  ) {
    delete environment[
      variable
    ];
  }

  let passed =
    0;

  for (
    const relativeTestPath
    of DETERMINISTIC_TESTS
  ) {
    const absoluteTestPath =
      resolve(
        compiledRoot,
        relativeTestPath,
      );

    console.log(
      `\n[Deterministic Test] ${relativeTestPath}`,
    );

    const temporaryRoot =
      resolve(
        tmpdir(),
      );

    const testWorkingDirectory =
      resolve(
        mkdtempSync(
          join(
            temporaryRoot,
            "cat-pro-deterministic-",
          ),
        ),
      );

    if (
      !testWorkingDirectory.startsWith(
        `${temporaryRoot}${sep}`,
      )
    ) {
      throw new Error(
        "Deterministic test working directory escaped the system temporary directory.",
      );
    }

    let result:
      ReturnType<typeof spawnSync>;

    try {
      result =
        spawnSync(
          process.execPath,
          [
            absoluteTestPath,
          ],
          {
            cwd:
              testWorkingDirectory,
            env:
              environment,
            stdio:
              "inherit",
            shell:
              false,
            windowsHide:
              true,
          },
        );
    } finally {
      rmSync(
        testWorkingDirectory,
        {
          recursive:
            true,
          force:
            true,
        },
      );
    }

    if (
      result.error
    ) {
      throw result.error;
    }

    if (
      result.status !==
      0
    ) {
      throw new Error(
        `Deterministic test failed with exit code ${result.status ?? "unknown"}: ${relativeTestPath}`,
      );
    }

    passed +=
      1;
  }

  console.log(
    `\nCAT PRO deterministic suite passed: ${passed}/${DETERMINISTIC_TESTS.length}.`,
  );

  console.log(
    "Real exchange API and confirmation-sensitive order tests were not included.",
  );
}

try {
  main();
} catch (
  error:
    unknown
) {
  console.error(
    error instanceof Error
      ? error.message
      : error,
  );

  process.exitCode =
    1;
}
