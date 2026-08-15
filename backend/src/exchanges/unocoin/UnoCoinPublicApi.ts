import {
  UNOCOIN,
} from "./constants";

import type {
  UnoCoinAssetOrder,
  UnoCoinAssetOrderBook,
  UnoCoinAssetOrderPage,
  UnoCoinBaseCoinSettings,
  UnoCoinOrderBook,
  UnoCoinPair,
  UnoCoinTicker,
} from "./types";

export interface UnoCoinPublicMarketApi {
  getPairs():
    Promise<UnoCoinPair[]>;

  getTickers():
    Promise<UnoCoinTicker[]>;

  getBaseCoinSettings():
    Promise<UnoCoinBaseCoinSettings>;

  getOrderBook(
    tickerId: string,
    depth?: number,
  ): Promise<UnoCoinOrderBook>;
}

export type UnoCoinFetch = (
  input:
    string | URL,

  init?:
    RequestInit,
) => Promise<Response>;

export class UnoCoinPublicApi
  implements UnoCoinPublicMarketApi
{
  constructor(
    private readonly request:
      UnoCoinFetch = fetch,
  ) {}

  async getPairs():
    Promise<UnoCoinPair[]> {
    const response =
      await this.getJson(
        new URL(
          UNOCOIN.REST
            .PAIRS_PATH,
          UNOCOIN.REST
            .BASE_URL,
        ),
      );

    if (
      !Array.isArray(
        response,
      )
    ) {
      throw new Error(
        "UnoCoin pairs response is not an array.",
      );
    }

    return response as
      UnoCoinPair[];
  }

  async getTickers():
    Promise<UnoCoinTicker[]> {
    const response =
      await this.getJson(
        new URL(
          UNOCOIN.REST
            .TICKERS_PATH,
          UNOCOIN.REST
            .BASE_URL,
        ),
      );

    if (
      !Array.isArray(
        response,
      )
    ) {
      throw new Error(
        "UnoCoin tickers response is not an array.",
      );
    }

    return response as
      UnoCoinTicker[];
  }

  async getBaseCoinSettings():
    Promise<UnoCoinBaseCoinSettings> {
    const response =
      await this.getJson(
        new URL(
          UNOCOIN.REST
            .BASE_COIN_SETTINGS_PATH,
          UNOCOIN.REST
            .BASE_URL,
        ),
      );

    if (
      !response ||
      typeof response !==
        "object" ||
      Array.isArray(
        response,
      )
    ) {
      throw new Error(
        "UnoCoin base-coin settings response is invalid.",
      );
    }

    return response as
      UnoCoinBaseCoinSettings;
  }

  async getOrderBook(
    tickerId: string,
    depth =
      UNOCOIN.ORDER_BOOK_DEPTH,
  ): Promise<UnoCoinOrderBook> {
    const normalizedTickerId =
      tickerId
        .trim()
        .toUpperCase();

    if (!normalizedTickerId) {
      throw new Error(
        "UnoCoin order-book request requires a ticker ID.",
      );
    }

    if (
      !Number.isSafeInteger(
        depth,
      ) ||
      depth <= 0 ||
      depth % 100 !==
        0
    ) {
      throw new Error(
        "UnoCoin order-book depth must be a positive multiple of 100.",
      );
    }

    const url =
      new URL(
        UNOCOIN.REST
          .ORDER_BOOK_PATH,
        UNOCOIN.REST
          .BASE_URL,
      );

    url.searchParams.set(
      "ticker_id",
      normalizedTickerId,
    );

    url.searchParams.set(
      "depth",
      String(
        depth,
      ),
    );

    try {
      /*
       * The documented asset book is bounded to 50 levels and proved more
       * responsive for the short Strategy #1 observation window. It remains
       * a real two-sided quantity-bearing public book; no ticker promotion or
       * synthetic freshness is involved.
       */
      return await this
        .getAssetOrderBook(
          normalizedTickerId,
          depth,
        );
    } catch (
      assetBookError:
        unknown
    ) {
      try {
        const response =
          await this.getJson(
            url,
          );

        if (
          !response ||
          typeof response !==
            "object" ||
          Array.isArray(
            response,
          )
        ) {
          throw new Error(
            `UnoCoin recovery order-book response is invalid: ${normalizedTickerId}.`,
          );
        }

        return response as
          UnoCoinOrderBook;
      } catch (
        recoveryError:
          unknown
      ) {
        throw new Error(
          `UnoCoin order-book sources failed for ${normalizedTickerId}. Asset book: ${this.errorMessage(assetBookError)} Recovery book: ${this.errorMessage(recoveryError)}`,
        );
      }
    }
  }

  private async getAssetOrderBook(
    tickerId: string,
    requestedDepth: number,
  ): Promise<UnoCoinOrderBook> {
    const marketParts =
      tickerId.split(
        "_",
      );

    if (
      marketParts.length !==
        2
    ) {
      throw new Error(
        "UnoCoin asset order-book fallback requires a two-symbol market.",
      );
    }

    const [
      expectedCoin,
      expectedBaseCoin,
    ] = marketParts;

    if (
      !expectedCoin ||
      !expectedBaseCoin
    ) {
      throw new Error(
        "UnoCoin asset order-book fallback market is invalid.",
      );
    }

    const fallbackDepth =
      Math.min(
        requestedDepth,
        UNOCOIN
          .MAXIMUM_PUBLISHED_DEPTH,
      );

    const fallbackPath =
      `${UNOCOIN.REST.ASSET_ORDER_BOOK_PATH}/${encodeURIComponent(tickerId)}/${fallbackDepth}`;

    const response =
      await this.getJson(
        new URL(
          fallbackPath,
          UNOCOIN.REST
            .BASE_URL,
        ),
      );

    if (
      !response ||
      typeof response !==
        "object" ||
      Array.isArray(
        response,
      )
    ) {
      throw new Error(
        "UnoCoin asset order-book fallback response is invalid.",
      );
    }

    const fallback =
      response as
        UnoCoinAssetOrderBook;

    const bids =
      this.normalizeAssetOrders(
        fallback.bids,
        expectedCoin,
        expectedBaseCoin,
        "BID",
      );

    const asks =
      this.normalizeAssetOrders(
        fallback.asks,
        expectedCoin,
        expectedBaseCoin,
        "ASK",
      );

    if (
      bids.length ===
        0 ||
      asks.length ===
        0
    ) {
      throw new Error(
        "UnoCoin asset order-book fallback contains no matching two-sided depth.",
      );
    }

    return {
      ticker_id:
        tickerId,

      bids,

      asks,
    };
  }

  private normalizeAssetOrders(
    incoming: unknown,
    expectedCoin: string,
    expectedBaseCoin: string,
    expectedSide:
      "BID" |
      "ASK",
  ): Array<readonly [unknown, unknown]> {
    if (
      !incoming ||
      typeof incoming !==
        "object" ||
      Array.isArray(
        incoming,
      )
    ) {
      return [];
    }

    const page =
      incoming as
        UnoCoinAssetOrderPage;

    if (
      !Array.isArray(
        page.data,
      )
    ) {
      return [];
    }

    return page.data
      .filter(
        (
          value,
        ): value is UnoCoinAssetOrder =>
          Boolean(
            value &&
            typeof value ===
              "object" &&
            !Array.isArray(
              value,
            ),
          ),
      )
      .filter(
        (order) =>
          this.normalizeSymbol(
            order.coin,
          ) ===
            expectedCoin &&
          this.normalizeSymbol(
            order.base_coin,
          ) ===
            expectedBaseCoin &&
          this.normalizeSymbol(
            order.order_type,
          ) ===
            expectedSide,
      )
      .map(
        (order) =>
          [
            order.rate,
            order.volume,
          ] as const,
      );
  }

  private normalizeSymbol(
    value: unknown,
  ): string {
    return typeof value ===
      "string"
      ? value
          .trim()
          .toUpperCase()
      : "";
  }

  private errorMessage(
    error: unknown,
  ): string {
    return error instanceof Error
      ? error.message
      : "unknown error";
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
              UNOCOIN
                .REQUEST_TIMEOUT_MS,
            ),
        },
      );

    if (!response.ok) {
      throw new Error(
        `UnoCoin public API failed with HTTP ${response.status}: ${url.pathname}.`,
      );
    }

    return response.json() as
      Promise<unknown>;
  }
}

export const unoCoinPublicApi =
  new UnoCoinPublicApi();
