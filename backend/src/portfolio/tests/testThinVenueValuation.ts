import assert from "node:assert/strict";

import type {ExecutableQuote} from "../../core/models/ExecutableQuote";
import {marketCache} from "../../services/cache.service";
import {PortfolioValuationService} from "../services/PortfolioValuationService";

/*
 * UnoCoin's USDT markets report the last trade as both bid and ask, so a
 * stale trade can value NEAR at 12 USDT while Binance pays 4.5. A thin
 * venue's quote far from the reference venues is capped at their bid.
 */
const NOW = 1_790_320_000_000;

function quote(exchange: string, market: string, bid: number): ExecutableQuote {
  return {
    exchange, market, lastPrice: bid, bestBidPrice: bid, bestBidQty: 10, bestAskPrice: bid * 1.001, bestAskQty: 10,
    spread: bid * 0.001, timestamp: NOW, source: "orderBook", executable: true,
  };
}

marketCache.clear();
try {
  marketCache.update(quote("unocoin", "NEARUSDT", 12));
  marketCache.update(quote("binance", "NEARUSDT", 4.5));
  marketCache.update(quote("bybit", "NEARUSDT", 4.52));
  marketCache.update(quote("unocoin", "DASHUSDT", 62.5));
  marketCache.update(quote("binance", "DASHUSDT", 63));
  marketCache.update(quote("unocoin", "ODDUSDT", 1.5));

  const service = new PortfolioValuationService();
  const near = service.valueAsset("unocoin", "NEAR", NOW);
  assert.equal(near.source, "REFERENCE_CAPPED");
  assert.ok(Math.abs((near.priceUsdt ?? 0) - 4.51) < 1e-9, String(near.priceUsdt));
  // Within 25% of the reference: the venue's own bid stands.
  const dash = service.valueAsset("unocoin", "DASH", NOW);
  assert.deepEqual([dash.source, dash.priceUsdt], ["BEST_BID", 62.5]);
  // A reference venue is never capped, and no reference means no cap.
  assert.equal(service.valueAsset("binance", "NEAR", NOW).priceUsdt, 4.5);
  assert.equal(service.valueAsset("unocoin", "ODD", NOW).source, "BEST_BID");
  console.log("Thin-venue valuation passed: a quote more than 25% from Binance/Bybit is capped at their median bid; close quotes, reference venues and unreferenced coins keep their own bid.");
} finally {
  marketCache.clear();
}
