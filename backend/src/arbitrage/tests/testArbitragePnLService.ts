import {
  arbitragePnLService,
} from "../metrics/ArbitragePnLService";

import type {
  ArbitrageLiveExecutionResult,
} from "../execution/models/ArbitrageLiveExecutionResult";

import type {
  LiveExecutionResult,
} from "../../execution/live/models/LiveExecutionResult";

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
      `synthetic-order-${now}`,

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
      now - 500,

    completedAt:
      now,

    executionTimeMs:
      500,

    failureReason:
      null,

    reasons: [],

    ...overrides,
  };
}

function createArbitrageResult(
  overrides:
    Partial<ArbitrageLiveExecutionResult> = {},
): ArbitrageLiveExecutionResult {
  const now =
    Date.now();

  const buyResult =
    createLegResult({
      exchange:
        "coindcx",

      side:
        "buy",

      averageFillPrice:
        6,

      requestedPrice:
        6,

      feeAmount:
        0.1,
    });

  const sellResult =
    createLegResult({
      exchange:
        "binance",

      side:
        "sell",

      averageFillPrice:
        6.5,

      requestedPrice:
        6.5,

      feeAmount:
        0.1,
    });

  return {
    success:
      true,

    status:
      "COMPLETED",

    opportunityId:
      `synthetic-opportunity-${now}`,

    market:
      "DOGEINR",

    requestedQuantity:
      10,

    buyExchange:
      "coindcx",

    sellExchange:
      "binance",

    buyResult,

    sellResult,

    matchedFilledQuantity:
      10,

    unmatchedBuyQuantity:
      0,

    unmatchedSellQuantity:
      0,

    startedAt:
      now - 600,

    completedAt:
      now,

    executionTimeMs:
      600,

    recoveryRequired:
      false,

    reasons: [],

    ...overrides,
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

function assertApproximatelyEqual(
  actual: number,
  expected: number,
  message: string,
  tolerance =
    0.000001,
): void {
  if (
    Math.abs(
      actual -
      expected,
    ) >
    tolerance
  ) {
    throw new Error(
      `${message} Expected ${expected}, received ${actual}.`,
    );
  }
}

async function main(): Promise<void> {
  console.log(
    "\n====================================",
  );

  console.log(
    "ARBITRAGE P&L SERVICE TEST",
  );

  console.log(
    "====================================",
  );

  arbitragePnLService.reset();

  /*
   * Scenario 1:
   * Buy 10 units at 6.00
   * Sell 10 units at 6.50
   *
   * Gross profit:
   * (6.50 - 6.00) × 10 = 5.00
   *
   * Fees:
   * 0.10 + 0.10 = 0.20
   *
   * Net profit:
   * 5.00 - 0.20 = 4.80
   */
  const profitableResult =
    createArbitrageResult();

  const profitableRecord =
    arbitragePnLService.record(
      profitableResult,
    );

  assertCondition(
    profitableRecord !==
      null,
    "Profitable execution should create a P&L record.",
  );

  assertApproximatelyEqual(
    profitableRecord.grossProfit,
    5,
    "Gross profit calculation is incorrect.",
  );

  assertApproximatelyEqual(
    profitableRecord.totalFees,
    0.2,
    "Total fee calculation is incorrect.",
  );

  assertApproximatelyEqual(
    profitableRecord.netProfit,
    4.8,
    "Net profit calculation is incorrect.",
  );

  assertApproximatelyEqual(
    profitableRecord.netProfitPercent,
    8,
    "Net profit percentage is incorrect.",
  );

  console.log(
    "\nSCENARIO 1 — PROFITABLE CYCLE",
  );

  console.table([
    {
      Market:
        profitableRecord.market,

      Quantity:
        profitableRecord.matchedQuantity,

      BuyPrice:
        profitableRecord.buyAveragePrice,

      SellPrice:
        profitableRecord.sellAveragePrice,

      GrossProfit:
        profitableRecord.grossProfit,

      Fees:
        profitableRecord.totalFees,

      NetProfit:
        profitableRecord.netProfit,

      NetProfitPercent:
        profitableRecord.netProfitPercent,
    },
  ]);

  /*
   * Scenario 2:
   * Losing completed cycle.
   */
  const lossResult =
    createArbitrageResult({
      opportunityId:
        "synthetic-loss-cycle",

      buyResult:
        createLegResult({
          exchange:
            "coindcx",

          side:
            "buy",

          averageFillPrice:
            7,

          requestedPrice:
            7,

          feeAmount:
            0.1,
        }),

      sellResult:
        createLegResult({
          exchange:
            "binance",

          side:
            "sell",

          averageFillPrice:
            6.8,

          requestedPrice:
            6.8,

          feeAmount:
            0.1,
        }),
    });

  const lossRecord =
    arbitragePnLService.record(
      lossResult,
    );

  assertCondition(
    lossRecord !==
      null,
    "Loss execution should create a P&L record.",
  );

  assertCondition(
    lossRecord.netProfit < 0,
    "Loss cycle should contain negative net profit.",
  );

  /*
   * Scenario 3:
   * Mismatched filled quantities requiring recovery.
   */
  const recoveryResult =
    createArbitrageResult({
      success:
        false,

      status:
        "RECOVERY_REQUIRED",

      opportunityId:
        "synthetic-recovery-cycle",

      matchedFilledQuantity:
        8,

      unmatchedBuyQuantity:
        2,

      unmatchedSellQuantity:
        0,

      recoveryRequired:
        true,

      buyResult:
        createLegResult({
          exchange:
            "coindcx",

          side:
            "buy",

          requestedQuantity:
            10,

          filledQuantity:
            10,

          remainingQuantity:
            0,

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

          requestedQuantity:
            10,

          filledQuantity:
            8,

          remainingQuantity:
            2,

          averageFillPrice:
            6.5,

          requestedPrice:
            6.5,
        }),
    });

  const recoveryRecord =
    arbitragePnLService.record(
      recoveryResult,
    );

  assertCondition(
    recoveryRecord !==
      null,
    "Recovery execution should create a P&L record.",
  );

  assertCondition(
    recoveryRecord.recoveryRequired,
    "Recovery record should be marked as recovery required.",
  );

  assertCondition(
    recoveryRecord.matchedQuantity ===
      8,
    "Recovery record matched quantity should be 8.",
  );

  const report =
    arbitragePnLService.getReport(
      10,
    );

  console.log(
    "\nFINAL P&L REPORT",
  );

  console.table([
    {
      TotalCycles:
        report.totalCycles,

      CompletedCycles:
        report.completedCycles,

      ProfitableCycles:
        report.profitableCycles,

      LossCycles:
        report.lossCycles,

      RecoveryRequired:
        report.recoveryRequiredCycles,

      GrossProfit:
        report.grossProfit,

      TotalFees:
        report.totalFees,

      NetProfit:
        report.netProfit,

      AverageNetProfit:
        report.averageNetProfit,

      WinRate:
        report.winRatePercent,
    },
  ]);

  assertCondition(
    report.totalCycles ===
      3,
    "Total cycle count should be 3.",
  );

  assertCondition(
    report.completedCycles ===
      2,
    "Completed cycle count should be 2.",
  );

  assertCondition(
    report.profitableCycles ===
      1,
    "Profitable cycle count should be 1.",
  );

  assertCondition(
    report.lossCycles ===
      1,
    "Loss cycle count should be 1.",
  );

  assertCondition(
    report.recoveryRequiredCycles ===
      1,
    "Recovery-required cycle count should be 1.",
  );

  assertCondition(
    report.winRatePercent ===
      50,
    "Win rate should be 50%.",
  );

  assertCondition(
    report.latest.length ===
      3,
    "Latest records should contain all three cycles.",
  );

  console.log(
    "\nARBITRAGE P&L SERVICE TEST PASSED.",
  );

  console.log(
    "No live order was placed.",
  );

  /*
   * Test data should not remain inside the running
   * singleton after this isolated test completes.
   */
  arbitragePnLService.reset();
}

void main().catch(
  (error: unknown) => {
    console.error(
      "\n[Arbitrage P&L Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    arbitragePnLService.reset();

    process.exitCode =
      1;
  },
);