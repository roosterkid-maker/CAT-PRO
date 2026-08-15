export interface CoinSwitchCredentials {
  apiKey: string;

  apiSecret: string;
}

export interface CoinSwitchCredentialSource {
  getCredentials():
    CoinSwitchCredentials;

  isConfigured():
    boolean;
}

export class CoinSwitchCredentialsProvider
  implements CoinSwitchCredentialSource
{
  getCredentials():
    CoinSwitchCredentials {
    const apiKey =
      process.env
        .COINSWITCH_API_KEY
        ?.trim();

    const apiSecret =
      process.env
        .COINSWITCH_API_SECRET
        ?.trim();

    if (!apiKey) {
      throw new Error(
        "COINSWITCH_API_KEY environment variable is missing.",
      );
    }

    if (!apiSecret) {
      throw new Error(
        "COINSWITCH_API_SECRET environment variable is missing.",
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
        .COINSWITCH_API_KEY
        ?.trim() &&
      process.env
        .COINSWITCH_API_SECRET
        ?.trim(),
    );
  }
}

export const coinSwitchCredentialsProvider =
  new CoinSwitchCredentialsProvider();
