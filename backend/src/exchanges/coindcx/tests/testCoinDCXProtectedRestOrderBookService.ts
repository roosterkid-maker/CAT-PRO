import assert from "node:assert/strict";

import type {
  OrderBook,
} from "../../../orderbook/models/OrderBook";

import {
  CoinDCXProtectedRestOrderBookService,
} from "../CoinDCXProtectedRestOrderBookService";

import {
  marketRegistry,
} from "../registry";

async function main(): Promise<void> {
  const stored: OrderBook[] = [];
  const service = new CoinDCXProtectedRestOrderBookService(
    {
      fetch: async (pair) => {
        if (pair === "I-USDT_INR") {
          return {
            bids: {"85.10": "100", "85.00": "200"},
            asks: {"85.20": "80", "85.30": "300"},
          };
        }

        assert.equal(pair, "B-BTC_USDT");
        return {
          bids: {"63999": "1.5", "63998": "2"},
          asks: {"64000": "1", "64001": "3"},
        };
      },
    },
    {
      replace: (book) => {
        stored.push(structuredClone(book));
        return {accepted: true, reason: "OK"};
      },
    },
    {refreshIntervalMs: 60_000},
  );

  assert.equal(await service.refresh(10_000), true);
  const conversion = stored.find((book) => book.market === "USDTINR");
  const hedgeAnchor = stored.find((book) => book.market === "BTCUSDT");
  assert.ok(conversion);
  assert.ok(hedgeAnchor);
  assert.equal(conversion.exchange, "coindcx");
  assert.equal(conversion.bids[0]?.price, 85.1);
  assert.equal(conversion.asks[0]?.price, 85.2);
  assert.equal(hedgeAnchor.bids[0]?.price, 63_999);
  assert.equal(hedgeAnchor.asks[0]?.price, 64_000);
  assert.equal(service.getDiagnostics().accepted, 2);
  assert.equal(service.getDiagnostics().books.length, 2);
  assert.equal(service.getDiagnostics().safety.orderSubmissionAllowed, false);

  marketRegistry.clear();
  marketRegistry.register({
    symbol: "COTI-USDT",
    pair: "KC-COTI_USDT",
    baseCurrency: "COTI",
    quoteCurrency: "USDT",
    minimumQuantity: 1,
    maximumQuantity: null,
    minimumPrice: 0.000001,
    maximumPrice: null,
    minimumNotional: 0.1,
    pricePrecision: 6,
    quantityPrecision: 2,
    quantityStep: 0.01,
    orderTypes: ["limit_order"],
  });

  const exactBooks: OrderBook[] = [];
  const exactService = new CoinDCXProtectedRestOrderBookService(
    {
      fetch: async (pair) => {
        assert.equal(pair, "KC-COTI_USDT");
        return {
          bids: {"0.00982": "1000"},
          asks: {"0.00983": "1000"},
        };
      },
    },
    {
      replace: (book) => {
        exactBooks.push(structuredClone(book));
        return {accepted: true, reason: "OK"};
      },
    },
    {refreshIntervalMs: 60_000},
  );

  const exactResult = await exactService.refreshExactMarket(
    "COTIUSDT",
    190,
  );

  assert.equal(exactResult.accepted, true);
  assert.equal(exactResult.market, "COTIUSDT");
  assert.equal(exactBooks[0]?.market, "COTIUSDT");
  marketRegistry.clear();

  console.log("COINDCX PROTECTED REST ORDER-BOOK TEST PASSED.");
  console.log("Bounded public USDT/INR valuation, BTC/USDT hedge-anchor depth and punctuation-safe exact COTI identity were normalized without authentication, balance mutation, or orders.");
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
