import {
  UNOCOIN,
} from "../constants";

import {
  normalizeUnoCoinMarket,
} from "../normalize";

import type {
  UnoCoinCredentials,
} from "./UnoCoinCredentialsProvider";

export interface UnoCoinCreateLimitOrderRequest {
  market: string;

  side:
    | "buy"
    | "sell";

  price: number;

  quantity: number;
}

export interface UnoCoinCreatedOrder {
  orderId: string;

  market: string;

  side:
    | "buy"
    | "sell";

  price: number;

  quantity: number;
}

export interface UnoCoinSpotOrder {
  orderId: string;

  market: string;

  side:
    | "buy"
    | "sell";

  price: number;

  averagePrice: number;

  originalQuantity: number;

  executedQuantity: number;

  remainingQuantity: number;

  status: number;
}

export interface UnoCoinAuthenticatedOrderClient {
  getAuthenticated<T>(
    path: string,
    credentials:
      UnoCoinCredentials,
  ): Promise<T>;

  postAuthenticatedForm<T>(
    path: string,
    fields:
      Readonly<
        Record<
          string,
          string
        >
      >,
    credentials:
      UnoCoinCredentials,
  ): Promise<T>;
}

export type UnoCoinOrderFetch = (
  input:
    string | URL | Request,
  init?:
    RequestInit,
) => Promise<Response>;

export interface UnoCoinOrderHttpClientOptions {
  fetchImplementation?:
    UnoCoinOrderFetch;

  baseUrl?: string;

  requestTimeoutMs?: number;
}

/**
 * Bearer-authenticated UnoCoin order transport.
 *
 * It intentionally exposes only the two HTTP shapes used by the audited
 * ordinary LIMIT lifecycle: authenticated GET and form POST. Tokens and
 * response bodies are never included in error messages.
 */
export class UnoCoinOrderHttpClient
  implements UnoCoinAuthenticatedOrderClient
{
  private readonly fetchImplementation:
    UnoCoinOrderFetch;

  private readonly baseUrl:
    string;

  private readonly requestTimeoutMs:
    number;

  constructor(
    options:
      UnoCoinOrderHttpClientOptions = {},
  ) {
    this.fetchImplementation =
      options.fetchImplementation ??
      fetch;
    this.baseUrl =
      options.baseUrl ??
      UNOCOIN.REST.BASE_URL;
    this.requestTimeoutMs =
      options.requestTimeoutMs ??
      UNOCOIN.REQUEST_TIMEOUT_MS;

    if (
      !Number.isSafeInteger(
        this.requestTimeoutMs,
      ) ||
      this.requestTimeoutMs <=
        0
    ) {
      throw new Error(
        "UnoCoin order timeout must be a positive integer.",
      );
    }
  }

  getAuthenticated<T>(
    path: string,
    credentials:
      UnoCoinCredentials,
  ): Promise<T> {
    return this.request<T>(
      "GET",
      path,
      credentials,
    );
  }

  postAuthenticatedForm<T>(
    path: string,
    fields:
      Readonly<
        Record<
          string,
          string
        >
      >,
    credentials:
      UnoCoinCredentials,
  ): Promise<T> {
    const body =
      new URLSearchParams();

    for (
      const [
        key,
        value,
      ]
      of Object.entries(
        fields,
      )
    ) {
      body.set(
        key,
        value,
      );
    }

    return this.request<T>(
      "POST",
      path,
      credentials,
      body,
    );
  }

  private async request<T>(
    method:
      "GET" |
      "POST",
    path: string,
    credentials:
      UnoCoinCredentials,
    body?:
      URLSearchParams,
  ): Promise<T> {
    const apiToken =
      credentials.apiToken
        .trim();

    if (!apiToken) {
      throw new Error(
        "UnoCoin API token is required for authenticated order access.",
      );
    }

    const url =
      new URL(
        path,
        this.baseUrl,
      );
    const controller =
      new AbortController();
    const timeout =
      setTimeout(
        () =>
          controller.abort(),
        this.requestTimeoutMs,
      );

    try {
      const response =
        await this.fetchImplementation(
          url,
          {
            method,
            headers: {
              Accept:
                "application/json",
              Authorization:
                `Bearer ${apiToken}`,
              ...(body
                ? {
                    "Content-Type":
                      "application/x-www-form-urlencoded;charset=UTF-8",
                  }
                : {}),
            },
            ...(body
              ? {
                  body,
                }
              : {}),
            signal:
              controller.signal,
          },
        );

      if (!response.ok) {
        throw new Error(
          `UnoCoin authenticated ${method} ${url.pathname} failed with HTTP ${response.status}.`,
        );
      }

      return await response.json() as T;
    } finally {
      clearTimeout(
        timeout,
      );
    }
  }
}

