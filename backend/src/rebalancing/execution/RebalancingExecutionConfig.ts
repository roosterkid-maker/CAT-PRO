/*
 * Environment-driven configuration for the Automated Capital Rebalancer.
 * Everything here defaults to OFF / empty - the feature does nothing until
 * an operator explicitly sets CAT_PRO_REBALANCER_ENABLED=true AND has
 * populated a whitelist, exactly like every other real-money-moving
 * feature in this codebase (see StrategyRuntimeOperatorConfiguration).
 *
 * Caps are denominated in USDT, not INR, even though the operator originally
 * sized them in INR (~Rs500-1000/transfer, ~Rs5,000/day). Every amount this
 * feature actually touches - RebalancingRouteProposal.amountUsdt, Binance
 * transfer/withdraw amounts - is already USDT. Converting an INR cap to USDT
 * at request time would need a live FX rate; a stale or hardcoded one could
 * silently let more real capital move than the operator intended, which is
 * the one direction a safety cap must never drift. Keeping the cap natively
 * in USDT removes that failure mode entirely. The defaults below are a
 * one-time conversion at ~Rs83/USDT - override via env vars to match the
 * operator's actual intended USDT amounts.
 */

export type RebalancingExecutionExchange = "binance" | "bybit" | "coindcx";

export interface RebalancingWithdrawalWhitelistEntry {
  readonly exchange: RebalancingExecutionExchange;
  readonly asset: string;
  readonly network: string;
  readonly address: string;
  readonly addressTag: string | null;
}

export interface RebalancingExecutionConfig {
  readonly enabled: boolean;
  readonly sameExchangeEnabled: boolean;
  readonly crossExchangeEnabled: boolean;
  readonly maximumPerTransferUsdt: number;
  readonly maximumPerDaySameExchangeUsdt: number;
  readonly maximumPerDayCrossExchangeUsdt: number;
  readonly withdrawalWhitelist: readonly RebalancingWithdrawalWhitelistEntry[];
}

const DEFAULT_MAXIMUM_PER_TRANSFER_USDT = 10;
const DEFAULT_MAXIMUM_PER_DAY_USDT = 60;

export function loadRebalancingExecutionConfig(
  environment: NodeJS.ProcessEnv = process.env,
): RebalancingExecutionConfig {
  return {
    enabled: parseBoolean(environment.CAT_PRO_REBALANCER_ENABLED),
    sameExchangeEnabled: parseBoolean(environment.CAT_PRO_REBALANCER_SAME_EXCHANGE_ENABLED),
    crossExchangeEnabled: parseBoolean(environment.CAT_PRO_REBALANCER_CROSS_EXCHANGE_ENABLED),

    maximumPerTransferUsdt: parsePositiveNumber(
      environment.CAT_PRO_REBALANCER_MAX_PER_TRANSFER_USDT,
      DEFAULT_MAXIMUM_PER_TRANSFER_USDT,
    ),

    maximumPerDaySameExchangeUsdt: parsePositiveNumber(
      environment.CAT_PRO_REBALANCER_MAX_PER_DAY_SAME_EXCHANGE_USDT,
      DEFAULT_MAXIMUM_PER_DAY_USDT,
    ),

    maximumPerDayCrossExchangeUsdt: parsePositiveNumber(
      environment.CAT_PRO_REBALANCER_MAX_PER_DAY_CROSS_EXCHANGE_USDT,
      DEFAULT_MAXIMUM_PER_DAY_USDT,
    ),

    withdrawalWhitelist: parseWhitelist(environment.CAT_PRO_REBALANCER_WITHDRAWAL_WHITELIST_JSON),
  };
}

/**
 * Look up the whitelisted destination for one (exchange, asset, network)
 * combination. Returns null if it isn't whitelisted - callers MUST treat
 * that as "refuse the transfer", never as "pick some other address".
 */
export function findWhitelistedAddress(
  config: RebalancingExecutionConfig,
  exchange: RebalancingExecutionExchange,
  asset: string,
  network: string,
): RebalancingWithdrawalWhitelistEntry | null {
  const normalizedAsset = asset.trim().toUpperCase();
  const normalizedNetwork = network.trim().toUpperCase();
  return (
    config.withdrawalWhitelist.find(
      (entry) =>
        entry.exchange === exchange &&
        entry.asset === normalizedAsset &&
        entry.network === normalizedNetwork,
    ) ?? null
  );
}

function parseBoolean(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseWhitelist(value: string | undefined): readonly RebalancingWithdrawalWhitelistEntry[] {
  if (!value || !value.trim()) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    throw new Error(
      "CAT_PRO_REBALANCER_WITHDRAWAL_WHITELIST_JSON is not valid JSON. Expected an array of " +
        '{"exchange","asset","network","address","addressTag"} entries.',
    );
  }

  if (!Array.isArray(raw)) {
    throw new Error("CAT_PRO_REBALANCER_WITHDRAWAL_WHITELIST_JSON must be a JSON array.");
  }

  return raw.map((entry, index) => normalizeWhitelistEntry(entry, index));
}

function normalizeWhitelistEntry(entry: unknown, index: number): RebalancingWithdrawalWhitelistEntry {
  if (typeof entry !== "object" || entry === null) {
    throw new Error(`Whitelist entry ${index} must be an object.`);
  }
  const record = entry as Record<string, unknown>;

  const exchange = record.exchange;
  if (exchange !== "binance" && exchange !== "bybit" && exchange !== "coindcx") {
    throw new Error(`Whitelist entry ${index} has an invalid "exchange" (must be binance, bybit or coindcx).`);
  }

  const asset = typeof record.asset === "string" ? record.asset.trim().toUpperCase() : "";
  if (!asset) throw new Error(`Whitelist entry ${index} is missing "asset".`);

  const network = typeof record.network === "string" ? record.network.trim().toUpperCase() : "";
  if (!network) throw new Error(`Whitelist entry ${index} is missing "network".`);

  const address = typeof record.address === "string" ? record.address.trim() : "";
  if (!address) throw new Error(`Whitelist entry ${index} is missing "address".`);

  const addressTag =
    typeof record.addressTag === "string" && record.addressTag.trim() ? record.addressTag.trim() : null;

  return {exchange, asset, network, address, addressTag};
}
