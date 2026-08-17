import type {
  PaperVdaTaxWithholdingEvidence,
  PaperVdaTaxWithholdingLegEvidence,
} from "../models/PaperProfitEvidence";

const SECTION_194S_RATE_PERCENT =
  1 as const;

const INDIA_SPOT_EXCHANGES =
  new Set([
    "coindcx",
    "coinswitch",
    "unocoin",
  ]);

export interface PaperVdaTaxWithholdingInput {
  market: string;

  quoteAsset?: string | null;

  buyExchange: string;

  sellExchange: string;

  buyNotional: number;

  sellNotional: number;

  buyTradingFee: number;

  sellTradingFee: number;

  generatedAt?: number;
}

export class PaperVdaTaxWithholdingService {
  calculate(
    input:
      PaperVdaTaxWithholdingInput,
  ): PaperVdaTaxWithholdingEvidence {
    this.validate(
      input,
    );

    const quoteAsset =
      this.normalizeAsset(
        input.quoteAsset,
      ) ||
      this.inferQuoteAsset(
        input.market,
      );

    if (!quoteAsset) {
      throw new Error(
        "PAPER VDA tax withholding requires an authoritative quote asset.",
      );
    }

    const cryptoToCrypto =
      quoteAsset !==
      "INR";

    const legs = [
      this.calculateLeg({
        side:
          "BUY",
        exchange:
          input.buyExchange,
        notional:
          input.buyNotional,
        tradingFee:
          input.buyTradingFee,
        cryptoToCrypto,
      }),
      this.calculateLeg({
        side:
          "SELL",
        exchange:
          input.sellExchange,
        notional:
          input.sellNotional,
        tradingFee:
          input.sellTradingFee,
        cryptoToCrypto,
      }),
    ];

    return {
      schemaVersion:
        1,
      policy:
        "MODELED_SECTION_194S_V1",
      currency:
        quoteAsset,
      thresholdTreatment:
        "ASSUMED_EXCEEDED_FOR_CONSERVATIVE_PAPER",
      ratePercent:
        SECTION_194S_RATE_PERCENT,
      legs,
      totalWithheld:
        this.round(
          legs.reduce(
            (
              total,
              leg,
            ) =>
              total +
              leg.withheld,
            0,
          ),
        ),
      claimableTaxCredit:
        true,
      economicProfitDeduction:
        0,
      generatedAt:
        input.generatedAt ??
        Date.now(),
      paperOnly:
        true,
      liveExecutionAllowed:
        false,
      orderSubmissionAllowed:
        false,
    };
  }

  private calculateLeg(
    input: {
      side: "BUY" | "SELL";
      exchange: string;
      notional: number;
      tradingFee: number;
      cryptoToCrypto: boolean;
    },
  ): PaperVdaTaxWithholdingLegEvidence {
    const exchange =
      input.exchange
        .trim()
        .toLowerCase();

    if (
      !INDIA_SPOT_EXCHANGES.has(
        exchange,
      )
    ) {
      return this.notApplicableLeg(
        input.side,
        exchange,
        "The venue is outside CAT PRO's modeled Indian Spot-exchange withholding policy.",
      );
    }

    if (
      input.side ===
        "BUY" &&
      !input.cryptoToCrypto
    ) {
      return this.notApplicableLeg(
        input.side,
        exchange,
        "An INR Spot buy is not modeled as a Section 194S sale by this account.",
      );
    }

    const basis =
      input.cryptoToCrypto
        ? "NET_CRYPTO_TO_CRYPTO_CONSIDERATION" as const
        : exchange ===
            "unocoin"
          ? "NET_UNOCOIN_SELL_CONSIDERATION" as const
          : "GROSS_SELL_CONSIDERATION" as const;

    const consideration =
      basis ===
        "GROSS_SELL_CONSIDERATION"
        ? input.notional
        : Math.max(
            0,
            input.notional -
              input.tradingFee,
          );

    return {
      side:
        input.side,
      exchange,
      applicable:
        true,
      basis,
      consideration:
        this.round(
          consideration,
        ),
      ratePercent:
        SECTION_194S_RATE_PERCENT,
      withheld:
        this.round(
          consideration *
          SECTION_194S_RATE_PERCENT /
          100,
        ),
      reason:
        input.cryptoToCrypto
          ? "Modeled Indian crypto-to-crypto transfer: TDS applies to the net VDA consideration."
          : basis ===
              "NET_UNOCOIN_SELL_CONSIDERATION"
            ? "Modeled UnoCoin INR sell: TDS uses the venue's published net-after-fee basis."
            : "Modeled Indian INR Spot sell: TDS uses gross sell consideration.",
    };
  }

  private notApplicableLeg(
    side: "BUY" | "SELL",
    exchange: string,
    reason: string,
  ): PaperVdaTaxWithholdingLegEvidence {
    return {
      side,
      exchange,
      applicable:
        false,
      basis:
        "NOT_APPLICABLE",
      consideration:
        0,
      ratePercent:
        0,
      withheld:
        0,
      reason,
    };
  }

  private inferQuoteAsset(
    market: string,
  ): string {
    const normalized =
      market
        .trim()
        .toUpperCase()
        .replace(
          /[\s_,\-/]+/g,
          "",
        );

    return [
      "USDT",
      "USDC",
      "INR",
      "BTC",
      "ETH",
    ].find(
      (asset) =>
        normalized.endsWith(
          asset,
        ),
    ) ??
    "";
  }

  private normalizeAsset(
    value:
      string | null | undefined,
  ): string {
    const normalized =
      value
        ?.trim()
        .toUpperCase() ??
      "";

    return /^[A-Z0-9]+$/
      .test(
        normalized,
      )
      ? normalized
      : "";
  }

  private validate(
    input:
      PaperVdaTaxWithholdingInput,
  ): void {
    if (
      !input.market.trim() ||
      !input.buyExchange.trim() ||
      !input.sellExchange.trim()
    ) {
      throw new Error(
        "PAPER VDA tax withholding requires market and exchange identities.",
      );
    }

    for (
      const [
        label,
        value,
      ] of [
        [
          "buy notional",
          input.buyNotional,
        ],
        [
          "sell notional",
          input.sellNotional,
        ],
        [
          "buy trading fee",
          input.buyTradingFee,
        ],
        [
          "sell trading fee",
          input.sellTradingFee,
        ],
      ] as const
    ) {
      if (
        !Number.isFinite(
          value,
        ) ||
        value < 0
      ) {
        throw new Error(
          `PAPER VDA tax ${label} must be a non-negative finite number.`,
        );
      }
    }
  }

  private round(
    value: number,
  ): number {
    return Number(
      value.toFixed(
        12,
      ),
    );
  }
}

export const paperVdaTaxWithholdingService =
  new PaperVdaTaxWithholdingService();
