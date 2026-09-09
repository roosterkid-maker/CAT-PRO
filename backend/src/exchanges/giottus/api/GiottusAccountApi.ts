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
