import {
  BybitCapabilityProvider,
} from "../../execution/capabilities/providers/bybit/BybitCapabilityProvider";

import type {
  BybitSpotInstrument,
} from "../bybit/marketLoader";

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

async function loadFixtureInstruments():
Promise<BybitSpotInstrument[]> {
  return [
    {
      symbol:
        "BTCUSDT",

      baseCoin:
        "BTC",

      quoteCoin:
        "USDT",

      status:
        "Trading",

      priceFilter: {
        tickSize:
          "0.1",
      },

      lotSizeFilter: {
        basePrecision:
          "0.000001",

        quotePrecision:
          "0.0000001",

        minOrderQty:
          "0.000001",

        maxOrderQty:
          "230",

        minOrderAmt:
          "5",

        maxOrderAmt:
          "8000000",

        maxLimitOrderQty:
          "230",

        maxMarketOrderQty:
          "120",

        postOnlyMaxLimitOrderSize:
          "1150",
      },
    },

    {
      symbol:
        "PAUSEDUSDT",

      baseCoin:
        "PAUSED",

      quoteCoin:
        "USDT",

      status:
        "PreLaunch",

      priceFilter: {
        tickSize:
          "0.0001",
      },

      lotSizeFilter: {
        basePrecision:
          "0.01",

        minOrderAmt:
          "1",

        maxLimitOrderQty:
          "1000",

        maxMarketOrderQty:
          "500",
      },
    },
  ];
}

async function main():
  Promise<void> {
  const provider =
    new BybitCapabilityProvider(
      loadFixtureInstruments,
    );

  const capabilities =
    await provider.getCapabilities({
      forceRefresh:
        true,
    });

  const btc =
    capabilities.find(
      (capability) =>
        capability.market ===
        "BTCUSDT",
    );

  const paused =
    capabilities.find(
      (capability) =>
        capability.market ===
        "PAUSEDUSDT",
    );

  assertCondition(
    capabilities.length ===
      2 &&
      btc !==
        undefined &&
      btc.baseAsset ===
        "BTC" &&
      btc.quoteAsset ===
        "USDT" &&
      btc.tradingEnabled &&
      !btc.maintenanceMode,
    "Bybit spot instruments must normalize into the common market capability model.",
  );

  assertCondition(
    btc.order
      .supportedOrderTypes
      .includes(
        "market",
      ) &&
      btc.order
        .supportedOrderTypes
        .includes(
          "limit",
        ) &&
      btc.order
        .supportedTimeInForce
        .includes(
          "GTC",
        ) &&
      btc.order
        .supportedTimeInForce
        .includes(
          "IOC",
        ) &&
      btc.order
        .supportedTimeInForce
        .includes(
          "FOK",
        ) &&
      btc.order
        .supportsPostOnly &&
      btc.order
        .supportsClientOrderId,
    "Bybit order capabilities must match the audited public V5 contract.",
  );

  assertCondition(
    btc.price
      .priceStep ===
        0.1 &&
      btc.price
        .pricePrecision ===
        1 &&
      btc.quantity
        .minimumQuantity ===
        null &&
      btc.quantity
        .maximumQuantity ===
        120 &&
      btc.quantity
        .quantityStep ===
        0.000001 &&
      btc.quantity
        .quantityPrecision ===
        6 &&
      btc.notional
        .minimumNotional ===
        5 &&
      btc.notional
        .maximumNotional ===
        null &&
      btc.fees
        .makerFeeRate ===
        null &&
      btc.fees
        .takerFeeRate ===
        null,
    "Bybit rules must use current fields, ignore deprecated limits, and avoid invented fees.",
  );

  assertCondition(
    paused !==
      undefined &&
      !paused.tradingEnabled &&
      paused.maintenanceMode,
    "A non-Trading Bybit instrument must remain fail-closed.",
  );

  const normalizedLookup =
    await provider.getCapability(
      "btc_usdt",
    );

  assertCondition(
    normalizedLookup?.market ===
      "BTCUSDT",
    "Bybit capability lookup must normalize common market separators.",
  );

  console.log(
    "BYBIT MARKET RULES INTEGRATION TEST PASSED.",
  );

  console.log(
    "No authenticated request or order was submitted.",
  );
}

void main().catch(
  (error: unknown) => {
    console.error(
      "[Bybit Market Rules Integration Test]",
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
