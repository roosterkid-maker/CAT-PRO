import {
  COINSWITCH,
} from "../constants";

import type {
  CoinSwitchCredentials,
} from "./CoinSwitchCredentialsProvider";

import {
  coinSwitchReadOnlyHttpClient,
} from "./CoinSwitchReadOnlyHttpClient";

export interface CoinSwitchBalance {
  asset: string;

  availableBalance: number;

  lockedBalance: number;

  totalBalance: number;
}

interface CoinSwitchSignedReadClient {
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
}

interface CoinSwitchPortfolioEnvelope {
  data?: unknown;
}

export class CoinSwitchAccountApi {
  constructor(
    private readonly client:
      CoinSwitchSignedReadClient =
      coinSwitchReadOnlyHttpClient,
  ) {}

  async getBalances(
    credentials?:
      CoinSwitchCredentials,
  ): Promise<CoinSwitchBalance[]> {
    const response =
      await this.client
        .getSigned<
          CoinSwitchPortfolioEnvelope
        >(
          COINSWITCH.REST
            .PORTFOLIO_PATH,
          {},
          credentials,
        );

    if (
      !Array.isArray(
        response.data,
      )
    ) {
      throw new Error(
        "Invalid CoinSwitch portfolio response: data must be an array.",
      );
    }

    return response.data.map(
      (
        value,
        index,
      ) =>
        this.normalizeBalance(
          value,
          index,
        ),
    );
  }

  private normalizeBalance(
    value: unknown,
    index: number,
  ): CoinSwitchBalance {
    if (!this.isRecord(value)) {
      throw new Error(
        `Invalid CoinSwitch portfolio row at index ${index}.`,
      );
    }

    const asset =
      typeof value.currency ===
        "string"
        ? value.currency
            .trim()
            .toUpperCase()
        : "";

    if (
      !/^[A-Z0-9]+$/
        .test(
          asset,
        )
    ) {
      throw new Error(
        `Invalid CoinSwitch portfolio currency at index ${index}.`,
      );
    }

    const availableBalance =
      this.toNonNegativeNumber(
        value.main_balance,
        "main_balance",
        asset,
      );

    const lockedBalance =
      this.toNonNegativeNumber(
        value.blocked_balance_order,
        "blocked_balance_order",
        asset,
      );

    return {
      asset,
      availableBalance,
      lockedBalance,
      totalBalance:
        availableBalance +
        lockedBalance,
    };
  }

  private toNonNegativeNumber(
    value: unknown,
    field: string,
    asset: string,
  ): number {
    const numericValue =
      Number(
        value,
      );

    if (
      !Number.isFinite(
        numericValue,
      ) ||
      numericValue <
        0
    ) {
      throw new Error(
        `Invalid CoinSwitch ${field} for ${asset}.`,
      );
    }

    return numericValue;
  }

  private isRecord(
    value: unknown,
  ): value is Record<
    string,
    unknown
  > {
    return (
      typeof value ===
        "object" &&
      value !==
        null &&
      !Array.isArray(
        value,
      )
    );
  }
}

export const coinSwitchAccountApi =
  new CoinSwitchAccountApi();
