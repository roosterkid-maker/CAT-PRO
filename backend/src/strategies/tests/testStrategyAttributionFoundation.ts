import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ArbitrageOpportunity,
} from "../../arbitrage/models/ArbitrageOpportunity";
import type {
  OpportunitySnapshot,
  OpportunitySnapshotListener,
} from "../../arbitrage/services/OpportunityService";
import { CandidateEvidenceAccumulatorService } from
  "../../automation/services/CandidateEvidenceAccumulatorService";
import { CandidateQualificationService } from
  "../../automation/services/CandidateQualificationService";
import { CapitalAwareQualificationEvidenceService } from
  "../../automation/services/CapitalAwareQualificationEvidenceService";
import { executionCandidateQueueService } from
  "../../automation/services/ExecutionCandidateQueueService";
import { opportunityMonitorService } from
  "../../automation/services/OpportunityMonitorService";
import { PaperAutomationAccountingService } from
  "../../automation/services/PaperAutomationAccountingService";
import { shadowExecutionDispatcherService } from
  "../../automation/services/ShadowExecutionDispatcherService";
import { ShadowLearningEvidenceArchiveService } from
  "../../automation/services/ShadowLearningEvidenceArchiveService";
import { StrategyAttributionAnalyticsService } from
  "../../analytics/services/StrategyAttributionAnalyticsService";
import { shadowTradeOutcomeTrackerService } from
  "../../automation/services/ShadowTradeOutcomeTrackerService";
import type {
  AutomatedPaperControllerCycleResult,
} from "../../automation/models/AutomatedPaperExecutionController";
import { liveExecutionCoordinator } from
  "../../execution/live/coordinator/LiveExecutionCoordinator";
import { orderLifecycleManager } from
  "../../execution/live/lifecycle/OrderLifecycleManager";
import { liveExecutionService } from
  "../../execution/live/LiveExecutionService";
import { executionMetricsService } from
  "../../execution/live/metrics/ExecutionMetricsService";
import { executionSettlementService } from
  "../../execution/live/settlement/ExecutionSettlementService";
import { capitalReservationService } from
  "../../trading/capital/CapitalReservationService";
import { automatedPaperTradingService } from
  "../../trading/execution/AutomatedPaperTradingService";
import { PaperOrderExecutor } from
  "../../trading/execution/PaperOrderExecutor";
import type { ExecutionPlan } from
  "../../trading/models/ExecutionPlan";
import { paperTradingService } from
  "../../trading/services/PaperTradingService";
import { CrossExchangeArbitrageStrategyController } from
  "../cross-exchange-arbitrage/CrossExchangeArbitrageStrategyController";
import type {
  CrossExchangeOpportunitySnapshotSource,
} from "../cross-exchange-arbitrage/CrossExchangeArbitrageStrategyController";
import {
  normalizeStrategyAttribution,
  unattributedLegacyStrategyEvidence,
} from "../models/StrategyAttribution";
import { StrategyAttributionService } from
  "../services/StrategyAttributionService";
import { StrategyOrchestrator } from
  "../services/StrategyOrchestrator";
import { StrategyReadModelService } from
  "../services/StrategyReadModelService";
import { StrategyRegistry } from
  "../services/StrategyRegistry";

class TestOpportunitySource
implements CrossExchangeOpportunitySnapshotSource {
  private readonly listeners =
    new Set<OpportunitySnapshotListener>();

  latest: OpportunitySnapshot | null = null;

  getLastOpportunitySnapshot(): OpportunitySnapshot | null {
    return this.latest
      ? structuredClone(this.latest)
      : null;
  }

  subscribeToOpportunitySnapshots(
    listener: OpportunitySnapshotListener,
  ): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(snapshot: OpportunitySnapshot): void {
    this.latest = structuredClone(snapshot);

    for (const listener of this.listeners) {
      listener(structuredClone(snapshot));
    }
  }
}

