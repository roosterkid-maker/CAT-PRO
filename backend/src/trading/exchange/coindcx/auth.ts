import { createHmac } from "node:crypto";

import { exchangeConfig } from "../../../config/exchange";

export function createCoinDCXHeaders(
  body: string,
): Record<string, string> {
  const signature = createHmac(
    "sha256",
    exchangeConfig.coinDCX.apiSecret,
  )
    .update(body)
    .digest("hex");

  return {
    "Content-Type":
      "application/json",

    "X-AUTH-APIKEY":
      exchangeConfig.coinDCX.apiKey,

    "X-AUTH-SIGNATURE":
      signature,
  };
}