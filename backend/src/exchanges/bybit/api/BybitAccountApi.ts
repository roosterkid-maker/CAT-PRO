import {
  bybitPrivateHttpClient,
} from "./BybitPrivateHttpClient";

import type {
  BybitCredentials,
} from "./BybitCredentialsProvider";

export interface BybitWalletCoinBalance {
  coin: string;

  equity: number;

  walletBalance: number;

  lockedBalance: number;

  spotBorrow: number;
}

export interface BybitApiKeyInformation {
  readOnly: boolean;

  spotTradingEnabled: boolean;

  withdrawalsEnabled: boolean;

  internalTransferEnabled: boolean;

  ipRestricted: boolean;

  boundIpCount: number;

  /**
   * Non-empty API permissions outside the exact Strategy #1 pilot allowlist.
   * Values contain permission names only; keys, secrets and bound IPs are never
   * included.
   */
  unexpectedPermissions: readonly string[];

  /**
   * Bybit-managed permission markers that are reported for Unified accounts
   * but are not independently selectable API capabilities.
   */
  systemManagedPermissions: readonly string[];
}

interface BybitWalletBalanceResult {
  list?: unknown;
}

interface BybitTransferableAmountResult {
  availableWithdrawalMap?: unknown;
}

interface BybitApiKeyInformationResult {
  readOnly?: unknown;

  permissions?: unknown;

  ips?: unknown;
}

interface BybitSignedReadClient {
  getSigned<T>(
    path: string,
    parameters?:
      Record<
        string,
        string
      >,
    credentials?:
      BybitCredentials,
  ): Promise<T>;
}

export class BybitAccountApi {
  constructor(
    private readonly client:
      BybitSignedReadClient =
      bybitPrivateHttpClient,
  ) {}

  async getApiKeyInformation(
    credentials?:
      BybitCredentials,
  ): Promise<BybitApiKeyInformation> {
    const result =
      await this.client
        .getSigned<
          BybitApiKeyInformationResult
        >(
          "/v5/user/query-api",
          {},
          credentials,
        );

    if (
      result.readOnly !==
        0 &&
      result.readOnly !==
        1
    ) {
      throw new Error(
        "Invalid Bybit API-key information readOnly value.",
      );
    }

    if (
      !this.isRecord(
        result.permissions,
      )
    ) {
      throw new Error(
        "Invalid Bybit API-key information permissions.",
      );
    }

    if (
      !Array.isArray(
        result.ips,
      )
    ) {
      throw new Error(
        "Invalid Bybit API-key information IP bindings.",
      );
    }

    const permissions =
      this.normalizePermissions(
        result.permissions,
      );

    const spotPermissions =
      permissions.get(
        "Spot",
      ) ?? [];

    const walletPermissions =
      permissions.get(
        "Wallet",
      ) ?? [];

    const unexpectedPermissions =
      Array.from(
        permissions.entries(),
      ).flatMap(
        ([category, values]) =>
          values
            .filter(
              (permission) =>
                !(
                  category ===
                    "Spot" &&
                  permission ===
                    "SpotTrade"
                ) &&
                !(
                  category ===
                    "Derivatives" &&
                  permission ===
                    "DerivativesTrade"
                ),
            )
            .map(
              (permission) =>
                `${category}:${permission}`,
            ),
      ).sort();

    const systemManagedPermissions =
      permissions.get(
        "Derivatives",
      )?.filter(
        (permission) =>
          permission ===
            "DerivativesTrade",
      ).map(
        (permission) =>
          `Derivatives:${permission}`,
      ) ?? [];

    const boundIps =
      result.ips
        .map(
          (value) =>
            typeof value ===
              "string"
              ? value.trim()
              : "",
        )
        .filter(
          Boolean,
        );

    return {
      readOnly:
        result.readOnly ===
        1,

      spotTradingEnabled:
        spotPermissions.includes(
          "SpotTrade",
        ),

      withdrawalsEnabled:
        walletPermissions.includes(
          "Withdraw",
        ),

      internalTransferEnabled:
        walletPermissions.some(
          (permission) =>
            permission ===
              "AccountTransfer" ||
            permission ===
              "SubMemberTransfer" ||
            permission ===
              "SubMemberTransferList",
        ),

      ipRestricted:
        boundIps.length >
          0 &&
        !boundIps.includes(
          "*",
        ),

      boundIpCount:
        boundIps.filter(
          (value) =>
          value !==
            "*",
        ).length,

      unexpectedPermissions,

      systemManagedPermissions,
    };
  }

