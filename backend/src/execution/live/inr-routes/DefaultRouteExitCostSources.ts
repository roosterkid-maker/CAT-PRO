import {
  binanceCapitalTransferApi,
} from "../../../exchanges/binance/api/BinanceCapitalTransferApi";

import {
  binanceRebalancerCredentialsProvider,
} from "../../../exchanges/binance/api/BinanceRebalancerCredentialsProvider";

import {
  bybitCapitalApi,
} from "../../../exchanges/bybit/api/BybitCapitalApi";

import {
  unoCoinAccountApi,
} from "../../../exchanges/unocoin/api/UnoCoinAccountApi";

import {
  unoCoinCredentialsProvider,
} from "../../../exchanges/unocoin/api/UnoCoinCredentialsProvider";

import {
  getRouteExitCostService,
  registerRouteExitCostService,
  RouteExitCostService,
  type ExitCostSources,
} from "./RouteExitCostService";

/* The live exchange reads behind the route exit-cost service. Read-only. */
export const DEFAULT_ROUTE_EXIT_COST_SOURCES: ExitCostSources = {
  unocoin: async () => {
    const settings = await unoCoinAccountApi.getWithdrawSettings(unoCoinCredentialsProvider.getCredentials());
    return new Map(settings.map((setting) => [setting.coin, {feeUnits: setting.networkFee, network: setting.network}]));
  },
  binance: async () => {
    const configs = await binanceCapitalTransferApi.getAllCoinConfigs(binanceRebalancerCredentialsProvider.getCredentials());
    return new Map([...configs].map(([coin, config]) => [coin, config.networks.map((network) => ({
      network: network.network,
      withdrawEnabled: config.withdrawAllEnable && network.withdrawEnable,
      depositEnabled: null,
      withdrawFee: network.withdrawFee,
    }))]));
  },
  bybit: async () => {
    const chains = await bybitCapitalApi.getCoinChains();
    return new Map([...chains].map(([coin, list]) => [coin, list.map((chain) => ({
      network: chain.chain,
      withdrawEnabled: chain.withdrawEnabled,
      depositEnabled: chain.depositEnabled,
      withdrawFee: Number.isFinite(chain.withdrawFee) ? chain.withdrawFee : null,
    }))]));
  },
};

/** The shared service, created on first use with the live sources. */
export function getOrCreateRouteExitCostService(): RouteExitCostService {
  const existing = getRouteExitCostService();
  if (existing) return existing;
  const service = new RouteExitCostService(DEFAULT_ROUTE_EXIT_COST_SOURCES);
  registerRouteExitCostService(service);
  return service;
}
