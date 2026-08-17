import {
  exchangeFees,
  getExchangeFees,
} from "../config/fees";

import {
  binanceCommissionApi,
} from "../../exchanges/binance/api/BinanceCommissionApi";

import {
  binanceCredentialsProvider,
} from "../../exchanges/binance/api/BinanceCredentialsProvider";

import {
  bybitCredentialsProvider,
} from "../../exchanges/bybit/api/BybitCredentialsProvider";

import {
  bybitFeeRateApi,
} from "../../exchanges/bybit/api/BybitFeeRateApi";

import {
  coinDCXCredentialsProvider,
} from "../../exchanges/coindcx/api/CoinDCXCredentialsProvider";

export type FeeVerificationStatus =
  | "VERIFIED"
  | "MISMATCH"
  | "NOT_CONFIGURED"
  | "UNSUPPORTED_BY_CURRENT_API"
  | "AUTH_FAILED"
  | "FAILED";

export type FeeEvidenceQuality =
  | "ACCOUNT_SYMBOL_EXACT"
  | "ACCOUNT_STANDARD_COMPONENT_ONLY"
  | "STATIC_ONLY";

export interface AccountFeeVerificationExchange {
  exchange: "binance" | "bybit" | "coindcx";

  symbol: string;

  status:
    FeeVerificationStatus;

  evidenceQuality:
    FeeEvidenceQuality;

  configured:
    boolean;

  staticMakerPercent:
    number;

  staticTakerPercent:
    number;

  accountMakerPercent:
    number | null;

  accountTakerPercent:
    number | null;

  makerDifferencePercent:
    number | null;

  takerDifferencePercent:
    number | null;

  matchesStatic:
    boolean | null;

  errorClassification:
    string | null;

  reasons:
    string[];

  metadata:
    Readonly<
      Record<
        string,
        unknown
      >
    >;
}

export interface AccountFeeVerificationReport {
  generatedAt: number;

  mode:
    "READ_ONLY_ACCOUNT_FEE_VERIFICATION";

  liveExecutionAllowed:
    false;

  staticRegistryMutationAllowed:
    false;

  symbol:
    string;

  verifiedExchanges:
    number;

  mismatchedExchanges:
    number;

  unresolvedExchanges:
    number;

  safeToTrustStaticRegistryForLive:
    boolean;

  exchanges:
    AccountFeeVerificationExchange[];

  blockers:
    string[];

  observations:
    string[];
}

export class AccountFeeVerificationService {
  async getReport(
    symbol =
      "BTCUSDT",
  ): Promise<AccountFeeVerificationReport> {
    const normalizedSymbol =
      symbol
        .trim()
        .toUpperCase();

    if (
      !normalizedSymbol
    ) {
      throw new Error(
        "Fee verification symbol is required.",
      );
    }

    const exchanges =
      await Promise.all([
        this.verifyBinance(
          normalizedSymbol,
        ),

        this.verifyBybit(
          normalizedSymbol,
        ),

        Promise.resolve(
          this.verifyCoinDCX(
            normalizedSymbol,
          ),
        ),
      ]);

    const blockers:
      string[] =
      [];

    for (
      const exchange
      of exchanges
    ) {
      if (
        exchange.status !==
        "VERIFIED"
      ) {
        blockers.push(
          `${exchange.exchange}: ${exchange.status}.`,
        );
      }
    }

    return {
      generatedAt:
        Date.now(),

      mode:
        "READ_ONLY_ACCOUNT_FEE_VERIFICATION",

      liveExecutionAllowed:
        false,

      staticRegistryMutationAllowed:
        false,

      symbol:
        normalizedSymbol,

      verifiedExchanges:
        exchanges.filter(
          (
            exchange,
          ) =>
            exchange.status ===
            "VERIFIED",
        ).length,

      mismatchedExchanges:
        exchanges.filter(
          (
            exchange,
          ) =>
            exchange.status ===
            "MISMATCH",
        ).length,

      unresolvedExchanges:
        exchanges.filter(
          (
            exchange,
          ) =>
            exchange.status !==
              "VERIFIED" &&
            exchange.status !==
              "MISMATCH",
        ).length,

      safeToTrustStaticRegistryForLive:
        exchanges.every(
          (
            exchange,
          ) =>
            exchange.status ===
            "VERIFIED",
        ),

      exchanges,

      blockers,

      observations: [
        "This endpoint never changes the configured fee registry automatically.",

        "Binance verification uses the signed account commission endpoint for the requested symbol.",

        "Binance standard maker/taker rates are compared with the static registry; special commission, tax commission, buyer/seller components, and discount metadata are exposed separately because order-side effective commission can differ.",

        "Bybit verification uses the authenticated spot fee-rate endpoint for the requested symbol.",

        "CoinDCX is kept STATIC_ONLY because the current project/API evidence does not expose an authenticated account-specific spot fee-rate endpoint that this build can safely rely on.",

        "Any unresolved or mismatched fee evidence remains a LIVE blocker.",
      ],
    };
  }

