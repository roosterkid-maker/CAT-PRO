import {
  sensitiveDataRedactor,
} from "../../core/security/SensitiveDataRedactor";

import {
  getExchangeFeeEvidence,
  replaceExchangeMarketFeeEvidence,
} from "../../arbitrage/config/fees";

import type {
  ExchangeFeeEvidence,
} from "../../arbitrage/models/FeeModel";

import {
  marketCache,
} from "../../services/cache.service";

import {
  executionAdapterVerificationService,
} from "../../execution/live/verification/ExecutionAdapterVerificationService";

import type {
  LiveExecutionAdapterReadiness,
} from "../../execution/live/contracts/LiveExecutionAdapter";

import {
  ZEBPAY,
} from "./constants";

import {
  zebPayAccountApi,
  type ZebPayAccountFeeEvidence,
  type ZebPayBalance,
} from "./api/ZebPayAccountApi";

import {
  zebPayCredentialsProvider,
  type ZebPayCredentialSource,
  type ZebPayCredentials,
} from "./api/ZebPayCredentialsProvider";

export interface ZebPayAuthenticatedReadApi {
  getBalances(
    credentials:
      ZebPayCredentials,
  ): Promise<ZebPayBalance[]>;

  getTradeFees(
    market: string,
    side:
      "buy" | "sell",
    credentials:
      ZebPayCredentials,
  ): Promise<ZebPayAccountFeeEvidence>;
}

export interface ZebPayAuthenticatedReadDiagnostics {
  credentialsConfigured: boolean;

  balanceRows: number;

  positiveBalanceRows: number;

  lastBalanceReadAt:
    number | null;

  referenceFeeMarket: string;

  feeEvidenceFresh: boolean;

  feeEvidenceExpiresAt:
    number | null;

  buyFee:
    ZebPayAccountFeeEvidence | null;

  sellFee:
    ZebPayAccountFeeEvidence | null;

  verifiedFeeMarkets:
    number;

  conservativeSideAwareFees:
    boolean;

  lastError:
    string | null;

  executionEligible: boolean;

  blocker:
    | "NONE"
    | "QUANTITY_DEPTH_ORDER_RULE_AND_SIDE_AWARE_FEE_EVIDENCE_REQUIRED";
}

export interface ZebPayAuthenticatedReadVerificationOptions {
  api?:
    ZebPayAuthenticatedReadApi;

  credentialsProvider?:
    ZebPayCredentialSource;

  now?:
    () => number;

  scheduleTimers?:
    boolean;

  refreshIntervalMs?:
    number;

  feeRefreshIntervalMs?:
    number;

  feeTtlMs?:
    number;

  feeMarketsProvider?:
    () => readonly string[];
}

const ZEBPAY_EXCHANGE =
  "zebpay";

export class ZebPayAuthenticatedReadVerificationService {
  private readonly api:
    ZebPayAuthenticatedReadApi;

  private readonly credentialsProvider:
    ZebPayCredentialSource;

  private readonly now:
    () => number;

  private readonly scheduleTimers:
    boolean;

  private readonly refreshIntervalMs:
    number;

  private readonly feeRefreshIntervalMs:
    number;

  private readonly feeTtlMs:
    number;

  private readonly feeMarketsProvider:
    () => readonly string[];

  private refreshTimer:
    NodeJS.Timeout | null =
    null;

  private verificationPromise:
    Promise<void> | null =
    null;

  private readonly diagnostics:
    ZebPayAuthenticatedReadDiagnostics = {
    credentialsConfigured:
      false,
    balanceRows:
      0,
    positiveBalanceRows:
      0,
    lastBalanceReadAt:
      null,
    referenceFeeMarket:
      ZEBPAY
        .REFERENCE_FEE_MARKET,
    feeEvidenceFresh:
      false,
    feeEvidenceExpiresAt:
      null,
    buyFee:
      null,
    sellFee:
      null,
    verifiedFeeMarkets:
      0,
    conservativeSideAwareFees:
      true,
    lastError:
      null,
    executionEligible:
      false,
    blocker:
      "QUANTITY_DEPTH_ORDER_RULE_AND_SIDE_AWARE_FEE_EVIDENCE_REQUIRED",
  };

