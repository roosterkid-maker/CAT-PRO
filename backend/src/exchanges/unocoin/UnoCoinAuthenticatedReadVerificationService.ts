import {
  executionAdapterVerificationService,
} from "../../execution/live/verification/ExecutionAdapterVerificationService";

import {
  unoCoinCredentialsProvider,
  type UnoCoinCredentialSource,
} from "./api/UnoCoinCredentialsProvider";

import {
  unoCoinReadOnlyHttpClient,
} from "./api/UnoCoinReadOnlyHttpClient";

export interface UnoCoinAuthenticatedReadApi {
  verifyAccountStatus(
    credentials:
      ReturnType<
        UnoCoinCredentialSource["getCredentials"]
      >,
  ): Promise<void>;
}

export interface UnoCoinAuthenticatedReadVerificationOptions {
  api?:
    UnoCoinAuthenticatedReadApi;

  credentialsProvider?:
    UnoCoinCredentialSource;

  scheduleTimers?: boolean;

  refreshIntervalMs?: number;
}

const UNOCOIN_EXCHANGE =
  "unocoin";

const DEFAULT_REFRESH_INTERVAL_MS =
  20_000;

export class UnoCoinAuthenticatedReadVerificationService {
  private readonly api:
    UnoCoinAuthenticatedReadApi;

  private readonly credentialsProvider:
    UnoCoinCredentialSource;

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

  constructor(
    options:
      UnoCoinAuthenticatedReadVerificationOptions = {},
  ) {
    this.api =
      options.api ??
      unoCoinReadOnlyHttpClient;

    this.credentialsProvider =
      options.credentialsProvider ??
      unoCoinCredentialsProvider;

    this.scheduleTimers =
      options.scheduleTimers ??
      true;

    this.refreshIntervalMs =
      options.refreshIntervalMs ??
      DEFAULT_REFRESH_INTERVAL_MS;

    if (
      !Number.isSafeInteger(
        this.refreshIntervalMs,
      ) ||
      this.refreshIntervalMs < 5_000
    ) {
      throw new Error(
        "UnoCoin authenticated-read refresh interval must be an integer of at least 5000 ms.",
      );
    }
  }

  async verify():
    Promise<void> {
    if (this.verificationPromise) {
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

  start(): void {
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
               * Failure evidence is already sanitized and
               * retained by the verification service. Avoid
               * logging private API response bodies.
               */
            });
        },
        this.refreshIntervalMs,
      );

    this.refreshTimer.unref();
  }

  stop(): void {
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

  private async verifyNow():
    Promise<void> {
    if (
      !this.credentialsProvider
        .isConfigured()
    ) {
      executionAdapterVerificationService
        .recordNotConfigured(
          UNOCOIN_EXCHANGE,
        );

      return;
    }

    try {
      await this.api
        .verifyAccountStatus(
          this.credentialsProvider
            .getCredentials(),
        );

      executionAdapterVerificationService
        .recordSuccess(
          UNOCOIN_EXCHANGE,
          "TOKEN_ACCOUNT_STATUS_READ",
        );
    } catch (
      error:
        unknown
    ) {
      executionAdapterVerificationService
        .recordFailure(
          UNOCOIN_EXCHANGE,
          "TOKEN_ACCOUNT_STATUS_READ",
          error,
        );

      throw error;
    }
  }
}

export const unoCoinAuthenticatedReadVerificationService =
  new UnoCoinAuthenticatedReadVerificationService();
