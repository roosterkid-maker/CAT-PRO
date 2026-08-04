import crypto from "node:crypto";

import {
  paperOrderExecutor,
} from "../trading/execution/PaperOrderExecutor";

import type {
  ExecutionPlan,
} from "../trading/models/ExecutionPlan";

function createTestPlan(): ExecutionPlan {
  const quantity = 100;

  return {
    id: crypto.randomUUID(),

    market: "TESTUSDT",

    mode: "PAPER",

    strategy: "PARALLEL",

    status: "READY",

    capital: 10_000,

    expectedProfit: 100,

    expectedProfitPercent: 1,

    maximumSlippagePercent: 0.05,

    timeoutMs: 3_000,

    buy: {
      exchange: "binance",
      market: "TESTUSDT",
      side: "BUY",
      quantity,
      limitPrice: 100,
    },

    sell: {
      exchange: "coindcx",
      market: "TESTUSDT",
      side: "SELL",
      quantity,
      limitPrice: 101,
    },

    createdAt: Date.now(),
  };
}

function main(): void {
  const plan = createTestPlan();

  const result =
    paperOrderExecutor.execute(plan);

  console.log("Execution Plan");
  console.dir(plan, {
    depth: null,
  });

  console.log("\nExecution Result");
  console.dir(result, {
    depth: null,
  });

  console.log("\nSummary");
  console.table([
    {
      market: result.market,
      status: result.status,
      successful: result.successful,
      capitalUsed:
        result.capitalUsed.toFixed(2),
      grossProfit:
        result.grossProfit.toFixed(2),
      totalFees:
        result.totalFees.toFixed(2),
      netProfit:
        result.netProfit.toFixed(2),
      netProfitPercent:
        `${result.netProfitPercent.toFixed(4)}%`,
    },
  ]);
}

main();