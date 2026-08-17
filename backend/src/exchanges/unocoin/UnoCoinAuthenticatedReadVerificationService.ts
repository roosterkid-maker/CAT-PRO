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

  transientRetryDelayMs?: number;
}

const UNOCOIN_EXCHANGE =
  "unocoin";

const VERIFICATION_METHOD =
  "TOKEN_ACCOUNT_STATUS_READ" as const;

/*
 * Central authenticated-read evidence currently
 * expires after 30 seconds.
 *
 * UnoCoin has demonstrated intermittent timeout /
 * HTTP 5xx behaviour under concurrent REST load.
 *
 * 10 seconds gives us multiple independent chances
 * to refresh genuine authenticated evidence before
 * that 30-second evidence naturally expires.
 */
const DEFAULT_REFRESH_INTERVAL_MS =
  10_000;

/*
 * One short retry is permitted for transient
 * transport/server failures.
 *
 * It does NOT refresh verification evidence unless
 * a real authenticated request succeeds.
 */
const DEFAULT_TRANSIENT_RETRY_DELAY_MS =
  1_500;

export class UnoCoinAuthenticatedReadVerificationService {
  private readonly api:
    UnoCoinAuthenticatedReadApi;

  private readonly credentialsProvider:
    UnoCoinCredentialSource;

  private readonly scheduleTimers:
    boolean;

  private readonly refreshIntervalMs:
    number;

  private readonly transientRetryDelayMs:
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

    this.transientRetryDelayMs =
      options.transientRetryDelayMs ??
      DEFAULT_TRANSIENT_RETRY_DELAY_MS;

    if (
      !Number.isSafeInteger(
        this.refreshIntervalMs,
      ) ||
      this.refreshIntervalMs <
        5_000
    ) {
      throw new Error(
        "UnoCoin authenticated-read refresh interval must be an integer of at least 5000 ms.",
      );
    }

    if (
      !Number.isSafeInteger(
        this.transientRetryDelayMs,
      ) ||
      this.transientRetryDelayMs <
        250
    ) {
      throw new Error(
        "UnoCoin authenticated-read transient retry delay must be an integer of at least 250 ms.",
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
      this.verifyWithTransientRetry();

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
               * Do not log raw authenticated response bodies,
               * authorization headers, or API tokens here.
               *
               * Permanent authentication failures are already
               * retained in sanitized central verification
               * evidence.
               *
               * Transient failures deliberately do not erase a
               * still-fresh previous success. If genuine reads
               * continue failing, that previous evidence will
               * naturally expire and readiness will become
               * VERIFICATION_STALE.
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

  private async verifyWithTransientRetry():
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
      await this.performAuthenticatedRead();

      return;
    } catch (
      firstError:
        unknown
    ) {
      if (
        this.isPermanentAuthenticationFailure(
          firstError,
        )
      ) {
        this.recordPermanentFailure(
          firstError,
        );

        throw firstError;
      }

      /*
       * A timeout, rate limit, HTTP 5xx, aborted
       * request, or similar infrastructure failure
       * receives one bounded retry.
       *
       * Crucially, we do NOT mark authentication
       * invalid before this retry.
       */
      await this.delay(
        this.transientRetryDelayMs,
      );

      try {
        await this.performAuthenticatedRead();

        return;
      } catch (
        secondError:
          unknown
      ) {
        if (
          this.isPermanentAuthenticationFailure(
            secondError,
          )
        ) {
          this.recordPermanentFailure(
            secondError,
          );

          throw secondError;
        }

        /*
         * Both attempts failed transiently.
         *
         * Do NOT call recordSuccess().
         * Do NOT extend the old verification TTL.
         * Do NOT call recordFailure() either, because
         * that would immediately erase otherwise
         * still-fresh genuine authentication evidence.
         *
         * The central 30-second TTL remains authoritative.
         * Continued failures therefore still fail closed
         * once the last real successful read becomes stale.
         */
        throw secondError;
      }
    }
  }

  private async performAuthenticatedRead():
    Promise<void> {
    await this.api
      .verifyAccountStatus(
        this.credentialsProvider
          .getCredentials(),
      );

    executionAdapterVerificationService
      .recordSuccess(
        UNOCOIN_EXCHANGE,
        VERIFICATION_METHOD,
      );
  }

  private recordPermanentFailure(
    error:
      unknown,
  ): void {
    executionAdapterVerificationService
      .recordFailure(
        UNOCOIN_EXCHANGE,
        VERIFICATION_METHOD,
        error,
      );
  }

  private isPermanentAuthenticationFailure(
    error:
      unknown,
  ): boolean {
    const message =
      error instanceof Error
        ? error.message
            .trim()
            .toLowerCase()
        : String(
            error ?? "",
          )
            .trim()
            .toLowerCase();

    if (!message) {
      return false;
    }

    /*
     * Explicit HTTP authentication / authorization
     * rejection must fail closed immediately.
     */
    if (
      message.includes(
        "http 401",
      ) ||
      message.includes(
        "http 403",
      )
    ) {
      return true;
    }

    /*
     * Missing/invalid local token configuration is
     * also not a transient network condition.
     */
    if (
      message.includes(
        "api token is required",
      ) ||
      message.includes(
        "api token is missing",
      ) ||
      message.includes(
        "invalid token",
      ) ||
      message.includes(
        "unauthorized",
      ) ||
      message.includes(
        "forbidden",
      ) ||
      message.includes(
        "authentication failed",
      ) ||
      message.includes(
        "invalid credential",
      )
    ) {
      return true;
    }

    return false;
  }

  private delay(
    milliseconds:
      number,
  ): Promise<void> {
    return new Promise(
      (
        resolve,
      ) => {
        const timer =
          setTimeout(
            resolve,
            milliseconds,
          );

        timer.unref();
      },
    );
  }
}

export const unoCoinAuthenticatedReadVerificationService =
  new UnoCoinAuthenticatedReadVerificationService();