interface UnoCoinOrderHistoryEnvelope {
  current_page?: unknown;

  data?: unknown;

  last_page?: unknown;
}

interface UnoCoinCreateOrderEnvelope {
  order_details?: unknown;
}

interface UnoCoinCancelOrderEnvelope {
  status?: unknown;
}

export interface UnoCoinOrderApiOptions {
  client?:
    UnoCoinAuthenticatedOrderClient;

  maximumHistoryPages?: number;
}

/**
 * Official ordinary UnoCoin LIMIT-order contract.
 *
 * UnoCoin does not document a single-order status endpoint. Status is read
 * from the authenticated, pair-scoped all-history endpoint and searched by
 * exact numeric order ID across a bounded number of pages.
 */
export class UnoCoinOrderApi {
  private readonly client:
    UnoCoinAuthenticatedOrderClient;

  private readonly maximumHistoryPages:
    number;

  constructor(
    options:
      UnoCoinOrderApiOptions = {},
  ) {
    this.client =
      options.client ??
      new UnoCoinOrderHttpClient();
    this.maximumHistoryPages =
      options.maximumHistoryPages ??
      5;

    if (
      !Number.isSafeInteger(
        this.maximumHistoryPages,
      ) ||
      this.maximumHistoryPages <
        1 ||
      this.maximumHistoryPages >
        20
    ) {
      throw new Error(
        "UnoCoin history page limit must be an integer from 1 to 20.",
      );
    }
  }

  async createLimitOrder(
    request:
      UnoCoinCreateLimitOrderRequest,
    credentials:
      UnoCoinCredentials,
  ): Promise<
    UnoCoinCreatedOrder
  > {
    const [
      coin,
      baseCoin,
    ] =
      this.marketAssets(
        request.market,
      );
    const market =
      `${coin}_${baseCoin}`;
    const side =
      this.requireSide(
        request.side,
      );
    const price =
      this.positiveNumber(
        request.price,
        "price",
      );
    const quantity =
      this.positiveNumber(
        request.quantity,
        "quantity",
      );
    const envelope =
      await this.client
        .postAuthenticatedForm<
          UnoCoinCreateOrderEnvelope
        >(
          "/api/exchange/placeorder",
          {
            coin,
            order_type:
              side ===
                "buy"
                ? "BID"
                : "ASK",
            rate:
              this.formatDecimal(
                price,
              ),
            volume:
              this.formatDecimal(
                quantity,
              ),
            base_coin:
              baseCoin,
            advance_order_type:
              "LIMIT",
          },
          credentials,
        );
    const details =
      this.recordOrNull(
        envelope.order_details,
      );

    if (!details) {
      throw new Error(
        "UnoCoin create-order response is missing order_details.",
      );
    }

    return {
      orderId:
        this.requireOrderId(
          details.id,
        ),
      market,
      side,
      price,
      quantity,
    };
  }

