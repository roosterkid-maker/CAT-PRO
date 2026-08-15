import assert from "node:assert/strict";

import type {
  BinanceMarketRules,
  BinanceMarketRulesSource,
} from "../binance/api/BinanceMarketRulesApi";
import {
  BinanceCapabilityProvider,
} from "../../execution/capabilities/providers/binance/BinanceCapabilityProvider";

class FakeBinanceMarketRulesSource
  implements BinanceMarketRulesSource
{
  allMarketRequests =
    0;

  symbolRequests =
    0;

  async getAllMarketRules():
    Promise<BinanceMarketRules[]> {
    this.allMarketRequests +=
      1;

    return [
      createRules(
        "BTCUSDT",
        "BTC",
      ),
      createRules(
        "ETHUSDT",
        "ETH",
        false,
      ),
      createRules(
        "ENSOUSDT",
        "ENSO",
        true,
        0.01,
      ),
    ];
  }

  async getMarketRules(
    symbol: string,
  ): Promise<BinanceMarketRules> {
    this.symbolRequests +=
      1;

    return createRules(
      symbol,
      symbol.startsWith(
        "BTC",
      )
        ? "BTC"
        : "ETH",
    );
  }
}

async function main():
  Promise<void> {
  const source =
    new FakeBinanceMarketRulesSource();

  const provider =
    new BinanceCapabilityProvider(
      source,
    );

  const firstCatalog =
    await provider.getCapabilities({
      product:
        "spot",
      forceRefresh:
        false,
    });

  assert.equal(
    firstCatalog.length,
    3,
  );

  assert.equal(
    source.allMarketRequests,
    1,
  );

  assert.equal(
    source.symbolRequests,
    0,
  );

  assert.ok(
    firstCatalog.every(
      (capability) =>
        capability.order
          .supportedOrderTypes
          .includes(
            "limit",
          ) &&
        capability.price
          .priceStep !==
          null &&
        capability.quantity
          .quantityStep !==
          null &&
        capability.notional
          .minimumNotional !==
          null,
    ),
  );

  assert.equal(
    firstCatalog.find((capability) => capability.market === "BTCUSDT")?.order.supportsPostOnly,
    true,
  );

  assert.equal(
    firstCatalog.find((capability) => capability.market === "ETHUSDT")?.order.supportsPostOnly,
    false,
  );

  assert.equal(
    firstCatalog.find((capability) => capability.market === "ENSOUSDT")?.quantity.quantityPrecision,
    2,
    "A 0.01 Binance LOT_SIZE step must not acquire a binary floating-point precision tail.",
  );

  const cachedCatalog =
    await provider.getCapabilities({
      product:
        "spot",
      forceRefresh:
        false,
    });

  assert.equal(
    cachedCatalog.length,
    3,
  );

  assert.equal(
    source.allMarketRequests,
    1,
  );

  const refreshedMarket =
    await provider.getCapability(
      "BTCUSDT",
    );

  assert.equal(
    refreshedMarket?.market,
    "BTCUSDT",
  );

  assert.equal(
    source.symbolRequests,
    1,
  );

  console.log(
    "Binance bulk capability synchronization test passed.",
  );
}

function createRules(
  symbol: string,
  baseAsset: string,
  supportsLimitMaker = true,
  quantityStep = 0.0001,
): BinanceMarketRules {
  return {
    symbol:
      symbol.toUpperCase(),
    status:
      "TRADING",
    baseAsset,
    quoteAsset:
      "USDT",
    spotTradingAllowed:
      true,
    minimumPrice:
      0.01,
    maximumPrice:
      1_000_000,
    priceStep:
      0.01,
    minimumQuantity:
      0.0001,
    maximumQuantity:
      1_000,
    quantityStep:
      quantityStep,
    minimumNotional:
      5,
    maximumNotional:
      null,
    supportedOrderTypes: [
      "LIMIT",
      "MARKET",
      ...(supportsLimitMaker ? ["LIMIT_MAKER"] : []),
    ],
  };
}

void main().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      error,
    );

    process.exitCode =
      1;
  },
);
