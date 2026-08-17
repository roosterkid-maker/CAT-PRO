import assert from "node:assert/strict";

import type {
  OrderBook,
} from "../../../orderbook/models/OrderBook";

import {
  CoinDCXProtectedRestOrderBookService,
} from "../CoinDCXProtectedRestOrderBookService";

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

  console.log("COINDCX PROTECTED REST ORDER-BOOK TEST PASSED.");
  console.log("Bounded public USDT/INR valuation and BTC/USDT hedge-anchor depth were normalized without authentication, balance mutation, or orders.");
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
