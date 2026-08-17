import {
  arbitragePnLService,
} from "../../../arbitrage/metrics/ArbitragePnLService";

import {
  paperTradingService,
} from "../../../trading/services/PaperTradingService";

import {
  executionDryRunHarness,
} from "../dryrun/ExecutionDryRunHarness";

import {
  executionHistoryService,
} from "../history/ExecutionHistoryService";

function assertCondition(
  condition: boolean,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const paperTradeCountBefore =
    paperTradingService
      .getTrades()
      .length;

  const pnlCycleCountBefore =
    arbitragePnLService
      .getReport(100)
      .totalCycles;

  const executionHistoryBefore =
    await executionHistoryService
      .getRecent(100);

  const result =
    executionDryRunHarness
      .run(
        "BALANCED_SUCCESS",
      );

  const paperTradeCountAfter =
    paperTradingService
      .getTrades()
      .length;

  const pnlCycleCountAfter =
    arbitragePnLService
      .getReport(100)
      .totalCycles;

  const executionHistoryAfter =
    await executionHistoryService
      .getRecent(100);

  assertCondition(
    result.passed &&
    result.noExchangeOrderSubmitted &&
    result.accountCapitalUnchanged,
    "Successful demo must pass with no exchange order and unchanged account capital.",
  );

  assertCondition(
    result.checks.buyFilled === true &&
    result.checks.sellFilled === true &&
    result.checks.exposureBalanced === true &&
    result.checks.settlementCompleted === true,
    "Successful demo must prove synthetic fills, balanced exposure and settlement.",
  );

  assertCondition(
    paperTradeCountAfter ===
      paperTradeCountBefore,
    "Successful demo must not create a genuine paper-trade record.",
  );

  assertCondition(
    pnlCycleCountAfter ===
      pnlCycleCountBefore,
    "Successful demo must not create an arbitrage P&L record.",
  );

  assertCondition(
    executionHistoryAfter.total ===
      executionHistoryBefore.total,
    "Successful demo must not create a real execution-history record.",
  );

  console.log(
    "SUCCESSFUL DEMO SIMULATION ISOLATION TEST PASSED.",
  );

  console.log(
    "Synthetic BUY/SELL settled; no exchange order, capital change, paper trade, real history or P&L record was produced.",
  );
}

main().catch(
  (error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode = 1;
  },
);
