import {
  COINSWITCH,
  type CoinSwitchPublicVenue,
} from "../constants";

import type {
  CoinSwitchCredentials,
} from "./CoinSwitchCredentialsProvider";

import {
  coinSwitchReadOnlyHttpClient,
  type CoinSwitchSignedBody,
} from "./CoinSwitchReadOnlyHttpClient";

export interface CoinSwitchCreateOrderRequest {
  venue:
    CoinSwitchPublicVenue;
  market: string;
  side:
    | "buy"
    | "sell";
  price: number;
  quantity: number;
  clientOrderId?: string;
}

export interface CoinSwitchSpotOrder {
  orderId: string;
  clientOrderId: string | null;
  venue:
    CoinSwitchPublicVenue;
  market: string;
  side:
    | "buy"
    | "sell";
  price: number;
  averagePrice: number;
  originalQuantity: number;
  executedQuantity: number;
  remainingQuantity: number;
  status: string;
}

interface CoinSwitchOrderEnvelope {
  data?: unknown;
}

export interface CoinSwitchSignedOrderClient {
  getSigned<T>(
    path: string,
    parameters?:
      Readonly<
        Record<
          string,
          string
        >
      >,
    credentials?:
      CoinSwitchCredentials,
  ): Promise<T>;

  postSigned<T>(
    path: string,
    body:
      CoinSwitchSignedBody,
    credentials?:
      CoinSwitchCredentials,
  ): Promise<T>;

  deleteSigned<T>(
    path: string,
    body:
      CoinSwitchSignedBody,
    credentials?:
      CoinSwitchCredentials,
  ): Promise<T>;
}

export class CoinSwitchOrderApi {
  constructor(
    private readonly client:
      CoinSwitchSignedOrderClient =
      coinSwitchReadOnlyHttpClient,
  ) {}

  async createSpotOrder(
    request:
      CoinSwitchCreateOrderRequest,
    credentials?:
      CoinSwitchCredentials,
  ): Promise<
    CoinSwitchSpotOrder
  > {
    const body:
      CoinSwitchSignedBody = {
      side:
        this.requireSide(
          request.side,
        ),
      symbol:
        this.marketToSymbol(
          request.market,
        ),
      type:
        "limit",
      price:
        this.positiveNumber(
          request.price,
          "price",
        ),
      quantity:
        this.positiveNumber(
          request.quantity,
          "quantity",
        ),
      exchange:
        this.requireVenue(
          request.venue,
        ),
      ...(request.clientOrderId
        ? {
            client_order_id:
              this.requireClientOrderId(
                request.clientOrderId,
              ),
          }
        : {}),
    };
    const envelope =
      await this.client
        .postSigned<
          CoinSwitchOrderEnvelope
        >(
          COINSWITCH.REST
            .ORDER_PATH,
          body,
          credentials,
        );

    return this.normalizeEnvelope(
      envelope,
    );
  }

  async getSpotOrder(
    orderId: string,
    credentials?:
      CoinSwitchCredentials,
  ): Promise<
    CoinSwitchSpotOrder
  > {
    const envelope =
      await this.client
        .getSigned<
          CoinSwitchOrderEnvelope
        >(
          COINSWITCH.REST
            .ORDER_PATH,
          {
            order_id:
              this.requireOrderId(
                orderId,
              ),
          },
          credentials,
        );

    return this.normalizeEnvelope(
      envelope,
    );
  }

  async cancelSpotOrder(
    orderId: string,
    credentials?:
      CoinSwitchCredentials,
  ): Promise<
    CoinSwitchSpotOrder
  > {
    const envelope =
      await this.client
        .deleteSigned<
          CoinSwitchOrderEnvelope
        >(
          COINSWITCH.REST
            .ORDER_PATH,
          {
            order_id:
              this.requireOrderId(
                orderId,
              ),
          },
          credentials,
        );

    return this.normalizeEnvelope(
      envelope,
    );
  }

