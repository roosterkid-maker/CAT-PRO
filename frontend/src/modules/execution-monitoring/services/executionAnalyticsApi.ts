import {
  API_BASE_URL,
} from "../../../config/runtimeUrls";

export interface ExecutionMetricsSnapshot {
  timestamp: number;

  totalExecutions: number;

  averageExecutionTimeMs: number;

  fillRatePercent: number;

  timeoutRatePercent: number;

  failureRatePercent: number;
}

export interface ExecutionAnalyticsReport {
  timestamp: number;

  snapshots:
    ExecutionMetricsSnapshot[];
}

export async function fetchExecutionAnalytics(
  limit = 60,
  signal?: AbortSignal,
): Promise<ExecutionAnalyticsReport> {
  const normalizedLimit =
    normalizeLimit(
      limit,
    );

  const response =
    await fetch(
      `${API_BASE_URL}/api/execution/analytics?limit=${normalizedLimit}`,
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
        "Execution analytics API returned invalid JSON.",
      );
    }
  }

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        responseData,
        response.status,
      ),
    );
  }

  if (
    !isExecutionAnalyticsReport(
      responseData,
    )
  ) {
    throw new Error(
      "Execution analytics API returned an invalid response.",
    );
  }

  return {
    timestamp:
      responseData.timestamp,

    snapshots:
      responseData.snapshots
        .filter(
          isExecutionMetricsSnapshot,
        )
        .sort(
          (
            first,
            second,
          ) =>
            first.timestamp -
            second.timestamp,
        ),
  };
}

function normalizeLimit(
  limit: number,
): number {
  if (
    !Number.isFinite(limit)
  ) {
    return 60;
  }

  return Math.max(
    1,
    Math.min(
      Math.floor(limit),
      720,
    ),
  );
}

function isExecutionAnalyticsReport(
  value: unknown,
): value is ExecutionAnalyticsReport {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isFiniteNumber(
      value.timestamp,
    ) &&
    Array.isArray(
      value.snapshots,
    )
  );
}

function isExecutionMetricsSnapshot(
  value: unknown,
): value is ExecutionMetricsSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isFiniteNumber(
      value.timestamp,
    ) &&
    isFiniteNumber(
      value.totalExecutions,
    ) &&
    isFiniteNumber(
      value.averageExecutionTimeMs,
    ) &&
    isFiniteNumber(
      value.fillRatePercent,
    ) &&
    isFiniteNumber(
      value.timeoutRatePercent,
    ) &&
    isFiniteNumber(
      value.failureRatePercent,
    )
  );
}

function getErrorMessage(
  value: unknown,
  status: number,
): string {
  if (isRecord(value)) {
    const message =
      toOptionalString(
        value.message,
      ) ??
      toOptionalString(
        value.error,
      );

    if (message) {
      return message;
    }
  }

  return `Execution analytics request failed with HTTP ${status}.`;
}

function isFiniteNumber(
  value: unknown,
): value is number {
  return (
    typeof value ===
      "number" &&
    Number.isFinite(value)
  );
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
