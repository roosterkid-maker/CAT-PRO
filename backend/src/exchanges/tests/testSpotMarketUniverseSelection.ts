import assert from "node:assert/strict";

import {
  SpotMarketUniverseSelector,
} from "../core/SpotMarketUniverseSelector";

function main(): void {
  const selector = new SpotMarketUniverseSelector();

  const catalog = [
    {symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT"},
    {symbol: "ETHUSDT", baseAsset: "ETH", quoteAsset: "USDT"},
    {symbol: "SOLUSDT", baseAsset: "SOL", quoteAsset: "USDT"},
    {symbol: "XRPUSDT", baseAsset: "XRP", quoteAsset: "USDT"},
    {symbol: "ADAUSDT", baseAsset: "ADA", quoteAsset: "USDT"},
    {symbol: "ETHBTC", baseAsset: "ETH", quoteAsset: "BTC"},
    {symbol: "SOLBTC", baseAsset: "SOL", quoteAsset: "BTC"},
    {symbol: "ETHUSDC", baseAsset: "ETH", quoteAsset: "USDC"},
  ];

  const activity = catalog.map((entry, index) => ({
    symbol: entry.symbol,
    turnover24h: 1_000 - index,
    volume24h: 100 - index,
  }));

  const selection = selector.select(
    catalog,
    activity,
    new Set(["eth_usdt", "eth-btc"]),
    5,
    "USDT",
    ["BTC", "ETH", "USDC"],
    0.2,
    1_000,
  );

  assert.equal(selection.selected.length, 5);
  assert.equal(selection.selectedSecondaryMarkets, 1);
  assert.ok(selection.selected.includes("ETHBTC"));
  assert.ok(selection.selected.includes("ETHUSDT"));
  assert.ok(selection.selected.includes("BTCUSDT"));
  assert.equal(selection.selectedAnchorMarkets, 2);
  assert.equal(selection.safety.liveExecutionAllowed, false);
  assert.equal(selection.safety.freshnessThresholdMutationAllowed, false);

  const fallback = selector.select(
    catalog,
    [],
    new Set(),
    3,
    "USDT",
    ["BTC"],
    0,
    2_000,
  );

  assert.deepEqual(fallback.selected, [
    "ADAUSDT",
    "BTCUSDT",
    "ETHUSDT",
  ]);

  assert.throws(() =>
    selector.select(catalog, activity, new Set(), 5, "USDT", ["BTC"], 0.75),
  );

  console.log("SPOT MARKET UNIVERSE SELECTION TEST PASSED.");
  console.log("Advisory activity changed no quote freshness or execution policy.");
}

main();
