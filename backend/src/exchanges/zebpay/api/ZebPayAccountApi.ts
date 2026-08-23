import {
  ZEBPAY,
} from "../constants";

import type {
  ZebPayCredentials,
} from "./ZebPayCredentialsProvider";

import {
  zebPayPrivateHttpClient,
} from "./ZebPayPrivateHttpClient";

export interface ZebPayBalance {
  asset: string;

  availableBalance: number;

  lockedBalance: number;

  totalBalance: number;
}

export type ZebPayFeeSide =
  | "buy"
  | "sell";

export interface ZebPayAccountFeeEvidence {
  market: string;

  side:
    ZebPayFeeSide;

  customerLevel: string;

  makerPercent: number;

  takerPercent: number;

  gstPercent: number;

  tdsPercent: number;

  effectiveMakerPercent: number;

  effectiveTakerPercent: number;
}

interface ZebPaySignedReadClient {
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
      ZebPayCredentials,
  ): Promise<{
    data: T;
  }>;
}

export class ZebPayAccountApi {
  constructor(
    private readonly client:
      ZebPaySignedReadClient =
      zebPayPrivateHttpClient,
  ) {}

  async getBalances(
    credentials:
      ZebPayCredentials,
  ): Promise<ZebPayBalance[]> {
    const response =
      await this.client
        .getSigned<unknown>(
          ZEBPAY.REST
            .WALLET_BALANCE_PATH,
          [],
          credentials,
        );

    if (
      !Array.isArray(
        response.data,
      )
    ) {
      throw new Error(
        "Invalid ZebPay wallet response: data must be an array.",
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

  async getTradeFees(
    market: string,
    side:
      ZebPayFeeSide,
    credentials:
      ZebPayCredentials,
  ): Promise<ZebPayAccountFeeEvidence> {
    const normalizedMarket =
      this.normalizeMarket(
        market,
      );

    const response =
      await this.client
        .getSigned<unknown>(
          `${ZEBPAY.REST.TRADE_FEES_PATH_PREFIX}/${normalizedMarket}`,
          [
            [
              "side",
              side,
            ],
          ],
          credentials,
        );

    if (
      !this.isRecord(
        response.data,
      ) ||
      !Array.isArray(
        response.data
          .feeList,
      )
    ) {
      throw new Error(
        "Invalid ZebPay fee response: feeList is missing.",
      );
    }

    const feeByCode =
      new Map<
        string,
        number
      >();

    for (
      const value
      of response.data
        .feeList
    ) {
      if (
        !this.isRecord(
          value,
        ) ||
        typeof value.feeCode !==
          "string"
      ) {
        continue;
      }

      const fee =
        this.toNonNegativeNumber(
          value.fee,
          `fee ${value.feeCode}`,
        );

      feeByCode.set(
        value.feeCode
          .trim()
          .toUpperCase(),
        fee,
      );
    }

    const makerPercent =
      this.requireFee(
        feeByCode,
        "MFEE",
      );

    const takerPercent =
      this.requireFee(
        feeByCode,
        "TFEE",
      );

    const gstPercent =
      this.requireFee(
        feeByCode,
        "GST",
      );

    const tdsPercent =
      this.requireFee(
        feeByCode,
        "TDS",
      );

    return {
      market:
        normalizedMarket,
      side,
      customerLevel:
        typeof response.data
          .customerLevel ===
          "string" &&
        response.data
          .customerLevel
          .trim()
          ? response.data
              .customerLevel
              .trim()
          : "UNKNOWN",
      makerPercent,
      takerPercent,
      gstPercent,
      tdsPercent,
      effectiveMakerPercent:
        makerPercent *
        (
          1 +
          gstPercent /
            100
        ),
      effectiveTakerPercent:
        takerPercent *
        (
          1 +
          gstPercent /
            100
        ),
    };
  }

  private normalizeBalance(
    value: unknown,
    index: number,
  ): ZebPayBalance {
    if (
      !this.isRecord(
        value,
      )
    ) {
      throw new Error(
        `Invalid ZebPay wallet row at index ${index}.`,
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
        `Invalid ZebPay wallet currency at index ${index}.`,
      );
    }

    const availableBalance =
      this.toNonNegativeNumber(
        value.balance,
        `${asset} balance`,
      );

    const lockedBalance =
      [
        "pending_trade_balance",
        "lien_locked_balance",
        "lending_balance",
        "pack_balance",
        "qt_locked_balance",
        "rms_locked_colletral",
      ].reduce(
        (
          total,
          field,
        ) =>
          total +
          this.toOptionalNonNegativeNumber(
            value[field],
            `${asset} ${field}`,
          ),
        0,
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

  private normalizeMarket(
    market: string,
  ): string {
    const normalized =
      market
        .trim()
        .toUpperCase()
        .replace(
          /[_/\s]+/g,
          "-",
        );

    if (
      !/^[A-Z0-9]+-[A-Z0-9]+$/
        .test(
          normalized,
        )
    ) {
      throw new Error(
        "ZebPay fee market must be a base-quote Spot pair.",
      );
    }

    return normalized;
  }

  private requireFee(
    fees:
      ReadonlyMap<
        string,
        number
      >,
    code: string,
  ): number {
    const value =
      fees.get(
        code,
      );

    if (
      value ===
        undefined
    ) {
      throw new Error(
        `ZebPay fee response is missing ${code}.`,
      );
    }

    return value;
  }

  private toOptionalNonNegativeNumber(
    value: unknown,
    label: string,
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
      label,
    );
  }

  private toNonNegativeNumber(
    value: unknown,
    label: string,
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
        `Invalid ZebPay ${label}.`,
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

export const zebPayAccountApi =
  new ZebPayAccountApi();
