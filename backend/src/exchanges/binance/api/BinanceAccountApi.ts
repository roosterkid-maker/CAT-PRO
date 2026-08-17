import {
  BINANCE,
} from "../constants";

import {
  binanceHttpClient,
} from "./BinanceHttpClient";

import type {
  BinanceCredentials,
} from "./BinanceCredentialsProvider";

export interface BinanceBalance {
  asset: string;

  availableBalance: number;

  lockedBalance: number;

  totalBalance: number;
}

export interface BinanceAccount {
  makerCommission: number;

  takerCommission: number;

  buyerCommission: number;

  sellerCommission: number;

  canTrade: boolean;

  canWithdraw: boolean;

  canDeposit: boolean;

  accountType: string;

  uid: number | null;

  balances:
    BinanceBalance[];
}

export interface BinanceApiRestrictions {
  ipRestricted: boolean;

  readingEnabled: boolean;

  spotAndMarginTradingEnabled: boolean;

  withdrawalsEnabled: boolean;

  internalTransferEnabled: boolean;
}


interface BinanceAccountResponse {
  makerCommission?: unknown;

  takerCommission?: unknown;

  buyerCommission?: unknown;

  sellerCommission?: unknown;

  canTrade?: unknown;

  canWithdraw?: unknown;

  canDeposit?: unknown;

  accountType?: unknown;

  uid?: unknown;

  balances?: unknown;
}

interface BinanceApiRestrictionsResponse {
  ipRestrict?: unknown;

  enableReading?: unknown;

  enableSpotAndMarginTrading?: unknown;

  enableWithdrawals?: unknown;

  enableInternalTransfer?: unknown;
}

export class BinanceAccountApi {
  async getApiRestrictions(
    credentials?:
      BinanceCredentials,
  ): Promise<BinanceApiRestrictions> {
    await binanceHttpClient
      .synchronizeServerTime();

    const response =
      await binanceHttpClient.getSigned<
        BinanceApiRestrictionsResponse
      >(
        BINANCE.REST.API_RESTRICTIONS,
        {},
        credentials,
      );

    return {
      ipRestricted:
        response.ipRestrict ===
        true,

      readingEnabled:
        response.enableReading ===
        true,

      spotAndMarginTradingEnabled:
        response.enableSpotAndMarginTrading ===
        true,

      withdrawalsEnabled:
        response.enableWithdrawals ===
        true,

      internalTransferEnabled:
        response.enableInternalTransfer ===
        true,
    };
  }

  async getAccount(
    credentials?:
      BinanceCredentials,
  ): Promise<BinanceAccount> {
    /*
     * Synchronize immediately before the signed request
     * to reduce timestamp and recvWindow failures.
     */
    await binanceHttpClient
      .synchronizeServerTime();

    const response =
      await binanceHttpClient.getSigned<
        BinanceAccountResponse
      >(
        BINANCE.REST.ACCOUNT,
        {
          omitZeroBalances:
            true,
        },
        credentials,
      );

    return this.normalizeAccount(
      response,
    );
  }

  async getBalances(
    credentials?:
      BinanceCredentials,
  ): Promise<BinanceBalance[]> {
    const account =
      await this.getAccount(
        credentials,
      );

    return account.balances;
  }

  async getBalance(
    asset: string,
    credentials?:
      BinanceCredentials,
  ): Promise<BinanceBalance | null> {
    const normalizedAsset =
      asset
        .trim()
        .toUpperCase();

    if (!normalizedAsset) {
      throw new Error(
        "Binance balance asset is required.",
      );
    }

    const balances =
      await this.getBalances(
        credentials,
      );

    return (
      balances.find(
        (balance) =>
          balance.asset ===
          normalizedAsset,
      ) ??
      null
    );
  }

  private normalizeAccount(
    response:
      BinanceAccountResponse,
  ): BinanceAccount {
    if (
      !Array.isArray(
        response.balances,
      )
    ) {
      throw new Error(
        "Invalid Binance account response: balances are missing.",
      );
    }

    const balances =
      response.balances
        .map((balance) =>
          this.normalizeBalance(
            balance,
          ),
        )
        .filter(
          (
            balance,
          ): balance is BinanceBalance =>
            balance !== null,
        );

    return {
      makerCommission:
        this.toNonNegativeNumber(
          response.makerCommission,
        ),

      takerCommission:
        this.toNonNegativeNumber(
          response.takerCommission,
        ),

      buyerCommission:
        this.toNonNegativeNumber(
          response.buyerCommission,
        ),

      sellerCommission:
        this.toNonNegativeNumber(
          response.sellerCommission,
        ),

      canTrade:
        response.canTrade ===
        true,

      canWithdraw:
        response.canWithdraw ===
        true,

      canDeposit:
        response.canDeposit ===
        true,

      accountType:
        this.toOptionalString(
          response.accountType,
        ) ??
        "UNKNOWN",

      uid:
        this.toOptionalSafeInteger(
          response.uid,
        ),

      balances,
    };
  }

  private normalizeBalance(
    value: unknown,
  ): BinanceBalance | null {
    if (!this.isRecord(value)) {
      return null;
    }

    const asset =
      this.toOptionalString(
        value.asset,
      )
        ?.toUpperCase() ??
      null;

    const availableBalance =
      this.toNonNegativeNumber(
        value.free,
      );

    const lockedBalance =
      this.toNonNegativeNumber(
        value.locked,
      );

    if (!asset) {
      return null;
    }

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
  ): number {
    const numberValue =
      Number(
        value ??
        0,
      );

    if (
      !Number.isFinite(
        numberValue,
      ) ||
      numberValue < 0
    ) {
      return 0;
    }

    return numberValue;
  }

  private toOptionalSafeInteger(
    value: unknown,
  ): number | null {
    const numberValue =
      Number(value);

    return Number.isSafeInteger(
      numberValue,
    )
      ? numberValue
      : null;
  }

  private toOptionalString(
    value: unknown,
  ): string | null {
    if (
      typeof value !==
      "string"
    ) {
      return null;
    }

    const normalized =
      value.trim();

    return normalized
      ? normalized
      : null;
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
      value !== null &&
      !Array.isArray(value)
    );
  }
}

export const binanceAccountApi =
  new BinanceAccountApi();
