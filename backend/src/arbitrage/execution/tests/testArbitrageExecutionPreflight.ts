import "dotenv/config";

import assert from "node:assert/strict";

import {
  arbitrageExecutionCoordinator,
} from "../ArbitrageExecutionCoordinator";

import type {
  ArbitrageOpportunity,
} from "../../models/ArbitrageOpportunity";

const TEST_OPPORTUNITY:
  ArbitrageOpportunity = {
  id:
    "preflight-test-opportunity",

  pair: {
    market:
      "DOGEINR",

    buy: {
      exchange:
        "coindcx",

      market:
        "DOGEINR",

      bestBidPrice:
        6.9,

      bestBidQty:
        1_000,

      bestAskPrice:
        7,

      bestAskQty:
        1_000,

      lastPrice:
        6.95,

      spread:
        0.1,

      source:
  "orderBook",

      executable:
        true,

      timestamp:
        Date.now(),
    },

    sell: {
      exchange:
        "binance",

      market:
        "DOGEINR",

      bestBidPrice:
        7.2,

      bestBidQty:
        1_000,

      bestAskPrice:
        7.3,

      bestAskQty:
        1_000,

      lastPrice:
        7.25,

      spread:
        0.1,

      source:
  "orderBook",

      executable:
        true,

      timestamp:
        Date.now(),
    },
  },

  buyPrice:
    7,

  sellPrice:
    7.2,

  buyAvailableQty:
    1_000,

  sellAvailableQty:
    1_000,

  requiredQty:
    14,

  availableExecutableQty:
    14,

  executableQty:
    14,

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

  analysisSummary: [
    "Synthetic preflight-only opportunity.",
  ],

  rawSpread:
    0.2,

  rawSpreadPercent:
    2.8571428571,

  estimatedFees:
    0.03,

  netProfit:
    2.77,

  netProfitPercent:
    2.827,

  usedLastPriceFallback:
    false,

  quotesAreFresh:
    true,

  score:
    100,

  timestamp:
    Date.now(),
};

async function main(): Promise<void> {
  /*
   * Safety:
   * confirmation intentionally remove kar rahe hain,
   * taaki koi live order issue na ho.
   */
  delete process.env
    .ARBITRAGE_LIVE_CONFIRMATION;

  const result =
    await arbitrageExecutionCoordinator.execute(
      TEST_OPPORTUNITY,
      {
        timeoutMs:
          5_000,

        pollingIntervalMs:
          1_000,

        cancelOnTimeout:
          true,
      },
    );

  const reviewOpportunity: ArbitrageOpportunity = {
    ...TEST_OPPORTUNITY,
    id: "preflight-review-opportunity",
    decision: "REVIEW",
    score: 79,
  };
  const reviewDefault = await arbitrageExecutionCoordinator.execute(
    reviewOpportunity,
  );
  assert.equal(
    reviewDefault.reasons.some((reason) => reason.includes("decision is REVIEW")),
    true,
    "The generic coordinator must reject REVIEW by default.",
  );

  const reviewTinyLive = await arbitrageExecutionCoordinator.execute(
    reviewOpportunity,
    {allowTinyLiveReviewCandidate: true},
  );
  assert.equal(
    reviewTinyLive.reasons.some((reason) => reason.includes("decision is REVIEW")),
    false,
    "The controlled Tiny-LIVE path may cross only the aggregate REVIEW boundary.",
  );
  assert.equal(reviewTinyLive.status, "BLOCKED");
  assert.equal(reviewTinyLive.buyResult, null);
  assert.equal(reviewTinyLive.sellResult, null);
  assert.equal(
    reviewTinyLive.reasons.some((reason) => reason.includes("confirmation is missing")),
    true,
  );
  assert.equal(
    reviewTinyLive.reasons.some((reason) => reason.includes("action authority is required")),
    true,
  );

  console.log(
    "\n======================================",
  );

  console.log(
    "ARBITRAGE EXECUTION PREFLIGHT TEST",
  );

  console.log(
    "======================================",
  );

  console.table([
    {
      Success:
        result.success,

      Status:
        result.status,

      OpportunityId:
        result.opportunityId,

      Market:
        result.market,

      BuyExchange:
        result.buyExchange,

      SellExchange:
        result.sellExchange,

      RequestedQuantity:
        result.requestedQuantity,

      BuyResult:
        result.buyResult
          ? "present"
          : "null",

      SellResult:
        result.sellResult
          ? "present"
          : "null",

      RecoveryRequired:
        result.recoveryRequired,

      ExecutionTimeMs:
        result.executionTimeMs,
    },
  ]);

  console.log(
    "\nReasons:",
  );

  for (
    const reason
    of result.reasons
  ) {
    console.log(
      `- ${reason}`,
    );
  }

  const hasConfirmationReason =
    result.reasons.some(
      (reason) =>
        reason.includes(
          "confirmation is missing",
        ),
    );

  const passed =
    result.status ===
      "BLOCKED" &&
    result.success ===
      false &&
    result.buyResult ===
      null &&
    result.sellResult ===
      null &&
    result.recoveryRequired ===
      false &&
    hasConfirmationReason;

  if (!passed) {
    console.error(
      "\nPREFLIGHT TEST FAILED.",
    );

    console.error(
      "Coordinator did not safely block live arbitrage without explicit confirmation.",
    );

    process.exitCode = 1;

    return;
  }

  console.log(
    "\nPREFLIGHT TEST PASSED.",
  );

  console.log(
    "No live order was placed.",
  );
}

void main().catch(
  (error: unknown) => {
    console.error(
      "\n[Arbitrage Preflight Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode = 1;
  },
);
