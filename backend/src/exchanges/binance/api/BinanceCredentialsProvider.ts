export interface BinanceCredentials {
  apiKey: string;

  apiSecret: string;
}

export class BinanceCredentialsProvider {
  getCredentials(): BinanceCredentials {
    const apiKey =
      process.env.BINANCE_API_KEY
        ?.trim();

    const apiSecret =
      process.env.BINANCE_API_SECRET
        ?.trim();

    if (!apiKey) {
      throw new Error(
        "BINANCE_API_KEY environment variable is missing.",
      );
    }

    if (!apiSecret) {
      throw new Error(
        "BINANCE_API_SECRET environment variable is missing.",
      );
    }

    return {
      apiKey,
      apiSecret,
    };
  }

  isConfigured(): boolean {
    return Boolean(
      process.env.BINANCE_API_KEY
        ?.trim() &&
      process.env.BINANCE_API_SECRET
        ?.trim(),
    );
  }
}

export const binanceCredentialsProvider =
  new BinanceCredentialsProvider();