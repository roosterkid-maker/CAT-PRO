import assert
  from "node:assert/strict";

import type {
  ArbitrageOpportunity,
} from "../../../arbitrage/models/ArbitrageOpportunity";

import type {
  OpportunitySnapshot,
  OpportunitySnapshotListener,
} from "../../../arbitrage/services/OpportunityService";

import {
  CrossExchangeArbitrageStrategyController,
} from "../../../strategies/cross-exchange-arbitrage/CrossExchangeArbitrageStrategyController";

import type {
  CrossExchangeOpportunitySnapshotSource,
} from "../../../strategies/cross-exchange-arbitrage/CrossExchangeArbitrageStrategyController";

import {
  StrategyAttributionService,
} from "../../../strategies/services/StrategyAttributionService";

import {
  StrategyOrchestrator,
} from "../../../strategies/services/StrategyOrchestrator";

import {
  StrategyRegistry,
} from "../../../strategies/services/StrategyRegistry";

import type {
  ExecutionCandidateQueueItem,
} from "../../../automation/models/ExecutionCandidateQueue";

import type {
  MultiOpportunityPaperBatchResult,
} from "../../../automation/models/MultiOpportunityPaperScheduler";

import type {
  ShadowDispatchBatchResult,
} from "../../../automation/models/ShadowExecutionDispatcher";

import {
  resolveUnifiedAutomatedExecutionMode,
  UnifiedAutomatedExecutionOrchestratorService,
} from "../services/UnifiedAutomatedExecutionOrchestratorService";

import {
  executionCandidateQueueService,
} from "../../../automation/services/ExecutionCandidateQueueService";

import {
  opportunityMonitorService,
} from "../../../automation/services/OpportunityMonitorService";

import {
  shadowExecutionDispatcherService,
} from "../../../automation/services/ShadowExecutionDispatcherService";

import type {
  UnifiedAutomatedExecutionPaperScheduler,
  UnifiedAutomatedExecutionQueue,
  UnifiedAutomatedExecutionShadowDispatcher,
} from "../services/UnifiedAutomatedExecutionOrchestratorService";

class TestOpportunitySource
implements CrossExchangeOpportunitySnapshotSource {
  private readonly listeners =
    new Set<OpportunitySnapshotListener>();

  private latest:
    OpportunitySnapshot | null =
    null;

  getLastOpportunitySnapshot():
    OpportunitySnapshot | null {
    return this.latest
      ? structuredClone(
          this.latest,
        )
      : null;
  }

  subscribeToOpportunitySnapshots(
    listener:
      OpportunitySnapshotListener,
  ): () => void {
    this.listeners.add(
      listener,
    );

    return () => {
      this.listeners.delete(
        listener,
      );
    };
  }

  emit(
    snapshot:
      OpportunitySnapshot,
  ): void {
    this.latest =
      structuredClone(
        snapshot,
      );

    for (
      const listener
      of this.listeners
    ) {
      listener(
        structuredClone(
          snapshot,
        ),
      );
    }
  }
}

class TestQueue
implements UnifiedAutomatedExecutionQueue {
  readonly cancelled:
    string[] =
    [];

  readonly consumed:
    string[] =
    [];

  constructor(
    readonly items:
      ExecutionCandidateQueueItem[],
  ) {}

  add(
    item:
      ExecutionCandidateQueueItem,
  ): void {
    this.items.push(
      item,
    );
  }

  getReadyItems():
    ExecutionCandidateQueueItem[] {
    return this.items
      .filter(
        (
          item,
        ) =>
          item.status ===
          "READY",
      )
      .map(
        (
          item,
        ) =>
          structuredClone(
            item,
          ),
      );
  }

  cancel(
    id:
      string,
  ): ExecutionCandidateQueueItem {
    const item =
      this.require(
        id,
      );

    item.status =
      "CANCELLED";

    this.cancelled.push(
      id,
    );

    return structuredClone(
      item,
    );
  }

  consume(
    id:
      string,
  ): ExecutionCandidateQueueItem {
    const item =
      this.require(
        id,
      );

    item.status =
      "CONSUMED";

    this.consumed.push(
      id,
    );

    return structuredClone(
      item,
    );
  }

  private require(
    id:
      string,
  ): ExecutionCandidateQueueItem {
    const item =
      this.items.find(
        (
          candidate,
        ) =>
          candidate.id ===
          id,
      );

    if (
      !item
    ) {
      throw new Error(
        `Missing test queue item ${id}.`,
      );
    }

    return item;
  }
}

