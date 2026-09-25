import {
  resolve,
} from "node:path";

import {
  orderBookService,
} from "../../orderbook/services/OrderBookService";

import {
  exchangeCapabilityService,
} from "../../execution/capabilities/services/ExchangeCapabilityService";

import {
  tradingAccountService,
} from "../../trading/account/TradingAccountService";

import {
  centralLiveOrderExecutionGateway,
} from "../../execution/live/central/CentralLiveOrderExecutionGateway";

import {
  liveTradingInterlock,
} from "../../execution/live/LiveTradingInterlock";

import {
  InrRouteSessionExecutor,
} from "../../execution/live/inr-routes/InrRouteSessionExecutor";

import {
  priceStepOf,
  quantityStepOf,
} from "../../execution/live/inr-routes/InrRouteLiveRunner";

import {
  registerDailyRealizedNetSource,
} from "../../execution/live/live-only/DailyLossGuard";

import {
  getExchangeTakerFeePercent,
} from "../../arbitrage/config/fees";

import {
  isLiveOnlyRuntimeEnabled,
} from "../../config/LiveOnlyRuntimePolicy";

import {
  InExchangeMakerLiveEngine,
  loadIxmLiveConfig,
  type IxmMarketRules,
} from "./InExchangeMakerLiveEngine";

import {
  getInExchangeMakerShadow,
} from "./InExchangeMakerShadowService";

import type {
  OrderBook,
} from "../../orderbook/models/OrderBook";

/* The live in-exchange maker on CoinDCX, wired to the audited order path. */
const IXM_RUNNER = "ixm";
let engine: InExchangeMakerLiveEngine | null = null;
const rulesRequested = new Set<string>();

function rules(market: string): IxmMarketRules | null {
  const capability = exchangeCapabilityService.getCachedCapability("coindcx", market, "spot");
  if (!capability) {
    // Load once in the background; the worker retries on its next pass.
    if (!rulesRequested.has(market)) {
      rulesRequested.add(market);
      void exchangeCapabilityService.getCapability({exchange: "coindcx", market, product: "spot"})
        .catch(() => undefined)
        .finally(() => rulesRequested.delete(market));
    }
    return null;
  }
  if (!capability.tradingEnabled || capability.maintenanceMode) return null;
  return {
    quantityStep: quantityStepOf(capability),
    priceStep: priceStepOf(capability),
    minimumQuantity: capability.quantity.minimumQuantity,
    minimumNotional: capability.notional.minimumNotional,
  };
}

/* REST snapshots for books the stream does not keep fresh (quiet, quarantined or past the subscription cap). */
const COINDCX_ORDERBOOK_URL = "https://public.coindcx.com/market_data/orderbook";
const SNAPSHOT_REUSE_MS = 300;
const snapshots = new Map<string, {at: number; book: Promise<OrderBook | null>}>();

function coinDcxPair(market: string): string | null {
  const match = /^([A-Z0-9]+?)(INR|USDT)$/u.exec(market);
  if (!match) return null;
  return match[2] === "INR" ? `I-${match[1]}_INR` : `B-${match[1]}_USDT`;
}

function levels(side: unknown): OrderBook["bids"] {
  if (!side || typeof side !== "object") return [];
  return Object.entries(side as Record<string, unknown>)
    .map(([price, quantity]) => ({price: Number(price), quantity: Number(quantity)}))
    .filter((level) => level.price > 0 && level.quantity > 0);
}

async function fetchSnapshot(market: string): Promise<OrderBook | null> {
  const pair = coinDcxPair(market);
  if (!pair) return null;
  const response = await fetch(`${COINDCX_ORDERBOOK_URL}?pair=${encodeURIComponent(pair)}`, {signal: AbortSignal.timeout(2_000)});
  if (!response.ok) return null;
  const body = await response.json() as {bids?: unknown; asks?: unknown};
  const bids = levels(body.bids).sort((a, b) => b.price - a.price);
  const asks = levels(body.asks).sort((a, b) => a.price - b.price);
  if (bids.length === 0 && asks.length === 0) return null;
  // Stamped on receipt: the snapshot is the book as of this response.
  return {exchange: "coindcx", market, bids, asks, timestamp: Date.now()};
}

/** Shares one in-flight or very recent snapshot between the bid and ask workers. */
function fetchBook(market: string): Promise<OrderBook | null> {
  const cached = snapshots.get(market);
  if (cached && Date.now() - cached.at <= SNAPSHOT_REUSE_MS) return cached.book;
  const book = fetchSnapshot(market).catch(() => null);
  snapshots.set(market, {at: Date.now(), book});
  return book;
}

export function startInExchangeMakerLive(): InExchangeMakerLiveEngine {
  if (engine) return engine;
  const config = loadIxmLiveConfig(process.env, isLiveOnlyRuntimeEnabled(process.env));
  const executor = new InrRouteSessionExecutor(
    centralLiveOrderExecutionGateway,
    resolve(process.cwd(), "logs", "live", "in-exchange-maker-sessions.jsonl"),
  );
  engine = new InExchangeMakerLiveEngine(config, {
    getQuote: (coin) => getInExchangeMakerShadow("coindcx")?.getLiveQuote(coin) ?? null,
    getBook: (market) => orderBookService.get("coindcx", market) ?? null,
    fetchBook,
    getRules: rules,
    getBalance: (asset) => tradingAccountService.getExchangeBalance("coindcx", asset)?.availableBalance ?? null,
    execute: (input) => executor.execute(input),
    inrFeePercent: () => getExchangeTakerFeePercent("coindcx", "XINR") ?? 0.59,
    usdtFeePercent: () => getExchangeTakerFeePercent("coindcx", "XUSDT") ?? 0.2,
    otherExposureHalted: () => liveTradingInterlock.getDiagnostics().exposureHalts.some((halt) => halt.runner !== IXM_RUNNER),
    publishHalt: (reason) => liveTradingInterlock.setExposureHalt(IXM_RUNNER, reason),
    now: Date.now,
    sleep: (milliseconds) => new Promise((done) => setTimeout(done, milliseconds)),
  });
  // IXM's realized P&L counts toward the global daily loss stop.
  registerDailyRealizedNetSource(IXM_RUNNER, (now) => engine?.realizedTodayInr(now) ?? 0);
  engine.start();
  return engine;
}

export function getInExchangeMakerLive(): InExchangeMakerLiveEngine | null {
  return engine;
}