  private async verifyBinance(
    symbol:
      string,
  ): Promise<AccountFeeVerificationExchange> {
    const staticFees =
      exchangeFees.binance;

    if (
      !staticFees
    ) {
      throw new Error(
        "Static Binance fee configuration is missing.",
      );
    }

    if (
      !binanceCredentialsProvider
        .isConfigured()
    ) {
      return this.baseResult({
        exchange:
          "binance",

        symbol,

        status:
          "NOT_CONFIGURED",

        evidenceQuality:
          "STATIC_ONLY",

        configured:
          false,

        staticMakerPercent:
          staticFees
            .makerPercent,

        staticTakerPercent:
          staticFees
            .takerPercent,

        reasons: [
          "BINANCE_API_KEY and/or BINANCE_API_SECRET is not configured.",
        ],
      });
    }

    try {
      const commission =
        await binanceCommissionApi
          .getCommission(
            symbol,
          );

      const maker =
        commission
          .standardCommission
          .makerPercent;

      const taker =
        commission
          .standardCommission
          .takerPercent;

      const match =
        this.equalFee(
          maker,
          staticFees.makerPercent,
        ) &&
        this.equalFee(
          taker,
          staticFees.takerPercent,
        );

      return {
        ...this.baseResult({
          exchange:
            "binance",

          symbol,

          status:
            match
              ? "VERIFIED"
              : "MISMATCH",

          evidenceQuality:
            "ACCOUNT_STANDARD_COMPONENT_ONLY",

          configured:
            true,

          staticMakerPercent:
            staticFees
              .makerPercent,

          staticTakerPercent:
            staticFees
              .takerPercent,

          reasons:
            match
              ? [
                  "Binance account standard maker/taker commission matches the static registry.",
                ]
              : [
                  "Binance account standard maker/taker commission differs from the static registry.",
                ],
        }),

        accountMakerPercent:
          maker,

        accountTakerPercent:
          taker,

        makerDifferencePercent:
          this.round(
            maker -
            staticFees
              .makerPercent,
          ),

        takerDifferencePercent:
          this.round(
            taker -
            staticFees
              .takerPercent,
          ),

        matchesStatic:
          match,

        metadata: {
          standardCommission:
            commission
              .standardCommission,

          specialCommission:
            commission
              .specialCommission,

          taxCommission:
            commission
              .taxCommission,

          discount:
            commission.discount,

          warning:
            "Static comparison uses Binance standard maker/taker components only. Effective order-side commission can include buyer/seller, special, tax, and discount effects.",
        },
      };
    } catch (
      error:
        unknown
    ) {
      const message =
        this.errorMessage(
          error,
        );

      const classification =
        this.classifyBinanceError(
          message,
        );

      return this.baseResult({
        exchange:
          "binance",

        symbol,

        status:
          classification ===
          "API_KEY_IP_OR_PERMISSION"
            ? "AUTH_FAILED"
            : "FAILED",

        evidenceQuality:
          "STATIC_ONLY",

        configured:
          true,

        staticMakerPercent:
          staticFees
            .makerPercent,

        staticTakerPercent:
          staticFees
            .takerPercent,

        errorClassification:
          classification,

        reasons: [
          message,
        ],
      });
    }
  }

  private async verifyBybit(
    symbol:
      string,
  ): Promise<AccountFeeVerificationExchange> {
    const staticFees =
      exchangeFees.bybit;

    if (
      !staticFees
    ) {
      throw new Error(
        "Static Bybit fee configuration is missing.",
      );
    }

    if (
      !bybitCredentialsProvider
        .isConfigured()
    ) {
      return this.baseResult({
        exchange:
          "bybit",

        symbol,

        status:
          "NOT_CONFIGURED",

        evidenceQuality:
          "STATIC_ONLY",

        configured:
          false,

        staticMakerPercent:
          staticFees
            .makerPercent,

        staticTakerPercent:
          staticFees
            .takerPercent,

        reasons: [
          "BYBIT_API_KEY and/or BYBIT_API_SECRET is not configured.",
        ],
      });
    }

    try {
      const fee =
        await bybitFeeRateApi
          .getSpotFeeRate(
            symbol,
          );

      const match =
        this.equalFee(
          fee.makerPercent,
          staticFees.makerPercent,
        ) &&
        this.equalFee(
          fee.takerPercent,
          staticFees.takerPercent,
        );

      return {
        ...this.baseResult({
          exchange:
            "bybit",

          symbol,

          status:
            match
              ? "VERIFIED"
              : "MISMATCH",

          evidenceQuality:
            "ACCOUNT_SYMBOL_EXACT",

          configured:
            true,

          staticMakerPercent:
            staticFees
              .makerPercent,

          staticTakerPercent:
            staticFees
              .takerPercent,

          reasons:
            match
              ? [
                  "Bybit authenticated spot fee rate matches the static registry.",
                ]
              : [
                  "Bybit authenticated spot fee rate differs from the static registry.",
                ],
        }),

        accountMakerPercent:
          fee.makerPercent,

        accountTakerPercent:
          fee.takerPercent,

        makerDifferencePercent:
          this.round(
            fee.makerPercent -
            staticFees
              .makerPercent,
          ),

        takerDifferencePercent:
          this.round(
            fee.takerPercent -
            staticFees
              .takerPercent,
          ),

        matchesStatic:
          match,

        metadata: {
          verifiedSymbol:
            fee.symbol,
        },
      };
    } catch (
      error:
        unknown
    ) {
      const message =
        this.errorMessage(
          error,
        );

      const classification =
        this.classifyBybitError(
          message,
        );

      return this.baseResult({
        exchange:
          "bybit",

        symbol,

        status:
          classification ===
          "AUTH_OR_PERMISSION"
            ? "AUTH_FAILED"
            : "FAILED",

        evidenceQuality:
          "STATIC_ONLY",

        configured:
          true,

        staticMakerPercent:
          staticFees
            .makerPercent,

        staticTakerPercent:
          staticFees
            .takerPercent,

        errorClassification:
          classification,

        reasons: [
          message,
        ],
      });
    }
  }

