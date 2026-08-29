import assert from "node:assert/strict";

import {
  CoinSwitchDepthApi,
} from "../api/CoinSwitchDepthApi";

const NOW = 1_788_000_000_000;

async function main(): Promise<void> {
  const calls: Array<{
    path: string;
    parameters?: Readonly<Record<string, string>>;
  }> = [];
  let response: unknown = depthFixture();
  const api = new CoinSwitchDepthApi({
    getSigned: async <T>(
      path: string,
      parameters?: Readonly<Record<string, string>>,
    ): Promise<T> => {
      calls.push({path, parameters});
      return response as T;
    },
  });

  const book = await api.getDepth(
    {venue: "c2c1", market: "BTCUSDT"},
    undefined,
    NOW,
  );

  assert.deepEqual(calls[0], {
    path: "/trade/api/v2/depth",
    parameters: {exchange: "c2c1", symbol: "btc/usdt"},
  });
  assert.equal(book.venue, "c2c1");
  assert.equal(book.market, "BTC_USDT");
  assert.equal(book.canonicalMarket, "BTCUSDT");
  assert.equal(book.timestamp, NOW);
  assert.equal(book.sourceTimestamp, NOW - 40);
  assert.deepEqual(book.bids, [
    {price: 100, quantity: 2},
    {price: 99, quantity: 3},
  ]);
  assert.deepEqual(book.asks, [
    {price: 101, quantity: 4},
    {price: 102, quantity: 5},
  ]);

  await assert.rejects(
    () => api.getDepth(
      {venue: "coinswitchx", market: "BTCUSDT"},
      undefined,
      NOW,
    ),
    /does not support requested market/iu,
  );

  response = depthFixture({bids: [["99", "1"], ["100", "1"]]});
  await assert.rejects(
    () => api.getDepth(
      {venue: "c2c1", market: "BTC_USDT"},
      undefined,
      NOW,
    ),
    /invalid or unsorted levels/iu,
  );

  response = depthFixture({symbol: "ETH/USDT"});
  await assert.rejects(
    () => api.getDepth(
      {venue: "c2c1", market: "BTC/USDT"},
      undefined,
      NOW,
    ),
    /market, clock, or book integrity/iu,
  );

  response = depthFixture({timestamp: NOW - 15_001});
  await assert.rejects(
    () => api.getDepth(
      {venue: "c2c1", market: "BTC/USDT"},
      undefined,
      NOW,
    ),
    /market, clock, or book integrity/iu,
  );

  response = depthFixture({bids: [["102", "1"]], asks: [["101", "1"]]});
  await assert.rejects(
    () => api.getDepth(
      {venue: "c2c1", market: "BTC/USDT"},
      undefined,
      NOW,
    ),
    /market, clock, or book integrity/iu,
  );

  console.log("CoinSwitch signed depth API checks passed.");
}

function depthFixture(
  overrides: Readonly<Record<string, unknown>> = {},
): {data: Record<string, unknown>} {
  return {
    data: {
      symbol: "BTC/USDT",
      timestamp: NOW - 40,
      bids: [["100", "2"], ["99", "3"]],
      asks: [["101", "4"], ["102", "5"]],
      ...overrides,
    },
  };
}

void main();
