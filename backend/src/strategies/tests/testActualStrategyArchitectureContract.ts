import assert from "node:assert/strict";

import {
  ACTUAL_STRATEGY_CATALOG,
  ACTUAL_STRATEGY_IDS,
  CENTRAL_PAPER_STRATEGY_IDS,
  getActualStrategy,
} from "../config/ActualStrategyCatalog";

import {
  strategyRegistry,
} from "../bootstrap/StrategyBootstrap";

import {
  HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
} from "../models/StrategyMetadata";

function main(): void {
  assert.equal(
    ACTUAL_STRATEGY_CATALOG.length,
    8,
    "CAT PRO must expose exactly eight actual trading strategies.",
  );

  assert.deepEqual(
    ACTUAL_STRATEGY_CATALOG.map(
      (strategy) => strategy.strategyNumber,
    ),
    [1, 2, 3, 4, 5, 6, 7, 8],
    "Strategy numbers must remain contiguous and stable.",
  );

  assert.equal(
    new Set(ACTUAL_STRATEGY_IDS).size,
    8,
    "Canonical strategy IDs must be unique.",
  );

  assert.equal(
    new Set(
      ACTUAL_STRATEGY_CATALOG.map(
        (strategy) =>
          strategy.implementationDirectory,
      ),
    ).size,
    8,
    "Each actual strategy must own one distinct implementation directory.",
  );

  assert.equal(
    CENTRAL_PAPER_STRATEGY_IDS.length,
    7,
    "Strategies #2-#8 must be the complete central PAPER allowlist domain.",
  );

  assert.ok(
    !new Set<string>(
      ACTUAL_STRATEGY_IDS,
    ).has(
      HEDGE_INVENTORY_MANAGEMENT_STRATEGY_ID,
    ),
    "Shared hedge/recovery must not be registered as a ninth strategy.",
  );

  for (const strategy of ACTUAL_STRATEGY_CATALOG) {
    assert.equal(
      getActualStrategy(strategy.id),
      strategy,
      `Catalog lookup must resolve ${strategy.id}.`,
    );
  }

  const registered =
    strategyRegistry
      .getControllers()
      .map(
        (controller) => {
          const metadata =
            controller.getMetadata();

          return {
            id: metadata.id,
            strategyNumber:
              metadata.strategyNumber,
          };
        },
      );

  assert.deepEqual(
    registered,
    ACTUAL_STRATEGY_CATALOG.map(
      (strategy) => ({
        id: strategy.id,
        strategyNumber:
          strategy.strategyNumber,
      }),
    ),
    "Runtime registry must match the canonical catalog exactly once and in order.",
  );

  console.log(
    "ACTUAL STRATEGY ARCHITECTURE CONTRACT TEST PASSED.",
  );
  console.log(
    "Exactly eight catalogued controllers are registered; shared hedge/recovery remains outside the trading-strategy count.",
  );
}

main();
