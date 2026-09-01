import type {
  BinanceCredentials,
} from "./BinanceCredentialsProvider";

/*
 * Deliberately SEPARATE from binanceCredentialsProvider. Every other Binance
 * key in this codebase is enforced by StrategyOneApiPermissionBoundaryService
 * to have withdrawals DISABLED - that invariant only holds if the rebalancer
 * never reuses that key. This provider reads its own dedicated env vars for
 * the one key the operator provisions specifically for capital movement
 * (Universal Transfer + withdrawal permission), so the two keys can never be
 * silently conflated.
 */
export class BinanceRebalancerCredentialsProvider {
  getCredentials(): BinanceCredentials {
    const apiKey =
      process.env.CAT_PRO_REBALANCER_BINANCE_API_KEY
        ?.trim();

    const apiSecret =
      process.env.CAT_PRO_REBALANCER_BINANCE_API_SECRET
        ?.trim();

    if (!apiKey) {
      throw new Error(
        "CAT_PRO_REBALANCER_BINANCE_API_KEY environment variable is missing.",
      );
    }

    if (!apiSecret) {
      throw new Error(
        "CAT_PRO_REBALANCER_BINANCE_API_SECRET environment variable is missing.",
      );
    }

    return {
      apiKey,
      apiSecret,
    };
  }

  isConfigured(): boolean {
    return Boolean(
      process.env.CAT_PRO_REBALANCER_BINANCE_API_KEY
        ?.trim() &&
      process.env.CAT_PRO_REBALANCER_BINANCE_API_SECRET
        ?.trim(),
    );
  }
}

export const binanceRebalancerCredentialsProvider =
  new BinanceRebalancerCredentialsProvider();
