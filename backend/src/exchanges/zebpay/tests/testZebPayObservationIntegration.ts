import {
  getExchangeFeeEvidence,
} from "../../../arbitrage/config/fees";

import {
  marketCache,
} from "../../../services/cache.service";

import {
  ZebPayObservationAdapter,
} from "../ZebPayObservationAdapter";

import {
  ZebPayPublicApi,
  type ZebPayPublicMarketApi,
} from "../ZebPayPublicApi";

import type {
  ZebPayMarket,
  ZebPayOrderBook,
  ZebPayTradePair,
} from "../types";

function assertCondition(
  condition:
    boolean,

  message:
    string,
): asserts condition {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

class FixtureApi
  implements ZebPayPublicMarketApi
{
  async getMarkets():
    Promise<ZebPayMarket[]> {
    return [
      {
        pair:
          "BTC-INR",
        virtualCurrency:
          "BTC",
        currency:
          "INR",
        market:
          "100.5",
        buy:
          "101",
        sell:
          "100",
        volumeEx:
          5,
      },
      {
        pair:
          "ETH-USDT",
        virtualCurrency:
          "ETH",
        currency:
          "USDT",
        market:
          "3000",
        buy:
          "3001",
        sell:
          "2999",
        volumeEx:
          2,
      },
      {
        pair:
          "COTI-INR",
        virtualCurrency:
          "COTI",
        currency:
          "INR",
        market:
          "1",
        volumeEx:
          0,
        volumeQt:
          100,
      },
      {
        pair:
          "BTC-EUR",
        virtualCurrency:
          "BTC",
        currency:
          "EUR",
        market:
          "80000",
        buy:
          "80100",
        sell:
          "79900",
        volumeEx:
          1,
      },
    ];
  }

  async getTradePairs():
    Promise<ZebPayTradePair[]> {
    return [
      {
        tradePairName:
          "BTC-INR",
        tradeVolumeCurrency:
          "BTC",
        tradeDenominationCurrency:
          "INR",
        volumeCurrencyDecimalPlaces:
          8,
        tradeCurrencyInputDecimalPlaces:
          8,
        denominationCurrencyInputDecimalPlaces:
          2,
        tradeMinimumAmount:
          99,
        tradeMaximumAmount:
          10_000_000,
        tradeTickSize:
          1,
        isEnable:
          true,
        isMarketOrderEnabled:
          true,
      },
      {
        tradePairName:
          "ETH-USDT",
        tradeVolumeCurrency:
          "ETH",
        tradeDenominationCurrency:
          "USDT",
        volumeCurrencyDecimalPlaces:
          8,
        isEnable:
          true,
      },
    ];
  }

  async getOrderBook(
    market: string,
  ): Promise<ZebPayOrderBook> {
    return market ===
        "BTC-INR"
      ? {
          pair:
            market,
          bids: [
            {
              price:
                100,
              amount:
                2,
            },
          ],
          asks: [
            {
              price:
                101,
              amount:
                3,
            },
          ],
        }
      : {
          pair:
            market,
          bids: [
            {
              price:
                2999,
              amount:
                4,
            },
          ],
          asks: [
            {
              price:
                3001,
              amount:
                5,
            },
          ],
        };
  }
}

class MetadataFailureApi
  extends FixtureApi
{
  override async getTradePairs():
    Promise<ZebPayTradePair[]> {
    throw new Error(
      "Simulated ZebPay trade-pair metadata outage.",
    );
  }
}

async function main():
  Promise<void> {
  marketCache.clear();

  const receivedAt =
    1_800_000_000_000;

  const adapter =
    new ZebPayObservationAdapter({
      api:
        new FixtureApi(),
      now:
        () => receivedAt,
      scheduleTimers:
        false,
    });

  await adapter.connect();

  assertCondition(
    adapter.isConnected() &&
      adapter.getMarketCount() ===
        2,
    "ZebPay observation adapter must publish only validated INR/USDT Spot observations.",
  );

  const btc =
    marketCache.get(
      "zebpay",
      "BTCINR",
    );

  assertCondition(
    btc !==
      undefined &&
      btc.bestBidPrice ===
        100 &&
      btc.bestAskPrice ===
        101 &&
      btc.bestBidQty ===
        null &&
      btc.bestAskQty ===
        null &&
      !btc.executable,
    "ZebPay discovery prices must never become executable without quantity-bearing depth.",
  );

  assertCondition(
    marketCache.get(
      "zebpay",
      "COTIINR",
    ) ===
      undefined,
    "Quick-Trade-only ZebPay markets must not be presented as Spot observations.",
  );

  await adapter.subscribe([
    "BTC_INR",
    "COTI_INR",
  ]);

  const diagnostics =
    adapter.getDiagnostics();

  assertCondition(
    diagnostics.requestedMarkets ===
      1 &&
      diagnostics.executableMarkets ===
        1 &&
      diagnostics.executionEligible &&
      diagnostics.blocker ===
        "NONE",
    "ZebPay subscriptions must promote only genuine quantity-bearing depth.",
  );

  const executableBtc =
    marketCache.get(
      "zebpay",
      "BTCINR",
    );

  assertCondition(
    executableBtc
      ?.bestBidQty ===
        2 &&
      executableBtc
        .bestAskQty ===
        3 &&
      executableBtc
        .executable ===
        true,
    "ZebPay REST bootstrap depth must preserve native quantities and become executable.",
  );

  const socketAccepted =
    adapter.ingestPublicMessage({
      type:
        "exchange-book",
      requestType:
        "BTC-INR",
      data: {
        bids: [
          [
            100,
            250_000_000,
          ],
        ],
        asks: [
          [
            101,
            300_000_000,
          ],
        ],
      },
    });

  assertCondition(
    socketAccepted &&
      marketCache.get(
        "zebpay",
        "BTCINR",
      )?.bestBidQty ===
        2.5,
    "ZebPay WebSocket atomic amounts must use authoritative base precision.",
  );

  assertCondition(
    getExchangeFeeEvidence(
      "zebpay",
      "BTCINR",
    ) ===
      null,
    "Depth alone must not fabricate account-specific fee evidence.",
  );

  const malformedApi =
    new ZebPayPublicApi(
      async () =>
        new Response(
          JSON.stringify({
            invalid:
              true,
          }),
          {
            status:
              200,
          },
        ),
      1_000,
    );

  let malformedRejected =
    false;

  try {
    await malformedApi
      .getMarkets();
  } catch {
    malformedRejected =
      true;
  }

  assertCondition(
    malformedRejected,
    "Malformed ZebPay public responses must be rejected.",
  );

  await adapter.disconnect();

  assertCondition(
    marketCache.getByExchange(
      "zebpay",
    ).length ===
      0,
    "Disconnect must remove ZebPay observation quotes.",
  );

  const metadataFailureAdapter =
    new ZebPayObservationAdapter({
      api:
        new MetadataFailureApi(),
      now:
        () => receivedAt,
      scheduleTimers:
        false,
    });

  await metadataFailureAdapter.connect();

  const metadataFailureDiagnostics =
    metadataFailureAdapter.getDiagnostics();

  assertCondition(
    metadataFailureAdapter.isConnected() &&
      metadataFailureAdapter.getMarketCount() === 2 &&
      metadataFailureDiagnostics.successfulPublicReads === 1 &&
      metadataFailureDiagnostics.failedPublicReads === 0 &&
      metadataFailureDiagnostics.failedMetadataReads === 1 &&
      metadataFailureDiagnostics.lastMetadataError !== null,
    "A trade-pair metadata outage must preserve truthful ZebPay market connectivity and remain separately diagnosed.",
  );

  await metadataFailureAdapter.disconnect();

  console.log(
    "ZEBPAY V162 DEPTH TEST PASSED: discovery remained quantity-free, REST/WebSocket books published genuine depth, and metadata outages did not falsely disconnect market data.",
  );
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