  async getSpotOrder(
    orderId: string,
    market: string,
    credentials:
      UnoCoinCredentials,
  ): Promise<
    UnoCoinSpotOrder
  > {
    const normalizedOrderId =
      this.requireOrderId(
        orderId,
      );
    const [
      coin,
      baseCoin,
    ] =
      this.marketAssets(
        market,
      );
    const expectedMarket =
      `${coin}_${baseCoin}`;

    for (
      let page = 1;
      page <=
        this.maximumHistoryPages;
      page +=
        1
    ) {
      const envelope =
        await this.client
          .getAuthenticated<
            UnoCoinOrderHistoryEnvelope
          >(
            `/api/exchange/orders/all/${encodeURIComponent(baseCoin)}/${encodeURIComponent(coin)}?page=${page}`,
            credentials,
          );
      const rows =
        Array.isArray(
          envelope.data,
        )
          ? envelope.data
          : null;

      if (!rows) {
        throw new Error(
          "UnoCoin order-history response data is not an array.",
        );
      }

      const matches =
        rows
          .map(
            (row) =>
              this.recordOrNull(
                row,
              ),
          )
          .filter(
            (
              row,
            ): row is Record<string, unknown> =>
              row !==
                null &&
              this.rowMatchesOrderId(
                row,
                normalizedOrderId,
              ),
          );

      if (
        matches.length >
        1
      ) {
        throw new Error(
          `UnoCoin order history contains duplicate matches for order ${normalizedOrderId}.`,
        );
      }

      const match =
        matches[0];

      if (match) {
        return this.normalizeHistoryOrder(
          match,
          normalizedOrderId,
          expectedMarket,
        );
      }

      const currentPage =
        this.positiveIntegerOrNull(
          envelope.current_page,
        ) ??
        page;
      const lastPage =
        this.positiveIntegerOrNull(
          envelope.last_page,
        ) ??
        currentPage;

      if (
        currentPage >=
        lastPage
      ) {
        break;
      }
    }

    throw new Error(
      `UnoCoin order ${normalizedOrderId} was not found in bounded ${expectedMarket} history.`,
    );
  }

  async requestCancel(
    orderId: string,
    credentials:
      UnoCoinCredentials,
  ): Promise<void> {
    const normalizedOrderId =
      this.requireOrderId(
        orderId,
      );
    const envelope =
      await this.client
        .postAuthenticatedForm<
          UnoCoinCancelOrderEnvelope
        >(
          "/api/exchange/cancel",
          {
            orderid:
              normalizedOrderId,
          },
          credentials,
        );
    const status =
      this.stringValue(
        envelope.status,
      )
        .toLowerCase();

    if (
      status !==
      "ok"
    ) {
      throw new Error(
        "UnoCoin cancellation request was not accepted.",
      );
    }
  }

