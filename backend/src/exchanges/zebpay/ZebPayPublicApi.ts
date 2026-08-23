import {
  ZEBPAY,
} from "./constants";

import type {
  ZebPayMarket,
  ZebPayOrderBook,
  ZebPayPublicEnvelope,
  ZebPayTradePair,
} from "./types";

export interface ZebPayPublicMarketApi {
  getMarkets():
    Promise<ZebPayMarket[]>;

  getTradePairs():
    Promise<ZebPayTradePair[]>;

  getOrderBook(
    market: string,
  ): Promise<ZebPayOrderBook>;
}

export type ZebPayFetch = (
  input:
    string | URL,

  init?:
    RequestInit,
) => Promise<Response>;

export class ZebPayPublicApi
  implements ZebPayPublicMarketApi
{
  constructor(
    private readonly request:
      ZebPayFetch = fetch,

    private readonly requestTimeoutMs:
      number =
      ZEBPAY.REQUEST_TIMEOUT_MS,
  ) {
    if (
      !Number.isSafeInteger(
        this.requestTimeoutMs,
      ) ||
      this.requestTimeoutMs <=
        0
    ) {
      throw new Error(
        "ZebPay public-read timeout must be a positive integer.",
      );
    }
  }

  async getMarkets():
    Promise<ZebPayMarket[]> {
    const url =
      new URL(
        ZEBPAY.REST
          .MARKETS_PATH,
        ZEBPAY.REST
          .BASE_URL,
      );

    const response =
      await this.request(
        url,
        {
          method:
            "GET",

          headers: {
            Accept:
              "application/json",
          },

          signal:
            AbortSignal.timeout(
              this.requestTimeoutMs,
            ),
        },
      );

    if (!response.ok) {
      throw new Error(
        `ZebPay public API failed with HTTP ${response.status}: ${url.pathname}.`,
      );
    }

    const payload =
      await response.json() as
        unknown;

    if (
      !Array.isArray(
        payload,
      )
    ) {
      throw new Error(
        "ZebPay markets response is not an array.",
      );
    }

    return payload as
      ZebPayMarket[];
  }

  async getTradePairs():
    Promise<ZebPayTradePair[]> {
    const payload =
      await this.getJson(
        ZEBPAY.REST
          .TRADE_PAIRS_PATH,
      );

    const data =
      this.unwrapData(
        payload,
      );

    if (!Array.isArray(data)) {
      throw new Error(
        "ZebPay trade-pairs response is not an array.",
      );
    }

    return data as
      ZebPayTradePair[];
  }

  async getOrderBook(
    market: string,
  ): Promise<ZebPayOrderBook> {
    const normalizedMarket =
      this.normalizeApiMarket(
        market,
      );

    const payload =
      await this.getJson(
        `${ZEBPAY.REST.ORDER_BOOK_PATH_PREFIX}/${normalizedMarket}/book?converted=1`,
      );

    const data =
      this.unwrapData(
        payload,
      );

    if (
      typeof data !==
        "object" ||
      data === null ||
      Array.isArray(data)
    ) {
      throw new Error(
        `ZebPay order book is invalid: ${normalizedMarket}.`,
      );
    }

    return data as
      ZebPayOrderBook;
  }

  private async getJson(
    pathAndQuery: string,
  ): Promise<unknown> {
    const url =
      new URL(
        pathAndQuery,
        ZEBPAY.REST
          .BASE_URL,
      );

    const response =
      await this.request(
        url,
        {
          method: "GET",
          headers: {
            Accept:
              "application/json",
          },
          signal:
            AbortSignal.timeout(
              this.requestTimeoutMs,
            ),
        },
      );

    if (!response.ok) {
      throw new Error(
        `ZebPay public API failed with HTTP ${response.status}: ${url.pathname}.`,
      );
    }

    return response.json() as
      Promise<unknown>;
  }

  private unwrapData(
    payload: unknown,
  ): unknown {
    if (
      typeof payload ===
        "object" &&
      payload !== null &&
      !Array.isArray(payload) &&
      "data" in payload
    ) {
      return (
        payload as
          ZebPayPublicEnvelope<unknown>
      ).data;
    }

    return payload;
  }

  private normalizeApiMarket(
    market: string,
  ): string {
    const normalized =
      market
        .trim()
        .toUpperCase()
        .replace(
          /[_/\s]+/gu,
          "-",
        );

    if (
      !/^[A-Z0-9]+-[A-Z0-9]+$/u
        .test(normalized)
    ) {
      throw new Error(
        "ZebPay public order-book market must be a base-quote pair.",
      );
    }

    return normalized;
  }
}

export const zebPayPublicApi =
  new ZebPayPublicApi();
