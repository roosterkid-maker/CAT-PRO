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

export class UnoCoinPublicDataRejectedError
  extends Error
{
  constructor(
    message: string,
  ) {
    super(
      message,
    );

    this.name =
      "UnoCoinPublicDataRejectedError";
  }
}

class UnoCoinHttpStatusError
  extends Error
{
  constructor(
    readonly status:
      number,
    readonly path:
      string,
  ) {
    super(
      `UnoCoin public API failed with HTTP ${status}: ${path}.`,
    );

    this.name =
      "UnoCoinHttpStatusError";
  }
}

const RETIRED_RECOVERY_ENDPOINT_COOLDOWN_MS =
  30 * 60 * 1_000;

export class UnoCoinPublicApi
  implements UnoCoinPublicMarketApi
{
  private recoveryOrderBookUnavailableUntil =
    0;

  constructor(
    private readonly request:
      UnoCoinFetch = fetch,

    private readonly requestTimeoutMs:
      number =
      UNOCOIN.REQUEST_TIMEOUT_MS,
  ) {
    if (
      !Number.isSafeInteger(
        this.requestTimeoutMs,
      ) ||
      this.requestTimeoutMs <=
        0
    ) {
      throw new Error(
        "UnoCoin public-read timeout must be a positive integer.",
      );
    }
  }

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

    const orderBookDeadlineAt =
      Date.now() +
      this.requestTimeoutMs;

    /*
     * The primary and recovery endpoints share one total request budget.
     * Previously each source could consume the full timeout, making one
     * failed market occupy a worker for roughly twice the configured limit.
     * Keep enough of the same bounded budget for a useful recovery attempt
     * without increasing aggregate pressure on UnoCoin during an outage.
     */
    const primaryBudgetMs =
      Math.max(
        1,
        Math.floor(
          this.requestTimeoutMs *
          0.6,
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
          primaryBudgetMs,
        );
    } catch (
      assetBookError:
        unknown
    ) {
      if (
        Date.now() <
        this.recoveryOrderBookUnavailableUntil
      ) {
        if (
          assetBookError instanceof
            UnoCoinPublicDataRejectedError
        ) {
          throw assetBookError;
        }

        throw new Error(
          `UnoCoin asset order-book failed for ${normalizedTickerId}; retired recovery endpoint is temporarily bypassed after HTTP 404. ${this.errorMessage(assetBookError)}`,
        );
      }

      try {
        const recoveryBudgetMs =
          Math.max(
            0,
            orderBookDeadlineAt -
              Date.now(),
          );

        if (
          recoveryBudgetMs ===
            0
        ) {
          throw new Error(
            "UnoCoin total order-book deadline was exhausted before recovery.",
          );
        }

        const response =
          await this.getJson(
            url,
            recoveryBudgetMs,
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

        this.recoveryOrderBookUnavailableUntil =
          0;

        return response as
          UnoCoinOrderBook;
      } catch (
        recoveryError:
          unknown
      ) {
        if (
          recoveryError instanceof
            UnoCoinHttpStatusError &&
          recoveryError.status ===
            404
        ) {
          /*
           * The legacy exchange-book path is retired in current production.
           * One 404 opens a bounded circuit so every invalid market does not
           * pay another guaranteed-failing HTTP request and log allocation.
           * The documented per-asset book remains the primary source and the
           * recovery path is probed again after the cooldown.
           */
          this.recoveryOrderBookUnavailableUntil =
            Date.now() +
            RETIRED_RECOVERY_ENDPOINT_COOLDOWN_MS;
        }

        const message =
          `UnoCoin order-book sources failed for ${normalizedTickerId}. Asset book: ${this.errorMessage(assetBookError)} Recovery book: ${this.errorMessage(recoveryError)}`;

        if (
          assetBookError instanceof
            UnoCoinPublicDataRejectedError
        ) {
          throw new UnoCoinPublicDataRejectedError(
            message,
          );
        }

        throw new Error(
          message,
        );
      }
    }
  }

  private async getAssetOrderBook(
    tickerId: string,
    requestedDepth: number,
    requestTimeoutMs:
      number,
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
        requestTimeoutMs,
      );

    if (
      !response ||
      typeof response !==
        "object" ||
      Array.isArray(
        response,
      )
    ) {
      throw new UnoCoinPublicDataRejectedError(
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
      throw new UnoCoinPublicDataRejectedError(
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
    const values =
      Array.isArray(
        incoming,
      )
        ? incoming
        : (
            incoming &&
            typeof incoming ===
              "object"
          )
          ? (
              incoming as
                UnoCoinAssetOrderPage
            ).data
          : null;

    if (
      !Array.isArray(
        values,
      )
    ) {
      return [];
    }

    return values
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
    requestTimeoutMs =
      this.requestTimeoutMs,
  ): Promise<unknown> {
    if (
      !Number.isSafeInteger(
        requestTimeoutMs,
      ) ||
      requestTimeoutMs <=
        0
    ) {
      throw new Error(
        "UnoCoin public request deadline must be a positive integer.",
      );
    }

    const controller =
      new AbortController();

    let timeout:
      NodeJS.Timeout | null =
      null;

    const request =
      Promise.resolve()
        .then(
          async () => {
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
                    controller.signal,
                },
              );

            if (!response.ok) {
              throw new UnoCoinHttpStatusError(
                response.status,
                url.pathname,
              );
            }

            return response.json() as
              Promise<unknown>;
          },
        );

    const deadline =
      new Promise<never>(
        (
          _resolve,
          reject,
        ) => {
          timeout =
            setTimeout(
              () => {
                reject(
                  new Error(
                    `UnoCoin public GET ${url.pathname} exceeded ${requestTimeoutMs} ms.`,
                  ),
                );

                controller.abort();
              },
              requestTimeoutMs,
            );
        },
      );

    try {
      return await Promise.race([
        request,
        deadline,
      ]);
    } finally {
      if (
        timeout
      ) {
        clearTimeout(
          timeout,
        );
      }
    }
  }
}

export const unoCoinPublicApi =
  new UnoCoinPublicApi();