  private normalizeHistoryOrder(
    row:
      Record<string, unknown>,
    expectedOrderId: string,
    expectedMarket: string,
  ): UnoCoinSpotOrder {
    const coin =
      this.requireAsset(
        row.coin,
        "coin",
      );
    const baseCoin =
      this.requireAsset(
        row.base_coin,
        "base_coin",
      );
    const market =
      `${coin}_${baseCoin}`;

    if (
      market !==
      expectedMarket
    ) {
      throw new Error(
        "UnoCoin order-history market does not match the requested pair.",
      );
    }

    const advanceOrderType =
      this.stringValue(
        row.advance_order_type,
      )
        .toUpperCase();

    if (
      advanceOrderType &&
      advanceOrderType !==
        "LIMIT"
    ) {
      throw new Error(
        "UnoCoin order-history row is not an ordinary LIMIT order.",
      );
    }

    const side =
      this.historySide(
        row.order_type,
      );
    const price =
      this.positiveNumber(
        row.rate,
        "history rate",
      );
    const originalQuantity =
      this.positiveNumber(
        row.volume,
        "history volume",
      );
    const status =
      this.requireHistoryStatus(
        row.status,
      );
    const fills =
      this.normalizeFills(
        row.exchange_transactions,
      );
    const executedQuantity =
      fills.reduce(
        (
          total,
          fill,
        ) =>
          total +
          fill.quantity,
        0,
      );

    if (
      executedQuantity >
      originalQuantity +
        Number.EPSILON *
          Math.max(
            1,
            originalQuantity,
          ) *
          16
    ) {
      throw new Error(
        "UnoCoin executed quantity exceeds original quantity.",
      );
    }

    if (
      (
        status ===
          1 ||
        status ===
          6
      ) &&
      (
        fills.length ===
          0 ||
        Math.abs(
          executedQuantity -
            originalQuantity,
        ) >
          Number.EPSILON *
            Math.max(
              1,
              originalQuantity,
            ) *
            16
      )
    ) {
      throw new Error(
        "UnoCoin completed order lacks complete transaction-level fill evidence.",
      );
    }

    if (
      status ===
        3 &&
      (
        executedQuantity <=
          0 ||
        executedQuantity >=
          originalQuantity
      )
    ) {
      throw new Error(
        "UnoCoin partial order lacks bounded transaction-level fill evidence.",
      );
    }

    const averagePrice =
      executedQuantity >
        0
        ? fills.reduce(
            (
              total,
              fill,
            ) =>
              total +
              fill.price *
                fill.quantity,
            0,
          ) /
          executedQuantity
        : 0;

    return {
      orderId:
        expectedOrderId,
      market,
      side,
      price,
      averagePrice,
      originalQuantity,
      executedQuantity,
      remainingQuantity:
        Math.max(
          0,
          originalQuantity -
            executedQuantity,
        ),
      status,
    };
  }

  private normalizeFills(
    value: unknown,
  ): Array<{
    quantity: number;
    price: number;
  }> {
    if (
      value ===
        undefined ||
      value ===
        null
    ) {
      return [];
    }

    if (!Array.isArray(value)) {
      throw new Error(
        "UnoCoin exchange_transactions must be an array.",
      );
    }

    return value.map(
      (
        incoming,
        index,
      ) => {
        const fill =
          this.recordOrNull(
            incoming,
          );

        if (!fill) {
          throw new Error(
            `UnoCoin fill ${index} is invalid.`,
          );
        }

        return {
          quantity:
            this.positiveNumber(
              fill.volume,
              `fill ${index} volume`,
            ),
          price:
            this.positiveNumber(
              fill.rate,
              `fill ${index} rate`,
            ),
        };
      },
    );
  }

  private rowMatchesOrderId(
    row:
      Record<string, unknown>,
    expected: string,
  ): boolean {
    for (
      const candidate
      of [
        row.id,
        row.order_id,
      ]
    ) {
      const normalized =
        this.orderIdOrNull(
          candidate,
        );

      if (
        normalized ===
        expected
      ) {
        return true;
      }
    }

    return false;
  }

  private marketAssets(
    value: string,
  ): [
    string,
    string,
  ] {
    const normalized =
      normalizeUnoCoinMarket(
        value,
      );
    let assets =
      normalized
        .split(
          "_",
        )
        .filter(
          (asset) =>
            asset.length >
              0,
        );

    if (
      assets.length ===
      1
    ) {
      for (
        const quote
        of [
          "USDT",
          "INR",
        ]
      ) {
        if (
          normalized.endsWith(
            quote,
          ) &&
          normalized.length >
            quote.length
        ) {
          assets = [
            normalized.slice(
              0,
              -quote.length,
            ),
            quote,
          ];
          break;
        }
      }
    }

    if (
      assets.length !==
        2 ||
      !assets.every(
        (asset) =>
          /^[A-Z0-9]{2,15}$/u.test(
            asset,
          ),
      ) ||
      ![
        "INR",
        "USDT",
      ].includes(
        assets[1] ??
          "",
      )
    ) {
      throw new Error(
        "UnoCoin spot market must be a valid BASE/INR or BASE/USDT pair.",
      );
    }

    return [
      assets[0] as string,
      assets[1] as string,
    ];
  }

