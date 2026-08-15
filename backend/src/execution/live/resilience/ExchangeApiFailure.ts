export type ExchangeApiFailureCategory =
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "NETWORK"
  | "SERVER_ERROR"
  | "AUTHENTICATION"
  | "TIMESTAMP_SYNC"
  | "NOT_FOUND"
  | "INVALID_REQUEST"
  | "EXCHANGE_REJECTED"
  | "UNKNOWN";

export interface ExchangeApiFailureClassification {
  category:
    ExchangeApiFailureCategory;

  retryableForSafeRead:
    boolean;

  statusCode:
    number | null;

  exchangeCode:
    string | null;

  message:
    string;
}

export interface SafeReadRetryDiagnostics {
  generatedAt:
    number;

  policy: {
    maximumAttempts:
      number;

    baseDelayMs:
      number;

    maximumDelayMs:
      number;

    orderSubmissionRetryAllowed:
      false;

    orderCancellationRetryAllowed:
      false;

    safeReadRetryAllowed:
      true;
  };

  totalOperations:
    number;

  totalAttempts:
    number;

  retries:
    number;

  succeededFirstAttempt:
    number;

  succeededAfterRetry:
    number;

  failedOperations:
    number;

  failuresByCategory:
    Record<
      ExchangeApiFailureCategory,
      number
    >;

  lastFailure: {
    exchange:
      string;

    operation:
      string;

    category:
      ExchangeApiFailureCategory;

    message:
      string;

    at:
      number;
  } | null;
}