function createOpportunity(
  id: string,
  market: string,
  timestamp: number,
): ArbitrageOpportunity {
  return {
    id,
    pair: {
      market,
      buy: {
        exchange: "binance",
        market,
        lastPrice: 100,
        bestBidPrice: 99,
        bestBidQty: 10,
        bestAskPrice: 100,
        bestAskQty: 10,
        spread: 1,
        timestamp,
        source: "orderBook",
        executable: true,
      },
      sell: {
        exchange: "coindcx",
        market,
        lastPrice: 105,
        bestBidPrice: 105,
        bestBidQty: 10,
        bestAskPrice: 106,
        bestAskQty: 10,
        spread: 1,
        timestamp,
        source: "orderBook",
        executable: true,
      },
    },
    buyPrice: 100,
    sellPrice: 105,
    buyAvailableQty: 10,
    sellAvailableQty: 10,
    requiredQty: 1,
    availableExecutableQty: 10,
    executableQty: 1,
    liquidityScore: 100,
    enoughLiquidity: true,
    freshnessScore: 100,
    feeScore: 100,
    spreadScore: 100,
    decision: "EXECUTE",
    analysisSummary: [],
    rawSpread: 5,
    rawSpreadPercent: 5,
    estimatedFees: 0.2,
    netProfit: 4.8,
    netProfitPercent: 4.8,
    usedLastPriceFallback: false,
    quotesAreFresh: true,
    score: 100,
    timestamp,
  };
}

function getSafetyState() {
  const reservations =
    capitalReservationService.getDiagnostics();
  const sessions =
    liveExecutionCoordinator.getDiagnostics();
  const orders =
    orderLifecycleManager.getDiagnostics();
  const settlements =
    executionSettlementService.getDiagnostics();
  const metrics =
    executionMetricsService.getReport();

  return {
    activeReservations: reservations.activeReservations,
    totalReservationsCreated: reservations.totalCreated,
    activeSessions: sessions.activeSessions,
    totalSessionsPrepared: sessions.totalPrepared,
    totalOrders: orders.totalOrders,
    totalSettlements: settlements.totalSettlements,
    totalExecutions: metrics.totalExecutions,
  };
}

function createPaperPlan(
  id: string,
): ExecutionPlan {
  return {
    id,
    version: 1,
    market: "V201ATTR-USDT",
    mode: "PAPER",
    strategy: "PARALLEL",
    status: "READY",
    capital: 100,
    expectedProfit: 5,
    expectedProfitPercent: 5,
    expectedFees: 0.2,
    expectedNetProfit: 4.8,
    expectedNetProfitPercent: 4.8,
    maximumSlippagePercent: 0.05,
    timeoutMs: 3_000,
    buy: {
      exchange: "binance",
      market: "V201ATTR-USDT",
      side: "BUY",
      quantity: 1,
      limitPrice: 100,
      orderType: "limit",
    },
    sell: {
      exchange: "coindcx",
      market: "V201ATTR-USDT",
      side: "SELL",
      quantity: 1,
      limitPrice: 105,
      orderType: "limit",
    },
    createdAt: Date.now(),
    expiresAt: Date.now() + 3_000,
    opportunityTimestamp: Date.now(),
  };
}

