import {
  COINSWITCH,
  type CoinSwitchPublicVenue,
} from "../constants";

import {
  normalizeCoinSwitchSymbol,
} from "../normalize";

import type {
  CoinSwitchCredentials,
} from "./CoinSwitchCredentialsProvider";

import {
  coinSwitchReadOnlyHttpClient,
} from "./CoinSwitchReadOnlyHttpClient";

export interface CoinSwitchTradeInfo {
  venue:
    CoinSwitchPublicVenue;

  symbol: string;

  market: string;

  baseAsset: string;

  quoteAsset:
    "INR" |
    "USDT";

  minimumNotional: number;

  maximumNotional: number;

  quantityPrecision: number;

  pricePrecision: number;

  quantityStep: number;

  priceStep: number;

  limitPrecisionAdjustment:
    number | null;
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

interface CoinSwitchTradeInfoEnvelope {
  data?: unknown;
}

export class CoinSwitchTradeInfoApi {
  constructor(
    private readonly client:
      CoinSwitchSignedReadClient =
      coinSwitchReadOnlyHttpClient,
  ) {}

  async getTradeInfo(
    venue:
      CoinSwitchPublicVenue,
    credentials?:
      CoinSwitchCredentials,
  ): Promise<
    CoinSwitchTradeInfo[]
  > {
    const response =
      await this.client
        .getSigned<
          CoinSwitchTradeInfoEnvelope
        >(
          COINSWITCH.REST
            .TRADE_INFO_PATH,
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

    const venueInfo =
      this.recordOrNull(
        data?.[
          venue
        ],
      );

    if (!venueInfo) {
      throw new Error(
        `CoinSwitch trade-info response is missing venue ${venue}.`,
      );
    }

    const rules:
      CoinSwitchTradeInfo[] = [];

    for (
      const [
        incomingSymbol,
        incomingInfo,
      ]
      of Object.entries(
        venueInfo,
      )
    ) {
      try {
        const normalized =
          this.normalizeSymbol(
            venue,
            incomingSymbol,
          );

        const info =
          this.recordOrNull(
            incomingInfo,
          );

        const quote =
          this.recordOrNull(
            info?.quote,
          );

        const precision =
          this.recordOrNull(
            info?.precision,
          );

        if (
          !normalized ||
          !quote ||
          !precision
        ) {
          continue;
        }

        const quantityPrecision =
          this.nonNegativePrecision(
            precision.base,
            "precision.base",
            normalized.symbol,
          );

        const pricePrecision =
          this.nonNegativePrecision(
            precision.quote,
            "precision.quote",
            normalized.symbol,
          );

        rules.push({
          venue,

          ...normalized,

          minimumNotional:
            this.positiveNumber(
              quote.min,
              "quote.min",
              normalized.symbol,
            ),

          maximumNotional:
            this.positiveNumber(
              quote.max,
              "quote.max",
              normalized.symbol,
            ),

          quantityPrecision,

          pricePrecision,

          quantityStep:
            this.precisionToStep(
              quantityPrecision,
            ),

          priceStep:
            this.precisionToStep(
              pricePrecision,
            ),

          limitPrecisionAdjustment:
            precision.limit ===
              undefined ||
            precision.limit ===
              null
              ? null
              : this.nonNegativePrecision(
                  precision.limit,
                  "precision.limit",
                  normalized.symbol,
                ),
        });
      } catch {
        /*
         * A signed trade-info catalog can contain
         * markets whose rule shape is unsupported or
         * incomplete. Exclude only that market rather
         * than promoting guessed rules or discarding
         * every independently valid market.
         */
        continue;
      }
    }

    if (
      rules.length ===
        0
    ) {
      throw new Error(
        `CoinSwitch returned no valid trade rules for ${venue}.`,
      );
    }

    return rules.sort(
      (
        first,
        second,
      ) =>
        first.market.localeCompare(
          second.market,
        ),
    );
  }

  private normalizeSymbol(
    venue:
      CoinSwitchPublicVenue,
    incomingSymbol:
      string,
  ): Omit<
    CoinSwitchTradeInfo,
    | "venue"
    | "minimumNotional"
    | "maximumNotional"
    | "quantityPrecision"
    | "pricePrecision"
    | "quantityStep"
    | "priceStep"
    | "limitPrecisionAdjustment"
  > | null {
    const symbol =
      normalizeCoinSwitchSymbol(
        incomingSymbol,
      );

    const [
      baseAsset,
      incomingQuoteAsset,
    ] =
      symbol.split(
        "/",
      );

    const quoteAsset =
      venue ===
        "coinswitchx"
        ? "INR"
        : "USDT";

    if (
      !baseAsset ||
      incomingQuoteAsset !==
        quoteAsset
    ) {
      return null;
    }

    return {
      symbol,

      market:
        `${baseAsset}_${quoteAsset}`,

      baseAsset,

      quoteAsset,
    };
  }

  private positiveNumber(
    value: unknown,
    field: string,
    symbol: string,
  ): number {
    const parsed =
      Number(
        value,
      );

    if (
      !Number.isFinite(
        parsed,
      ) ||
      parsed <= 0
    ) {
      throw new Error(
        `CoinSwitch ${field} is invalid for ${symbol}.`,
      );
    }

    return parsed;
  }

  private nonNegativePrecision(
    value: unknown,
    field: string,
    symbol: string,
  ): number {
    const parsed =
      Number(
        value,
      );

    if (
      !Number.isSafeInteger(
        parsed,
      ) ||
      parsed < 0 ||
      parsed > 18
    ) {
      throw new Error(
        `CoinSwitch ${field} is invalid for ${symbol}.`,
      );
    }

    return parsed;
  }

  private precisionToStep(
    precision: number,
  ): number {
    return Number(
      `1e-${precision}`,
    );
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

export const coinSwitchTradeInfoApi =
  new CoinSwitchTradeInfoApi();
