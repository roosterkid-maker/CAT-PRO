import {
  API_BASE_URL,
} from "../../../config/runtimeUrls";

export type ExecutionHealthStatus =
  | "HEALTHY"
  | "DEGRADED"
  | "UNHEALTHY"
  | "NO_DATA";

export type LiveExecutionAdapterVerificationState =
  | "NOT_CONFIGURED"
  | "CONFIGURED_UNVERIFIED"
  | "VERIFICATION_STALE"
  | "VERIFIED";

export type LiveExecutionAdapterVerificationMethod =
  | "SIGNED_BALANCE_READ";

export interface ExchangeExecutionMetrics {
  exchange: string;

  totalExecutions: number;

  filledExecutions: number;

  cancelledExecutions: number;

  timedOutExecutions: number;

  rejectedExecutions: number;

  failedExecutions: number;

  partialFillExecutions: number;

  totalRequestedQuantity: number;

  totalFilledQuantity: number;

  totalExecutionTimeMs: number;

  averageExecutionTimeMs: number;

  fastestExecutionTimeMs:
    | number
    | null;

  slowestExecutionTimeMs:
    | number
    | null;

  fillRatePercent: number;

  cancellationRatePercent: number;

  timeoutRatePercent: number;

  failureRatePercent: number;

  lastExecutionAt:
    | number
    | null;
}

export interface ExecutionMetricsReport {
  timestamp: number;

  totalExecutions: number;

  exchanges:
    ExchangeExecutionMetrics[];
}

export interface ExchangeExecutionHealth {
  exchange: string;

  adapterRegistered: boolean;

  credentialsConfigured: boolean;

  authenticationVerified: boolean;

  exchangeApiReachable: boolean;

  verificationState:
    LiveExecutionAdapterVerificationState;

  readOnlyVerificationFresh:
    boolean;

  lastVerifiedAt:
    | number
    | null;

  lastVerificationAttemptAt:
    | number
    | null;

  verificationExpiresAt:
    | number
    | null;

  verificationMethod:
    | LiveExecutionAdapterVerificationMethod
    | null;

  lastVerificationError:
    | string
    | null;

  liveExecutionEnabled:
    false;

  adapterConnected: boolean;

  executionEvidenceAvailable:
    boolean;

  status:
    ExecutionHealthStatus;

  totalExecutions: number;

  fillRatePercent: number;

  cancellationRatePercent: number;

  timeoutRatePercent: number;

  failureRatePercent: number;

  averageExecutionTimeMs: number;

  lastExecutionAt:
    | number
    | null;

  reasons: string[];
}

export interface ExecutionHealthReport {
  timestamp: number;

  status:
    ExecutionHealthStatus;

  totalExecutions: number;

  healthyExchanges: number;

  degradedExchanges: number;

  unhealthyExchanges: number;

  exchanges:
    ExchangeExecutionHealth[];

  reasons: string[];
}

async function requestJson<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const response =
    await fetch(
      `${API_BASE_URL}${path}`,
      {
        method:
          "GET",

        headers: {
          Accept:
            "application/json",
        },

        signal,
      },
    );

  const responseText =
    await response.text();

  let responseData:
    unknown = null;

  if (responseText) {
    try {
      responseData =
        JSON.parse(
          responseText,
        );
    } catch {
      throw new Error(
        `Execution monitoring API returned invalid JSON for ${path}.`,
      );
    }
  }

  /*
   * Execution health intentionally returns HTTP 503
   * when status is UNHEALTHY. The report is still valid
   * dashboard data and should be returned to the UI.
   */
  if (
    path ===
      "/api/execution/health" &&
    response.status ===
      503 &&
    isExecutionHealthReport(
      responseData,
    )
  ) {
    return responseData as T;
  }

  if (!response.ok) {
    throw new Error(
      getApiErrorMessage(
        responseData,
        response.status,
        path,
      ),
    );
  }

  return responseData as T;
}

export async function fetchExecutionMetrics(
  signal?: AbortSignal,
): Promise<ExecutionMetricsReport> {
  const report =
    await requestJson<
      ExecutionMetricsReport
    >(
      "/api/execution/metrics",
      signal,
    );

  if (
    !isExecutionMetricsReport(
      report,
    )
  ) {
    throw new Error(
      "Execution metrics API returned an invalid response.",
    );
  }

  return report;
}

export async function fetchExecutionHealth(
  signal?: AbortSignal,
): Promise<ExecutionHealthReport> {
  const report =
    await requestJson<
      ExecutionHealthReport
    >(
      "/api/execution/health",
      signal,
    );

  if (
    !isExecutionHealthReport(
      report,
    )
  ) {
    throw new Error(
      "Execution health API returned an invalid response.",
    );
  }

  return report;
}

function isExecutionMetricsReport(
  value: unknown,
): value is ExecutionMetricsReport {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.timestamp ===
      "number" &&
    typeof value.totalExecutions ===
      "number" &&
    Array.isArray(
      value.exchanges,
    )
  );
}

function isExecutionHealthReport(
  value: unknown,
): value is ExecutionHealthReport {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.timestamp ===
      "number" &&
    isHealthStatus(
      value.status,
    ) &&
    typeof value.totalExecutions ===
      "number" &&
    typeof value.healthyExchanges ===
      "number" &&
    typeof value.degradedExchanges ===
      "number" &&
    typeof value.unhealthyExchanges ===
      "number" &&
    Array.isArray(
      value.exchanges,
    ) &&
    Array.isArray(
      value.reasons,
    )
  );
}

function isHealthStatus(
  value: unknown,
): value is ExecutionHealthStatus {
  return (
    value === "HEALTHY" ||
    value === "DEGRADED" ||
    value === "UNHEALTHY" ||
    value === "NO_DATA"
  );
}

function getApiErrorMessage(
  responseData: unknown,
  status: number,
  path: string,
): string {
  if (isRecord(responseData)) {
    const message =
      toOptionalString(
        responseData.message,
      ) ??
      toOptionalString(
        responseData.error,
      );

    if (message) {
      return message;
    }
  }

  return `Execution monitoring request failed: ${path} returned HTTP ${status}.`;
}

function toOptionalString(
  value: unknown,
): string | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const normalized =
    value.trim();

  return normalized
    ? normalized
    : null;
}

function isRecord(
  value: unknown,
): value is Record<
  string,
  unknown
> {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}