async function main(): Promise<void> {
  const safetyBefore = getSafetyState();
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "cat-pro-v20-1-"),
  );

  const source = new TestOpportunitySource();
  const controller =
    new CrossExchangeArbitrageStrategyController(
      { maximumSignalAgeMs: 60_000 },
      source,
    );
  const registry = new StrategyRegistry();
  registry.register(controller);
  const orchestrator = new StrategyOrchestrator(registry);
  const attributionService =
    new StrategyAttributionService(
      orchestrator,
      { maximumSignals: 100 },
    );

  attributionService.start();
  attributionService.start();
  orchestrator.start();

  let latestSignalId = "";
  const baseTime = Date.now();
  const observationTimes = [
    baseTime - 6_000,
    baseTime - 3_000,
    baseTime,
  ];

  for (
    let index = 0;
    index < observationTimes.length;
    index += 1
  ) {
    const generatedAt = observationTimes[index] as number;
    const attributedOpportunity = createOpportunity(
      `attributed-opportunity-${index}`,
      "V201ATTR-USDT",
      generatedAt,
    );
    const legacyOpportunity = createOpportunity(
      `legacy-opportunity-${index}`,
      "V201LEGACY-USDT",
      generatedAt,
    );
    const strategySnapshot: OpportunitySnapshot = {
      generatedAt,
      opportunities: [attributedOpportunity],
    };

    source.emit(strategySnapshot);

    const resolved = attributionService.resolveSnapshot({
      generatedAt,
      opportunities: [
        attributedOpportunity,
        legacyOpportunity,
      ],
    });

    const attribution = resolved.get(attributedOpportunity.id);
    assert.ok(attribution);
    assert.equal(attribution.attributionStatus, "ATTRIBUTED");
    assert.equal(attribution.strategyId, "cross-exchange-arbitrage");
    assert.equal(attribution.intentId, null);
    assert.equal(resolved.has(legacyOpportunity.id), false);

    latestSignalId = attribution.signalId;

    opportunityMonitorService.observeSnapshot(
      [attributedOpportunity, legacyOpportunity],
      generatedAt,
      resolved,
    );
  }

  const attributedCandidate =
    opportunityMonitorService.getCandidate(
      "V201ATTR-USDT|binance|coindcx",
    );
  const legacyCandidate =
    opportunityMonitorService.getCandidate(
      "V201LEGACY-USDT|binance|coindcx",
    );

  assert.ok(attributedCandidate);
  assert.ok(legacyCandidate);
  assert.equal(
    attributedCandidate.strategyAttribution.signalId,
    latestSignalId,
  );
  assert.equal(
    legacyCandidate.strategyAttribution.attributionStatus,
    "UNATTRIBUTED_LEGACY",
  );

  const qualificationService =
    new CandidateQualificationService();
  const attributedQualification =
    qualificationService.evaluate(
      attributedCandidate,
      baseTime,
    );
  const sameCandidateWithoutAttribution = {
    ...structuredClone(attributedCandidate),
    strategyAttribution:
      unattributedLegacyStrategyEvidence(),
  };
  const legacyAttributionQualification =
    qualificationService.evaluate(
      sameCandidateWithoutAttribution,
      baseTime,
    );

  assert.equal(attributedQualification.status, "QUALIFIED");
  assert.equal(
    legacyAttributionQualification.status,
    attributedQualification.status,
    "Strategy attribution must not alter qualification status.",
  );
  assert.equal(
    legacyAttributionQualification.score,
    attributedQualification.score,
    "Strategy attribution must not alter qualification score.",
  );
  assert.deepEqual(
    legacyAttributionQualification.checks,
    attributedQualification.checks,
    "Strategy attribution must not alter qualification checks.",
  );

  const candidateEvidencePath =
    join(temporaryDirectory, "candidate-evidence.jsonl");
  const candidateEvidence =
    new CandidateEvidenceAccumulatorService(
      candidateEvidencePath,
    );
  candidateEvidence.observeSnapshot(baseTime);
  const candidateEvidenceRecord =
    candidateEvidence
      .getDiagnostics()
      .routes
      .find(
        (record) =>
          record.key === attributedCandidate.key,
      );
  assert.equal(
    candidateEvidenceRecord
      ?.latestStrategyAttribution
      .signalId,
    latestSignalId,
  );

  const qualificationEvidencePath =
    join(temporaryDirectory, "qualification-evidence.jsonl");
  const qualificationEvidence =
    new CapitalAwareQualificationEvidenceService(
      qualificationEvidencePath,
    );
  qualificationEvidence.capture(baseTime);
  const qualificationEvidenceRecord =
    qualificationEvidence
      .getDiagnostics()
      .routes
      .find(
        (record) =>
          record.key === attributedCandidate.key,
      );
  assert.equal(
    qualificationEvidenceRecord
      ?.latestStrategyAttribution
      .signalId,
    latestSignalId,
  );

  executionCandidateQueueService.synchronize(baseTime);
  const readyItems =
    executionCandidateQueueService.getReadyItems(baseTime);
  const attributedQueueItem = readyItems.find(
    (item) =>
      item.candidateKey === attributedCandidate.key,
  );
  const legacyQueueItem = readyItems.find(
    (item) =>
      item.candidateKey === legacyCandidate.key,
  );
  assert.equal(
    attributedQueueItem?.strategyAttribution.signalId,
    latestSignalId,
  );
  assert.equal(
    legacyQueueItem?.strategyAttribution.attributionStatus,
    "UNATTRIBUTED_LEGACY",
  );

  const dispatchBatch =
    shadowExecutionDispatcherService.dispatchAvailable();
  const attributedDispatch = dispatchBatch.records.find(
    (record) =>
      record.candidateKey === attributedCandidate.key &&
      record.status === "SHADOW_DISPATCHED",
  );
  const legacyDispatch = dispatchBatch.records.find(
    (record) =>
      record.candidateKey === legacyCandidate.key &&
      record.status === "SHADOW_DISPATCHED",
  );
  assert.ok(attributedDispatch);
  assert.ok(legacyDispatch);
  assert.equal(
    attributedDispatch.strategyAttribution.signalId,
    latestSignalId,
  );
  assert.equal(
    legacyDispatch.strategyAttribution.attributionStatus,
    "UNATTRIBUTED_LEGACY",
  );

  shadowTradeOutcomeTrackerService.process(baseTime);
  const attributedOutcome =
    shadowTradeOutcomeTrackerService.getByDispatch(
      attributedDispatch.id,
    );
  const legacyOutcome =
    shadowTradeOutcomeTrackerService.getByDispatch(
      legacyDispatch.id,
    );
  assert.ok(attributedOutcome);
  assert.ok(legacyOutcome);
  assert.equal(
    attributedOutcome.strategyAttribution.signalId,
    latestSignalId,
  );
  assert.equal(
    attributedOutcome.strategyAttribution.intentId,
    null,
  );
  assert.deepEqual(
    attributedOutcome.predicted,
    legacyOutcome.predicted,
    "Strategy attribution must not alter Shadow outcome calculations.",
  );

  const archivePath =
    join(temporaryDirectory, "shadow-evidence.jsonl");
  const archive =
    new ShadowLearningEvidenceArchiveService(
      archivePath,
    );
  archive.capture(baseTime);
  const restoredArchive =
    new ShadowLearningEvidenceArchiveService(
      archivePath,
    );
  const restoredAttributedOutcome =
    restoredArchive
      .getOutcomeRecords()
      .find(
        (record) =>
          record.id === attributedOutcome.id,
      );
  assert.equal(
    restoredAttributedOutcome
      ?.strategyAttribution
      .signalId,
    latestSignalId,
  );

  const legacyArchivePath =
    join(temporaryDirectory, "legacy-shadow-evidence.jsonl");
  const legacyArchiveLine = JSON.stringify({
    schemaVersion: 1,
    persistedAt: 1,
    startedAt: 1,
    captureCount: 1,
    lastCapturedAt: 1,
    lastCapturedSnapshotGeneratedAt: 1,
    queueItems: [],
    dispatchRecords: [],
    outcomeRecords: [
      {
        id: "historical-outcome-without-attribution",
        dispatchedAt: 1,
        status: "SUCCESS",
      },
    ],
  }) + "\n";
  writeFileSync(
    legacyArchivePath,
    legacyArchiveLine,
    "utf8",
  );
  const legacyArchive =
    new ShadowLearningEvidenceArchiveService(
      legacyArchivePath,
    );
  assert.equal(
    legacyArchive
      .getOutcomeRecords()[0]
      ?.strategyAttribution
      .attributionStatus,
    "UNATTRIBUTED_LEGACY",
  );
  assert.equal(
    readFileSync(legacyArchivePath, "utf8"),
    legacyArchiveLine,
    "Reading historical evidence must not backfill or rewrite it.",
  );

  assert.equal(
    normalizeStrategyAttribution(undefined).attributionStatus,
    "UNATTRIBUTED_LEGACY",
  );

  const rejectedLegacyPaper =
    await automatedPaperTradingService.execute({
      opportunity: createOpportunity(
        "paper-eligibility-legacy",
        "V201PAPER-USDT",
        baseTime,
      ),
      requestedCapital: -1,
    });
  const rejectedAttributedPaper =
    await automatedPaperTradingService.execute({
      strategyAttribution:
        attributedCandidate.strategyAttribution,
      opportunity: createOpportunity(
        "paper-eligibility-attributed",
        "V201PAPER-USDT",
        baseTime,
      ),
      requestedCapital: -1,
    });
  assert.equal(rejectedLegacyPaper.approved, false);
  assert.equal(rejectedAttributedPaper.approved, false);
  assert.deepEqual(
    rejectedAttributedPaper.reasons,
    rejectedLegacyPaper.reasons,
    "Strategy attribution must not change Paper eligibility.",
  );

  const paperExecutor = new PaperOrderExecutor();
  const plan = createPaperPlan(
    `v20.1-attribution-${randomUUID()}`,
  );
  const legacyPaperResult =
    paperExecutor.execute(plan);
  const attributedPaperResult =
    paperExecutor.execute(
      plan,
      undefined,
      attributedCandidate.strategyAttribution,
    );
  assert.equal(
    attributedPaperResult.strategyAttribution.signalId,
    latestSignalId,
  );
  assert.equal(
    attributedPaperResult.strategyAttribution.intentId,
    null,
  );
  assert.deepEqual(
    {
      capitalUsed: attributedPaperResult.capitalUsed,
      grossProfit: attributedPaperResult.grossProfit,
      totalFees: attributedPaperResult.totalFees,
      netProfit: attributedPaperResult.netProfit,
      netProfitPercent: attributedPaperResult.netProfitPercent,
      successful: attributedPaperResult.successful,
    },
    {
      capitalUsed: legacyPaperResult.capitalUsed,
      grossProfit: legacyPaperResult.grossProfit,
      totalFees: legacyPaperResult.totalFees,
      netProfit: legacyPaperResult.netProfit,
      netProfitPercent: legacyPaperResult.netProfitPercent,
      successful: legacyPaperResult.successful,
    },
    "Attribution must not change Paper simulation economics.",
  );

  const paperTrade =
    paperTradingService.recordCompletedExecution(
      attributedPaperResult,
    );
  assert.equal(
    paperTrade.strategyAttribution.signalId,
    latestSignalId,
  );

  const paperCycle:
    AutomatedPaperControllerCycleResult = {
    cycleId: 1,
    status: "EXECUTED",
    startedAt: attributedPaperResult.startedAt,
    completedAt:
      attributedPaperResult.completedAt ??
      baseTime,
    durationMs: 0,
    readinessScore: 100,
    readinessLevel: "TEST_FIXTURE",
    paperExecutionArmed: false,
    requestedCapital: 100,
    candidate: {
      strategyAttribution:
        attributedCandidate.strategyAttribution,
      candidateKey: attributedCandidate.key,
      candidateGeneration: "test-generation",
      opportunityId: attributedCandidate.latestOpportunityId,
      market: attributedCandidate.market,
      buyExchange: attributedCandidate.buyExchange,
      sellExchange: attributedCandidate.sellExchange,
      qualificationScore: attributedQualification.score,
      netProfitPercent:
        attributedCandidate.latest.netProfitPercent,
      liquidityScore:
        attributedCandidate.latest.liquidityScore,
      freshnessScore:
        attributedCandidate.latest.freshnessScore,
      consecutiveObservations:
        attributedCandidate.consecutiveObservations,
      persistenceMs: attributedCandidate.lifetimeMs,
    },
    result: attributedPaperResult,
    reasons: ["Deterministic attribution fixture."],
  };
  const accounting =
    new PaperAutomationAccountingService();
  const captureCycle = (
    accounting as unknown as {
      captureCycle(
        cycle: AutomatedPaperControllerCycleResult,
        synchronizedAt: number,
      ): void;
    }
  ).captureCycle.bind(accounting);
  captureCycle(paperCycle, baseTime);
  const ledgerEntry = accounting.getEntry(plan.id);
  assert.equal(
    ledgerEntry?.strategyAttribution.signalId,
    latestSignalId,
  );
  assert.equal(
    ledgerEntry?.strategyAttribution.intentId,
    null,
  );

  const attributionAnalytics =
    new StrategyAttributionAnalyticsService();
  const attributionSummary =
    attributionAnalytics.getSummary(
      "cross-exchange-arbitrage",
      baseTime,
    );
  assert.ok(
    attributionSummary
      .shadowOutcomes
      .attributedToStrategy >= 1,
  );
  assert.equal(
    attributionSummary
      .paperTrades
      .attributedToStrategy,
    1,
  );
  assert.equal(
    "netProfit" in attributionSummary,
    false,
    "V20.1 must not invent strategy P&L.",
  );

  const readModel = new StrategyReadModelService(
    registry,
    orchestrator,
    attributionAnalytics,
  );
  const safetyBeforeApi = getSafetyState();
  const strategyReadModel =
    readModel.getById(
      "cross-exchange-arbitrage",
      baseTime,
    );
  assert.ok(strategyReadModel);
  assert.equal(
    strategyReadModel
      .attribution
      .intentEvidenceStatus,
    "NOT_REPORTED",
  );
  assert.equal(
    strategyReadModel.attribution.intentId,
    null,
  );
  assert.ok(
    (
      strategyReadModel
        .attribution
        .attributedShadowOutcomes
        .count ??
      0
    ) >= 1,
  );
  assert.equal(
    strategyReadModel
      .attribution
      .attributedPaperTrades
      .count,
    1,
  );
  assert.deepEqual(
    getSafetyState(),
    safetyBeforeApi,
    "Read-only strategy API requests must not mutate execution state.",
  );

  assert.deepEqual(
    getSafetyState(),
    safetyBefore,
    "Attribution propagation must not create capital reservations, LIVE sessions, exchange orders, settlements, or execution records.",
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
    "Strategy attribution must not enable LIVE execution.",
  );

  orchestrator.stop();
  attributionService.stop();
  attributionService.stop();
  rmSync(
    temporaryDirectory,
    { recursive: true, force: true },
  );

  console.log(
    "Strategy attribution foundation deterministic test passed.",
  );
  console.log(
    "Signal identity remained stable through new Shadow and Paper evidence; legacy history remained explicitly unattributed.",
  );
  console.log(
    "No capital reservation, LIVE session, exchange order, settlement, or execution record was created by attribution.",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      error instanceof Error
        ? error.stack ?? error.message
        : error,
    );
    process.exitCode = 1;
  },
);
