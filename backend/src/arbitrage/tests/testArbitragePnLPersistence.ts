import {
  existsSync,
  readFileSync,
  rmSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

import {
  ArbitragePnLService,
} from "../metrics/ArbitragePnLService";

import type {
  ArbitrageLiveExecutionResult,
} from "../execution/models/ArbitrageLiveExecutionResult";

import type {
  LiveExecutionResult,
} from "../../execution/live/models/LiveExecutionResult";

const TEST_FILE =
  resolve(
    process.cwd(),
    "logs",
    "tests",
    "arbitrage-pnl-persistence-test.jsonl",
  );

function createLegResult(
  overrides:
    Partial<LiveExecutionResult> = {},
): LiveExecutionResult {
  const now =
    Date.now();

  return {
    success:
      true,

    exchange:
      "coindcx",

    market:
      "DOGEINR",

    side:
      "buy",

    orderId:
      `persistence-order-${now}`,

    clientOrderId:
      null,

    status:
      "FILLED",

    requestedQuantity:
      10,

    filledQuantity:
      10,

    remainingQuantity:
      0,

    requestedPrice:
      6,

    averageFillPrice:
      6,

    feeAmount:
      0.1,

    cancelled:
      false,

    timedOut:
      false,

    startedAt:
      now - 400,

    completedAt:
      now,

    executionTimeMs:
      400,

    failureReason:
      null,

    reasons: [],

    ...overrides,
  };
}

function createExecutionResult(
  opportunityId: string,
  completedAt: number,
): ArbitrageLiveExecutionResult {
  return {
    success:
      true,

    status:
      "COMPLETED",

    opportunityId,

    market:
      "DOGEINR",

    requestedQuantity:
      10,

    buyExchange:
      "coindcx",

    sellExchange:
      "binance",

    buyResult:
      createLegResult({
        exchange:
          "coindcx",

        side:
          "buy",

        averageFillPrice:
          6,

        requestedPrice:
          6,
      }),

    sellResult:
      createLegResult({
        exchange:
          "binance",

        side:
          "sell",

        averageFillPrice:
          6.5,

        requestedPrice:
          6.5,
      }),

    matchedFilledQuantity:
      10,

    unmatchedBuyQuantity:
      0,

    unmatchedSellQuantity:
      0,

    startedAt:
      completedAt - 500,

    completedAt,

    executionTimeMs:
      500,

    recoveryRequired:
      false,

    reasons: [],
  };
}

function assertCondition(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

function cleanup(): void {
  if (
    existsSync(
      TEST_FILE,
    )
  ) {
    rmSync(
      TEST_FILE,
      {
        force:
          true,
      },
    );
  }
}

async function main(): Promise<void> {
  console.log(
    "\n====================================",
  );

  console.log(
    "ARBITRAGE P&L PERSISTENCE TEST",
  );

  console.log(
    "====================================",
  );

  cleanup();

  const firstService =
    new ArbitragePnLService(
      TEST_FILE,
    );

  const firstCompletedAt =
    Date.now();

  const secondCompletedAt =
    firstCompletedAt +
    1_000;

  firstService.record(
    createExecutionResult(
      "persisted-cycle-1",
      firstCompletedAt,
    ),
    {
      persist:
        true,
    },
  );

  firstService.record(
    createExecutionResult(
      "persisted-cycle-2",
      secondCompletedAt,
    ),
    {
      persist:
        true,
    },
  );

  assertCondition(
    existsSync(
      TEST_FILE,
    ),
    "P&L persistence file was not created.",
  );

  const persistedContent =
    readFileSync(
      TEST_FILE,
      "utf8",
    );

  const persistedLines =
    persistedContent
      .split(
        /\r?\n/,
      )
      .filter(
        Boolean,
      );

  assertCondition(
    persistedLines.length ===
      2,
    "Persistence file should contain two JSONL records.",
  );

  /*
   * Simulates a fresh backend process loading
   * previously persisted P&L records.
   */
  const reloadedService =
    new ArbitragePnLService(
      TEST_FILE,
    );

  const report =
    reloadedService.getReport(
      10,
    );

  console.log(
    "\nRELOADED P&L REPORT",
  );

  console.table([
    {
      TotalCycles:
        report.totalCycles,

      CompletedCycles:
        report.completedCycles,

      ProfitableCycles:
        report.profitableCycles,

      NetProfit:
        report.netProfit,

      TotalFees:
        report.totalFees,

      LatestRecords:
        report.latest.length,

      NewestOpportunity:
        report.latest[0]
          ?.opportunityId ??
        "missing",
    },
  ]);

  assertCondition(
    report.totalCycles ===
      2,
    "Reloaded service should contain two cycles.",
  );

  assertCondition(
    report.completedCycles ===
      2,
    "Both reloaded cycles should be completed.",
  );

  assertCondition(
    report.profitableCycles ===
      2,
    "Both reloaded cycles should be profitable.",
  );

  assertCondition(
    report.netProfit ===
      9.6,
    "Reloaded net profit should equal 9.6.",
  );

  assertCondition(
    report.totalFees ===
      0.4,
    "Reloaded total fees should equal 0.4.",
  );

  assertCondition(
    report.latest.length ===
      2,
    "Reloaded report should contain two latest records.",
  );

  assertCondition(
    report.latest[0]
      ?.opportunityId ===
      "persisted-cycle-2",
    "Newest persisted record should appear first.",
  );

  console.log(
    "\nARBITRAGE P&L PERSISTENCE TEST PASSED.",
  );

  console.log(
    "Production P&L history was not modified.",
  );

  cleanup();
}

void main().catch(
  (error: unknown) => {
    console.error(
      "\n[Arbitrage P&L Persistence Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    cleanup();

    process.exitCode =
      1;
  },
);