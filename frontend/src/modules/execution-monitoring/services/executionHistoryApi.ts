import {
  API_BASE_URL,
} from "../../../config/runtimeUrls";

export type ExecutionHistoryStatus =
  | "PENDING"
  | "OPEN"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELLED"
  | "TIMED_OUT"
  | "REJECTED"
  | "FAILED"
  | "UNKNOWN";

export interface ExecutionHistoryItem {
  id: string;

  timestamp: number;

  event: string;

  exchange: string;

  market: string;

  side:
    | "buy"
    | "sell"
    | "unknown";

  orderId:
    | string
    | null;

  clientOrderId:
    | string
    | null;

  status:
    ExecutionHistoryStatus;

  requestedQuantity: number;

  filledQuantity: number;

  remainingQuantity: number;

  requestedPrice:
    | number
    | null;

  averageFillPrice: number;

  feeAmount: number;

  executionTimeMs: number;

  cancelled: boolean;

  timedOut: boolean;

  success: boolean;

  failureReason:
    | string
    | null;

  message:
    | string
    | null;
}

export interface ExecutionHistoryReport {
  timestamp: number;

  total: number;

  executions:
    ExecutionHistoryItem[];
}

export async function fetchRecentExecutions(
  limit = 20,
  signal?: AbortSignal,
): Promise<ExecutionHistoryReport> {
  const normalizedLimit =
    Math.max(
      1,
      Math.min(
        Math.floor(limit),
        100,
      ),
    );

  const response =
    await fetch(
      `${API_BASE_URL}/api/execution/history/recent?limit=${normalizedLimit}`,
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

  const responseData:
    unknown =
    await response.json();

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        responseData,
        response.status,
      ),
    );
  }

  if (
    !isExecutionHistoryReport(
      responseData,
    )
  ) {
    throw new Error(
      "Execution history API returned an invalid response.",
    );
  }

  return responseData;
}

function isExecutionHistoryReport(
  value: unknown,
): value is ExecutionHistoryReport {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.timestamp ===
      "number" &&
    typeof value.total ===
      "number" &&
    Array.isArray(
      value.executions,
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
      );

    if (message) {
      return message;
    }
  }

  return `Execution history request failed with HTTP ${status}.`;
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
