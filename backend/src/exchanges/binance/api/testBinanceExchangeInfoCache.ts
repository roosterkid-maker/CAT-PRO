import assert
  from "node:assert/strict";

import {
  BinanceMarketRulesApi,
  type BinanceMarketRulesHttpPort,
} from "./BinanceMarketRulesApi";

async function main():
  Promise<void> {
  let now =
    1_788_210_000_000;

  let networkReads =
    0;

  const port:
    BinanceMarketRulesHttpPort = {
    getPublic:
      async <T>() => {
        networkReads +=
          1;

        await Promise.resolve();

        return {
          symbols: [
            {
              symbol:
                "BTCUSDT",
              status:
                "TRADING",
              baseAsset:
                "BTC",
              quoteAsset:
                "USDT",
              isSpotTradingAllowed:
                true,
              orderTypes: [
                "LIMIT",
                "LIMIT_MAKER",
              ],
              filters: [
                {
                  filterType:
                    "PRICE_FILTER",
                  minPrice:
                    "0.01",
                  maxPrice:
                    "1000000",
                  tickSize:
                    "0.01",
                },
                {
                  filterType:
                    "LOT_SIZE",
                  minQty:
                    "0.00001",
                  maxQty:
                    "1000",
                  stepSize:
                    "0.00001",
                },
                {
                  filterType:
                    "MIN_NOTIONAL",
                  minNotional:
                    "5",
                },
              ],
            },
          ],
        } as T;
      },
  };

  const api =
    new BinanceMarketRulesApi(
      port,
      () => now,
      1_000,
    );

  const [
    all,
    market,
  ] = await Promise.all([
    api.getAllMarketRules(),
    api.getMarketRules(
      "btcusdt",
    ),
  ]);

  assert.equal(
    networkReads,
    1,
    "Concurrent all-market and single-market lookups must share one exchangeInfo request.",
  );

  assert.equal(
    all.length,
    1,
  );

  assert.equal(
    market.symbol,
    "BTCUSDT",
  );

  await api.getMarketRules(
    "BTCUSDT",
  );

  assert.equal(
    networkReads,
    1,
    "Fresh market-rule lookups must reuse the bounded exchangeInfo cache.",
  );

  now +=
    1_000;

  await api.getAllMarketRules();

  assert.equal(
    networkReads,
    2,
    "The catalog must refresh once after its cache expires.",
  );

  console.log(
    "BINANCE EXCHANGE-INFO CACHE TEST PASSED.",
  );

  console.log(
    "Bulk and per-market rules now share one single-flight five-minute catalog cache instead of multiplying weight by candidate count.",
  );
}

void main();
