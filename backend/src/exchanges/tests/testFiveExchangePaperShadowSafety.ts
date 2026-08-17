import {
  clearDynamicFeeEvidence,
  replaceExchangeMarketFeeEvidence,
} from "../../arbitrage/config/fees";

import type {
  ExchangeMarketCapability,
} from "../../execution/capabilities/models/ExchangeCapability";

import {
  exchangeOrderValidator,
} from "../../execution/capabilities/validation/ExchangeOrderValidator";

import {
  paperOrderExecutor,
} from "../../trading/execution/PaperOrderExecutor";

import type {
  ExecutionPlan,
} from "../../trading/models/ExecutionPlan";

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

function capability(
  withRules: boolean,
): ExchangeMarketCapability {
  return {
    exchange:
      "coinswitch",
    market:
      "BTC_INR",
    baseAsset:
      "BTC",
    quoteAsset:
      "INR",
    product:
      "spot",
    tradingEnabled:
      true,
    maintenanceMode:
      false,
    order: {
      supportedOrderTypes: [
        "limit",
      ],
      supportedTimeInForce:
        [],
      supportsPostOnly:
        false,
      supportsClientOrderId:
        true,
      supportsOrderCancellation:
        true,
      supportsOrderStatusPolling:
        true,
    },
    price: {
      minimumPrice:
        null,
      maximumPrice:
        null,
      priceStep:
        withRules
          ? 0.01
          : null,
      pricePrecision:
        withRules
          ? 2
          : null,
    },
    quantity: {
      minimumQuantity:
        null,
      maximumQuantity:
        null,
      quantityStep:
        withRules
          ? 0.000001
          : null,
      quantityPrecision:
        withRules
          ? 6
          : null,
    },
    notional: {
      minimumNotional:
        withRules
          ? 100
          : null,
      maximumNotional:
        withRules
          ? 1_000_000
          : null,
    },
    fees: {
      makerFeeRate:
        null,
      takerFeeRate:
        null,
      feeAsset:
        null,
    },
    sourceUpdatedAt:
      null,
    synchronizedAt:
      Date.now(),
  };
}

function paperPlan():
  ExecutionPlan {
  const now =
    Date.now();

  return {
    id:
      "paper-fee-evidence-fixture",
    market:
      "BTC_INR",
    mode:
      "PAPER",
    strategy:
      "PARALLEL",
    status:
      "READY",
    capital:
      100,
    expectedProfit:
      1,
    expectedProfitPercent:
      1,
    maximumSlippagePercent:
      0,
    timeoutMs:
      3_000,
    buy: {
      exchange:
        "coinswitch",
      market:
        "BTC_INR",
      side:
        "BUY",
      quantity:
        1,
      limitPrice:
        100,
    },
    sell: {
      exchange:
        "unocoin",
      market:
        "BTC_INR",
      side:
        "SELL",
      quantity:
        1,
      limitPrice:
        101,
    },
    createdAt:
      now,
  };
}

function main(): void {
  const unknownRuleResult =
    exchangeOrderValidator
      .validate({
        exchange:
          "coinswitch",
        market:
          "BTC_INR",
        side:
          "buy",
        orderType:
          "limit",
        quantity:
          1,
        price:
          100,
        capability:
          capability(
            false,
          ),
      });

  assertCondition(
    !unknownRuleResult.valid &&
    unknownRuleResult.issues.filter(
      (issue) =>
        issue.code ===
        "CAPABILITY_DATA_INVALID",
    ).length ===
      3,
    "Unknown quantity, price, or minimum-notional rules must block an order instead of passing validation.",
  );

  const completeRuleResult =
    exchangeOrderValidator
      .validate({
        exchange:
          "coinswitch",
        market:
          "BTC_INR",
        side:
          "buy",
        orderType:
          "limit",
        quantity:
          1,
        price:
          100,
        capability:
          capability(
            true,
          ),
      });

  assertCondition(
    completeRuleResult.valid,
    "Current complete order-rule evidence should allow an otherwise valid paper order.",
  );

  const incompleteIncrementCapability =
    capability(
      true,
    );

  incompleteIncrementCapability.price = {
    ...incompleteIncrementCapability.price,
    priceStep:
      null,
    pricePrecision:
      null,
  };

  incompleteIncrementCapability.quantity = {
    ...incompleteIncrementCapability.quantity,
    quantityStep:
      null,
    quantityPrecision:
      null,
  };

  const strictIncompleteIncrementResult =
    exchangeOrderValidator
      .validate({
        exchange:
          "coinswitch",
        market:
          "BTC_INR",
        side:
          "buy",
        orderType:
          "limit",
        quantity:
          1,
        price:
          100,
        capability:
          incompleteIncrementCapability,
      });

  assertCondition(
    !strictIncompleteIncrementResult.valid,
    "Missing increment evidence must remain blocked for an exchange-order validation.",
  );

  const isolatedPaperIncompleteIncrementResult =
    exchangeOrderValidator
      .validate({
        exchange:
          "coinswitch",
        market:
          "BTC_INR",
        side:
          "buy",
        orderType:
          "limit",
        quantity:
          1,
        price:
          100,
        capability:
          incompleteIncrementCapability,
        validationMode:
          "ISOLATED_PAPER_SIMULATION",
      });

  assertCondition(
    isolatedPaperIncompleteIncrementResult.valid,
    "Isolated PAPER may model positive, notional-valid values when only increment metadata is unpublished.",
  );

  clearDynamicFeeEvidence(
    "coinswitch",
  );
  clearDynamicFeeEvidence(
    "unocoin",
  );

  let missingFeeBlocked =
    false;

  try {
    paperOrderExecutor.execute(
      paperPlan(),
      {
        simulatedSlippagePercent:
          0,
      },
    );
  } catch {
    missingFeeBlocked =
      true;
  }

  assertCondition(
    missingFeeBlocked,
    "Paper execution must block when a five-exchange route lacks current market-specific fee evidence.",
  );

  const synchronizedAt =
    Date.now();

  replaceExchangeMarketFeeEvidence(
    "coinswitch",
    [
      {
        exchange:
          "coinswitch",
        market:
          "BTC_INR",
        makerPercent:
          0.1,
        takerPercent:
          0.2,
        source:
          "ACCOUNT_API",
        synchronizedAt,
        expiresAt:
          synchronizedAt +
          60_000,
      },
    ],
  );

  replaceExchangeMarketFeeEvidence(
    "unocoin",
    [
      {
        exchange:
          "unocoin",
        market:
          "BTC_INR",
        makerPercent:
          0.2,
        takerPercent:
          0.3,
        source:
          "PUBLIC_API",
        synchronizedAt,
        expiresAt:
          synchronizedAt +
          60_000,
      },
    ],
  );

  try {
    const result =
      paperOrderExecutor.execute(
        paperPlan(),
        {
          simulatedSlippagePercent:
            0,
        },
      );

    assertCondition(
      Math.abs(
        result.totalFees -
        0.503,
      ) <
        1e-12 &&
      Math.abs(
        result.netProfit -
        0.497,
      ) <
        1e-12,
      "Paper execution must calculate fees from current market evidence rather than a hardcoded default.",
    );
  } finally {
    clearDynamicFeeEvidence(
      "coinswitch",
    );
    clearDynamicFeeEvidence(
      "unocoin",
    );
  }

  console.log(
    "FIVE-EXCHANGE PAPER/SHADOW SAFETY TEST PASSED.",
  );

  console.log(
    "No LIVE adapter or order submission path was invoked.",
  );
}

main();