  private requireAsset(
    value: unknown,
    field: string,
  ): string {
    const asset =
      this.stringValue(
        value,
      )
        .toUpperCase();

    if (
      !/^[A-Z0-9]{2,15}$/u.test(
        asset,
      )
    ) {
      throw new Error(
        `UnoCoin history ${field} is invalid.`,
      );
    }

    return asset;
  }

  private historySide(
    value: unknown,
  ):
    "buy" |
    "sell" {
    const side =
      this.stringValue(
        value,
      )
        .toUpperCase();

    if (
      side ===
      "BID"
    ) {
      return "buy";
    }

    if (
      side ===
      "ASK"
    ) {
      return "sell";
    }

    throw new Error(
      "UnoCoin history order_type must be BID or ASK.",
    );
  }

  private requireSide(
    value: string,
  ):
    "buy" |
    "sell" {
    if (
      value !==
        "buy" &&
      value !==
        "sell"
    ) {
      throw new Error(
        "UnoCoin spot side must be buy or sell.",
      );
    }

    return value;
  }

  private requireHistoryStatus(
    value: unknown,
  ): number {
    const status =
      typeof value ===
        "number"
        ? value
        : typeof value ===
              "string" &&
            value.trim()
          ? Number(
              value,
            )
          : Number.NaN;

    if (
      !Number.isSafeInteger(
        status,
      ) ||
      ![
        -3,
        -2,
        -1,
        0,
        1,
        2,
        3,
        4,
        5,
        6,
        7,
      ].includes(
        status,
      )
    ) {
      throw new Error(
        "UnoCoin order history returned an undocumented status.",
      );
    }

    return status;
  }

  private requireOrderId(
    value: unknown,
  ): string {
    const orderId =
      this.orderIdOrNull(
        value,
      );

    if (!orderId) {
      throw new Error(
        "UnoCoin order ID must be a positive integer.",
      );
    }

    return orderId;
  }

  private orderIdOrNull(
    value: unknown,
  ): string | null {
    const normalized =
      typeof value ===
        "number"
        ? String(
            value,
          )
        : typeof value ===
            "string"
          ? value.trim()
          : "";

    if (
      !/^[1-9][0-9]{0,18}$/u.test(
        normalized,
      )
    ) {
      return null;
    }

    return normalized;
  }

  private positiveIntegerOrNull(
    value: unknown,
  ): number | null {
    const parsed =
      Number(
        value,
      );

    return Number.isSafeInteger(
      parsed,
    ) &&
      parsed >
        0
      ? parsed
      : null;
  }

  private positiveNumber(
    value: unknown,
    field: string,
  ): number {
    const parsed =
      Number(
        value,
      );

    if (
      !Number.isFinite(
        parsed,
      ) ||
      parsed <=
        0
    ) {
      throw new Error(
        `UnoCoin ${field} must be a positive finite number.`,
      );
    }

    return parsed;
  }

  private formatDecimal(
    value: number,
  ): string {
    return value
      .toFixed(
        UNOCOIN.EXCHANGE_DECIMAL_PRECISION,
      )
      .replace(
        /(?:\.0+|(?<fraction>\.[0-9]*?)0+)$/u,
        "$<fraction>",
      );
  }

  private stringValue(
    value: unknown,
  ): string {
    return typeof value ===
      "string"
      ? value.trim()
      : "";
  }

  private recordOrNull(
    value: unknown,
  ): Record<string, unknown> | null {
    return typeof value ===
      "object" &&
      value !==
        null &&
      !Array.isArray(
        value,
      )
      ? value as Record<string, unknown>
      : null;
  }
}

export const unoCoinOrderApi =
  new UnoCoinOrderApi();
