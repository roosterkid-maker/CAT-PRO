import type {
  ExchangeApiFailureCategory,
  ExchangeApiFailureClassification,
} from "./ExchangeApiFailure";

export class ExchangeApiFailureClassifier {
  classify(
    error:
      unknown,
  ): ExchangeApiFailureClassification {
    const message =
      error instanceof Error
        ? error.message
        : String(
            error,
          );

    const normalized =
      message.toLowerCase();

    const statusCode =
      this.extractStatusCode(
        message,
      );

    const exchangeCode =
      this.extractExchangeCode(
        message,
      );

    let category:
      ExchangeApiFailureCategory =
      "UNKNOWN";

    if (
      statusCode ===
        429 ||
      statusCode ===
        418 ||
      exchangeCode ===
        "-1003" ||
      normalized.includes(
        "rate limit",
      ) ||
      normalized.includes(
        "too many requests",
      )
    ) {
      category =
        "RATE_LIMIT";
    } else if (
      normalized.includes(
        "timeout",
      ) ||
      normalized.includes(
        "timed out",
      ) ||
      normalized.includes(
        "econnaborted",
      ) ||
      normalized.includes(
        "etimedout",
      )
    ) {
      category =
        "TIMEOUT";
    } else if (
      normalized.includes(
        "econnreset",
      ) ||
      normalized.includes(
        "enotfound",
      ) ||
      normalized.includes(
        "eai_again",
      ) ||
      normalized.includes(
        "socket hang up",
      ) ||
      normalized.includes(
        "network error",
      ) ||
      normalized.includes(
        "connection refused",
      )
    ) {
      category =
        "NETWORK";
    } else if (
      statusCode !==
        null &&
      statusCode >=
        500 &&
      statusCode <=
        599
    ) {
      category =
        "SERVER_ERROR";
    } else if (
      exchangeCode ===
        "-1021" ||
      (
        normalized.includes(
          "timestamp",
        ) &&
        (
          normalized.includes(
            "recvwindow",
          ) ||
          normalized.includes(
            "ahead of the server",
          ) ||
          normalized.includes(
            "outside of",
          )
        )
      )
    ) {
      category =
        "TIMESTAMP_SYNC";
    } else if (
      statusCode ===
        401 ||
      statusCode ===
        403 ||
      exchangeCode ===
        "-2014" ||
      exchangeCode ===
        "-2015" ||
      normalized.includes(
        "invalid api-key",
      ) ||
      normalized.includes(
        "invalid api key",
      ) ||
      normalized.includes(
        "authentication",
      ) ||
      (
        normalized.includes(
          "signature",
        ) &&
        normalized.includes(
          "invalid",
        )
      )
    ) {
      category =
        "AUTHENTICATION";
    } else if (
      statusCode ===
        404 ||
      exchangeCode ===
        "-2013" ||
      normalized.includes(
        "order does not exist",
      ) ||
      normalized.includes(
        "order not found",
      )
    ) {
      category =
        "NOT_FOUND";
    } else if (
      statusCode ===
        400 ||
      statusCode ===
        422 ||
      exchangeCode ===
        "-1100" ||
      exchangeCode ===
        "-1101" ||
      exchangeCode ===
        "-1102" ||
      normalized.includes(
        "invalid request",
      ) ||
      normalized.includes(
        "mandatory parameter",
      ) ||
      normalized.includes(
        "bad request",
      )
    ) {
      category =
        "INVALID_REQUEST";
    } else if (
      statusCode !==
        null &&
      statusCode >=
        400 &&
      statusCode <=
        499
    ) {
      category =
        "EXCHANGE_REJECTED";
    }

    return {
      category,

      retryableForSafeRead:
        this.isRetryable(
          category,
        ),

      statusCode,

      exchangeCode,

      message,
    };
  }

  private isRetryable(
    category:
      ExchangeApiFailureCategory,
  ): boolean {
    return (
      category ===
        "RATE_LIMIT" ||
      category ===
        "TIMEOUT" ||
      category ===
        "NETWORK" ||
      category ===
        "SERVER_ERROR" ||
      category ===
        "TIMESTAMP_SYNC"
    );
  }

  private extractStatusCode(
    message:
      string,
  ): number | null {
    const match =
      message.match(
        /status=(\d{3})/i,
      );

    if (
      !match
    ) {
      return null;
    }

    const value =
      Number(
        match[1],
      );

    return Number.isInteger(
      value,
    )
      ? value
      : null;
  }

  private extractExchangeCode(
    message:
      string,
  ): string | null {
    const match =
      message.match(
        /code=(-?\d+)/i,
      );

    return match?.[1] ??
      null;
  }
}

export const exchangeApiFailureClassifier =
  new ExchangeApiFailureClassifier();