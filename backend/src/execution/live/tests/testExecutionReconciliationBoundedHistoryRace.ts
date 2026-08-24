import assert from "node:assert/strict";

import {
  orderLifecycleManager,
} from "../lifecycle/OrderLifecycleManager";
import {
  ExecutionReconciliationEngine,
} from "../reconciliation/ExecutionReconciliationEngine";

async function main():
  Promise<void> {
  const manager =
    orderLifecycleManager as unknown as {
      getDiagnostics:
        typeof orderLifecycleManager.getDiagnostics;
      getOrder:
        typeof orderLifecycleManager.getOrder;
    };

  const originalGetDiagnostics =
    manager.getDiagnostics;
  const originalGetOrder =
    manager.getOrder;

  try {
    manager.getDiagnostics =
      (() => ({
        orders: [
          {
            id:
              "trimmed-order",
          },
        ],
      })) as typeof manager.getDiagnostics;

    manager.getOrder =
      (() => null) as typeof manager.getOrder;

    const engine =
      new ExecutionReconciliationEngine();

    const checked =
      await engine.scan();

    assert.equal(
      checked,
      0,
      "A lifecycle row trimmed after the scan snapshot must be skipped.",
    );

    assert.equal(
      engine.getDiagnostics()
        .scanInProgress,
      false,
      "A bounded-history race must always release the scan lock.",
    );
  } finally {
    manager.getDiagnostics =
      originalGetDiagnostics;
    manager.getOrder =
      originalGetOrder;
  }

  console.log(
    "Execution reconciliation bounded-history race tests passed.",
  );
}

void main();
