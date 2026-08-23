import type {
  BinanceCredentials,
} from "../../exchanges/binance/api/BinanceCredentialsProvider";

/**
 * Dedicated credential boundary for Binance USD-M Futures.
 *
 * Spot credentials are intentionally never used as a fallback. Keeping the
 * products separate prevents a Spot-only key from reaching signed Futures
 * endpoints and makes a missing/partial Futures configuration fail before I/O.
 */
export class BinanceUsdMCredentialsProvider {
  constructor(
    private readonly environment: NodeJS.ProcessEnv = process.env,
  ) {}

  getCredentials(): BinanceCredentials {
    const apiKey = this.environment.BINANCE_USDM_API_KEY?.trim();
    const apiSecret = this.environment.BINANCE_USDM_API_SECRET?.trim();

    if (!apiKey) {
      throw new Error(
        "BINANCE_USDM_API_KEY environment variable is missing.",
      );
    }

    if (!apiSecret) {
      throw new Error(
        "BINANCE_USDM_API_SECRET environment variable is missing.",
      );
    }

    return {apiKey, apiSecret};
  }

  isConfigured(): boolean {
    return Boolean(
      this.environment.BINANCE_USDM_API_KEY?.trim() &&
      this.environment.BINANCE_USDM_API_SECRET?.trim(),
    );
  }
}

export const binanceUsdMCredentialsProvider =
  new BinanceUsdMCredentialsProvider();
