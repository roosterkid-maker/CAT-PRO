import assert from "node:assert/strict";

import {
  buildArbitragePnLReport,
} from "../history/ArbitragePnLReport";

import type {
  ExecutionHistoryItem,
} from "../history/ExecutionHistoryService";

function leg(partial: Partial<ExecutionHistoryItem> & Pick<ExecutionHistoryItem, "clientOrderId" | "exchange" | "side">): ExecutionHistoryItem {
  return {
    id: `${partial.clientOrderId}`,
    timestamp: 1_000,
    event: "EXECUTION_COMPLETED",
    market: "SANDUSDT",
    orderId: "o",
    status: "FILLED",
    requestedQuantity: 100,
    filledQuantity: 100,
    remainingQuantity: 0,
    requestedPrice: 1,
    averageFillPrice: 1,
    feeAmount: 0,
    executionTimeMs: 1,
    cancelled: false,
    timedOut: false,
    success: true,
    failureReason: null,
    message: null,
    ...partial,
  } as ExecutionHistoryItem;
}

const report = buildArbitragePnLReport(
  [
    // Completed: buy 100 @ 1.00, sell 100 @ 1.02 -> gross 2.00.
    leg({clientOrderId: "arb-buy-a", exchange: "bybit", side: "buy", averageFillPrice: 1.0}),
    leg({clientOrderId: "arb-sell-a", exchange: "coindcx", side: "sell", averageFillPrice: 1.02, timestamp: 2_000}),
    // One leg filled, other timed out: recovery, no P&L.
    leg({clientOrderId: "arb-sell-b", exchange: "bybit", side: "sell"}),
    leg({clientOrderId: "arb-buy-b", exchange: "coindcx", side: "buy", status: "TIMED_OUT", filledQuantity: 0, averageFillPrice: 0}),
    // Not an arbitrage leg (manual recovery order): ignored.
    leg({clientOrderId: "cat-recovery-1", exchange: "bybit", side: "buy"}),
  ],
  (exchange) => (exchange === "bybit" ? 0.118 : 0.5),
  20,
  5_000,
);

assert.equal(report.totalCycles, 2);
assert.equal(report.completedCycles, 1);
assert.equal(report.recoveryRequiredCycles, 1);
assert.ok(Math.abs(report.grossProfit - 2) < 1e-9);
// fees = 100*1.00*0.118% + 100*1.02*0.5% = 0.118 + 0.51
assert.ok(Math.abs(report.totalFees - 0.628) < 1e-9);
assert.ok(Math.abs(report.netProfit - 1.372) < 1e-9);
assert.equal(report.winRatePercent, 100);
assert.equal(report.latest[0].opportunityId, "a", "newest cycle first");
assert.equal(report.latest.find((record) => record.opportunityId === "b")?.status, "ONE_LEG_FILLED");
assert.equal(report.feesEstimated, true);

console.log("testArbitragePnLReport: PASS");
