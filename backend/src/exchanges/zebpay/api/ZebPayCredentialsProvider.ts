export interface ZebPayCredentials {
  apiKey: string;

  apiSecret: string;
}

export interface ZebPayCredentialSource {
  getCredentials():
    ZebPayCredentials;

  isConfigured():
    boolean;
}

export class ZebPayCredentialsProvider
  implements ZebPayCredentialSource
{
  getCredentials():
    ZebPayCredentials {
    const apiKey =
      process.env
        .ZEBPAY_API_KEY
        ?.trim();

    const apiSecret =
      process.env
        .ZEBPAY_API_SECRET
        ?.trim();

    if (!apiKey) {
      throw new Error(
        "ZEBPAY_API_KEY environment variable is missing.",
      );
    }

    if (!apiSecret) {
      throw new Error(
        "ZEBPAY_API_SECRET environment variable is missing.",
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
        .ZEBPAY_API_KEY
        ?.trim() &&
      process.env
        .ZEBPAY_API_SECRET
        ?.trim(),
    );
  }
}

export const zebPayCredentialsProvider =
  new ZebPayCredentialsProvider();
