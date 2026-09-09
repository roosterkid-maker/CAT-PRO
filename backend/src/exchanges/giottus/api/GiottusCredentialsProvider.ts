export interface GiottusCredentials {
  apiKey: string;

  apiSecret: string;
}

export interface GiottusCredentialSource {
  getCredentials():
    GiottusCredentials;

  isConfigured():
    boolean;
}

export class GiottusCredentialsProvider
  implements GiottusCredentialSource
{
  getCredentials():
    GiottusCredentials {
    const apiKey =
      process.env
        .GIOTTUS_API_KEY
        ?.trim();

    const apiSecret =
      process.env
        .GIOTTUS_API_SECRET
        ?.trim();

    if (!apiKey) {
      throw new Error(
        "GIOTTUS_API_KEY environment variable is missing.",
      );
    }

    if (!apiSecret) {
      throw new Error(
        "GIOTTUS_API_SECRET environment variable is missing.",
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
        .GIOTTUS_API_KEY
        ?.trim() &&
      process.env
        .GIOTTUS_API_SECRET
        ?.trim(),
    );
  }
}

export const giottusCredentialsProvider =
  new GiottusCredentialsProvider();
