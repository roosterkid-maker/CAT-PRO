import assert from "node:assert/strict";

import type {
  BinanceCredentials,
} from "../../exchanges/binance/api/BinanceCredentialsProvider";

import type {
  BybitCredentials,
} from "../../exchanges/bybit/api/BybitCredentialsProvider";

import type {
  DerivativeVenueAccountEvidence,
} from "../models/DerivativeAccountEvidence";

import {
  BinanceUsdMAccountReadProvider,
  type BinanceUsdMSignedGetPort,
} from "../providers/BinanceUsdMAccountReadProvider";

import {
  BybitLinearAccountReadProvider,
  type BybitLinearSignedGetPort,
} from "../providers/BybitLinearAccountReadProvider";

import type {
  DerivativeAccountReadProvider,
} from "../providers/DerivativeAccountReadProvider";

import {
  DerivativeAccountEvidenceService,
} from "../services/DerivativeAccountEvidenceService";

const now = 1_780_100_000_000;
const markets = ["BTCUSDT", "ETHUSDT"] as const;
const credentials = {apiKey: "fixture-key", apiSecret: "fixture-secret"};
const credentialsSource = {
  isConfigured: () => true,
  getCredentials: () => credentials,
};

class BinancePort implements BinanceUsdMSignedGetPort {
  readonly calls: string[] = [];

  async getPublic<T>(path: string): Promise<T> {
    this.calls.push(`PUBLIC ${path}`);
    return {serverTime: now} as T;
  }

  async getSigned<T>(
    path: string,
    parameters: Readonly<Record<string, string>>,
    _credentials: BinanceCredentials,
    serverTimestamp: number,
  ): Promise<T> {
    this.calls.push(`SIGNED_GET ${path} ${parameters.symbol ?? ""} ${serverTimestamp}`);
    if (path.endsWith("/balance")) {
      return [{asset: "USDT", balance: "900", availableBalance: "750"}] as T;
    }
    return [{symbol: parameters.symbol, positionAmt: "0", positionSide: "BOTH", entryPrice: "0", markPrice: "100", liquidationPrice: "0", leverage: "10"}] as T;
  }
}

class BybitPort implements BybitLinearSignedGetPort {
  readonly calls: string[] = [];

  async getSigned<T>(
    path: string,
    parameters: Record<string, string>,
    _credentials?: BybitCredentials,
  ): Promise<T> {
    this.calls.push(`SIGNED_GET ${path} ${parameters.symbol ?? parameters.accountType ?? ""}`);
    if (path.includes("wallet-balance")) {
      return {list: [{accountType: "UNIFIED", totalAvailableBalance: "640", totalWalletBalance: "800", totalEquity: "805", totalInitialMargin: "50", totalMaintenanceMargin: "5"}]} as T;
    }
    return {list: [{symbol: parameters.symbol, side: "", size: "0", avgPrice: "", markPrice: "100", liqPrice: "", leverage: "10", positionStatus: "Normal", positionIdx: 0}]} as T;
  }
}

class FixtureProvider implements DerivativeAccountReadProvider {
  failures = 0;
  constructor(readonly exchange: string, private readonly availableMargin: number) {}
  isConfigured(): boolean { return true; }
  async fetch(requested: readonly string[], observedAt = Date.now()): Promise<DerivativeVenueAccountEvidence> {
    if (this.failures > 0) { this.failures -= 1; throw new Error(`${this.exchange} fixture unavailable`); }
    return evidence(this.exchange, requested, this.availableMargin, observedAt);
  }
}

