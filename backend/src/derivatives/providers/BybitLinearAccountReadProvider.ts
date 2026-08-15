import {
  bybitCredentialsProvider,
  type BybitCredentials,
} from "../../exchanges/bybit/api/BybitCredentialsProvider";

import {
  bybitPrivateHttpClient,
} from "../../exchanges/bybit/api/BybitPrivateHttpClient";

import type {
  DerivativePositionEvidence,
  DerivativeVenueAccountEvidence,
} from "../models/DerivativeAccountEvidence";

import type {
  DerivativeAccountReadProvider,
} from "./DerivativeAccountReadProvider";

interface BybitWalletResult {
  list?: unknown;
}

interface BybitPositionRecord {
  symbol?: unknown;
  side?: unknown;
  size?: unknown;
  avgPrice?: unknown;
  markPrice?: unknown;
  liqPrice?: unknown;
  leverage?: unknown;
  positionStatus?: unknown;
  positionIdx?: unknown;
}

interface BybitPositionResult {
  list?: unknown;
}

export interface BybitLinearSignedGetPort {
  getSigned<T>(
    path: string,
    parameters: Record<string, string>,
    credentials?: BybitCredentials,
  ): Promise<T>;
}

export class BybitLinearAccountReadProvider
implements DerivativeAccountReadProvider {
  readonly exchange = "bybit";

  constructor(
    private readonly port: BybitLinearSignedGetPort = bybitPrivateHttpClient,
    private readonly credentialsSource = bybitCredentialsProvider,
    private readonly freshnessMs = 30_000,
  ) {}

  isConfigured(): boolean {
    return this.credentialsSource.isConfigured();
  }

  async fetch(
    markets: readonly string[],
    now = Date.now(),
  ): Promise<DerivativeVenueAccountEvidence> {
    const normalizedMarkets = Array.from(
      new Set(markets.map(symbol).filter(Boolean)),
    ).sort();

    if (normalizedMarkets.length === 0 || normalizedMarkets.length > 10) {
      throw new Error("Derivative account read requires one to ten bounded markets.");
    }

    const credentials = this.credentialsSource.getCredentials();
    const [wallet, ...positionResponses] = await Promise.all([
      this.port.getSigned<BybitWalletResult>(
        "/v5/account/wallet-balance",
        {accountType: "UNIFIED"},
        credentials,
      ),
      ...normalizedMarkets.map((market) => this.port.getSigned<BybitPositionResult>(
        "/v5/position/list",
        {category: "linear", symbol: market},
        credentials,
      )),
    ]);

    if (!Array.isArray(wallet.list)) {
      throw new Error("Invalid Bybit UNIFIED wallet response.");
    }

    const account = wallet.list.find((item) =>
      isRecord(item) && item.accountType === "UNIFIED",
    );

    if (!isRecord(account)) {
      throw new Error("Bybit UNIFIED account evidence is missing.");
    }

    const positions = positionResponses.flatMap((result, index) =>
      normalizeBybitPositions(result, normalizedMarkets[index]!, now),
    );

    return immutable({
      exchange: this.exchange,
      product: "LINEAR_PERPETUAL",
      settlementAsset: "USDT",
      availableMargin: nonNegative(account.totalAvailableBalance, "Bybit totalAvailableBalance"),
      availableMarginUnit: "ACCOUNT_USD_VALUE",
      walletBalance: nullableNonNegative(account.totalWalletBalance),
      totalEquity: nullableNonNegative(account.totalEquity),
      totalInitialMargin: nullableNonNegative(account.totalInitialMargin),
      totalMaintenanceMargin: nullableNonNegative(account.totalMaintenanceMargin),
      positions,
      marginSourceEndpoint: "GET /v5/account/wallet-balance",
      positionSourceEndpoint: "GET /v5/position/list",
      observedAt: now,
      expiresAt: now + this.freshnessMs,
      authenticatedReadVerified: true,
      positionReadVerified: true,
      orderSubmissionAllowed: false,
      liveExecutionAllowed: false,
    });
  }
}

function normalizeBybitPositions(
  result: BybitPositionResult,
  market: string,
  now: number,
): DerivativePositionEvidence[] {
  if (!Array.isArray(result.list)) {
    throw new Error(`Invalid Bybit position response for ${market}.`);
  }

  const matching = result.list
    .filter(isRecord)
    .filter((record) => symbol(record.symbol) === market) as BybitPositionRecord[];

  if (matching.length === 0) {
    throw new Error(`Bybit position evidence is missing for ${market}.`);
  }

  const active = matching.filter((record) => nonNegative(record.size, "Bybit position size") > 0);
  const long = active.find((record) => symbol(record.side) === "BUY");
  const short = active.find((record) => symbol(record.side) === "SELL");

  if (long && short) {
    const signedQuantity = nonNegative(long.size, "Bybit long size") -
      nonNegative(short.size, "Bybit short size");
    return [evidence(market, signedQuantity, "HEDGED", long, now)];
  }

  const record = active[0] ?? matching[0]!;
  const size = nonNegative(record.size, "Bybit position size");
  const side = symbol(record.side);
  const signedQuantity = side === "SELL" ? -size : side === "BUY" ? size : 0;

  return [evidence(
    market,
    signedQuantity,
    signedQuantity > 0 ? "LONG" : signedQuantity < 0 ? "SHORT" : "FLAT",
    record,
    now,
  )];
}

function evidence(
  market: string,
  signedQuantity: number,
  positionSide: DerivativePositionEvidence["positionSide"],
  record: BybitPositionRecord,
  now: number,
): DerivativePositionEvidence {
  return immutable({
    exchange: "bybit",
    market,
    product: "LINEAR_PERPETUAL",
    positionSide,
    signedQuantity,
    entryPrice: nullableNonNegative(record.avgPrice),
    markPrice: nullablePositive(record.markPrice),
    liquidationPrice: nullablePositive(record.liqPrice),
    leverage: nullablePositive(record.leverage),
    positionStatus: typeof record.positionStatus === "string" && record.positionStatus.trim()
      ? record.positionStatus.trim()
      : null,
    source: "AUTHENTICATED_READ_ONLY_REST",
    sourceEndpoint: "GET /v5/position/list",
    observedAt: now,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function symbol(value: unknown): string { return typeof value === "string" ? value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : ""; }
function nonNegative(value: unknown, field: string): number { const parsed = Number(value); if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field} is invalid.`); return parsed; }
function nullableNonNegative(value: unknown): number | null { if (value === "" || value === null || value === undefined) return null; const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null; }
function nullablePositive(value: unknown): number | null { if (value === "" || value === null || value === undefined) return null; const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
function immutable<T>(value: T): T { return Object.freeze(structuredClone(value)); }
