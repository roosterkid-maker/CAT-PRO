import type {DerivativePositionEvidence, DerivativeVenueAccountEvidence} from "../models/DerivativeAccountEvidence";
import type {DerivativeAccountReadProvider} from "./DerivativeAccountReadProvider";
import {coinDCXHttpClient} from "../../exchanges/coindcx/api/CoinDCXHttpClient";
import {coinDCXCredentialsProvider} from "../../exchanges/coindcx/api/CoinDCXCredentialsProvider";
import {CoinSwitchReadOnlyHttpClient} from "../../exchanges/coinswitch/api/CoinSwitchReadOnlyHttpClient";
import {coinSwitchCredentialsProvider} from "../../exchanges/coinswitch/api/CoinSwitchCredentialsProvider";
import {ZebPayPrivateHttpClient} from "../../exchanges/zebpay/api/ZebPayPrivateHttpClient";
import {zebPayCredentialsProvider} from "../../exchanges/zebpay/api/ZebPayCredentialsProvider";

const FRESH_MS = 30_000;

export class CoinDCXFuturesAccountReadProvider implements DerivativeAccountReadProvider {
  readonly exchange = "coindcx";
  isConfigured(): boolean { return coinDCXCredentialsProvider.isConfigured(); }
  async fetch(markets: readonly string[], now = Date.now()): Promise<DerivativeVenueAccountEvidence> {
    const normalized = bounded(markets);
    const credentials = coinDCXCredentialsProvider.getCredentials();
    const body = {timestamp: now};
    const [walletRaw, positionsRaw] = await Promise.all([
      coinDCXHttpClient.getPrivate<unknown>("/exchange/v1/derivatives/futures/wallets", body, credentials),
      coinDCXHttpClient.postPrivate<unknown>("/exchange/v1/derivatives/futures/positions", {
        ...body, page: "1", size: "100", margin_currency_short_name: "USDT",
      }, credentials),
    ]);
    const wallets = records(walletRaw);
    const wallet = wallets.find((item) => text(item.currency_short_name ?? item.asset ?? item.currency) === "USDT");
    if (!wallet) throw new Error("CoinDCX futures authenticated USDT wallet evidence is missing.");
    const positions = normalized.map((market) => positionFromRecords(
      this.exchange, market, records(positionsRaw), now,
      "POST /exchange/v1/derivatives/futures/positions",
    ));
    const available = requiredNonNegative(wallet.available_balance ?? wallet.available_margin ?? wallet.balance, "CoinDCX available futures margin");
    return venue(this.exchange, available, nullable(wallet.balance ?? wallet.wallet_balance),
      nullable(wallet.total_equity ?? wallet.equity), positions,
      "GET /exchange/v1/derivatives/futures/wallets",
      "POST /exchange/v1/derivatives/futures/positions", now, "USDT");
  }
}

export class CoinSwitchFuturesAccountReadProvider implements DerivativeAccountReadProvider {
  readonly exchange = "coinswitch";
  constructor(private readonly client = new CoinSwitchReadOnlyHttpClient()) {}
  isConfigured(): boolean { return coinSwitchCredentialsProvider.isConfigured(); }
  async fetch(markets: readonly string[], now = Date.now()): Promise<DerivativeVenueAccountEvidence> {
    const normalized = bounded(markets);
    const [walletRaw, positionsRaw] = await Promise.all([
      this.client.getSigned<unknown>("/trade/api/v2/futures/wallet_balance", {exchange: "EXCHANGE_2"}),
      this.client.getSigned<unknown>("/trade/api/v2/futures/positions", {exchange: "EXCHANGE_2"}),
    ]);
    const wallets = records(walletRaw);
    const wallet = wallets.find((item) => text(item.asset ?? item.currency ?? item.symbol) === "USDT") ??
      (isRecordData(walletRaw) ? isRecordData(walletRaw) : null);
    if (!wallet) throw new Error("CoinSwitch futures authenticated USDT wallet evidence is missing.");
    const positions = normalized.map((market) => positionFromRecords(
      this.exchange, market, records(positionsRaw), now, "GET /trade/api/v2/futures/positions",
    ));
    const available = requiredNonNegative(wallet.available_balance ?? wallet.available_margin ?? wallet.free, "CoinSwitch available futures margin");
    return venue(this.exchange, available, nullable(wallet.balance ?? wallet.wallet_balance),
      nullable(wallet.total_equity ?? wallet.equity), positions,
      "GET /trade/api/v2/futures/wallet_balance", "GET /trade/api/v2/futures/positions", now, "USDT");
  }
}

export class ZebPayFuturesAccountReadProvider implements DerivativeAccountReadProvider {
  readonly exchange = "zebpay";
  private readonly client = new ZebPayPrivateHttpClient(fetch, undefined, () => Date.now(), 10_000,
    "https://futuresbe.zebpay.com");
  isConfigured(): boolean { return zebPayCredentialsProvider.isConfigured(); }
  async fetch(markets: readonly string[], now = Date.now()): Promise<DerivativeVenueAccountEvidence> {
    const normalized = bounded(markets);
    const credentials = zebPayCredentialsProvider.getCredentials();
    const [walletEnvelope, positionsEnvelope] = await Promise.all([
      this.client.getSigned<unknown>("/api/v1/wallet/balance", [], credentials),
      this.client.getSigned<unknown>("/api/v1/trade/positions", [["symbols", normalized.join(",")], ["status", "OPEN"]], credentials),
    ]);
    const wallets = records(walletEnvelope.data);
    const wallet = wallets.find((item) => text(item.asset ?? item.currency ?? item.symbol) === "USDT") ??
      (isRecordData(walletEnvelope.data)?.USDT && isRecordData(isRecordData(walletEnvelope.data)?.USDT)
        ? isRecordData(isRecordData(walletEnvelope.data)?.USDT) : null);
    if (!wallet) throw new Error("ZebPay futures authenticated USDT wallet evidence is missing.");
    const positions = normalized.map((market) => positionFromRecords(
      this.exchange, market, records(positionsEnvelope.data), now, "GET /api/v1/trade/positions",
    ));
    const available = requiredNonNegative(wallet.free ?? wallet.available ?? wallet.availableBalance, "ZebPay available futures margin");
    return venue(this.exchange, available, nullable(wallet.total ?? wallet.balance),
      nullable(wallet.total ?? wallet.equity), positions,
      "GET /api/v1/wallet/balance", "GET /api/v1/trade/positions", now, "USDT");
  }
}

