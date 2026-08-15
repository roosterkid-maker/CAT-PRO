export interface UnoCoinCredentials {
  apiToken: string;
}

export interface UnoCoinCredentialSource {
  getCredentials():
    UnoCoinCredentials;

  isConfigured():
    boolean;
}

export class UnoCoinCredentialsProvider
  implements UnoCoinCredentialSource
{
  getCredentials():
    UnoCoinCredentials {
    const apiToken =
      process.env
        .UNOCOIN_API_TOKEN
        ?.trim();

    if (!apiToken) {
      throw new Error(
        "UNOCOIN_API_TOKEN environment variable is missing.",
      );
    }

    return {
      apiToken,
    };
  }

  isConfigured():
    boolean {
    return Boolean(
      process.env
        .UNOCOIN_API_TOKEN
        ?.trim(),
    );
  }
}

export const unoCoinCredentialsProvider =
  new UnoCoinCredentialsProvider();
