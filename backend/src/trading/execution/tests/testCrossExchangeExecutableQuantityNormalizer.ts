import assert from "node:assert/strict";

import type {
  ExchangeMarketCapability,
} from "../../../execution/capabilities/models/ExchangeCapability";

import {
  exchangeOrderValidator,
} from "../../../execution/capabilities/validation/ExchangeOrderValidator";

import {
  crossExchangeExecutableQuantityNormalizer,
} from "../CrossExchangeExecutableQuantityNormalizer";

interface CapabilityOverrides {
  exchange: string;

  quantityStep: number | null;

  quantityPrecision: number | null;

  minimumQuantity?: number | null;

  maximumQuantity?: number | null;

  minimumNotional?: number | null;

  maximumNotional?: number | null;
}

function capability(
  overrides:
    CapabilityOverrides,
): ExchangeMarketCapability {
  return {
    exchange:
      overrides.exchange,
    market:
      "XRP_INR",
    baseAsset:
      "XRP",
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
      supportedTimeInForce: [],
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
        0.01,
      pricePrecision:
        2,
    },
    quantity: {
      minimumQuantity:
        overrides.minimumQuantity ??
        0.1,
      maximumQuantity:
        overrides.maximumQuantity ??
        1_000,
      quantityStep:
        overrides.quantityStep,
      quantityPrecision:
        overrides.quantityPrecision,
    },
    notional: {
      minimumNotional:
        overrides.minimumNotional ??
        10,
      maximumNotional:
        overrides.maximumNotional ??
        1_000_000,
    },
    fees: {
      makerFeeRate:
        0.001,
      takerFeeRate:
        0.002,
      feeAsset:
        "INR",
    },
    sourceUpdatedAt:
      Date.now(),
    synchronizedAt:
      Date.now(),
  };
}

