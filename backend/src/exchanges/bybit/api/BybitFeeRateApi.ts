import {
  bybitPrivateHttpClient,
} from "./BybitPrivateHttpClient";

import type {
  BybitCredentials,
} from "./BybitCredentialsProvider";

export interface BybitFeeRate {
  symbol: string;

  makerPercent: number;

  takerPercent: number;
}

interface BybitFeeRateResult {
  category?: unknown;

  list?: unknown;
}

export class BybitFeeRateApi {
  async getSpotFeeRate(
    symbol:
      string,

    credentials?:
      BybitCredentials,
  ): Promise<BybitFeeRate> {
    const normalizedSymbol =
      symbol
        .trim()
        .toUpperCase();

    if (
      !normalizedSymbol
    ) {
      throw new Error(
        "Bybit fee-rate symbol is required.",
      );
    }

    const result =
      await bybitPrivateHttpClient
        .getSigned<
          BybitFeeRateResult
        >(
          "/v5/account/fee-rate",

          {
            category:
              "spot",

            symbol:
              normalizedSymbol,
          },

          credentials,
        );

    if (
      !Array.isArray(
        result.list,
      ) ||
      result.list.length ===
        0
    ) {
      throw new Error(
        "Bybit fee-rate response list is empty.",
      );
    }

    const first =
      result.list[
        0
      ];

    if (
      typeof first !==
        "object" ||
      first ===
        null ||
      Array.isArray(
        first,
      )
    ) {
      throw new Error(
        "Invalid Bybit fee-rate record.",
      );
    }

    const record =
      first as Record<
        string,
        unknown
      >;

    return {
      symbol:
        typeof record.symbol ===
          "string" &&
        record.symbol.trim()
          ? record.symbol
              .trim()
              .toUpperCase()
          : normalizedSymbol,

      makerPercent:
        this.decimalRateToPercent(
          record.makerFeeRate,
          "makerFeeRate",
        ),

      takerPercent:
        this.decimalRateToPercent(
          record.takerFeeRate,
          "takerFeeRate",
        ),
    };
  }

  private decimalRateToPercent(
    value:
      unknown,

    name:
      string,
  ): number {
    const decimal =
      Number(
        value,
      );

    if (
      !Number.isFinite(
        decimal,
      ) ||
      decimal <
        0
    ) {
      throw new Error(
        `Invalid Bybit ${name}.`,
      );
    }

    return decimal *
      100;
  }
}

export const bybitFeeRateApi =
  new BybitFeeRateApi();