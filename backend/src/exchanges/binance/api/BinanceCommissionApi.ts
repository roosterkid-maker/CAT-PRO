import {
  BINANCE,
} from "../constants";

import {
  binanceHttpClient,
} from "./BinanceHttpClient";

import type {
  BinanceCredentials,
} from "./BinanceCredentialsProvider";

export interface BinanceCommissionRateSet {
  makerPercent: number;

  takerPercent: number;

  buyerPercent: number;

  sellerPercent: number;
}

export interface BinanceCommissionDiscount {
  enabledForAccount: boolean;

  enabledForSymbol: boolean;

  discountAsset: string | null;

  discountPercent: number | null;
}

export interface BinanceCommissionEvidence {
  symbol: string;

  standardCommission:
    BinanceCommissionRateSet;

  specialCommission:
    BinanceCommissionRateSet;

  taxCommission:
    BinanceCommissionRateSet;

  discount:
    BinanceCommissionDiscount;
}

interface BinanceCommissionResponse {
  symbol?: unknown;

  standardCommission?: unknown;

  specialCommission?: unknown;

  taxCommission?: unknown;

  discount?: unknown;
}

export class BinanceCommissionApi {
  async getCommission(
    symbol: string,

    credentials?:
      BinanceCredentials,
  ): Promise<BinanceCommissionEvidence> {
    const normalizedSymbol =
      symbol
        .trim()
        .toUpperCase();

    if (
      !normalizedSymbol
    ) {
      throw new Error(
        "Binance commission symbol is required.",
      );
    }

    await binanceHttpClient
      .synchronizeServerTime();

    const response =
      await binanceHttpClient.getSigned<
        BinanceCommissionResponse
      >(
        BINANCE
          .REST
          .ACCOUNT_COMMISSION,

        {
          symbol:
            normalizedSymbol,
        },

        credentials,
      );

    return {
      symbol:
        this.toRequiredString(
          response.symbol,
          "Binance commission symbol",
        )
          .toUpperCase(),

      standardCommission:
        this.normalizeRateSet(
          response
            .standardCommission,
          "standardCommission",
        ),

      specialCommission:
        this.normalizeRateSet(
          response
            .specialCommission,
          "specialCommission",
        ),

      taxCommission:
        this.normalizeRateSet(
          response
            .taxCommission,
          "taxCommission",
        ),

      discount:
        this.normalizeDiscount(
          response.discount,
        ),
    };
  }

  private normalizeRateSet(
    value:
      unknown,

    name:
      string,
  ): BinanceCommissionRateSet {
    if (
      !this.isRecord(
        value,
      )
    ) {
      throw new Error(
        `Invalid Binance ${name} response.`,
      );
    }

    return {
      makerPercent:
        this.decimalRateToPercent(
          value.maker,
          `${name}.maker`,
        ),

      takerPercent:
        this.decimalRateToPercent(
          value.taker,
          `${name}.taker`,
        ),

      buyerPercent:
        this.decimalRateToPercent(
          value.buyer,
          `${name}.buyer`,
        ),

      sellerPercent:
        this.decimalRateToPercent(
          value.seller,
          `${name}.seller`,
        ),
    };
  }

  private normalizeDiscount(
    value:
      unknown,
  ): BinanceCommissionDiscount {
    if (
      !this.isRecord(
        value,
      )
    ) {
      return {
        enabledForAccount:
          false,

        enabledForSymbol:
          false,

        discountAsset:
          null,

        discountPercent:
          null,
      };
    }

    return {
      enabledForAccount:
        value.enabledForAccount ===
        true,

      enabledForSymbol:
        value.enabledForSymbol ===
        true,

      discountAsset:
        this.toOptionalString(
          value.discountAsset,
        ),

      /*
       * Binance discount is a multiplier reduction
       * expressed as a decimal fraction.
       * Example 0.25 means 25% discount.
       */
      discountPercent:
        value.discount ===
          undefined ||
        value.discount ===
          null
          ? null
          : this.decimalRateToPercent(
              value.discount,
              "discount.discount",
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
        `Invalid Binance commission rate: ${name}.`,
      );
    }

    return decimal *
      100;
  }

  private toRequiredString(
    value:
      unknown,

    name:
      string,
  ): string {
    const normalized =
      this.toOptionalString(
        value,
      );

    if (
      !normalized
    ) {
      throw new Error(
        `${name} is missing.`,
      );
    }

    return normalized;
  }

  private toOptionalString(
    value:
      unknown,
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
    value:
      unknown,
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

export const binanceCommissionApi =
  new BinanceCommissionApi();