  async getUnifiedWalletBalances(
    credentials?:
      BybitCredentials,
  ): Promise<
    BybitWalletCoinBalance[]
  > {
    const result =
      await this.client
        .getSigned<
          BybitWalletBalanceResult
        >(
          "/v5/account/wallet-balance",

          {
            accountType:
              "UNIFIED",
          },

          credentials,
        );

    if (
      !Array.isArray(
        result.list,
      )
    ) {
      throw new Error(
        "Invalid Bybit wallet-balance response list.",
      );
    }

    const unifiedAccount =
      result.list.find(
        (value) =>
          this.isRecord(
            value,
          ) &&
          value.accountType ===
            "UNIFIED",
      );

    if (
      !this.isRecord(
        unifiedAccount,
      ) ||
      !Array.isArray(
        unifiedAccount.coin,
      )
    ) {
      throw new Error(
        "Bybit UNIFIED wallet-balance account is missing.",
      );
    }

    return unifiedAccount.coin.map(
      (
        value,
        index,
      ) =>
        this.normalizeCoinBalance(
          value,
          index,
        ),
    );
  }

  async getUnifiedTransferableBalances(
    coins:
      readonly string[],

    credentials?:
      BybitCredentials,
  ): Promise<ReadonlyMap<string, number>> {
    const normalizedCoins =
      Array.from(
        new Set(
          coins.map(
            (
              coin,
            ) =>
              coin.trim()
                .toUpperCase(),
          ).filter(
            Boolean,
          ),
        ),
      );

    const balances =
      new Map<string, number>();

    for (
      let index =
        0;
      index <
        normalizedCoins.length;
      index +=
        20
    ) {
      const chunk =
        normalizedCoins.slice(
          index,
          index +
            20,
        );

      const result =
        await this.client
          .getSigned<
            BybitTransferableAmountResult
          >(
            "/v5/account/withdrawal",
            {
              coinName:
                chunk.join(
                  ",",
                ),
            },
            credentials,
          );

      if (
        !this.isRecord(
          result.availableWithdrawalMap,
        )
      ) {
        throw new Error(
          "Invalid Bybit transferable-balance response map.",
        );
      }

      for (
        const coin
        of chunk
      ) {
        const raw =
          result.availableWithdrawalMap[
            coin
          ];

        balances.set(
          coin,
          this.toNonNegativeNumber(
            raw,
            "availableWithdrawalMap",
            coin,
          ),
        );
      }
    }

    return balances;
  }

  private normalizeCoinBalance(
    value: unknown,
    index: number,
  ): BybitWalletCoinBalance {
    if (
      !this.isRecord(
        value,
      )
    ) {
      throw new Error(
        `Invalid Bybit wallet coin record at index ${index}.`,
      );
    }

    const coin =
      typeof value.coin ===
        "string"
        ? value.coin
            .trim()
            .toUpperCase()
        : "";

    if (!coin) {
      throw new Error(
        `Bybit wallet coin is missing at index ${index}.`,
      );
    }

    return {
      coin,

      equity:
        this.toFiniteNumber(
          value.equity,
          "equity",
          coin,
        ),

      walletBalance:
        this.toFiniteNumber(
          value.walletBalance,
          "walletBalance",
          coin,
        ),

      lockedBalance:
        this.toNonNegativeNumber(
          value.locked,
          "locked",
          coin,
        ),

      spotBorrow:
        this.toNonNegativeNumber(
          value.spotBorrow,
          "spotBorrow",
          coin,
          true,
        ),
    };
  }

  private normalizePermissionList(
    value: unknown,
    field: string,
  ): string[] {
    if (!Array.isArray(value)) {
      throw new Error(
        `Invalid Bybit ${field} permission list.`,
      );
    }

    return value.map(
      (permission) => {
        if (
          typeof permission !==
            "string" ||
          !permission.trim()
        ) {
          throw new Error(
            `Invalid Bybit ${field} permission value.`,
          );
        }

        return permission.trim();
      },
    );
  }

  private normalizePermissions(
    value: Record<
      string,
      unknown
    >,
  ): ReadonlyMap<
    string,
    readonly string[]
  > {
    const normalized =
      new Map<
        string,
        readonly string[]
      >();

    for (
      const [rawCategory, rawPermissions]
      of Object.entries(
        value,
      )
    ) {
      const category =
        rawCategory.trim();

      if (!category) {
        throw new Error(
          "Invalid Bybit permission category.",
        );
      }

      normalized.set(
        category,
        this.normalizePermissionList(
          rawPermissions,
          category,
        ),
      );
    }

    return normalized;
  }

  private toNonNegativeNumber(
    value: unknown,
    field: string,
    coin: string,
    emptyIsZero =
      false,
  ): number {
    if (
      emptyIsZero &&
      (
        value ===
          undefined ||
        value ===
          null ||
        value ===
          ""
      )
    ) {
      return 0;
    }

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
        `Invalid Bybit ${field} for ${coin}.`,
      );
    }

    return numericValue;
  }

  private toFiniteNumber(
    value: unknown,
    field: string,
    coin: string,
  ): number {
    const numericValue =
      Number(
        value,
      );

    if (
      !Number.isFinite(
        numericValue,
      )
    ) {
      throw new Error(
        `Invalid Bybit ${field} for ${coin}.`,
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

export const bybitAccountApi =
  new BybitAccountApi();
