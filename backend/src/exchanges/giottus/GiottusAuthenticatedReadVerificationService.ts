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
  type GiottusBalance,
  type GiottusOpenOrder,
} from "./api/GiottusAccountApi";

import {
  giottusCredentialsProvider,
  type GiottusCredentialSource,
  type GiottusCredentials,
} from "./api/GiottusCredentialsProvider";

import {
  GIOTTUS,
} from "./constants";

import {
  giottusAuthenticatedBalanceReadCoordinator,
  type GiottusAuthenticatedBalanceReadDiagnostics,
  type GiottusAuthenticatedBalanceReader,
} from "./GiottusAuthenticatedBalanceReadCoordinator";

import {
  GiottusPrivateRateLimitError,
} from "./api/GiottusPrivateRequestGovernor";

export interface GiottusAuthenticatedReadApi {
  getBalances(
    credentials:
      GiottusCredentials,
  ): Promise<GiottusBalance[]>;

  getOpenOrders(
    credentials: GiottusCredentials,
  ): Promise<GiottusOpenOrder[]>;
}

export interface GiottusAuthenticatedReadDiagnostics {
  credentialsConfigured: boolean;

  balanceRows: number;

  positiveBalanceRows: number;

  openOrderRows: number;

  partiallyFilledOpenOrders: number;

  lastBalanceReadAt:
    number | null;

  lastError:
    string | null;

  balanceRead:
    GiottusAuthenticatedBalanceReadDiagnostics | null;

  executionEligible: false;

  blocker:
    "RULE_FEE_CLOCK_AND_DETERMINISTIC_ORDER_SUBMISSION_REQUIRED";
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

  balanceReader?:
    GiottusAuthenticatedBalanceReader;
}

export class GiottusAuthenticatedReadVerificationService {
  private readonly credentialsProvider:
    GiottusCredentialSource;

  private readonly balanceReader:
    GiottusAuthenticatedBalanceReader;

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
    openOrderRows:
      0,
    partiallyFilledOpenOrders:
      0,
    lastBalanceReadAt:
      null,
    lastError:
      null,
    balanceRead:
      null,
    executionEligible:
      false,
    blocker:
      "RULE_FEE_CLOCK_AND_DETERMINISTIC_ORDER_SUBMISSION_REQUIRED",
  };

  constructor(
    options:
      GiottusAuthenticatedReadVerificationOptions = {},
  ) {
    this.credentialsProvider =
      options.credentialsProvider ??
      giottusCredentialsProvider;

    this.now =
      options.now ??
      (() => Date.now());

    this.balanceReader =
      options.balanceReader ??
      (
        options.api
          ? {
              readBalances:
                async (
                  credentials,
                ) => ({
                  balances:
                    await options.api!
                      .getBalances(
                        credentials,
                      ),
                  observedAt:
                    this.now(),
                  source:
                    "REMOTE" as const,
                }),
            }
          : giottusAuthenticatedBalanceReadCoordinator
      );

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
      balanceRead:
        this.balanceReader
          .getDiagnostics?.() ??
        null,
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
      const credentials =
        this.credentialsProvider
          .getCredentials();

      const balanceEvidence =
        await this.balanceReader
          .readBalances(
            credentials,
          );

      const balances =
        balanceEvidence
          .balances;

      const verifiedAt =
        balanceEvidence
          .observedAt;

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

      if (
        error instanceof
          GiottusPrivateRateLimitError
      ) {
        executionAdapterVerificationService
          .recordTransientFailure(
            GIOTTUS.NAME,
            "SIGNED_BALANCE_READ",
            sanitized,
            this.now(),
          );
      } else {
        executionAdapterVerificationService
          .recordFailure(
            GIOTTUS.NAME,
            "SIGNED_BALANCE_READ",
            sanitized,
            this.now(),
          );
      }

      throw error;
    }
  }
}

export const giottusAuthenticatedReadVerificationService =
  new GiottusAuthenticatedReadVerificationService();
