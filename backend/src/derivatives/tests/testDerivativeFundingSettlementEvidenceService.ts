import assert from "node:assert/strict";

import {
  BinanceUsdMFundingSettlementProvider,
  type DerivativePublicJsonFetcher,
} from "../providers/BinanceUsdMFundingSettlementProvider";

import {
  BybitLinearFundingSettlementProvider,
} from "../providers/BybitLinearFundingSettlementProvider";

import {
  DerivativeFundingSettlementEvidenceService,
} from "../services/DerivativeFundingSettlementEvidenceService";

const now = 1_780_700_000_000;
const fundingTime = now - 60_000;

async function main(): Promise<void> {
  const binanceCalls: string[] = [];
  const binanceSettlementTime = fundingTime + 6;
  const binanceFetch: DerivativePublicJsonFetcher = async <T>(url: string): Promise<T> => {
    binanceCalls.push(url);
    return [{symbol: "BTCUSDT", fundingRate: "0.0001", fundingTime: binanceSettlementTime, markPrice: "100.25", rateType: "Regular"}] as T;
  };
  const bybitCalls: string[] = [];
  const bybitFetch: DerivativePublicJsonFetcher = async <T>(url: string): Promise<T> => {
    bybitCalls.push(url);
    if (url.includes("funding/history")) return {retCode: 0, retMsg: "OK", time: now,
      result: {list: [{symbol: "BTCUSDT", fundingRate: "-0.0002", fundingRateTimestamp: String(fundingTime)}]}} as T;
    return {retCode: 0, retMsg: "OK", time: now,
      result: {symbol: "BTCUSDT", list: [[String(fundingTime), "100.5", "101", "99", "100.4"]]}} as T;
  };

  const binance = new BinanceUsdMFundingSettlementProvider(["BTCUSDT"], binanceFetch);
  const bybit = new BybitLinearFundingSettlementProvider(["BTCUSDT"], bybitFetch);
  const service = new DerivativeFundingSettlementEvidenceService([binance, bybit], {
    refreshIntervalMs: 10_000,
    retentionMs: 120_000,
    maximumEvidence: 10,
  });
  const snapshot = await service.refresh(now);

  assert.equal(snapshot.summary.evidence, 2);
  assert.equal(snapshot.summary.exactExchangeMarkPrices, 1);
  assert.equal(snapshot.summary.boundedMarkPriceProxies, 1);
  assert.equal(snapshot.summary.readyProviders, 2);
  assert.equal(service.get("BINANCE", "btcusdt", fundingTime, now)?.markPrice, 100.25);
  assert.equal(service.get("BINANCE", "btcusdt", fundingTime, now)?.fundingTime, binanceSettlementTime);
  assert.equal(service.get("BINANCE", "btcusdt", fundingTime - 2_000, now), null);
  assert.equal(service.get("bybit", "BTCUSDT", fundingTime, now)?.markPrice, 100.5);
  assert.equal(service.get("bybit", "BTCUSDT", fundingTime, now)?.priceQuality, "BOUNDED_PUBLIC_MARK_KLINE_PROXY");
  assert.ok(binanceCalls[0]?.includes("/fapi/v1/fundingRate?"));
  assert.ok(bybitCalls.some((url) => url.includes("/v5/market/funding/history?")));
  assert.ok(bybitCalls.some((url) => url.includes("/v5/market/mark-price-kline?")));
  assert.equal(snapshot.safety.accountTransactionsAttributedToPaperPositions, false);
  assert.equal(snapshot.safety.liveExecutionAllowed, false);
  assert.equal(snapshot.safety.orderSubmissionAllowed, false);

  console.log("DERIVATIVE FUNDING SETTLEMENT EVIDENCE TEST PASSED.");
  console.log("Settled public rates were bounded to configured markets; Binance exact associated marks and Bybit labeled one-minute mark proxies remained distinct and PAPER-only.");
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