  constructor(
    options:
      ZebPayAuthenticatedReadVerificationOptions = {},
  ) {
    this.api =
      options.api ??
      zebPayAccountApi;

    this.credentialsProvider =
      options.credentialsProvider ??
      zebPayCredentialsProvider;

    this.now =
      options.now ??
      (() => Date.now());

    this.scheduleTimers =
      options.scheduleTimers ??
      true;

    this.refreshIntervalMs =
      options.refreshIntervalMs ??
      ZEBPAY
        .AUTHENTICATED_READ_REFRESH_MS;

    this.feeRefreshIntervalMs =
      options.feeRefreshIntervalMs ??
      ZEBPAY
        .ACCOUNT_FEE_REFRESH_MS;

    this.feeTtlMs =
      options.feeTtlMs ??
      ZEBPAY
        .ACCOUNT_FEE_TTL_MS;

    this.feeMarketsProvider =
      options.feeMarketsProvider ??
      (() =>
        marketCache
          .getExecutableByExchange(
            ZEBPAY_EXCHANGE,
          )
          .map(
            (quote) =>
              quote.market,
          ));

    for (
      const [
        label,
        value,
      ]
      of [
        [
          "authenticated-read refresh",
          this.refreshIntervalMs,
        ],
        [
          "fee refresh",
          this.feeRefreshIntervalMs,
        ],
        [
          "fee TTL",
          this.feeTtlMs,
        ],
      ] as const
    ) {
      if (
        !Number.isSafeInteger(
          value,
        ) ||
        value <
          5_000
      ) {
        throw new Error(
          `ZebPay ${label} interval must be an integer of at least 5000 ms.`,
        );
      }
    }

    if (
      this.feeTtlMs <=
        this.feeRefreshIntervalMs
    ) {
      throw new Error(
        "ZebPay fee TTL must exceed its refresh interval.",
      );
    }
  }

  async verify():
    Promise<void> {
    if (
      this.verificationPromise
    ) {
      await this.verificationPromise;

      return;
    }

    const verificationPromise =
      this.verifyNow();

    this.verificationPromise =
      verificationPromise;

    try {
      await verificationPromise;
    } finally {
      if (
        this.verificationPromise ===
          verificationPromise
      ) {
        this.verificationPromise =
          null;
      }
    }
  }

  start():
    void {
    if (
      !this.scheduleTimers ||
      this.refreshTimer !==
        null
    ) {
      return;
    }

    this.refreshTimer =
      setInterval(
        () => {
          void this.verify()
            .catch(() => {
              /*
               * Sanitized failure evidence is retained by this service and
               * the shared verification registry. Do not log response bodies.
               */
            });
        },
        this.refreshIntervalMs,
      );

    this.refreshTimer.unref();
  }

  stop():
    void {
    if (
      this.refreshTimer ===
        null
    ) {
      return;
    }

    clearInterval(
      this.refreshTimer,
    );

    this.refreshTimer =
      null;
  }

  getReadiness():
    LiveExecutionAdapterReadiness {
    return executionAdapterVerificationService
      .getReadiness(
        ZEBPAY_EXCHANGE,
        this.credentialsProvider
          .isConfigured(),
      );
  }

  getDiagnostics():
    ZebPayAuthenticatedReadDiagnostics {
    const now =
      this.now();

    return {
      ...this.diagnostics,
      credentialsConfigured:
        this.credentialsProvider
          .isConfigured(),
      feeEvidenceFresh:
        this.diagnostics
          .feeEvidenceExpiresAt !==
          null &&
        now <=
          this.diagnostics
            .feeEvidenceExpiresAt,
      buyFee:
        this.diagnostics.buyFee
          ? {
              ...this.diagnostics
                .buyFee,
            }
          : null,
      sellFee:
        this.diagnostics.sellFee
          ? {
              ...this.diagnostics
                .sellFee,
            }
          : null,
    };
  }

  private async verifyNow():
    Promise<void> {
    const configured =
      this.credentialsProvider
        .isConfigured();

    this.diagnostics
      .credentialsConfigured =
      configured;

    if (!configured) {
      executionAdapterVerificationService
        .recordNotConfigured(
          ZEBPAY_EXCHANGE,
        );

      return;
    }

    const credentials =
      this.credentialsProvider
        .getCredentials();

    try {
      const balances =
        await this.api
          .getBalances(
            credentials,
          );

      const verifiedAt =
        this.now();

      this.diagnostics
        .balanceRows =
        balances.length;

      this.diagnostics
        .positiveBalanceRows =
        balances.filter(
          (balance) =>
            balance.totalBalance >
              0,
        ).length;

      this.diagnostics
        .lastBalanceReadAt =
        verifiedAt;

      this.diagnostics
        .lastError =
        null;

      executionAdapterVerificationService
        .recordSuccess(
          ZEBPAY_EXCHANGE,
          "SIGNED_BALANCE_READ",
          verifiedAt,
        );

      await this.refreshFeesIfDue(
        credentials,
        verifiedAt,
      );
    } catch (
      error:
        unknown
    ) {
      const sanitized =
        sensitiveDataRedactor
          .redactString(
            error instanceof Error
              ? error.message
              : "ZebPay authenticated read verification failed.",
          )
          .slice(
            0,
            500,
          );

      this.diagnostics
        .lastError =
        sanitized;

      executionAdapterVerificationService
        .recordFailure(
          ZEBPAY_EXCHANGE,
          "SIGNED_BALANCE_READ",
          sanitized,
          this.now(),
        );

      throw error;
    }
  }

