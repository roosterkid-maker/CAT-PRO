import assert
  from "node:assert/strict";

import {
  readFileSync,
  readdirSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

import type {
  ArbitrageOpportunity,
} from "../../arbitrage/models/ArbitrageOpportunity";

import type {
  OpportunitySnapshot,
  OpportunitySnapshotListener,
} from "../../arbitrage/services/OpportunityService";

import {
  liveExecutionCoordinator,
} from "../../execution/live/coordinator/LiveExecutionCoordinator";

import {
  orderLifecycleManager,
} from "../../execution/live/lifecycle/OrderLifecycleManager";

import {
  liveExecutionService,
} from "../../execution/live/LiveExecutionService";

import {
  executionMetricsService,
} from "../../execution/live/metrics/ExecutionMetricsService";

import {
  executionRecoveryEngine,
} from "../../execution/live/recovery/ExecutionRecoveryEngine";

import {
  executionSettlementService,
} from "../../execution/live/settlement/ExecutionSettlementService";

import {
  capitalReservationService,
} from "../../trading/capital/CapitalReservationService";

import {
  paperTradingService,
} from "../../trading/services/PaperTradingService";

import {
  CrossExchangeArbitrageStrategyController,
} from "../cross-exchange-arbitrage/CrossExchangeArbitrageStrategyController";

import type {
  CrossExchangeOpportunitySnapshotSource,
} from "../cross-exchange-arbitrage/CrossExchangeArbitrageStrategyController";

import {
  CrossExchangeMarketMakingStrategyController,
} from "../cross-exchange-market-making/CrossExchangeMarketMakingStrategyController";

import {
  HedgeInventoryManagementStrategyController,
} from "../hedge-inventory-management/HedgeInventoryManagementStrategyController";

import type {
  StrategyIntent,
} from "../models/StrategyIntent";

import {
  StrategyOrchestrator,
} from "../services/StrategyOrchestrator";

import {
  StrategyRegistry,
} from "../services/StrategyRegistry";

class TestOpportunitySource
implements CrossExchangeOpportunitySnapshotSource {
  private listener:
    OpportunitySnapshotListener | null =
    null;

  getLastOpportunitySnapshot():
    OpportunitySnapshot | null {
    return null;
  }

  subscribeToOpportunitySnapshots(
    listener:
      OpportunitySnapshotListener,
  ): () => void {
    this.listener =
      listener;

    return () => {
      if (
        this.listener ===
        listener
      ) {
        this.listener =
          null;
      }
    };
  }

  emit(
    snapshot:
      OpportunitySnapshot,
  ): void {
    this.listener?.(
      structuredClone(
        snapshot,
      ),
    );
  }
}

function createOpportunity(
  timestamp:
    number,
): ArbitrageOpportunity {
  return {
    id:
      "safety-opportunity",
    pair: {
      market:
        "BTC-USDT",
      buy: {
        exchange:
          "binance",
        market:
          "BTC-USDT",
        lastPrice:
          100,
        bestBidPrice:
          99,
        bestBidQty:
          10,
        bestAskPrice:
          100,
        bestAskQty:
          10,
        spread:
          1,
        timestamp,
        source:
          "orderBook",
        executable:
          true,
      },
      sell: {
        exchange:
          "coindcx",
        market:
          "BTC-USDT",
        lastPrice:
          102,
        bestBidPrice:
          102,
        bestBidQty:
          10,
        bestAskPrice:
          103,
        bestAskQty:
          10,
        spread:
          1,
        timestamp,
        source:
          "orderBook",
        executable:
          true,
      },
    },
    buyPrice:
      100,
    sellPrice:
      102,
    buyAvailableQty:
      10,
    sellAvailableQty:
      10,
    requiredQty:
      1,
    availableExecutableQty:
      10,
    executableQty:
      1,
    liquidityScore:
      100,
    enoughLiquidity:
      true,
    freshnessScore:
      100,
    feeScore:
      100,
    spreadScore:
      100,
    decision:
      "EXECUTE",
    analysisSummary:
      [],
    rawSpread:
      2,
    rawSpreadPercent:
      2,
    estimatedFees:
      0.2,
    netProfit:
      1.8,
    netProfitPercent:
      1.8,
    usedLastPriceFallback:
      false,
    quotesAreFresh:
      true,
    score:
      100,
    timestamp,
  };
}

function getSafetyState() {
  const reservations =
    capitalReservationService
      .getDiagnostics();

  const sessions =
    liveExecutionCoordinator
      .getDiagnostics();

  const orders =
    orderLifecycleManager
      .getDiagnostics();

  const settlements =
    executionSettlementService
      .getDiagnostics();

  const recovery =
    executionRecoveryEngine
      .getDiagnostics();

  const metrics =
    executionMetricsService
      .getReport();

  return {
    paperTrades:
      paperTradingService
        .getTrades()
        .length,
    activeReservations:
      reservations
        .activeReservations,
    totalReservationsCreated:
      reservations.totalCreated,
    activeSessions:
      sessions.activeSessions,
    totalSessionsPrepared:
      sessions.totalPrepared,
    totalOrders:
      orders.totalOrders,
    totalSettlements:
      settlements.totalSettlements,
    recoveryIncidents:
      recovery.incidents.length,
    totalExecutions:
      metrics.totalExecutions,
  };
}

function assertForbiddenImportsAbsent():
  void {
  const sourceRoot =
    resolve(
      __dirname,
      "..",
      "..",
      "..",
      "src",
      "strategies",
    );

  const implementationFiles =
    collectTypeScriptFiles(
      sourceRoot,
    ).filter(
      (filePath) =>
        !filePath.includes(
          `${resolve(sourceRoot, "tests")}`,
        ),
    );

  const forbiddenImportFragments = [
    "LiveExecutionService",
    "AutomatedPaperTradingService",
    "PaperTradingService",
    "CapitalReservationService",
    "LiveExecutionCoordinator",
    "TradingExecutionCoordinator",
    "ExecutionModeRouter",
    "ArbitrageExecutionCoordinator",
    "/adapters/",
    "/modules/risk/",
    "/modules/execution/",
    "/modules/capital/",
    "/trading/intelligence/RiskEngine",
    "/risk/services/RiskEngine",
    "/reconciliation/",
    "/settlement/",
    "/recovery/",
  ];

  for (
    const filePath
    of implementationFiles
  ) {
    const source =
      readFileSync(
        filePath,
        "utf8",
      );

    const importSpecifiers =
      [
        ...source.matchAll(
          /from\s+["']([^"']+)["']/g,
        ),
      ].map(
        (match) =>
          match[1] ??
          "",
      );

    for (
      const importSpecifier
      of importSpecifiers
    ) {
      const isCanonicalCentralPaperRecoveryBridge =
        filePath.endsWith(
          "CentralPaperExecutionWorkerService.ts",
        ) &&
        importSpecifier ===
          "../../recovery/adapters/CentralPaperSharedRecoveryBridgeService";

      const isCanonicalCentralPaperRiskGate =
        filePath.endsWith(
          "CentralPaperRuntimeEvidenceCollector.ts",
        ) &&
        importSpecifier ===
          "../../risk/services/RiskEngine";

      const isCanonicalCentralPaperRecoveryReadModel =
        filePath.endsWith(
          "CentralPaperLifecycleReadModelService.ts",
        ) &&
        importSpecifier ===
          "../../recovery/services/CentralPaperRecoveryLifecycleService";

      if (
        isCanonicalCentralPaperRecoveryBridge ||
        isCanonicalCentralPaperRiskGate ||
        isCanonicalCentralPaperRecoveryReadModel
      ) {
        continue;
      }

      for (
        const forbidden
        of forbiddenImportFragments
      ) {
        assert.equal(
          importSpecifier.includes(
            forbidden,
          ),
          false,
          `Forbidden strategy import ${importSpecifier} found in ${filePath}.`,
        );
      }
    }
  }
}

function collectTypeScriptFiles(
  directory:
    string,
): string[] {
  const files:
    string[] =
    [];

  for (
    const entry
    of readdirSync(
      directory,
      {
        withFileTypes:
          true,
      },
    )
  ) {
    const entryPath =
      resolve(
        directory,
        entry.name,
      );

    if (
      entry.isDirectory()
    ) {
      files.push(
        ...collectTypeScriptFiles(
          entryPath,
        ),
      );
    } else if (
      entry.isFile() &&
      entry.name.endsWith(
        ".ts",
      )
    ) {
      files.push(
        entryPath,
      );
    }
  }

  return files;
}

function main():
  void {
  assertForbiddenImportsAbsent();

  const before =
    getSafetyState();

  const source =
    new TestOpportunitySource();

  const controller =
    new CrossExchangeArbitrageStrategyController(
      {},
      source,
    );

  const registry =
    new StrategyRegistry();

  registry.register(
    controller,
  );

  const xemmController =
    new CrossExchangeMarketMakingStrategyController();

  registry.register(
    xemmController,
  );

  const hedgeInventoryController =
    new HedgeInventoryManagementStrategyController();

  registry.register(
    hedgeInventoryController,
  );

  const orchestrator =
    new StrategyOrchestrator(
      registry,
    );

  const forwardedSignals:
    string[] =
    [];

  orchestrator.subscribeToSignals(
    (signal) => {
      forwardedSignals.push(
        signal.id,
      );
    },
  );

  orchestrator.start();
  orchestrator.start();

  const generatedAt =
    Date.now();

  source.emit({
    generatedAt,
    opportunities: [
      createOpportunity(
        generatedAt,
      ),
    ],
  });

  const signal =
    controller.getSignals(
      generatedAt +
      1,
    )[0];

  assert.ok(
    signal,
    "Safety fixture must produce read-only signal evidence.",
  );

  assert.equal(
    signal.executionAuthorized,
    false,
  );

  assert.equal(
    signal.automaticExecutionAllowed,
    false,
  );

  if (
    signal.kind !==
    "CROSS_EXCHANGE_ARBITRAGE_OPPORTUNITY"
  ) {
    throw new Error(
      "Safety fixture requires Strategy #1 opportunity evidence.",
    );
  }

  const intent:
    StrategyIntent = {
    id:
      "intent-contract-only",
    strategyId:
      signal.strategyId,
    signalId:
      signal.id,
    kind:
      "PROPOSED_STRATEGY_ACTION",
    proposedMode:
      "PAPER",
    proposalType:
      "CROSS_EXCHANGE_ARBITRAGE_PAPER_EXECUTION",
    proposedCapital:
      1,
    createdAt:
      generatedAt,
    expiresAt:
      generatedAt +
      1_000,
    status:
      "PROPOSED",
    executionAuthorized:
      false,
    automaticExecutionAllowed:
      false,
    evidence: {
      type:
        "CROSS_EXCHANGE_ARBITRAGE_PAPER_EXECUTION",
      sourceOpportunityId:
        "safety-contract-only",
      candidateGeneration:
        "safety-contract-only",
      market:
        signal.evidence.market,
      buyExchange:
        signal.evidence.buyExchange,
      sellExchange:
        signal.evidence.sellExchange,
    },
  };

  assert.equal(
    intent.executionAuthorized,
    false,
  );

  assert.equal(
    intent.automaticExecutionAllowed,
    false,
  );

  assert.equal(
    forwardedSignals.length,
    1,
    "Orchestrator must forward evidence once without executing it.",
  );

  assert.equal(
    xemmController.isRunning(),
    false,
    "Default-disabled XEMM must remain stopped when the orchestrator starts.",
  );

  assert.equal(
    xemmController.getSignals().length,
    0,
    "Default-disabled V21.5 XEMM must not manufacture signal, lifecycle, fill, hedge, analytics, or readiness evidence.",
  );

  assert.equal(
    hedgeInventoryController.isRunning(),
    false,
    "Default-disabled V22.18 hedge / inventory management must remain stopped when the orchestrator starts.",
  );

  assert.equal(
    hedgeInventoryController.getSignals().length,
    0,
    "Default-disabled V22.18 must not manufacture exposure or hedge evidence.",
  );

  assert.equal(
    hedgeInventoryController
      .getHedgeTargetSnapshot()
      .evidenceStatus,
    "NO_DATA",
    "Default-disabled V22.18 must not manufacture hedge targets.",
  );

  assert.equal(
    hedgeInventoryController
      .getHedgeRouteSnapshot()
      .evidenceStatus,
    "NO_DATA",
    "Default-disabled V22.18 must not manufacture route economics.",
  );

  assert.equal(
    hedgeInventoryController
      .getHedgeMarketRuleSnapshot()
      .evidenceStatus,
    "NO_DATA",
    "Default-disabled V22.18 must not manufacture market-rule feasibility.",
  );

  assert.equal(
    hedgeInventoryController
      .getHedgePostRuleEconomicsSnapshot()
      .evidenceStatus,
    "NO_DATA",
    "Default-disabled V22.18 must not manufacture post-rule economics revalidation.",
  );

  assert.equal(
    hedgeInventoryController
      .getHedgeBasisRiskSnapshot()
      .evidenceStatus,
    "NO_DATA",
    "Default-disabled V22.18 must not manufacture basis/correlation risk evidence.",
  );

  assert.equal(
    hedgeInventoryController
      .getHedgeRiskApprovalSnapshot()
      .evidenceStatus,
    "NO_DATA",
    "Default-disabled V22.18 must not manufacture RiskEngine approval evidence.",
  );

  assert.equal(
    hedgeInventoryController
      .getHedgeCapitalReservationSnapshot()
      .evidenceStatus,
    "NO_DATA",
    "Default-disabled V22.18 must not manufacture capital-reservation evidence.",
  );

  assert.equal(
    hedgeInventoryController
      .getHedgeIntentProposalSnapshot()
      .evidenceStatus,
    "NO_DATA",
    "Default-disabled V22.18 must not manufacture bounded hedge-intent proposals.",
  );

  assert.equal(
    hedgeInventoryController
      .getHedgeIntentPersistenceSnapshot()
      .evidenceStatus,
    "NO_DATA",
    "Default-disabled V22.18 must not persist a canonical hedge StrategyIntent.",
  );

  assert.equal(
    hedgeInventoryController
      .getHedgeIntentLifecycleSnapshot()
      .evidenceStatus,
    "NO_DATA",
    "Default-disabled V22.18 must not create hedge-intent lifecycle evidence.",
  );

  assert.equal(
    hedgeInventoryController
      .getHedgeIntentLastLookSnapshot()
      .evidenceStatus,
    "NO_DATA",
    "Default-disabled V22.18 must not create hedge-intent last-look evidence.",
  );

  assert.equal(
    hedgeInventoryController
      .getHedgeExecutionPlanProposalSnapshot()
      .evidenceStatus,
    "NO_DATA",
    "Default-disabled V22.18 must not create a hedge execution-plan proposal.",
  );

  assert.equal(
    hedgeInventoryController
      .getHedgeShadowFillSimulationSnapshot()
      .evidenceStatus,
    "NO_DATA",
    "Default-disabled V22.18 must not manufacture SHADOW fill-simulation evidence.",
  );

  assert.equal(
    hedgeInventoryController
      .getHedgeResidualReconciliationSnapshot()
      .evidenceStatus,
    "NO_DATA",
    "Default-disabled V22.18 must not manufacture residual-reconciliation or recovery-required evidence.",
  );

  assert.equal(
    hedgeInventoryController
      .getHedgeRecoveryProposalSnapshot()
      .evidenceStatus,
    "NO_DATA",
    "Default-disabled V22.18 must not manufacture a SHADOW recovery-action proposal.",
  );

  assert.equal(
    hedgeInventoryController
      .getHedgeRecoveryProposalLifecycleSnapshot()
      .evidenceStatus,
    "NO_DATA",
    "Default-disabled V22.18 must not manufacture recovery-proposal lifecycle or operator-decision evidence.",
  );

  assert.equal(
    hedgeInventoryController
      .getHedgeRecoveryActionHandoffSnapshot()
      .evidenceStatus,
    "NO_DATA",
    "Default-disabled V22.18 must not manufacture an operator-approved recovery-action handoff.",
  );

  orchestrator.stop();
  orchestrator.stop();

  const after =
    getSafetyState();

  assert.deepEqual(
    after,
    before,
    "Strategy observation must not mutate Paper, capital, LIVE session, order, settlement, recovery, or execution state.",
  );

  assert.equal(
    liveExecutionService
      .getExchangeStatuses()
      .every(
        (exchange) =>
          !exchange.liveExecutionEnabled &&
          !exchange.adapterConnected,
      ),
    true,
    "LIVE execution must remain globally disabled and disconnected.",
  );

  const liveExecutionSource =
    readFileSync(
      resolve(
        __dirname,
        "..",
        "..",
        "..",
        "src",
        "execution",
        "live",
        "LiveExecutionService.ts",
      ),
      "utf8",
    );

  for (
    const requiredRuntimeGate
    of [
      /TRADING_MODE[\s\S]*===\s*["']live["']/,
      /LIVE_TRADING_ENABLED[\s\S]*===\s*["']true["']/,
      /ARBITRAGE_LIVE_CONFIRMATION[\s\S]*ENABLE_STRATEGY_ONE_TINY_LIVE_RUNTIME/,
      /STRATEGY_ONE_LIVE_RUNTIME_CONFIRMATION[\s\S]*ENABLE_STRATEGY_ONE_TINY_LIVE_RUNTIME/,
    ]
  ) {
    assert.match(
      liveExecutionSource,
      requiredRuntimeGate,
      "LIVE execution must remain behind every exact Strategy #1 runtime gate.",
    );
  }

  assert.equal(
    process.env.TRADING_MODE?.trim().toLowerCase() === "live" &&
      process.env.LIVE_TRADING_ENABLED?.trim().toLowerCase() === "true" &&
      process.env.ARBITRAGE_LIVE_CONFIRMATION?.trim() ===
        "ENABLE_STRATEGY_ONE_TINY_LIVE_RUNTIME" &&
      process.env.STRATEGY_ONE_LIVE_RUNTIME_CONFIRMATION?.trim() ===
        "ENABLE_STRATEGY_ONE_TINY_LIVE_RUNTIME",
    false,
    "The deterministic test runtime must remain fail-closed for LIVE execution.",
  );

  console.log(
    "Strategy safety-isolation deterministic test passed.",
  );

  console.log(
    "No Paper trade, LIVE session, capital reservation, order, settlement, recovery incident, execution, or exchange order was created.",
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
