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

export interface UnoCoinWithdrawSetting {
  readonly coin: string;
  /** Flat withdrawal fee in units of the coin. */
  readonly networkFee: number;
  readonly minimumWithdraw: number;
  /** The one network UnoCoin sends on: ETH (ERC-20), BSC, TRX, or the coin's own chain. */
  readonly network: string;
}

/** UnoCoin names the network only in its notes ("Only ERC-20 (Ethereum Chain) is supported"). */
export function unoCoinNetworkOf(coin: string, notes: readonly unknown[]): string {
  const text = notes.map((note) => (typeof note === "string" ? note : "")).join(" ").toUpperCase();
  if (/\bERC-?20\b|ETHEREUM CHAIN/u.test(text)) return "ETH";
  if (/\bBSC\b|\bBEP-?20\b|BINANCE CHAIN|BINANCE SMART CHAIN/u.test(text)) return "BSC";
  if (/\bTRC-?20\b|\bTRON\b/u.test(text)) return "TRX";
  if (/\bSOLANA\b|\bSPL\b/u.test(text)) return "SOL";
  if (/\bPOLYGON\b|\bMATIC\b/u.test(text)) return "MATIC";
  return coin.toUpperCase();
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

  /** Per-coin withdrawal fee and network, from the same wallet read. */
  async getWithdrawSettings(
    credentials:
      UnoCoinCredentials,
  ): Promise<UnoCoinWithdrawSetting[]> {
    const response =
      await this.client
        .getAuthenticated<
          UnoCoinWalletEnvelope
        >(
          UNOCOIN.REST
            .WALLET_PATH,
          credentials,
        );
    if (!Array.isArray(response.wallets)) {
      throw new Error("Invalid UnoCoin wallet response: wallets must be an array.");
    }
    const settings: UnoCoinWithdrawSetting[] = [];
    for (const value of response.wallets) {
      const row = value as Record<string, unknown> | null;
      if (!row || typeof row !== "object" || row.type !== "CRYPTO") continue;
      const coin = typeof row.coin === "string" ? row.coin.trim().toUpperCase() : "";
      const networkFee = Number(row.network_fee);
      const minimumWithdraw = Number(row.min_withdraw_limit);
      if (!coin || !Number.isFinite(networkFee) || networkFee < 0) continue;
      settings.push({
        coin,
        networkFee,
        minimumWithdraw: Number.isFinite(minimumWithdraw) && minimumWithdraw >= 0 ? minimumWithdraw : 0,
        network: unoCoinNetworkOf(coin, [row.deposit_note, row.withdraw_note]),
      });
    }
    return settings;
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