  private async refreshFeesIfDue(
    credentials:
      ZebPayCredentials,
    now: number,
  ): Promise<void> {
    const feeMarkets = [
      ...new Set([
        ZEBPAY
          .REFERENCE_FEE_MARKET,
        ...this.feeMarketsProvider(),
      ].map(
        normalizeFeeMarket,
      )),
    ].slice(
      0,
      ZEBPAY.WEBSOCKET
        .MAXIMUM_ACTIVE_MARKETS,
    );

    const expiresAt =
      this.diagnostics
        .feeEvidenceExpiresAt;

    const requestedMarketsCovered =
      feeMarkets.every(
        (market) =>
          getExchangeFeeEvidence(
            ZEBPAY_EXCHANGE,
            market,
          ) !== null,
      );

    if (
      expiresAt !==
        null &&
      now <
        expiresAt -
          (
            this.feeTtlMs -
            this.feeRefreshIntervalMs
          ) &&
      requestedMarketsCovered
    ) {
      return;
    }

    try {
      const sideEvidence =
        await Promise.all(
          feeMarkets.map(
            async (market) => {
              const [
                buyFee,
                sellFee,
              ] = await Promise.all([
                this.api.getTradeFees(
                  market,
                  "buy",
                  credentials,
                ),
                this.api.getTradeFees(
                  market,
                  "sell",
                  credentials,
                ),
              ]);

              return {
                market,
                buyFee,
                sellFee,
              };
            },
          ),
        );

      const reference =
        sideEvidence.find(
          (item) =>
            item.market ===
            normalizeFeeMarket(
              ZEBPAY.REFERENCE_FEE_MARKET,
            ),
        );

      if (!reference) {
        throw new Error(
          "ZebPay reference side-aware fee evidence is missing.",
        );
      }

      const dynamicEvidence:
        ExchangeFeeEvidence[] =
        sideEvidence.map(
          (item) => ({
            exchange:
              ZEBPAY_EXCHANGE,
            market:
              item.market,
            /*
             * The shared hot path currently owns one rate per venue/market.
             * Use the worse authenticated BUY/SELL rate so either direction
             * can never understate fees. Exact side evidence remains below.
             */
            makerPercent:
              Math.max(
                item.buyFee
                  .effectiveMakerPercent,
                item.sellFee
                  .effectiveMakerPercent,
              ),
            takerPercent:
              Math.max(
                item.buyFee
                  .effectiveTakerPercent,
                item.sellFee
                  .effectiveTakerPercent,
              ),
            source:
              "ACCOUNT_API",
            synchronizedAt:
              now,
            expiresAt:
              now +
              this.feeTtlMs,
          }),
        );

      replaceExchangeMarketFeeEvidence(
        ZEBPAY_EXCHANGE,
        dynamicEvidence,
      );

      const buyFee =
        reference.buyFee;

      const sellFee =
        reference.sellFee;

      this.diagnostics
        .buyFee =
        {
          ...buyFee,
        };

      this.diagnostics
        .sellFee =
        {
          ...sellFee,
        };

      this.diagnostics
        .feeEvidenceExpiresAt =
        now +
        this.feeTtlMs;

      this.diagnostics
        .feeEvidenceFresh =
        true;

      this.diagnostics
        .verifiedFeeMarkets =
        dynamicEvidence.length;

      this.diagnostics
        .executionEligible =
        dynamicEvidence.length >
        0;

      this.diagnostics.blocker =
        this.diagnostics
          .executionEligible
          ? "NONE"
          : "QUANTITY_DEPTH_ORDER_RULE_AND_SIDE_AWARE_FEE_EVIDENCE_REQUIRED";
    } catch (
      error:
        unknown
    ) {
      this.diagnostics
        .feeEvidenceFresh =
        false;

      this.diagnostics
        .feeEvidenceExpiresAt =
        null;

      this.diagnostics
        .buyFee =
        null;

      this.diagnostics
        .sellFee =
        null;

      this.diagnostics
        .verifiedFeeMarkets =
        0;

      this.diagnostics
        .executionEligible =
        false;

      this.diagnostics.blocker =
        "QUANTITY_DEPTH_ORDER_RULE_AND_SIDE_AWARE_FEE_EVIDENCE_REQUIRED";

      /*
       * Balance authentication remains valid even if account fee evidence is
       * unavailable. ZebPay execution remains independently fail-closed.
       */
    }
  }
}

export const zebPayAuthenticatedReadVerificationService =
  new ZebPayAuthenticatedReadVerificationService();

function normalizeFeeMarket(
  market: string,
): string {
  const normalized =
    market
      .trim()
      .toUpperCase()
      .replace(
        /[^A-Z0-9]/gu,
        "",
      );

  for (const quote of [
    "USDT",
    "INR",
  ]) {
    if (
      normalized.endsWith(
        quote,
      ) &&
      normalized.length >
        quote.length
    ) {
      return `${normalized.slice(0, -quote.length)}-${quote}`;
    }
  }

  throw new Error(
    `Unsupported ZebPay fee market: ${market}.`,
  );
}