class TestShadowDispatcher
implements UnifiedAutomatedExecutionShadowDispatcher {
  calls =
    0;

  allowed:
    string[] =
    [];

  dispatchAvailable(
    allowedCandidateKeys?:
      ReadonlySet<string>,
  ): ShadowDispatchBatchResult {
    this.calls +=
      1;

    this.allowed =
      [
        ...(
          allowedCandidateKeys ??
          []
        ),
      ].sort();

    return {
      generatedAt:
        Date.now(),
      attempted:
        this.allowed.length,
      dispatched:
        this.allowed.length,
      revalidationFailed:
        0,
      duplicatesSuppressed:
        0,
      records:
        this.allowed.map(
          (
            candidateKey,
          ) => ({
            candidateKey,
            status:
              "SHADOW_DISPATCHED",
          }) as never,
        ),
    };
  }
}

class TestPaperScheduler
implements UnifiedAutomatedExecutionPaperScheduler {
  calls =
    0;

  allowed:
    string[] =
    [];

  async run(
    now =
      Date.now(),

    allowedCandidateKeys?:
      ReadonlySet<string>,
  ): Promise<MultiOpportunityPaperBatchResult> {
    this.calls +=
      1;

    this.allowed =
      [
        ...(
          allowedCandidateKeys ??
          []
        ),
      ].sort();

    return {
      id:
        `paper-${this.calls}`,
      batchNumber:
        this.calls,
      status:
        "EXECUTED",
      startedAt:
        now,
      completedAt:
        now,
      durationMs:
        0,
      readinessScore:
        100,
      readinessLevel:
        "TEST_READY",
      paperExecutionArmed:
        true,
      candidatesConsidered:
        this.allowed.length,
      candidatesSelected:
        this.allowed.length,
      executionAttempts:
        this.allowed.length,
      executed:
        this.allowed.length,
      rejected:
        0,
      capitalScheduled:
        100 *
        this.allowed.length,
      capitalExecuted:
        100 *
        this.allowed.length,
      projectedExchangeCapital:
        {},
      executions:
        this.allowed.map(
          (
            candidateKey,
          ) => ({
            candidateKey,
            result: {
              status:
                "EXECUTED",
            },
          }) as never,
        ),
      skipped:
        [],
      reasons: [
        "Deterministic PAPER fixture.",
      ],
    };
  }
}

function createQueueItem(
  id:
    string,

  candidateKey:
    string,

  attribution:
    "OWNED" |
    "LEGACY",

  firstSeenAt =
    1_000,
): ExecutionCandidateQueueItem {
  const strategyAttribution =
    attribution ===
      "OWNED"
      ? {
          attributionStatus:
            "ATTRIBUTED" as const,
          strategyId:
            "cross-exchange-arbitrage" as const,
          signalId:
            `signal-${candidateKey}`,
          intentId:
            null,
        }
      : {
          attributionStatus:
            "UNATTRIBUTED_LEGACY" as const,
          strategyId:
            null,
          signalId:
            null,
          intentId:
            null,
        };

  return {
    id,
    candidateKey,
    status:
      "READY",
    strategyAttribution,
    qualification: {
      candidate: {
        firstSeenAt,
        reappearances:
          0,
        strategyAttribution,
      },
    },
  } as unknown as ExecutionCandidateQueueItem;
}

