import type {
  BinanceCredentials,
} from "../../exchanges/binance/api/BinanceCredentialsProvider";

import {
  binanceUsdMHttpClient,
  type BinanceUsdMHttpClient,
} from "../../exchanges/binance/api/BinanceUsdMHttpClient";

import {
  binanceUsdMCredentialsProvider,
} from "./BinanceUsdMCredentialsProvider";

import {
  binanceSigner,
} from "../../exchanges/binance/api/BinanceSigner";

import type {
  DerivativePositionEvidence,
  DerivativeVenueAccountEvidence,
} from "../models/DerivativeAccountEvidence";

import type {
  DerivativeAccountReadProvider,
} from "./DerivativeAccountReadProvider";

interface BinanceBalanceRecord {
  asset?: unknown;
  balance?: unknown;
  availableBalance?: unknown;
}

interface BinancePositionRecord {
  symbol?: unknown;
  positionAmt?: unknown;
  positionSide?: unknown;
  entryPrice?: unknown;
  markPrice?: unknown;
  liquidationPrice?: unknown;
  leverage?: unknown;
  updateTime?: unknown;
}

interface BinanceServerTimeResponse {
  serverTime?: unknown;
}

export interface BinanceUsdMSignedGetPort {
  getPublic<T>(path: string): Promise<T>;
  getSigned<T>(
    path: string,
    parameters: Readonly<Record<string, string>>,
    credentials: BinanceCredentials,
    serverTimestamp: number,
  ): Promise<T>;
}

interface BinanceUsdMCredentialsSource {
  getCredentials(): BinanceCredentials;
  isConfigured(): boolean;
}

class DefaultBinanceUsdMSignedGetPort
implements BinanceUsdMSignedGetPort {
  constructor(
    private readonly client: BinanceUsdMHttpClient = binanceUsdMHttpClient,
  ) {}

  async getPublic<T>(path: string): Promise<T> {
    return this.client.getPublic<T>(path);
  }

  async getSigned<T>(
    path: string,
    parameters: Readonly<Record<string, string>>,
    credentials: BinanceCredentials,
    serverTimestamp: number,
  ): Promise<T> {
    const signed = binanceSigner.createSignedTimestampRequest(
      {...parameters},
      credentials.apiSecret,
      {timestamp: serverTimestamp, recvWindow: 5_000},
    );

    return this.client.request<T>("GET", path, {
      parameters: signed.parameters,
      queryString: signed.signedQueryString,
      headers: {"X-MBX-APIKEY": credentials.apiKey},
    });
  }
}

export class BinanceUsdMAccountReadProvider
implements DerivativeAccountReadProvider {
  readonly exchange = "binance";

  constructor(
    private readonly port: BinanceUsdMSignedGetPort = new DefaultBinanceUsdMSignedGetPort(),
    private readonly credentialsSource: BinanceUsdMCredentialsSource = binanceUsdMCredentialsProvider,
    private readonly freshnessMs = 30_000,
  ) {}

  isConfigured(): boolean {
    return this.credentialsSource.isConfigured();
  }

  async fetch(
    markets: readonly string[],
    now = Date.now(),
  ): Promise<DerivativeVenueAccountEvidence> {
    const normalizedMarkets = normalizeMarkets(markets);
    requireBoundedMarkets(normalizedMarkets);
    const credentials = this.credentialsSource.getCredentials();
    const time = await this.port.getPublic<BinanceServerTimeResponse>("/fapi/v1/time");
    const serverTimestamp = positiveInteger(time.serverTime, "Binance USD-M server time");
    const [balances, ...positionResponses] = await Promise.all([
      this.port.getSigned<BinanceBalanceRecord[]>(
        "/fapi/v3/balance",
        {},
        credentials,
        serverTimestamp,
      ),
      ...normalizedMarkets.map((market) => this.port.getSigned<BinancePositionRecord[]>(
        "/fapi/v3/positionRisk",
        {symbol: market},
        credentials,
        serverTimestamp,
      )),
    ]);

    if (!Array.isArray(balances)) {
      throw new Error("Invalid Binance USD-M balance response.");
    }

    const usdt = balances.find((item) => symbol(item.asset) === "USDT");
    if (!usdt) {
      throw new Error("Binance USD-M USDT balance evidence is missing.");
    }

    const positions = positionResponses.flatMap((records, index) =>
      normalizeBinancePositions(records, normalizedMarkets[index]!, now),
    );

    return immutable({
      exchange: this.exchange,
      product: "LINEAR_PERPETUAL",
      settlementAsset: "USDT",
      availableMargin: nonNegative(usdt.availableBalance, "Binance availableBalance"),
      availableMarginUnit: "USDT",
      walletBalance: nonNegative(usdt.balance, "Binance balance"),
      totalEquity: null,
      totalInitialMargin: null,
      totalMaintenanceMargin: null,
      positions,
      marginSourceEndpoint: "GET /fapi/v3/balance",
      positionSourceEndpoint: "GET /fapi/v3/positionRisk",
      observedAt: now,
      expiresAt: now + this.freshnessMs,
      authenticatedReadVerified: true,
      marginReadVerified: true,
      positionReadVerified: true,
      orderSubmissionAllowed: false,
      liveExecutionAllowed: false,
    });
  }
}

