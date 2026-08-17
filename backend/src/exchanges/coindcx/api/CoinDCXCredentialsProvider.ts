import type {
  CoinDCXCredentials,
} from "./CoinDCXHttpClient";

export class CoinDCXCredentialsProvider {
  getCredentials(): CoinDCXCredentials {
    const apiKey =
      process.env.COINDCX_API_KEY
        ?.trim();

    const apiSecret =
      process.env.COINDCX_API_SECRET
        ?.trim();

    if (!apiKey) {
      throw new Error(
        "COINDCX_API_KEY environment variable is missing.",
      );
    }

    if (!apiSecret) {
      throw new Error(
        "COINDCX_API_SECRET environment variable is missing.",
      );
    }

    return {
      apiKey,
      apiSecret,
    };
  }

  isConfigured(): boolean {
    return Boolean(
      process.env.COINDCX_API_KEY
        ?.trim() &&
      process.env.COINDCX_API_SECRET
        ?.trim(),
    );
  }
}

export const coinDCXCredentialsProvider =
  new CoinDCXCredentialsProvider();