function createOpportunity(
  id:
    string,

  timestamp:
    number,
): ArbitrageOpportunity {
  return {
    id,
    pair: {
      market:
        "UNI-ORCH-USDT",
      buy: {
        exchange:
          "binance",
        market:
          "UNI-ORCH-USDT",
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
          "UNI-ORCH-USDT",
        lastPrice:
          105,
        bestBidPrice:
          105,
        bestBidQty:
          10,
        bestAskPrice:
          106,
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
      105,
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
      5,
    rawSpreadPercent:
      5,
    estimatedFees:
      0.2,
    netProfit:
      4.8,
    netProfitPercent:
      4.8,
    usedLastPriceFallback:
      false,
    quotesAreFresh:
      true,
    score:
      100,
    timestamp,
  };
}

async function testShadowOwnershipAndDeduplication():
  Promise<void> {
  const owned =
    createQueueItem(
      "owned-1",
      "BTC-USDT|binance|coindcx",
      "OWNED",
    );

  const legacy =
    createQueueItem(
      "legacy-1",
      "ETH-USDT|binance|coindcx",
      "LEGACY",
    );

  const queue =
    new TestQueue([
      owned,
      legacy,
    ]);

  const shadow =
    new TestShadowDispatcher();

  const paper =
    new TestPaperScheduler();

  const orchestrator =
    new UnifiedAutomatedExecutionOrchestratorService({
      queue,
      shadowDispatcher:
        shadow,
      paperScheduler:
        paper,
      resolveMode:
        () =>
          "SHADOW",
    });

  const first =
    await orchestrator
      .run(
        2_000,
      );

  assert.equal(
    first.status,
    "DISPATCHED",
  );

  assert.deepEqual(
    shadow.allowed,
    [
      owned.candidateKey,
    ],
  );

  assert.equal(
    paper.calls,
    0,
    "SHADOW and PAPER dispatch must remain mutually exclusive.",
  );

  assert.deepEqual(
    queue.cancelled,
    [
      legacy.id,
    ],
    "Unattributed candidates must fail the central ownership gate.",
  );

  assert.equal(
    first.liveOrderSubmissionAllowed,
    false,
  );

  /*
   * The production SHADOW dispatcher consumes the original queue item.
   * This lightweight dispatcher fixture returns evidence only, so mirror
   * that already-tested queue transition before simulating a renewal.
   */
  owned.status =
    "CONSUMED";

  queue.add(
    createQueueItem(
      "owned-renewed",
      owned.candidateKey,
      "OWNED",
    ),
  );

  const duplicate =
    await orchestrator
      .run(
        2_001,
      );

  assert.equal(
    duplicate.status,
    "NO_OWNED_CANDIDATE",
  );

  assert.equal(
    duplicate
      .duplicateRejections
      .length,
    1,
  );

  assert.deepEqual(
    queue.consumed,
    [
      "owned-renewed",
    ],
    "A renewed queue item for the same continuous generation must be consumed without redispatch.",
  );
}

function testProductionModeAdmissionStateMachine():
  void {
  const baseState = {
    accountEnabled:
      true,
    emergencyStop:
      false,
    accountMode:
      "PAPER",
  };

  assert.equal(
    resolveUnifiedAutomatedExecutionMode({
      ...baseState,
      paperExecutionAllowed:
        false,
    }),
    "SHADOW",
    "An armed-but-not-ready controller must keep collecting genuine SHADOW evidence.",
  );

  assert.equal(
    resolveUnifiedAutomatedExecutionMode({
      ...baseState,
      paperExecutionAllowed:
        true,
    }),
    "PAPER",
    "PAPER becomes the execution owner only after the complete controller gate passes.",
  );

  assert.equal(
    resolveUnifiedAutomatedExecutionMode({
      ...baseState,
      emergencyStop:
        true,
      paperExecutionAllowed:
        true,
    }),
    "DISABLED",
    "Emergency stop must remain authoritative even after PAPER admission.",
  );

  assert.equal(
    resolveUnifiedAutomatedExecutionMode({
      ...baseState,
      accountMode:
        "LIVE",
      paperExecutionAllowed:
        true,
    }),
    "LIVE_BLOCKED",
    "The unified orchestrator must never acquire a LIVE submission mode.",
  );
}

async function testPaperModeSeparation():
  Promise<void> {
  const item =
    createQueueItem(
      "paper-owned",
      "SOL-USDT|bybit|binance",
      "OWNED",
    );

  const queue =
    new TestQueue([
      item,
    ]);

  const shadow =
    new TestShadowDispatcher();

  const paper =
    new TestPaperScheduler();

  const orchestrator =
    new UnifiedAutomatedExecutionOrchestratorService({
      queue,
      shadowDispatcher:
        shadow,
      paperScheduler:
        paper,
      resolveMode:
        () =>
          "PAPER",
    });

  const result =
    await orchestrator
      .run(
        3_000,
      );

  assert.equal(
    result.status,
    "DISPATCHED",
  );

  assert.equal(
    shadow.calls,
    0,
  );

  assert.deepEqual(
    paper.allowed,
    [
      item.candidateKey,
    ],
  );

  assert.deepEqual(
    queue.consumed,
    [
      item.id,
    ],
  );

  assert.equal(
    result.exchangeOrdersSubmitted,
    0,
  );
}

async function testLiveRemainsBlocked():
  Promise<void> {
  const queue =
    new TestQueue([
      createQueueItem(
        "live-owned",
        "XRP-USDT|binance|coindcx",
        "OWNED",
      ),
    ]);

  const shadow =
    new TestShadowDispatcher();

  const paper =
    new TestPaperScheduler();

  const orchestrator =
    new UnifiedAutomatedExecutionOrchestratorService({
      queue,
      shadowDispatcher:
        shadow,
      paperScheduler:
        paper,
      resolveMode:
        () =>
          "LIVE",
    });

  const result =
    await orchestrator
      .run(
        4_000,
      );

  assert.equal(
    result.mode,
    "LIVE_BLOCKED",
  );

  assert.equal(
    result.status,
    "LIVE_BLOCKED",
  );

  assert.equal(
    shadow.calls,
    0,
  );

  assert.equal(
    paper.calls,
    0,
  );

  assert.equal(
    result.liveExecutionAllowed,
    false,
  );
}

async function testActualSignalToShadowRuntimePath():
  Promise<void> {
  const source =
    new TestOpportunitySource();

  const controller =
    new CrossExchangeArbitrageStrategyController(
      {
        maximumSignalAgeMs:
          60_000,
      },
      source,
    );

  const registry =
    new StrategyRegistry();

  registry.register(
    controller,
  );

  const strategyOrchestrator =
    new StrategyOrchestrator(
      registry,
    );

  const attribution =
    new StrategyAttributionService(
      strategyOrchestrator,
    );

  attribution.start();
  strategyOrchestrator.start();

  const baseTime =
    Date.now();

  for (
    const [
      index,
      generatedAt,
    ]
    of [
      baseTime -
        6_000,
      baseTime -
        3_000,
      baseTime,
    ].entries()
  ) {
    const opportunity =
      createOpportunity(
        `unified-runtime-${index}`,
        generatedAt,
      );

    const snapshot:
      OpportunitySnapshot = {
      generatedAt,
      opportunities: [
        opportunity,
      ],
    };

    source.emit(
      snapshot,
    );

    opportunityMonitorService
      .observeSnapshot(
        snapshot.opportunities,
        snapshot.generatedAt,
        attribution.resolveSnapshot(
          snapshot,
        ),
      );
  }

  executionCandidateQueueService
    .synchronize(
      baseTime,
    );

  const unified =
    new UnifiedAutomatedExecutionOrchestratorService({
      queue:
        executionCandidateQueueService,
      shadowDispatcher:
        shadowExecutionDispatcherService,
      resolveMode:
        () =>
          "SHADOW",
    });

  const result =
    await unified.run(
      baseTime,
    );

  assert.equal(
    result.status,
    "DISPATCHED",
  );

  assert.equal(
    result.ownedCandidates,
    1,
  );

  const dispatch =
    result.shadow
      ?.records
      .find(
        (
          record,
        ) =>
          record.candidateKey ===
          "UNI-ORCH-USDT|binance|coindcx",
      );

  assert.ok(
    dispatch,
    "The real qualified queue candidate must reach the existing SHADOW dispatcher.",
  );

  assert.equal(
    dispatch
      .strategyAttribution
      .attributionStatus,
    "ATTRIBUTED",
  );

  if (
    dispatch
      .strategyAttribution
      .attributionStatus ===
    "ATTRIBUTED"
  ) {
    assert.equal(
      dispatch
        .strategyAttribution
        .strategyId,
      "cross-exchange-arbitrage",
    );
  }

  assert.equal(
    dispatch.status,
    "SHADOW_DISPATCHED",
  );

  strategyOrchestrator.stop();
  attribution.stop();
}

async function main():
  Promise<void> {
  testProductionModeAdmissionStateMachine();
  await testShadowOwnershipAndDeduplication();
  await testPaperModeSeparation();
  await testLiveRemainsBlocked();
  await testActualSignalToShadowRuntimePath();

  console.log(
    "Unified automated Strategy #1 execution orchestrator deterministic test passed.",
  );

  console.log(
    "Ownership, mode separation, generation deduplication, queue consumption, and fail-closed LIVE behavior were validated.",
  );
}

void main()
  .catch(
    (
      error:
        unknown,
    ) => {
      console.error(
        error instanceof Error
          ? error.stack ??
            error.message
          : error,
      );

      process.exitCode =
        1;
    },
  );
