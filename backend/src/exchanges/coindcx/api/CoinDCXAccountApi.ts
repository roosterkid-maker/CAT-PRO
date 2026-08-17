import {
  coinDCXHttpClient,
  type CoinDCXCredentials,
} from "./CoinDCXHttpClient";

import {
  coinDCXSigner,
} from "./CoinDCXSigner";

export interface CoinDCXBalance {
  currency: string;

  balance: number;

  lockedBalance: number;

  availableBalance: number;

  totalBalance: number;
}

interface CoinDCXBalanceResponse {
  currency?: string;

  balance?:
    | number
    | string;

  locked_balance?:
    | number
    | string;
}

export class CoinDCXAccountApi {
  async getBalances(
    credentials: CoinDCXCredentials,
  ): Promise<CoinDCXBalance[]> {
    const body =
      coinDCXSigner.createTimestampBody();

    const response =
      await coinDCXHttpClient.postPrivate<
        CoinDCXBalanceResponse[]
      >(
        "/exchange/v1/users/balances",
        body,
        credentials,
      );

    if (!Array.isArray(response)) {
      throw new Error(
        "Invalid CoinDCX balance response.",
      );
    }

    return response
      .map((item) =>
        this.normalizeBalance(
          item,
        ),
      )
      .filter(
        (
          balance,
        ): balance is CoinDCXBalance =>
          balance !== null,
      );
  }

  async getBalance(
    currency: string,
    credentials: CoinDCXCredentials,
  ): Promise<CoinDCXBalance | null> {
    const normalizedCurrency =
      currency
        .trim()
        .toUpperCase();

    if (!normalizedCurrency) {
      throw new Error(
        "Currency is required.",
      );
    }

    const balances =
      await this.getBalances(
        credentials,
      );

    return (
      balances.find(
        (balance) =>
          balance.currency ===
          normalizedCurrency,
      ) ??
      null
    );
  }

  private normalizeBalance(
    response: CoinDCXBalanceResponse,
  ): CoinDCXBalance | null {
    const currency =
      response.currency
        ?.trim()
        .toUpperCase();

    const balance =
      Number(
        response.balance ??
          0,
      );

    const lockedBalance =
      Number(
        response.locked_balance ??
          0,
      );

    if (
      !currency ||
      !Number.isFinite(balance) ||
      !Number.isFinite(
        lockedBalance,
      ) ||
      balance < 0 ||
      lockedBalance < 0
    ) {
      return null;
    }

    return {
      currency,

      balance,

      lockedBalance,

      /*
       * CoinDCX balance already represents
       * the currently usable balance.
       */
      availableBalance:
        balance,

      totalBalance:
        balance +
        lockedBalance,
    };
  }
}

export const coinDCXAccountApi =
  new CoinDCXAccountApi();