  private verifyCoinDCX(
    symbol:
      string,
  ): AccountFeeVerificationExchange {
    const staticFees =
      getExchangeFees(
        "coindcx",
        symbol,
      );

    if (
      !staticFees
    ) {
      throw new Error(
        "Static CoinDCX fee configuration is missing.",
      );
    }

    return this.baseResult({
      exchange:
        "coindcx",

      symbol,

      status:
        "UNSUPPORTED_BY_CURRENT_API",

      evidenceQuality:
        "STATIC_ONLY",

      configured:
        coinDCXCredentialsProvider
          .isConfigured(),

      staticMakerPercent:
        staticFees
          .makerPercent,

      staticTakerPercent:
        staticFees
          .takerPercent,

      reasons: [
        "No authenticated CoinDCX account-specific spot fee-rate endpoint is integrated in the current verified API surface.",

        "CoinDCX static fees therefore remain unverified account assumptions and must not be treated as LIVE-confirmed economics.",
      ],
    });
  }

  private baseResult(
    input: {
      exchange:
        "binance" |
        "bybit" |
        "coindcx";

      symbol:
        string;

      status:
        FeeVerificationStatus;

      evidenceQuality:
        FeeEvidenceQuality;

      configured:
        boolean;

      staticMakerPercent:
        number;

      staticTakerPercent:
        number;

      errorClassification?:
        string | null;

      reasons:
        string[];
    },
  ): AccountFeeVerificationExchange {
    return {
      exchange:
        input.exchange,

      symbol:
        input.symbol,

      status:
        input.status,

      evidenceQuality:
        input.evidenceQuality,

      configured:
        input.configured,

      staticMakerPercent:
        input
          .staticMakerPercent,

      staticTakerPercent:
        input
          .staticTakerPercent,

      accountMakerPercent:
        null,

      accountTakerPercent:
        null,

      makerDifferencePercent:
        null,

      takerDifferencePercent:
        null,

      matchesStatic:
        null,

      errorClassification:
        input
          .errorClassification ??
        null,

      reasons:
        input.reasons,

      metadata:
        {},
    };
  }

  private classifyBinanceError(
    message:
      string,
  ): string {
    if (
      message.includes(
        "code=-2015",
      ) ||
      message
        .toLowerCase()
        .includes(
          "invalid api-key, ip, or permissions",
        )
    ) {
      return "API_KEY_IP_OR_PERMISSION";
    }

    if (
      message.includes(
        "code=-1021",
      ) ||
      message
        .toLowerCase()
        .includes(
          "timestamp",
        )
    ) {
      return "TIMESTAMP_OR_RECV_WINDOW";
    }

    if (
      message
        .toLowerCase()
        .includes(
          "signature",
        )
    ) {
      return "SIGNATURE";
    }

    return "UNKNOWN";
  }

  private classifyBybitError(
    message:
      string,
  ): string {
    const lower =
      message
        .toLowerCase();

    if (
      lower.includes(
        "api key",
      ) ||
      lower.includes(
        "permission",
      ) ||
      lower.includes(
        "retcode=10003",
      ) ||
      lower.includes(
        "retcode=10005",
      )
    ) {
      return "AUTH_OR_PERMISSION";
    }

    if (
      lower.includes(
        "timestamp",
      ) ||
      lower.includes(
        "retcode=10002",
      )
    ) {
      return "TIMESTAMP_OR_RECV_WINDOW";
    }

    return "UNKNOWN";
  }

  private equalFee(
    first:
      number,

    second:
      number,
  ): boolean {
    return Math.abs(
      first -
      second,
    ) <=
      0.000001;
  }

  private round(
    value:
      number,
  ): number {
    return Number(
      value.toFixed(
        8,
      ),
    );
  }

  private errorMessage(
    error:
      unknown,
  ): string {
    return error instanceof Error
      ? error.message
      : "Unknown fee verification failure.";
  }
}

export const accountFeeVerificationService =
  new AccountFeeVerificationService();
