import type {
  ExchangeApiFailureCategory,
  SafeReadRetryDiagnostics,
} from "./ExchangeApiFailure";

import {
  exchangeApiFailureClassifier,
} from "./ExchangeApiFailureClassifier";

const DEFAULT_MAXIMUM_ATTEMPTS =
  3;

const DEFAULT_BASE_DELAY_MS =
  250;

const DEFAULT_MAXIMUM_DELAY_MS =
  2_000;

export interface SafeExchangeReadRequest<T> {
  exchange:
    string;

  operation:
    string;

  run:
    () => Promise<T>;
}

export class SafeExchangeReadExecutor {
  private totalOperations =
    0;

  private totalAttempts =
    0;

  private retries =
    0;

  private succeededFirstAttempt =
    0;

  private succeededAfterRetry =
    0;

  private failedOperations =
    0;

  private readonly failuresByCategory:
    Record<
      ExchangeApiFailureCategory,
      number
    > = {
    RATE_LIMIT:
      0,

    TIMEOUT:
      0,

    NETWORK:
      0,

    SERVER_ERROR:
      0,

    AUTHENTICATION:
      0,

    TIMESTAMP_SYNC:
      0,

    NOT_FOUND:
      0,

    INVALID_REQUEST:
      0,

    EXCHANGE_REJECTED:
      0,

    UNKNOWN:
      0,
  };

  private lastFailure:
    SafeReadRetryDiagnostics["lastFailure"] =
    null;

  async execute<T>(
    request:
      SafeExchangeReadRequest<T>,
  ): Promise<T> {
    this.totalOperations +=
      1;

    let lastError:
      unknown =
      new Error(
        "Safe exchange read failed without an attempt.",
      );

    for (
      let attempt =
        1;

      attempt <=
      DEFAULT_MAXIMUM_ATTEMPTS;

      attempt +=
        1
    ) {
      this.totalAttempts +=
        1;

      try {
        const result =
          await request.run();

        if (
          attempt ===
          1
        ) {
          this.succeededFirstAttempt +=
            1;
        } else {
          this.succeededAfterRetry +=
            1;
        }

        return result;
      } catch (
        error:
          unknown
      ) {
        lastError =
          error;

        const classification =
          exchangeApiFailureClassifier
            .classify(
              error,
            );

        this.failuresByCategory[
          classification.category
        ] += 1;

        this.lastFailure = {
          exchange:
            request.exchange
              .trim()
              .toLowerCase(),

          operation:
            request.operation,

          category:
            classification.category,

          message:
            classification.message,

          at:
            Date.now(),
        };

        const retry =
          classification
            .retryableForSafeRead &&
          attempt <
            DEFAULT_MAXIMUM_ATTEMPTS;

        if (
          !retry
        ) {
          this.failedOperations +=
            1;

          throw error;
        }

        this.retries +=
          1;

        await this.sleep(
          this.delayForAttempt(
            attempt,
          ),
        );
      }
    }

    this.failedOperations +=
      1;

    throw lastError;
  }

  getDiagnostics():
    SafeReadRetryDiagnostics {
    return {
      generatedAt:
        Date.now(),

      policy: {
        maximumAttempts:
          DEFAULT_MAXIMUM_ATTEMPTS,

        baseDelayMs:
          DEFAULT_BASE_DELAY_MS,

        maximumDelayMs:
          DEFAULT_MAXIMUM_DELAY_MS,

        /*
         * CRITICAL:
         *
         * Mutating exchange operations never
         * use this retry policy.
         */
        orderSubmissionRetryAllowed:
          false,

        orderCancellationRetryAllowed:
          false,

        safeReadRetryAllowed:
          true,
      },

      totalOperations:
        this.totalOperations,

      totalAttempts:
        this.totalAttempts,

      retries:
        this.retries,

      succeededFirstAttempt:
        this.succeededFirstAttempt,

      succeededAfterRetry:
        this.succeededAfterRetry,

      failedOperations:
        this.failedOperations,

      failuresByCategory: {
        ...this.failuresByCategory,
      },

      lastFailure:
        this.lastFailure
          ? {
              ...this.lastFailure,
            }
          : null,
    };
  }

  private delayForAttempt(
    attempt:
      number,
  ): number {
    return Math.min(
      DEFAULT_MAXIMUM_DELAY_MS,

      DEFAULT_BASE_DELAY_MS *
        2 **
          Math.max(
            0,
            attempt -
              1,
          ),
    );
  }

  private async sleep(
    ms:
      number,
  ): Promise<void> {
    await new Promise<void>(
      (
        resolve,
      ) =>
        setTimeout(
          resolve,
          ms,
        ),
    );
  }
}

export const safeExchangeReadExecutor =
  new SafeExchangeReadExecutor();