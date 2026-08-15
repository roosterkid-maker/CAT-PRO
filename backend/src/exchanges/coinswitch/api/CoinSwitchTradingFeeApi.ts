import {
  COINSWITCH,
  type CoinSwitchPublicVenue,
} from "../constants";

import type {
  CoinSwitchCredentials,
} from "./CoinSwitchCredentialsProvider";

import {
  coinSwitchReadOnlyHttpClient,
} from "./CoinSwitchReadOnlyHttpClient";

export interface CoinSwitchTradingFee {
  venue:
    CoinSwitchPublicVenue;

  baseAsset: string;

  makerPercent: number;

  takerPercent: number;

  sourceTimestamp: number;
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

interface CoinSwitchTradingFeeEnvelope {
  data?: unknown;
}

export class CoinSwitchTradingFeeApi {
  constructor(
    private readonly client:
      CoinSwitchSignedReadClient =
      coinSwitchReadOnlyHttpClient,
  ) {}

  async getTradingFees(
    venue:
      CoinSwitchPublicVenue,
    credentials?:
      CoinSwitchCredentials,
  ): Promise<
    CoinSwitchTradingFee[]
  > {
    const response =
      await this.client
        .getSigned<
          CoinSwitchTradingFeeEnvelope
        >(
          COINSWITCH.REST
            .TRADING_FEE_PATH,
          {
            exchange:
              venue,
          },
          credentials,
        );

    const data =
      this.recordOrNull(
        response.data,
      );

    const venueFees =
      this.recordOrNull(
        data?.[
          venue
        ],
      );

    if (!venueFees) {
      throw new Error(
        `CoinSwitch trading-fee response is missing venue ${venue}.`,
      );
    }

    const fees:
      CoinSwitchTradingFee[] = [];

    for (
      const [
        incomingAsset,
        incomingFee,
      ]
      of Object.entries(
        venueFees,
      )
    ) {
      const baseAsset =
        this.normalizeAsset(
          incomingAsset,
        );

      const fee =
        this.recordOrNull(
          incomingFee,
        );

      if (
        !baseAsset ||
        !fee
      ) {
        continue;
      }

      fees.push({
        venue,

        baseAsset,

        makerPercent:
          this.decimalRateToPercent(
            fee.maker_fee_after_discount,
            "maker_fee_after_discount",
            baseAsset,
          ),

        takerPercent:
          this.decimalRateToPercent(
            fee.taker_fee_after_discount,
            "taker_fee_after_discount",
            baseAsset,
          ),

        sourceTimestamp:
          this.unixSecondsToMilliseconds(
            fee.timestamp,
            baseAsset,
          ),
      });
    }

    if (
      fees.length ===
        0
    ) {
      throw new Error(
        `CoinSwitch returned no valid account fee evidence for ${venue}.`,
      );
    }

    return fees.sort(
      (
        first,
        second,
      ) =>
        first.baseAsset
          .localeCompare(
            second.baseAsset,
          ),
    );
  }

  private decimalRateToPercent(
    value: unknown,
    field: string,
    asset: string,
  ): number {
    const rate =
      Number(
        value,
      );

    if (
      !Number.isFinite(
        rate,
      ) ||
      rate < 0 ||
      rate > 1
    ) {
      throw new Error(
        `CoinSwitch ${field} is invalid for ${asset}.`,
      );
    }

    return Number(
      (
        rate * 100
      ).toFixed(
        12,
      ),
    );
  }

  private unixSecondsToMilliseconds(
    value: unknown,
    asset: string,
  ): number {
    const seconds =
      Number(
        value,
      );

    if (
      !Number.isSafeInteger(
        seconds,
      ) ||
      seconds <= 0
    ) {
      throw new Error(
        `CoinSwitch fee timestamp is invalid for ${asset}.`,
      );
    }

    return seconds *
      1_000;
  }

  private normalizeAsset(
    value: string,
  ): string {
    const normalized =
      value
        .trim()
        .toUpperCase();

    return /^[A-Z0-9]+$/
      .test(
        normalized,
      )
      ? normalized
      : "";
  }

  private recordOrNull(
    value: unknown,
  ): Record<
    string,
    unknown
  > | null {
    return typeof value ===
      "object" &&
      value !== null &&
      !Array.isArray(
        value,
      )
      ? value as Record<
          string,
          unknown
        >
      : null;
  }
}

export const coinSwitchTradingFeeApi =
  new CoinSwitchTradingFeeApi();
