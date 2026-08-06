import crypto from "node:crypto";

export type CoinDCXRequestBody =
  Record<string, unknown>;

export interface SignedCoinDCXRequest {
  body: CoinDCXRequestBody;

  payload: string;

  headers: {
    "Content-Type": "application/json";
    "X-AUTH-APIKEY": string;
    "X-AUTH-SIGNATURE": string;
  };
}

export class CoinDCXSigner {
  sign(
    body: CoinDCXRequestBody,
    apiKey: string,
    apiSecret: string,
  ): SignedCoinDCXRequest {
    const normalizedApiKey =
      apiKey.trim();

    const normalizedApiSecret =
      apiSecret.trim();

    if (!normalizedApiKey) {
      throw new Error(
        "CoinDCX API key is missing.",
      );
    }

    if (!normalizedApiSecret) {
      throw new Error(
        "CoinDCX API secret is missing.",
      );
    }

    const payload =
      JSON.stringify(body);

    const signature =
      crypto
        .createHmac(
          "sha256",
          normalizedApiSecret,
        )
        .update(payload)
        .digest("hex");

    return {
      body,

      payload,

      headers: {
        "Content-Type":
          "application/json",

        "X-AUTH-APIKEY":
          normalizedApiKey,

        "X-AUTH-SIGNATURE":
          signature,
      },
    };
  }

  createTimestampBody(
    additionalBody:
      CoinDCXRequestBody = {},
    now = Date.now(),
  ): CoinDCXRequestBody {
    if (
      !Number.isFinite(now) ||
      now <= 0
    ) {
      throw new Error(
        "Invalid request timestamp.",
      );
    }

    return {
      ...additionalBody,

      timestamp:
        Math.floor(now),
    };
  }
}

export const coinDCXSigner =
  new CoinDCXSigner();