async function main(): Promise<void> {
  const binancePort = new BinancePort();
  const binance = new BinanceUsdMAccountReadProvider(binancePort, credentialsSource, 30_000);
  const binanceEvidence = await binance.fetch(markets, now);
  assert.equal(binanceEvidence.availableMargin, 750);
  assert.equal(binanceEvidence.availableMarginUnit, "USDT");
  assert.equal(binanceEvidence.marginReadVerified, true);
  assert.equal(binanceEvidence.positions.length, 2);
  assert.equal(binanceEvidence.positions.every((item) => item.positionSide === "FLAT"), true);
  assert.deepEqual(binancePort.calls.map((item) => item.split(" ").slice(0, 2).join(" ")), [
    "PUBLIC /fapi/v1/time",
    "SIGNED_GET /fapi/v3/balance",
    "SIGNED_GET /fapi/v3/positionRisk",
    "SIGNED_GET /fapi/v3/positionRisk",
  ]);

  const bybitPort = new BybitPort();
  const bybit = new BybitLinearAccountReadProvider(bybitPort, credentialsSource, 30_000);
  const bybitEvidence = await bybit.fetch(markets, now);
  assert.equal(bybitEvidence.availableMargin, 640);
  assert.equal(bybitEvidence.availableMarginUnit, "ACCOUNT_USD_VALUE");
  assert.equal(bybitEvidence.totalMaintenanceMargin, 5);
  assert.equal(bybitEvidence.positions.every((item) => item.signedQuantity === 0), true);
  assert.equal(bybitPort.calls.every((item) => item.startsWith("SIGNED_GET")), true);

  const fixture = new FixtureProvider("binance", 500);
  const service = new DerivativeAccountEvidenceService([fixture], {
    markets,
    refreshIntervalMs: 1_000,
    freshnessThresholdMs: 2_000,
    retentionMs: 5_000,
  });
  const ready = await service.refresh(now);
  assert.equal(ready.providers[0]?.state, "READY");
  assert.equal(service.getMarketEvidence("binance", "BTCUSDT", now + 1_000)?.account.availableMargin, 500);
  assert.equal(service.getMarketEvidence("binance", "BTCUSDT", now + 2_001), null);
  assert.equal(ready.safety.signedGetOnly, true);
  assert.equal(ready.safety.orderSubmissionAllowed, false);

  const verificationFixture = new FixtureProvider("binance", 500);
  const verificationService = new DerivativeAccountEvidenceService([verificationFixture], {
    markets,
    refreshIntervalMs: 1_000,
    freshnessThresholdMs: 30_000,
    retentionMs: 60_000,
  });
  const verificationNow = Date.now();
  const verified = await verificationService.verifyBinanceUsdM(verificationNow);
  assert.equal(verified.outcome, "VERIFIED");
  assert.equal(verified.checks.marginReadVerified, true);
  assert.equal(verified.checks.positionReadVerified, true);
  assert.equal(verified.checks.configuredMarketsCovered, true);
  assert.equal(verified.evidence?.observedAt, verificationNow);
  assert.deepEqual(verified.safety.endpoints, [
    "GET /fapi/v3/balance",
    "GET /fapi/v3/positionRisk",
  ]);
  assert.equal(verified.safety.orderSubmissionAllowed, false);
  assert.equal(verified.safety.paperAuthorityChanged, false);

  verificationFixture.failures = 1;
  const failedVerification = await verificationService.verifyBinanceUsdM(verificationNow + 1);
  assert.equal(failedVerification.outcome, "FAILED");
  assert.equal(failedVerification.provider.state, "DEGRADED");
  assert.equal(failedVerification.evidence, null);
  assert.equal(failedVerification.checks.currentAttemptSucceeded, false);
  assert.equal(failedVerification.checks.marginReadVerified, false);
  assert.match(failedVerification.provider.lastError ?? "", /fixture unavailable/);

  fixture.failures = 1;
  const degraded = await service.refresh(now + 3_000);
  assert.equal(degraded.providers[0]?.state, "DEGRADED");
  assert.match(degraded.providers[0]?.lastError ?? "", /fixture unavailable/);
  assert.equal(service.getSnapshot(now + 5_001).evidence.length, 0);

  console.log("DERIVATIVE AUTHENTICATED ACCOUNT EVIDENCE TEST PASSED.");
  console.log("Binance USD-M and Bybit linear used signed GET-only balance/position contracts; exact-attempt verification rejected retained evidence after failure, bounded cached evidence expired fail-closed, and no order or LIVE path was exposed.");
}

function evidence(
  exchange: string,
  requested: readonly string[],
  availableMargin: number,
  observedAt: number,
): DerivativeVenueAccountEvidence {
  return {
    exchange,
    product: "LINEAR_PERPETUAL",
    settlementAsset: "USDT",
    availableMargin,
    availableMarginUnit: "USDT",
    walletBalance: availableMargin,
    totalEquity: null,
    totalInitialMargin: null,
    totalMaintenanceMargin: null,
    positions: requested.map((market) => ({
      exchange,
      market,
      product: "LINEAR_PERPETUAL",
      positionSide: "FLAT",
      signedQuantity: 0,
      entryPrice: null,
      markPrice: 100,
      liquidationPrice: null,
      leverage: 10,
      positionStatus: null,
      source: "AUTHENTICATED_READ_ONLY_REST",
      sourceEndpoint: "GET fixture-position",
      observedAt,
    })),
    marginSourceEndpoint: "GET fixture-balance",
    positionSourceEndpoint: "GET fixture-position",
    observedAt,
    expiresAt: observedAt + 2_000,
    authenticatedReadVerified: true,
    marginReadVerified: true,
    positionReadVerified: true,
    orderSubmissionAllowed: false,
    liveExecutionAllowed: false,
  };
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
