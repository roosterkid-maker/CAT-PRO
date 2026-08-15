import type {
  ExchangeMarketCapability,
  ExchangeTradingProduct,
} from "../models/ExchangeCapability";

import {
  createExchangeCapabilityKey,
} from "../models/ExchangeCapability";

import type {
  ExchangeCapabilityProvider,
  ExchangeCapabilityQuery,
} from "../providers/ExchangeCapabilityProvider";

import {
  ExchangeCapabilityService,
} from "../services/ExchangeCapabilityService";

import {
  ExchangeOrderValidator,
} from "../validation/ExchangeOrderValidator";

const NOW =
  1_700_000_000_000;

class FixtureCapabilityProvider
  implements ExchangeCapabilityProvider
{
  readonly exchange =
    "fixture";

  readonly forceRefreshRequests:
    boolean[] = [];

  constructor(
    private lastSynchronizationTime:
      number | null,
  ) {}

  async getCapabilities(
    query:
      ExchangeCapabilityQuery = {},
  ): Promise<
    readonly ExchangeMarketCapability[]
  > {
    const forceRefresh =
      query.forceRefresh ===
      true;

    this.forceRefreshRequests.push(
      forceRefresh,
    );

    if (forceRefresh) {
      this.lastSynchronizationTime =
        NOW;
    }

    return [
      capability(
        this.lastSynchronizationTime ??
          NOW,
      ),
    ];
  }

  async getCapability(
    _market: string,
    _product:
      ExchangeTradingProduct =
      "spot",
  ): Promise<
    ExchangeMarketCapability
  > {
    return capability(
      this.lastSynchronizationTime ??
        NOW,
    );
  }

  invalidateCache(): void {
    this.lastSynchronizationTime =
      null;
  }

  getLastSynchronizationTime():
    number | null {
    return this.lastSynchronizationTime;
  }

  isSynchronized(): boolean {
    return this.lastSynchronizationTime !==
      null;
  }
}

function capability(
  synchronizedAt: number,
): ExchangeMarketCapability {
  return {
    exchange:
      "fixture",
    market:
      "BTC_USDT",
    baseAsset:
      "BTC",
    quoteAsset:
      "USDT",
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
      supportedTimeInForce: [
        "GTC",
      ],
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
        null,
      maximumQuantity:
        null,
      quantityStep:
        0.00001,
      quantityPrecision:
        5,
    },
    notional: {
      minimumNotional:
        10,
      maximumNotional:
        null,
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
      synchronizedAt,
    synchronizedAt,
  };
}

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main():
  Promise<void> {
  const provider =
    new FixtureCapabilityProvider(
      NOW -
        5 * 60 * 1000,
    );
  const service =
    new ExchangeCapabilityService(
      [provider],
      () => NOW,
    );

  await service.synchronizeExchange(
    "fixture",
    {
      product:
        "spot",
      forceRefresh:
        false,
    },
  );

  assert(
    provider.forceRefreshRequests[0] ===
      true,
    "A five-minute-old provider cache must be refreshed even when the caller permits cached data.",
  );

  const separatorFreeCapability =
    await service.getCapability({
      exchange:
        "fixture",
      market:
        "BTCUSDT",
      product:
        "spot",
    });

  assert(
    separatorFreeCapability?.market ===
      "BTC_USDT",
    "A separator-free route must resolve the venue capability without rewriting its auditable market spelling.",
  );

  assert(
    createExchangeCapabilityKey(
      "fixture",
      "BTC_USDT",
    ) ===
      createExchangeCapabilityKey(
        "fixture",
        "BTC-USDT",
      ) &&
      createExchangeCapabilityKey(
        "fixture",
        "BTC-USDT",
      ) ===
        createExchangeCapabilityKey(
          "fixture",
          "BTCUSDT",
        ),
    "Capability identity must be stable across supported market separators.",
  );

  const validation =
    new ExchangeOrderValidator()
      .validate({
        exchange:
          "fixture",
        market:
          "BTCUSDT",
        product:
          "spot",
        side:
          "buy",
        orderType:
          "limit",
        timeInForce:
          "GTC",
        quantity:
          0.001,
        price:
          50_000,
        capability:
          separatorFreeCapability,
      });

  assert(
    validation.valid,
    "Order validation must accept a canonical route when capability evidence uses a venue separator.",
  );

  await service.synchronizeExchange(
    "fixture",
    {
      product:
        "spot",
      forceRefresh:
        false,
    },
  );

  assert(
    provider.forceRefreshRequests[1] ===
      false,
    "A fresh synchronized provider cache should be reused when the caller permits cached data.",
  );

  await service.synchronizeExchange(
    "fixture",
    {
      product:
        "spot",
    },
  );

  assert(
    provider.forceRefreshRequests[2] ===
      true,
    "The default synchronization contract must continue to force a refresh.",
  );

  provider.invalidateCache();

  await service.synchronizeExchange(
    "fixture",
    {
      product:
        "spot",
      forceRefresh:
        false,
    },
  );

  assert(
    provider.forceRefreshRequests[3] ===
      true,
    "An unsynchronized provider must refresh even when cached data was requested.",
  );

  console.log(
    "EXCHANGE CAPABILITY CACHE REFRESH TEST PASSED.",
  );
  console.log(
    "Only fixture capability metadata was used; no exchange request or order was submitted.",
  );
}

void main().catch(
  (
    error:
      unknown,
  ) => {
    console.error(
      error instanceof Error
        ? error.message
        : error,
    );

    process.exitCode =
      1;
  },
);
