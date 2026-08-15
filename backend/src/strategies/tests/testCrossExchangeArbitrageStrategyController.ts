import assert
  from "node:assert/strict";

import type {
  ArbitrageOpportunity,
} from "../../arbitrage/models/ArbitrageOpportunity";

import type {
  OpportunitySnapshot,
  OpportunitySnapshotListener,
} from "../../arbitrage/services/OpportunityService";

import {
  CrossExchangeArbitrageStrategyController,
} from "../cross-exchange-arbitrage/CrossExchangeArbitrageStrategyController";

import type {
  CrossExchangeOpportunitySnapshotSource,
} from "../cross-exchange-arbitrage/CrossExchangeArbitrageStrategyController";

class TestOpportunitySource
implements CrossExchangeOpportunitySnapshotSource {
  private readonly listeners =
    new Set<
      OpportunitySnapshotListener
    >();

  latest:
    OpportunitySnapshot | null =
    null;

  getLastCalls =
    0;

  subscribeCalls =
    0;

  getLastOpportunitySnapshot():
    OpportunitySnapshot | null {
    this.getLastCalls +=
      1;

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
    this.subscribeCalls +=
      1;

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

  activeSubscriptions():
    number {
    return this.listeners.size;
  }
}

function createOpportunity(
  timestamp:
    number,
): ArbitrageOpportunity {
  return {
    id:
      "opportunity-1",
    pair: {
      market:
        "BTC-USDT",
      buy: {
        exchange:
          "Binance",
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
          "CoinDCX",
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
      98,
    enoughLiquidity:
      true,
    freshnessScore:
      97,
    feeScore:
      96,
    spreadScore:
      95,
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
      95,
    timestamp,
  };
}

function main():
  void {
  const source =
    new TestOpportunitySource();

  const controller =
    new CrossExchangeArbitrageStrategyController(
      {
        maximumSignalAgeMs:
          1_000,
      },
      source,
    );

  const missingEvidence =
    controller.getRuntimeSnapshot(
      1_000,
    );

  assert.equal(
    missingEvidence.evidence
      .snapshot,
    "NO_DATA",
  );

  assert.equal(
    missingEvidence.evidence
      .signals,
    "NO_DATA",
  );

  assert.equal(
    missingEvidence.evidence
      .performance,
    "NOT_REPORTED",
  );

  const forwardedSignals:
    unknown[] =
    [];

  controller.subscribeToSignals(
    (signal) => {
      forwardedSignals.push(
        signal,
      );
    },
  );

  controller.start();
  controller.start();

  assert.equal(
    source.subscribeCalls,
    1,
    "Controller start must be idempotent.",
  );

  assert.equal(
    source.getLastCalls,
    1,
    "Controller may read only the existing latest snapshot during start.",
  );

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

  const signals =
    controller.getSignals(
      generatedAt +
      100,
    );

  assert.equal(
    signals.length,
    1,
  );

  const signal =
    signals[0];

  assert.ok(
    signal,
  );

  assert.equal(
    signal.strategyId,
    "cross-exchange-arbitrage",
  );

  assert.equal(
    signal.sourceOpportunityId,
    "opportunity-1",
  );

  assert.equal(
    signal.evidence.market,
    "BTC-USDT",
  );

  assert.equal(
    signal.evidence.buyExchange,
    "binance",
  );

  assert.equal(
    signal.evidence.sellExchange,
    "coindcx",
  );

  assert.equal(
    signal.evidence.netProfit,
    1.8,
  );

  assert.equal(
    signal.executionAuthorized,
    false,
  );

  assert.equal(
    signal.automaticExecutionAllowed,
    false,
  );

  assert.equal(
    Object.isFrozen(
      signal,
    ),
    true,
  );

  assert.equal(
    Object.isFrozen(
      signal.evidence,
    ),
    true,
  );

  assert.equal(
    Reflect.set(
      signal.evidence,
      "market",
      "ETH-USDT",
    ),
    false,
    "StrategySignal evidence must be immutable at runtime.",
  );

  assert.equal(
    forwardedSignals.length,
    1,
  );

  const available =
    controller.getRuntimeSnapshot(
      generatedAt +
      100,
    );

  assert.equal(
    available.evidence.snapshot,
    "AVAILABLE",
  );

  assert.equal(
    available.evidence.signals,
    "AVAILABLE",
  );

  source.emit({
    generatedAt,
    opportunities: [
      createOpportunity(
        generatedAt,
      ),
    ],
  });

  assert.equal(
    controller
      .getRuntimeSnapshot(
        generatedAt +
        100,
      )
      .duplicateSnapshotsIgnored,
    1,
  );

  const expired =
    controller.getRuntimeSnapshot(
      generatedAt +
      1_001,
    );

  assert.equal(
    expired.evidence.snapshot,
    "NO_DATA",
  );

  assert.equal(
    expired.evidence.signals,
    "NO_DATA",
  );

  assert.equal(
    controller.getSignals(
      generatedAt +
      1_001,
    ).length,
    0,
  );

  controller.stop();
  controller.stop();

  assert.equal(
    source.activeSubscriptions(),
    0,
    "Controller stop must be idempotent and unsubscribe.",
  );

  assert.equal(
    controller
      .getRuntimeSnapshot(
        generatedAt +
        100,
      )
      .stopCount,
    1,
  );

  console.log(
    "Cross-exchange strategy controller deterministic test passed.",
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
