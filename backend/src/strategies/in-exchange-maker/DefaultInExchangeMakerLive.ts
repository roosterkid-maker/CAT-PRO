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
