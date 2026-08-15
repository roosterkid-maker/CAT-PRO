import assert
  from "node:assert/strict";

import type {
  StrategyController,
  StrategySignalListener,
} from "../contracts/StrategyController";

import type {
  StrategyMetadata,
} from "../models/StrategyMetadata";

import type {
  StrategyRuntimeSnapshot,
} from "../models/StrategyRuntimeSnapshot";

import type {
  StrategySignal,
} from "../models/StrategySignal";

import {
  StrategyRegistry,
} from "../services/StrategyRegistry";

class TestStrategyController
implements StrategyController {
  constructor(
    private readonly metadata:
      StrategyMetadata,
  ) {}

  getMetadata():
    StrategyMetadata {
    return structuredClone(
      this.metadata,
    );
  }

  start(): void {}

  stop(): void {}

  isRunning(): boolean {
    return false;
  }

  getRuntimeSnapshot(
    now =
      Date.now(),
  ): StrategyRuntimeSnapshot {
    return {
      strategyId:
        this.metadata.id,
      generatedAt:
        now,
      running:
        false,
      startCount:
        0,
      stopCount:
        0,
      lastStartedAt:
        null,
      lastStoppedAt:
        null,
      processedSnapshots:
        0,
      duplicateSnapshotsIgnored:
        0,
      totalSignalsObserved:
        0,
      currentSignalCount:
        0,
      lastSnapshotGeneratedAt:
        null,
      lastSnapshotReceivedAt:
        null,
      lastSnapshotOpportunityCount:
        null,
      lastSignalObservedAt:
        null,
      lastError:
        null,
      evidence: {
        snapshot:
          "NO_DATA",
        signals:
          "NO_DATA",
        performance:
          "NOT_REPORTED",
      },
      legacyHistoryAttribution:
        "UNATTRIBUTED_LEGACY",
      safety: {
        readOnly:
          true,
        signalExecutionAllowed:
          false,
        intentExecutionAllowed:
          false,
        automaticExecutionAllowed:
          false,
      },
    };
  }

  getSignals():
    readonly StrategySignal[] {
    return [];
  }

  subscribeToSignals(
    _listener:
      StrategySignalListener,
  ): () => void {
    return () => {};
  }
}

function createMetadata(
  id:
    string,
  strategyNumber:
    number,
): StrategyMetadata {
  return {
    id,
    strategyNumber,
    displayName:
      id,
    version:
      "20.0",
    category:
      "CROSS_EXCHANGE_ARBITRAGE",
    description:
      "Deterministic registry fixture.",
    controllerMode:
      "READ_ONLY",
    signalSource:
      "OpportunityService",
    legacyHistoryAttribution:
      "UNATTRIBUTED_LEGACY",
    capabilities: {
      signalAdaptation:
        true,
      intentGeneration:
        false,
      automaticExecution:
        false,
      paperExecution:
        false,
      liveExecution:
        false,
    },
  };
}

function main():
  void {
  const registry =
    new StrategyRegistry();

  const second =
    new TestStrategyController(
      createMetadata(
        "second-strategy",
        2,
      ),
    );

  const first =
    new TestStrategyController(
      createMetadata(
        "first-strategy",
        1,
      ),
    );

  registry.register(
    second,
  );

  registry.register(
    first,
  );

  assert.throws(
    () => {
      registry.register(
        new TestStrategyController(
          createMetadata(
            "first-strategy",
            3,
          ),
        ),
      );
    },
    /already registered/,
    "Duplicate strategy IDs must be rejected.",
  );

  assert.throws(
    () => {
      registry.register(
        new TestStrategyController(
          createMetadata(
            "duplicate-number-strategy",
            2,
          ),
        ),
      );
    },
    /number is already registered/,
    "Duplicate strategy numbers must be rejected.",
  );

  const firstSnapshot =
    registry.getSnapshot(
      1_234,
    );

  const secondSnapshot =
    registry.getSnapshot(
      1_234,
    );

  assert.deepEqual(
    firstSnapshot,
    secondSnapshot,
    "Registry snapshots must be deterministic for the same state and timestamp.",
  );

  assert.deepEqual(
    firstSnapshot.strategies
      .map(
        (strategy) =>
          strategy.metadata.id,
      ),
    [
      "first-strategy",
      "second-strategy",
    ],
    "Registry snapshots must use strategy number and ID ordering.",
  );

  assert.equal(
    Object.isFrozen(
      firstSnapshot,
    ),
    true,
    "Registry snapshots must be immutable.",
  );

  assert.equal(
    Object.isFrozen(
      firstSnapshot.strategies,
    ),
    true,
    "Nested registry collections must be immutable.",
  );

  console.log(
    "Strategy registry deterministic test passed.",
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