function main(): void {
  const buyCapability =
    capability({
      exchange:
        "buy-venue",
      quantityStep:
        0.1,
      quantityPrecision:
        1,
    });

  const sellCapability =
    capability({
      exchange:
        "sell-venue",
      quantityStep:
        0.01,
      quantityPrecision:
        2,
    });

  const floatingResidue =
    crossExchangeExecutableQuantityNormalizer
      .normalize({
        rawQuantity:
          54.400000000000006,
        buyPrice:
          100,
        sellPrice:
          101,
        buyCapability,
        sellCapability,
      });

  assert.equal(
    floatingResidue.state,
    "UNCHANGED",
  );
  assert.equal(
    floatingResidue.normalizedQuantity,
    54.4,
  );
  assert.equal(
    floatingResidue.commonQuantityIncrement,
    0.1,
  );
  assert.equal(
    floatingResidue.quantityNeverIncreased,
    true,
  );

  const roundedDown =
    crossExchangeExecutableQuantityNormalizer
      .normalize({
        rawQuantity:
          54.47,
        buyPrice:
          100,
        sellPrice:
          101,
        buyCapability,
        sellCapability,
      });

  assert.equal(
    roundedDown.state,
    "NORMALIZED",
  );
  assert.equal(
    roundedDown.normalizedQuantity,
    54.4,
  );

  const mismatchedSteps =
    crossExchangeExecutableQuantityNormalizer
      .normalize({
        rawQuantity:
          2.74,
        buyPrice:
          100,
        sellPrice:
          101,
        buyCapability:
          capability({
            exchange:
              "quarter-step",
            quantityStep:
              0.25,
            quantityPrecision:
              2,
          }),
        sellCapability:
          capability({
            exchange:
              "tenth-step",
            quantityStep:
              0.1,
            quantityPrecision:
              1,
          }),
      });

  assert.equal(
    mismatchedSteps.commonQuantityIncrement,
    0.5,
  );
  assert.equal(
    mismatchedSteps.normalizedQuantity,
    2.5,
  );

  const maximumClipped =
    crossExchangeExecutableQuantityNormalizer
      .normalize({
        rawQuantity:
          10.9,
        buyPrice:
          100,
        sellPrice:
          101,
        buyCapability:
          capability({
            exchange:
              "capped-buy",
            quantityStep:
              0.1,
            quantityPrecision:
              1,
            maximumQuantity:
              5.05,
          }),
        sellCapability,
      });

  assert.equal(
    maximumClipped.normalizedQuantity,
    5,
  );
  assert.equal(
    maximumClipped.state,
    "NORMALIZED",
  );

  const belowNotional =
    crossExchangeExecutableQuantityNormalizer
      .normalize({
        rawQuantity:
          0.19,
        buyPrice:
          20,
        sellPrice:
          21,
        buyCapability:
          capability({
            exchange:
              "minimum-buy",
            quantityStep:
              0.1,
            quantityPrecision:
              1,
            minimumNotional:
              10,
          }),
        sellCapability:
          capability({
            exchange:
              "minimum-sell",
            quantityStep:
              0.1,
            quantityPrecision:
              1,
            minimumNotional:
              10,
          }),
      });

  assert.equal(
    belowNotional.state,
    "BLOCKED",
  );
  assert.equal(
    belowNotional.normalizedQuantity,
    null,
  );
  assert.ok(
    belowNotional.blockers.some(
      (
        blocker,
      ) =>
        blocker.includes(
          "below minimum",
        ),
    ),
  );

  const sandMinimumOrderCushion =
    crossExchangeExecutableQuantityNormalizer.normalize({
      rawQuantity: 118.26145071226081,
      buyPrice: 0.04233,
      sellPrice: 0.04274,
      buyCapability: capability({
        exchange: "bybit",
        quantityStep: 0.01,
        quantityPrecision: 2,
        minimumNotional: 5,
      }),
      sellCapability: capability({
        exchange: "coindcx",
        quantityStep: 1,
        quantityPrecision: 0,
        minimumNotional: 5,
      }),
      maximumQuantity: 119.3,
      allowMinimumOrderRoundUpWithinHardCap: true,
    });

  assert.equal(sandMinimumOrderCushion.state, "NORMALIZED");
  assert.equal(sandMinimumOrderCushion.normalizedQuantity, 119);
  assert.equal(sandMinimumOrderCushion.commonQuantityIncrement, 1);
  assert.equal(sandMinimumOrderCushion.minimumOrderCushionUsed, true);
  assert.equal(sandMinimumOrderCushion.minimumOrderCushionSteps, 1);
  assert.equal(sandMinimumOrderCushion.roundDownOnly, false);
  assert.equal(sandMinimumOrderCushion.quantityNeverIncreased, false);
  assert.ok((sandMinimumOrderCushion.increaseQuantity ?? 0) < 1);

  const mantraBybitCoinDcxCushion =
    crossExchangeExecutableQuantityNormalizer.normalize({
      rawQuantity: 1183.069751308,
      buyPrice: 0.004199,
      sellPrice: 0.00423,
      buyCapability: capability({
        exchange: "bybit",
        quantityStep: 0.1,
        quantityPrecision: 1,
        maximumQuantity: 10_000,
        minimumNotional: 5,
      }),
      sellCapability: capability({
        exchange: "coindcx",
        quantityStep: 1,
        quantityPrecision: 0,
        maximumQuantity: 10_000,
        minimumNotional: 5,
      }),
      maximumQuantity: 2_300,
      allowMinimumOrderRoundUpWithinHardCap: true,
    });

  assert.equal(mantraBybitCoinDcxCushion.state, "NORMALIZED");
  assert.equal(mantraBybitCoinDcxCushion.normalizedQuantity, 1191);
  assert.equal(mantraBybitCoinDcxCushion.commonQuantityIncrement, 1);
  assert.equal(mantraBybitCoinDcxCushion.minimumOrderCushionUsed, true);
  assert.equal(mantraBybitCoinDcxCushion.minimumOrderCushionSteps, 8);
  assert.ok(
    (mantraBybitCoinDcxCushion.legs[0]?.normalizedNotional ?? 0) >= 5,
  );

  const binanceCoinDcxCushion =
    crossExchangeExecutableQuantityNormalizer.normalize({
      rawQuantity: 771,
      buyPrice: 0.00647,
      sellPrice: 0.00655,
      buyCapability: capability({
        exchange: "coindcx",
        quantityStep: 1,
        quantityPrecision: 0,
        minimumNotional: 5,
      }),
      sellCapability: capability({
        exchange: "binance",
        quantityStep: 0.1,
        quantityPrecision: 1,
        minimumNotional: 5,
      }),
      maximumQuantity: 900,
      allowMinimumOrderRoundUpWithinHardCap: true,
    });

  assert.equal(binanceCoinDcxCushion.state, "NORMALIZED");
  assert.equal(binanceCoinDcxCushion.normalizedQuantity, 773);
  assert.equal(binanceCoinDcxCushion.minimumOrderCushionSteps, 2);

  const binanceBybitCushion =
    crossExchangeExecutableQuantityNormalizer.normalize({
      rawQuantity: 49.2,
      buyPrice: 0.1,
      sellPrice: 0.102,
      buyCapability: capability({
        exchange: "binance",
        quantityStep: 0.1,
        quantityPrecision: 1,
        minimumNotional: 5,
      }),
      sellCapability: capability({
        exchange: "bybit",
        quantityStep: 0.01,
        quantityPrecision: 2,
        minimumNotional: 5,
      }),
      maximumQuantity: 55,
      allowMinimumOrderRoundUpWithinHardCap: true,
    });

  assert.equal(binanceBybitCushion.state, "NORMALIZED");
  assert.equal(binanceBybitCushion.normalizedQuantity, 50);
  assert.equal(binanceBybitCushion.minimumOrderCushionSteps, 8);

  const sandCushionAboveHardCap =
    crossExchangeExecutableQuantityNormalizer.normalize({
      rawQuantity: 118.26145071226081,
      buyPrice: 0.04233,
      sellPrice: 0.04274,
      buyCapability: capability({
        exchange: "bybit",
        quantityStep: 0.01,
        quantityPrecision: 2,
        minimumNotional: 5,
      }),
      sellCapability: capability({
        exchange: "coindcx",
        quantityStep: 1,
        quantityPrecision: 0,
        minimumNotional: 5,
      }),
      maximumQuantity: 118.9,
      allowMinimumOrderRoundUpWithinHardCap: true,
    });

  assert.equal(sandCushionAboveHardCap.state, "BLOCKED");
  assert.equal(sandCushionAboveHardCap.minimumOrderCushionUsed, false);
  assert.match(
    sandCushionAboveHardCap.blockers[0] ?? "",
    /above the safe quantity ceiling/iu,
    "The actionable depth/capital ceiling must be the primary blocker shown to the operator.",
  );
  assert.match(
    sandCushionAboveHardCap.blockers.join(" "),
    /above the safe quantity ceiling/iu,
  );

  const minimumNotionalFloatingBoundary =
    crossExchangeExecutableQuantityNormalizer
      .normalize({
        rawQuantity:
          0.3,
        buyPrice:
          33.33333333333333,
        sellPrice:
          33.33333333333333,
        buyCapability:
          capability({
            exchange:
              "floating-boundary-buy",
            quantityStep:
              0.1,
            quantityPrecision:
              1,
            minimumNotional:
              10,
          }),
        sellCapability:
          capability({
            exchange:
              "floating-boundary-sell",
            quantityStep:
              0.1,
            quantityPrecision:
              1,
            minimumNotional:
              10,
          }),
      });

  assert.notEqual(
    minimumNotionalFloatingBoundary.state,
    "BLOCKED",
    "IEEE-754 residue at the exact exchange minimum must not create a false blocker.",
  );

  const missingCapability =
    crossExchangeExecutableQuantityNormalizer
      .normalize({
        rawQuantity:
          1,
        buyPrice:
          100,
        sellPrice:
          101,
        buyCapability:
          null,
        sellCapability,
      });

  assert.equal(
    missingCapability.state,
    "BLOCKED",
  );

  const missingIncrementRules =
    crossExchangeExecutableQuantityNormalizer
      .normalize({
        rawQuantity:
          1,
        buyPrice:
          100,
        sellPrice:
          101,
        buyCapability:
          capability({
            exchange:
              "missing-rules",
            quantityStep:
              null,
            quantityPrecision:
              null,
          }),
        sellCapability,
      });

  assert.equal(
    missingIncrementRules.state,
    "BLOCKED",
  );
  assert.ok(
    missingIncrementRules.blockers.some(
      (
        blocker,
      ) =>
        blocker.includes(
          "increment/precision evidence",
        ),
    ),
  );

  const paperOnlyMissingIncrementFallback =
    crossExchangeExecutableQuantityNormalizer
      .normalize({
        rawQuantity:
          1.23456,
        buyPrice:
          100,
        sellPrice:
          101,
        buyCapability:
          capability({
            exchange:
              "known-paper-leg",
            quantityStep:
              0.01,
            quantityPrecision:
              2,
          }),
        sellCapability:
          capability({
            exchange:
              "unpublished-paper-leg",
            quantityStep:
              null,
            quantityPrecision:
              null,
          }),
        allowIncompleteIncrementEvidenceForPaper:
          true,
      });

  assert.equal(
    paperOnlyMissingIncrementFallback.state,
    "NORMALIZED",
  );
  assert.equal(
    paperOnlyMissingIncrementFallback.normalizedQuantity,
    1.23,
  );
  assert.equal(
    paperOnlyMissingIncrementFallback.commonQuantityIncrement,
    0.01,
  );
  assert.equal(
    paperOnlyMissingIncrementFallback.incrementEvidenceComplete,
    false,
  );
  assert.equal(
    paperOnlyMissingIncrementFallback.paperOnlyFallbackUsed,
    true,
  );
  assert.equal(
    paperOnlyMissingIncrementFallback.liveOrderSafe,
    false,
  );

  const paperFallbackWithoutAnyIncrement =
    crossExchangeExecutableQuantityNormalizer
      .normalize({
        rawQuantity:
          1,
        buyPrice:
          100,
        sellPrice:
          101,
        buyCapability:
          capability({
            exchange:
              "unknown-paper-buy",
            quantityStep:
              null,
            quantityPrecision:
              null,
          }),
        sellCapability:
          capability({
            exchange:
              "unknown-paper-sell",
            quantityStep:
              null,
            quantityPrecision:
              null,
          }),
        allowIncompleteIncrementEvidenceForPaper:
          true,
      });

  assert.equal(
    paperFallbackWithoutAnyIncrement.state,
    "BLOCKED",
  );
  assert.equal(
    paperFallbackWithoutAnyIncrement.liveOrderSafe,
    false,
  );

  const residueValidation =
    exchangeOrderValidator
      .validate({
        exchange:
          buyCapability.exchange,
        market:
          buyCapability.market,
        side:
          "sell",
        orderType:
          "limit",
        quantity:
          54.400000000000006,
        price:
          100,
        capability:
          buyCapability,
      });

  assert.equal(
    residueValidation.valid,
    true,
    "Binary floating-point residue must not create a false quantity-precision rejection.",
  );

  const truePrecisionViolation =
    exchangeOrderValidator
      .validate({
        exchange:
          buyCapability.exchange,
        market:
          buyCapability.market,
        side:
          "sell",
        orderType:
          "limit",
        quantity:
          54.45,
        price:
          100,
        capability:
          buyCapability,
      });

  assert.equal(
    truePrecisionViolation.valid,
    false,
  );
  assert.ok(
    truePrecisionViolation.issues.some(
      (
        issue,
      ) =>
        issue.code ===
        "QUANTITY_PRECISION_EXCEEDED",
    ),
  );

  console.log(
    "Cross-exchange executable quantity normalization tests passed.",
  );
}

try {
  main();
} catch (
  error:
    unknown
) {
  console.error(
    error,
  );
  process.exitCode =
    1;
}
