import {
  GIOTTUS,
} from "../constants";

import type {
  GiottusCredentials,
} from "./GiottusCredentialsProvider";

import {
  giottusPrivateHttpClient,
} from "./GiottusPrivateHttpClient";

export interface GiottusBalance {
  asset: string;

  freeBalance: number;

  lockedBalance: number;

  totalBalance: number;
}

export interface GiottusOpenOrder {
  symbol: string;
  orderId: string;
  price: number;
  originalQuantity: number;
  executedQuantity: number;
  remainingQuantity: number;
  status: "NEW" | "PARTIALLY_FILLED";
  type: "MARKET" | "LIMIT" | "STOP_MARKET" | "STOP_LIMIT";
  side: "BUY" | "SELL";
  createdAt: number;
}

interface GiottusSignedReadClient {
  getSigned<T>(
    path: string,
    query:
      ReadonlyArray<
        readonly [
          string,
          string | number | boolean,
        ]
      >,
    credentials:
      GiottusCredentials,
  ): Promise<T>;
}

export class GiottusAccountApi {
  constructor(
    private readonly client:
      GiottusSignedReadClient =
      giottusPrivateHttpClient,
  ) {}

  async getBalances(
    credentials:
      GiottusCredentials,
  ): Promise<GiottusBalance[]> {
    const payload =
      await this.client
        .getSigned<unknown>(
          GIOTTUS.REST.WALLET_PATH,
          [],
          credentials,
        );

    if (!Array.isArray(payload)) {
      throw new Error(
        "Invalid Giottus wallet response: balance list is missing.",
      );
    }

    return payload.map(
      (value, index) =>
        this.normalizeBalance(
          value,
          index,
        ),
    );
  }

  async getOpenOrders(
    credentials: GiottusCredentials,
  ): Promise<GiottusOpenOrder[]> {
    const payload = await this.client.getSigned<unknown>(
      GIOTTUS.REST.OPEN_ORDERS_PATH,
      [],
      credentials,
    );
    if (!Array.isArray(payload)) {
      throw new Error("Invalid Giottus open-orders response: order list is missing.");
    }
    return payload.map((value, index) => this.normalizeOpenOrder(value, index));
  }

  private normalizeBalance(
    value: unknown,
    index: number,
  ): GiottusBalance {
    if (!this.isRecord(value)) {
      throw new Error(
        `Invalid Giottus wallet row at index ${index}.`,
      );
    }

    const asset =
      typeof value.asset === "string"
        ? value.asset
            .trim()
            .toUpperCase()
        : "";

    if (!/^[A-Z0-9]+$/.test(asset)) {
      throw new Error(
        `Invalid Giottus wallet asset at index ${index}.`,
      );
    }

    const freeBalance =
      this.toNonNegativeNumber(
        value.free,
        `${asset} free balance`,
      );

    const lockedBalance =
      [
        "locked",
        "lockedFd",
        "lockedStaking",
        "lockedOtc",
      ].reduce(
        (total, field) =>
          total +
          this.toOptionalNonNegativeNumber(
            value[field],
            `${asset} ${field}`,
          ),
        0,
      );

    return {
      asset,
      freeBalance,
      lockedBalance,
      totalBalance:
        freeBalance +
        lockedBalance,
    };
  }

  private normalizeOpenOrder(value: unknown, index: number): GiottusOpenOrder {
    if (!this.isRecord(value)) {
      throw new Error(`Invalid Giottus open-order row at index ${index}.`);
    }
    const symbol = typeof value.symbol === "string" ? value.symbol.trim().toUpperCase() : "";
    const orderId = typeof value.orderId === "string" ? value.orderId.trim() : "";
    const status = value.status;
    const type = value.type;
    const side = value.side;
    const createdAt = Number(value.time);
    if (
      !/^[A-Z0-9]+\/[A-Z0-9]+$/.test(symbol) ||
      !/^\d+-\d+-\d+$/.test(orderId) ||
      (status !== "NEW" && status !== "PARTIALLY_FILLED") ||
      (type !== "MARKET" && type !== "LIMIT" && type !== "STOP_MARKET" && type !== "STOP_LIMIT") ||
      (side !== "BUY" && side !== "SELL") ||
      !Number.isSafeInteger(createdAt) || createdAt <= 0
    ) {
      throw new Error(`Invalid Giottus open-order identity at index ${index}.`);
    }
    return {
      symbol,
      orderId,
      price: this.toNonNegativeNumber(value.price, `${symbol} order price`),
      originalQuantity: this.toNonNegativeNumber(value.origQty, `${symbol} original quantity`),
      executedQuantity: this.toNonNegativeNumber(value.executedQty, `${symbol} executed quantity`),
      remainingQuantity: this.toNonNegativeNumber(value.remainingQty, `${symbol} remaining quantity`),
      status,
      type,
      side,
      createdAt,
    };
  }

  private toOptionalNonNegativeNumber(
    value: unknown,
    label: string,
  ): number {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      return 0;
    }

    return this.toNonNegativeNumber(
      value,
      label,
    );
  }

  private toNonNegativeNumber(
    value: unknown,
    label: string,
  ): number {
    const numeric =
      Number(value);

    if (
      !Number.isFinite(numeric) ||
      numeric < 0
    ) {
      throw new Error(
        `Invalid Giottus ${label}.`,
      );
    }

    return numeric;
  }

  private isRecord(
    value: unknown,
  ): value is Record<
    string,
    unknown
  > {
    return (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    );
  }
}

export const giottusAccountApi =
  new GiottusAccountApi();
