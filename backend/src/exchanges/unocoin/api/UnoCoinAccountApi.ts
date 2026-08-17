import {
  UNOCOIN,
} from "../constants";

import type {
  UnoCoinCredentials,
} from "./UnoCoinCredentialsProvider";

import {
  unoCoinReadOnlyHttpClient,
} from "./UnoCoinReadOnlyHttpClient";

export interface UnoCoinBalance {
  asset: string;

  availableBalance: number;

  lockedBalance: number;

  totalBalance: number;
}

interface UnoCoinAuthenticatedReadClient {
  getAuthenticated<T>(
    path: string,
    credentials:
      UnoCoinCredentials,
  ): Promise<T>;
}

interface UnoCoinWalletEnvelope {
  wallets?: unknown;
}

export class UnoCoinAccountApi {
  constructor(
    private readonly client:
      UnoCoinAuthenticatedReadClient =
      unoCoinReadOnlyHttpClient,
  ) {}

  async getBalances(
    credentials:
      UnoCoinCredentials,
  ): Promise<UnoCoinBalance[]> {
    const response =
      await this.client
        .getAuthenticated<
          UnoCoinWalletEnvelope
        >(
          UNOCOIN.REST
            .WALLET_PATH,
          credentials,
        );

    if (
      !Array.isArray(
        response.wallets,
      )
    ) {
      throw new Error(
        "Invalid UnoCoin wallet response: wallets must be an array.",
      );
    }

    return response.wallets.map(
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
  ): UnoCoinBalance {
    if (!this.isRecord(value)) {
      throw new Error(
        `Invalid UnoCoin wallet row at index ${index}.`,
      );
    }

    const asset =
      typeof value.coin ===
        "string"
        ? value.coin
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
        `Invalid UnoCoin wallet coin at index ${index}.`,
      );
    }

    const availableBalance =
      this.toNonNegativeNumber(
        value.balance,
        "balance",
        asset,
      );

    const orderLockedBalance =
      this.toOptionalNonNegativeNumber(
        value.locked_balance,
        "locked_balance",
        asset,
      );

    const lendingBalance =
      this.toOptionalNonNegativeNumber(
        value.lending_balance,
        "lending_balance",
        asset,
      );

    const lockedBalance =
      orderLockedBalance +
      lendingBalance;

    return {
      asset,
      availableBalance,
      lockedBalance,
      totalBalance:
        availableBalance +
        lockedBalance,
    };
  }

  private toOptionalNonNegativeNumber(
    value: unknown,
    field: string,
    asset: string,
  ): number {
    if (
      value ===
        undefined ||
      value ===
        null ||
      value ===
        ""
    ) {
      return 0;
    }

    return this.toNonNegativeNumber(
      value,
      field,
      asset,
    );
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
        `Invalid UnoCoin ${field} for ${asset}.`,
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

export const unoCoinAccountApi =
  new UnoCoinAccountApi();
