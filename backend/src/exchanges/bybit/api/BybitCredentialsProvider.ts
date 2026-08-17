export interface BybitCredentials {
  apiKey: string;

  apiSecret: string;
}

export class BybitCredentialsProvider {
  getCredentials():
    BybitCredentials {
    const apiKey =
      process.env
        .BYBIT_API_KEY
        ?.trim();

    const apiSecret =
      process.env
        .BYBIT_API_SECRET
        ?.trim();

    if (
      !apiKey
    ) {
      throw new Error(
        "BYBIT_API_KEY environment variable is missing.",
      );
    }

    if (
      !apiSecret
    ) {
      throw new Error(
        "BYBIT_API_SECRET environment variable is missing.",
      );
    }

    return {
      apiKey,

      apiSecret,
    };
  }

  isConfigured():
    boolean {
    return Boolean(
      process.env
        .BYBIT_API_KEY
        ?.trim() &&
      process.env
        .BYBIT_API_SECRET
        ?.trim(),
    );
  }
}

export const bybitCredentialsProvider =
  new BybitCredentialsProvider();