function normalizeBinancePositions(
  records: BinancePositionRecord[],
  market: string,
  now: number,
): DerivativePositionEvidence[] {
  if (!Array.isArray(records)) {
    throw new Error(`Invalid Binance USD-M position response for ${market}.`);
  }
  const matching = records.filter((item) => symbol(item.symbol) === market);
  if (matching.length === 0) {
    throw new Error(`Binance USD-M position evidence is missing for ${market}.`);
  }
  const long = matching.find((item) => symbol(item.positionSide) === "LONG");
  const short = matching.find((item) => symbol(item.positionSide) === "SHORT");
  if (long && short) {
    const longQuantity = Math.abs(finite(long.positionAmt, "Binance LONG positionAmt"));
    const shortQuantity = Math.abs(finite(short.positionAmt, "Binance SHORT positionAmt"));
    return [positionEvidence(market, longQuantity - shortQuantity, "HEDGED", longQuantity > 0 ? long : short, now)];
  }
  const record = matching[0]!;
  const quantity = finite(record.positionAmt, "Binance positionAmt");
  return [positionEvidence(
    market,
    quantity,
    quantity > 0 ? "LONG" : quantity < 0 ? "SHORT" : "FLAT",
    record,
    now,
  )];
}

function positionEvidence(
  market: string,
  quantity: number,
  side: DerivativePositionEvidence["positionSide"],
  record: BinancePositionRecord,
  now: number,
): DerivativePositionEvidence {
  return immutable({
    exchange: "binance",
    market,
    product: "LINEAR_PERPETUAL",
    positionSide: side,
    signedQuantity: quantity,
    entryPrice: nullableNonNegative(record.entryPrice),
    markPrice: nullablePositive(record.markPrice),
    liquidationPrice: nullablePositive(record.liquidationPrice),
    leverage: nullablePositive(record.leverage),
    positionStatus: null,
    source: "AUTHENTICATED_READ_ONLY_REST",
    sourceEndpoint: "GET /fapi/v3/positionRisk",
    observedAt: now,
  });
}

function normalizeMarkets(markets: readonly string[]): string[] {
  return Array.from(new Set(markets.map(symbol).filter(Boolean))).sort();
}
function requireBoundedMarkets(markets: readonly string[]): void {
  if (markets.length === 0 || markets.length > 20) throw new Error("Derivative account read requires one to twenty bounded markets.");
}
function symbol(value: unknown): string { return typeof value === "string" ? value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : ""; }
function finite(value: unknown, field: string): number { const parsed = Number(value); if (!Number.isFinite(parsed)) throw new Error(`${field} is invalid.`); return parsed; }
function nonNegative(value: unknown, field: string): number { const parsed = finite(value, field); if (parsed < 0) throw new Error(`${field} is negative.`); return parsed; }
function nullableNonNegative(value: unknown): number | null { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null; }
function nullablePositive(value: unknown): number | null { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
function positiveInteger(value: unknown, field: string): number { const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${field} is invalid.`); return parsed; }
function immutable<T>(value: T): T { return Object.freeze(structuredClone(value)); }
