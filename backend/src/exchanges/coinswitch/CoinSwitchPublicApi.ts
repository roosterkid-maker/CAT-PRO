import {
  COINSWITCH,
  type CoinSwitchPublicVenue,
} from "./constants";

import type {
  CoinSwitchServerTimeResponse,
  CoinSwitchTicker,
  CoinSwitchTickerEnvelope,
} from "./types";

export interface CoinSwitchPublicMarketApi {
  getServerTime():
    Promise<number>;

  getTickers(
    venue:
      CoinSwitchPublicVenue,
  ): Promise<
    Record<string, CoinSwitchTicker>
  >;
}

export type CoinSwitchFetch = (
  input:
    string | URL,

  init?:
    RequestInit,
) => Promise<Response>;

export class CoinSwitchPublicApi
  implements CoinSwitchPublicMarketApi
{
  constructor(
    private readonly request:
      CoinSwitchFetch = fetch,
  ) {}

  async getServerTime():
    Promise<number> {
    const response =
      await this.getJson(
        new URL(
          COINSWITCH.REST
            .SERVER_TIME_PATH,
          COINSWITCH
            .REST_BASE_URL,
        ),
      ) as
        CoinSwitchServerTimeResponse;

    const serverTime =
      Number(
        response.serverTime,
      );

    if (
      !Number.isSafeInteger(
        serverTime,
      ) ||
      serverTime <=
        0
    ) {
      throw new Error(
        "CoinSwitch server-time response is invalid.",
      );
    }

    return serverTime;
  }

  async getTickers(
    venue:
      CoinSwitchPublicVenue,
  ): Promise<
    Record<string, CoinSwitchTicker>
  > {
    const url =
      new URL(
        COINSWITCH.REST
          .ALL_TICKERS_PATH,
        COINSWITCH
          .REST_BASE_URL,
      );

    url.searchParams.set(
      "exchange",
      venue,
    );

    const response =
      await this.getJson(
        url,
      ) as
        CoinSwitchTickerEnvelope;

    if (
      !response.data ||
      typeof response.data !==
        "object" ||
      Array.isArray(
        response.data,
      )
    ) {
      throw new Error(
        `CoinSwitch ticker response is invalid: ${venue}.`,
      );
    }

    return response.data as
      Record<
        string,
        CoinSwitchTicker
      >;
  }

  private async getJson(
    url: URL,
  ): Promise<unknown> {
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
              COINSWITCH
                .REQUEST_TIMEOUT_MS,
            ),
        },
      );

    if (!response.ok) {
      throw new Error(
        `CoinSwitch public API failed with HTTP ${response.status}: ${url.pathname}.`,
      );
    }

    return response.json() as
      Promise<unknown>;
  }
}

export const coinSwitchPublicApi =
  new CoinSwitchPublicApi();
