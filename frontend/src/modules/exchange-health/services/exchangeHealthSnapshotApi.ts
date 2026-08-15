import {
  fetchExecutionHealth,
} from "@/modules/execution-monitoring/services/executionMonitoringApi";

import {
  fetchSystemHealth,
} from "@/modules/system-health/services/systemHealthApi";

import {
  fetchExchangeClockSafety,
  fetchExchangeFleetCapabilities,
  fetchPaperShadowReadiness,
  fetchReadinessObservations,
} from "./exchangeHealthApi";

import type {
  ExchangeHealthEvidenceSnapshot,
  ExchangeHealthEvidenceSource,
} from "../types/ExchangeHealthSnapshot";

export async function fetchExchangeHealthEvidenceSnapshot(
  signal?: AbortSignal,
): Promise<ExchangeHealthEvidenceSnapshot> {
  const requestedAt =
    Date.now();

  const results =
    await Promise.allSettled([
      fetchSystemHealth(
        signal,
      ),
      fetchExecutionHealth(
        signal,
      ),
      fetchExchangeClockSafety(
        signal,
      ),
      fetchExchangeFleetCapabilities(
        signal,
      ),
      fetchPaperShadowReadiness(
        signal,
      ),
      fetchReadinessObservations(
        signal,
      ),
    ] as const);

  if (signal?.aborted) {
    throw new DOMException(
      "Exchange health evidence request was cancelled.",
      "AbortError",
    );
  }

  const sources = {
    systemHealth:
      toEvidenceSource(
        results[0],
        (response) =>
          response.data.timestamp,
      ),

    executionHealth:
      toEvidenceSource(
        results[1],
        (report) =>
          report.timestamp,
      ),

    clockSafety:
      toEvidenceSource(
        results[2],
        (response) =>
          response.data.generatedAt,
      ),

    fleetCapabilities:
      toEvidenceSource(
        results[3],
        (response) =>
          response.data.generatedAt,
      ),

    paperShadowReadiness:
      toEvidenceSource(
        results[4],
        (response) =>
          response.data.generatedAt,
      ),

    readinessObservations:
      toEvidenceSource(
        results[5],
        (response) =>
          response.data.generatedAt,
      ),
  };

  const sourceValues =
    Object.values(
      sources,
    );

  const sourceTimestamps =
    sourceValues
      .map(
        (source) =>
          source.generatedAt,
      )
      .filter(
        (
          timestamp,
        ): timestamp is number =>
          timestamp !== null,
      );

  const completedAt =
    Date.now();

  return {
    version: "19.35",
    requestedAt,
    completedAt,
    requestDurationMs:
      completedAt -
      requestedAt,
    sourceCount: 6,
    successfulSourceCount:
      sourceValues.filter(
        (source) =>
          source.data !== null,
      ).length,
    sourceSkewMs:
      sourceTimestamps.length <
      2
        ? null
        : Math.max(
            ...sourceTimestamps,
          ) -
          Math.min(
            ...sourceTimestamps,
          ),
    sources,
  };
}

function toEvidenceSource<T>(
  result:
    PromiseSettledResult<T>,
  getGeneratedAt:
    (value: T) => number,
): ExchangeHealthEvidenceSource<T> {
  if (
    result.status ===
    "fulfilled"
  ) {
    return {
      data: result.value,
      error: null,
      generatedAt:
        getGeneratedAt(
          result.value,
        ),
    };
  }

  return {
    data: null,
    error:
      getErrorMessage(
        result.reason,
      ),
    generatedAt: null,
  };
}

function getErrorMessage(
  error: unknown,
): string {
  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message;
  }

  return "Evidence source request failed.";
}