function positionFromRecords(exchange: string, market: string, values: Record<string, unknown>[], now: number,
  endpoint: string): DerivativePositionEvidence {
  const matching = values.filter((item) => marketOf(item) === market);
  if (matching.length === 0) return position(exchange, market, 0, "FLAT", {}, now, endpoint);
  const quantities = matching.map((item) => {
    const quantity = requiredNonNegative(item.quantity ?? item.size ?? item.position_size ?? item.position_quantity ?? 0, `${exchange} position quantity`);
    const side = text(item.side ?? item.position_side);
    return {record: item, signed: side === "SELL" || side === "SHORT" ? -quantity : side === "BUY" || side === "LONG" ? quantity : signed(item)};
  });
  const total = quantities.reduce((sum, item) => sum + item.signed, 0);
  const side: DerivativePositionEvidence["positionSide"] = matching.length > 1 && quantities.some((item) => item.signed > 0) && quantities.some((item) => item.signed < 0)
    ? "HEDGED" : total > 0 ? "LONG" : total < 0 ? "SHORT" : "FLAT";
  return position(exchange, market, total, side, quantities[0]!.record, now, endpoint);
}
function position(exchange: string, market: string, quantity: number, side: DerivativePositionEvidence["positionSide"],
  item: Record<string, unknown>, now: number, endpoint: string): DerivativePositionEvidence {
  return immutable({exchange, market, product: "LINEAR_PERPETUAL", positionSide: side,
    signedQuantity: quantity, entryPrice: nullablePositive(item.entry_price ?? item.entryPrice ?? item.avgPrice),
    markPrice: nullablePositive(item.mark_price ?? item.markPrice),
    liquidationPrice: nullablePositive(item.liquidation_price ?? item.liqPrice),
    leverage: nullablePositive(item.leverage), positionStatus: optionalText(item.status ?? item.position_status),
    source: "AUTHENTICATED_READ_ONLY_REST", sourceEndpoint: endpoint, observedAt: now});
}
function venue(exchange: string, availableMargin: number, walletBalance: number | null, totalEquity: number | null,
  positions: DerivativePositionEvidence[], marginEndpoint: string, positionEndpoint: string, now: number,
  unit: DerivativeVenueAccountEvidence["availableMarginUnit"]): DerivativeVenueAccountEvidence {
  return immutable({exchange, product: "LINEAR_PERPETUAL", settlementAsset: "USDT", availableMargin,
    availableMarginUnit: unit, walletBalance, totalEquity, totalInitialMargin: null,
    totalMaintenanceMargin: null, positions, marginSourceEndpoint: marginEndpoint,
    positionSourceEndpoint: positionEndpoint, observedAt: now, expiresAt: now + FRESH_MS,
    authenticatedReadVerified: true, positionReadVerified: true, orderSubmissionAllowed: false,
    liveExecutionAllowed: false});
}
function records(value: unknown): Record<string, unknown>[] {
  const data = isRecordData(value);
  const unwrapped: unknown = data && "data" in data ? data.data : value;
  if (Array.isArray(unwrapped)) return unwrapped.filter((item): item is Record<string, unknown> => Boolean(isRecordData(item)));
  const record = isRecordData(unwrapped); if (!record) return [];
  for (const key of ["positions", "wallets", "balances", "list", "result"]) {
    const candidate = record[key]; if (Array.isArray(candidate)) return candidate.filter((item): item is Record<string, unknown> => Boolean(isRecordData(item)));
  }
  return Object.entries(record).flatMap(([key, item]) => {
    const nested = isRecordData(item); return nested ? [{asset: key, ...nested}] : [];
  });
}
function bounded(markets: readonly string[]): string[] { const values = Array.from(new Set(markets.map(text).filter(Boolean))).sort(); if (values.length === 0 || values.length > 20) throw new Error("Derivative account read requires one to twenty bounded markets."); return values; }
function marketOf(item: Record<string, unknown>): string { const raw = text(item.symbol ?? item.market ?? item.pair ?? item.instrument); return raw.replace(/^B/, "").replace(/FUTURES$/, ""); }
function text(value: unknown): string { return typeof value === "string" ? value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : ""; }
function optionalText(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim().slice(0, 100) : null; }
function signed(item: Record<string, unknown>): number { const value = Number(item.signed_quantity ?? item.position_amount ?? item.positionAmt ?? 0); if (!Number.isFinite(value)) throw new Error("Derivative signed position quantity is invalid."); return value; }
function requiredNonNegative(value: unknown, field: string): number { const parsed = Number(value); if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field} is invalid.`); return parsed; }
function nullable(value: unknown): number | null { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null; }
function nullablePositive(value: unknown): number | null { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
function isRecordData(value: unknown): Record<string, unknown> | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function immutable<T>(value: T): T { return Object.freeze(structuredClone(value)); }