  private normalizeEnvelope(
    envelope:
      CoinSwitchOrderEnvelope,
  ): CoinSwitchSpotOrder {
    const data =
      this.recordOrNull(
        envelope.data,
      );

    if (!data) {
      throw new Error(
        "CoinSwitch order response data is missing.",
      );
    }

    const orderSource =
      this.stringValue(
        data.order_source,
      );

    if (
      orderSource &&
      orderSource !==
        "API_TRADING"
    ) {
      throw new Error(
        "CoinSwitch order response has an unexpected order source.",
      );
    }

    const originalQuantity =
      this.positiveNumber(
        data.orig_qty,
        "orig_qty",
      );
    const executedQuantity =
      this.nonNegativeNumber(
        data.executed_qty,
        "executed_qty",
      );

    if (
      executedQuantity >
      originalQuantity
    ) {
      throw new Error(
        "CoinSwitch executed quantity exceeds original quantity.",
      );
    }

    const status =
      this.stringValue(
        data.status,
      );

    if (!status) {
      throw new Error(
        "CoinSwitch order status is missing.",
      );
    }

    return {
      orderId:
        this.requireOrderId(
          this.stringValue(
            data.order_id,
          ),
        ),
      clientOrderId:
        this.stringValue(
          data.client_order_id,
        ) ||
        null,
      venue:
        this.requireVenue(
          this.stringValue(
            data.exchange,
          ),
        ),
      market:
        this.symbolToMarket(
          this.stringValue(
            data.symbol,
          ),
        ),
      side:
        this.requireSide(
          this.stringValue(
            data.side,
          )
            .toLowerCase(),
        ),
      price:
        this.positiveNumber(
          data.price,
          "price",
        ),
      averagePrice:
        this.nonNegativeNumber(
          data.average_price,
          "average_price",
        ),
      originalQuantity,
      executedQuantity,
      remainingQuantity:
        Math.max(
          0,
          originalQuantity -
            executedQuantity,
        ),
      status:
        status.toUpperCase(),
    };
  }

  private marketToSymbol(
    market: string,
  ): string {
    const assets =
      this.marketAssets(
        market,
      );

    return `${assets[0]}/${assets[1]}`;
  }

  private symbolToMarket(
    symbol: string,
  ): string {
    const assets =
      this.marketAssets(
        symbol,
      );

    return `${assets[0]}_${assets[1]}`;
  }

  private marketAssets(
    value: string,
  ): [string, string] {
    const normalized =
      value
        .trim()
        .toUpperCase();
    let assets =
      normalized
        .split(
          /[\s_,\-/]+/u,
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
        "CoinSwitch spot market must be a valid BASE/INR or BASE/USDT pair.",
      );
    }

    return [
      assets[0] as string,
      assets[1] as string,
    ];
  }

  private requireVenue(
    value: string,
  ): CoinSwitchPublicVenue {
    const venue =
      value
        .trim()
        .toLowerCase();

    if (
      venue !==
        "coinswitchx" &&
      venue !==
        "c2c1"
    ) {
      throw new Error(
        "CoinSwitch venue must be coinswitchx or c2c1.",
      );
    }

    return venue;
  }

  private requireSide(
    value: string,
  ): "buy" | "sell" {
    if (
      value !==
        "buy" &&
      value !==
        "sell"
    ) {
      throw new Error(
        "CoinSwitch spot side must be buy or sell.",
      );
    }

    return value;
  }

  private requireOrderId(
    value: string,
  ): string {
    const orderId =
      value.trim();

    if (
      !orderId ||
      orderId.length >
        128
    ) {
      throw new Error(
        "CoinSwitch order ID is required and must not exceed 128 characters.",
      );
    }

    return orderId;
  }

  private requireClientOrderId(
    value: string,
  ): string {
    const clientOrderId =
      value.trim();

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        clientOrderId,
      )
    ) {
      throw new Error(
        "CoinSwitch client order ID must be a valid UUID.",
      );
    }

    return clientOrderId;
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
        `CoinSwitch ${field} must be a positive finite number.`,
      );
    }

    return parsed;
  }

  private nonNegativeNumber(
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
      parsed <
        0
    ) {
      throw new Error(
        `CoinSwitch ${field} must be a non-negative finite number.`,
      );
    }

    return parsed;
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
  ): Record<
    string,
    unknown
  > | null {
    return typeof value ===
      "object" &&
      value !==
        null &&
      !Array.isArray(
        value,
      )
      ? value as Record<
          string,
          unknown
        >
      : null;
  }
}

export const coinSwitchOrderApi =
  new CoinSwitchOrderApi();
