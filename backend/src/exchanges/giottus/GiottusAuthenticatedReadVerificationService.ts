import {
  sensitiveDataRedactor,
} from "../../core/security/SensitiveDataRedactor";

import {
  executionAdapterVerificationService,
} from "../../execution/live/verification/ExecutionAdapterVerificationService";

import type {
  LiveExecutionAdapterReadiness,
} from "../../execution/live/contracts/LiveExecutionAdapter";

import {
  giottusAccountApi,
  type GiottusBalance,
} from "./api/GiottusAccountApi";

import {
  giottusCredentialsProvider,
  type GiottusCredentialSource,
  type GiottusCredentials,
} from "./api/GiottusCredentialsProvider";

import {
  GIOTTUS,
} from "./constants";

export interface GiottusAuthenticatedReadApi {
  getBalances(
    credentials:
      GiottusCredentials,
  ): Promise<GiottusBalance[]>;
}

export interface GiottusAuthenticatedReadDiagnostics {
  credentialsConfigured: boolean;

  balanceRows: number;

  positiveBalanceRows: number;

  lastBalanceReadAt:
    number | null;

  lastError:
    string | null;

  executionEligible: false;

  blocker:
    "MARKET_DATA_RULE_FEE_CLOCK_AND_ORDER_LIFECYCLE_REQUIRED";
}

export interface GiottusAuthenticatedReadVerificationOptions {
  api?:
    GiottusAuthenticatedReadApi;

  credentialsProvider?:
    GiottusCredentialSource;

  now?:
    () => number;

  scheduleTimers?:
    boolean;

  refreshIntervalMs?:
    number;
}

export class GiottusAuthenticatedReadVerificationService {
  private readonly api:
    GiottusAuthenticatedReadApi;

  private readonly credentialsProvider:
    GiottusCredentialSource;

  private readonly now:
    () => number;

  private readonly scheduleTimers:
    boolean;

  private readonly refreshIntervalMs:
    number;

  private refreshTimer:
    NodeJS.Timeout | null =
    null;

  private verificationPromise:
    Promise<void> | null =
    null;

  private readonly diagnostics:
    GiottusAuthenticatedReadDiagnostics = {
    credentialsConfigured:
      false,
    balanceRows:
      0,
    positiveBalanceRows:
      0,
    lastBalanceReadAt:
      null,
    lastError:
      null,
    executionEligible:
      false,
    blocker:
      "MARKET_DATA_RULE_FEE_CLOCK_AND_ORDER_LIFECYCLE_REQUIRED",
  };

  constructor(
    options:
      GiottusAuthenticatedReadVerificationOptions = {},
  ) {
    this.api =
      options.api ??
      giottusAccountApi;

    this.credentialsProvider =
      options.credentialsProvider ??
      giottusCredentialsProvider;

    this.now =
      options.now ??
      (() => Date.now());

    this.scheduleTimers =
      options.scheduleTimers ??
      true;

    this.refreshIntervalMs =
      options.refreshIntervalMs ??
      GIOTTUS.AUTHENTICATED_READ_REFRESH_MS;

    if (
      !Number.isSafeInteger(
        this.refreshIntervalMs,
      ) ||
      this.refreshIntervalMs < 5_000
    ) {
      throw new Error(
        "Giottus authenticated-read refresh interval must be an integer of at least 5000 ms.",
      );
    }
  }

  async verify():
    Promise<void> {
    if (this.verificationPromise) {
      await this.verificationPromise;

      return;
    }

    const promise =
      this.verifyNow();

    this.verificationPromise =
      promise;

    try {
      await promise;
    } finally {
      if (
        this.verificationPromise ===
        promise
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
      this.refreshTimer !== null
    ) {
      return;
    }

    this.refreshTimer =
      setInterval(
        () => {
          void this.verify()
            .catch(() => {
              // Sanitized failure evidence is retained; never log payloads.
            });
        },
        this.refreshIntervalMs,
      );

    this.refreshTimer.unref();
  }

  stop():
    void {
    if (this.refreshTimer === null) {
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
        GIOTTUS.NAME,
        this.credentialsProvider
          .isConfigured(),
      );
  }

  getDiagnostics():
    GiottusAuthenticatedReadDiagnostics {
    return {
      ...this.diagnostics,
      credentialsConfigured:
        this.credentialsProvider
          .isConfigured(),
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
          GIOTTUS.NAME,
        );

      return;
    }

    try {
      const balances =
        await this.api
          .getBalances(
            this.credentialsProvider
              .getCredentials(),
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
            balance.totalBalance > 0,
        ).length;

      this.diagnostics
        .lastBalanceReadAt =
        verifiedAt;

      this.diagnostics
        .lastError =
        null;

      executionAdapterVerificationService
        .recordSuccess(
          GIOTTUS.NAME,
          "SIGNED_BALANCE_READ",
          verifiedAt,
        );
    } catch (error: unknown) {
      const sanitized =
        sensitiveDataRedactor
          .redactString(
            error instanceof Error
              ? error.message
              : "Giottus authenticated read verification failed.",
          )
          .slice(0, 500);

      this.diagnostics
        .lastError =
        sanitized;

      executionAdapterVerificationService
        .recordFailure(
          GIOTTUS.NAME,
          "SIGNED_BALANCE_READ",
          sanitized,
          this.now(),
        );

      throw error;
    }
  }
}

export const giottusAuthenticatedReadVerificationService =
  new GiottusAuthenticatedReadVerificationService();
