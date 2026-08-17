import {
  fetchExecutionAnalytics,
} from "../services/executionAnalyticsApi";

import {
  useQuery,
} from "@tanstack/react-query";

import {
  fetchArbitragePnL,
} from "../services/arbitragePnLApi";

import {
  fetchRecentExecutions,
} from "../services/executionHistoryApi";

import {
  fetchExecutionHealth,
  fetchExecutionMetrics,
} from "../services/executionMonitoringApi";

export function useExecutionMetrics() {
  return useQuery({
    queryKey: [
      "execution-metrics",
    ],

    queryFn: ({
      signal,
    }) =>
      fetchExecutionMetrics(
        signal,
      ),

    refetchInterval:
      5_000,

    staleTime:
      4_000,
  });
}

export function useExecutionHealth() {
  return useQuery({
    queryKey: [
      "execution-health",
    ],

    queryFn: ({
      signal,
    }) =>
      fetchExecutionHealth(
        signal,
      ),

    refetchInterval:
      5_000,

    staleTime:
      4_000,
  });
}

export function useRecentExecutions(
  limit = 20,
) {
  return useQuery({
    queryKey: [
      "recent-executions",
      limit,
    ],

    queryFn: ({
      signal,
    }) =>
      fetchRecentExecutions(
        limit,
        signal,
      ),

    refetchInterval:
      5_000,

    staleTime:
      4_000,
  });
}

export function useArbitragePnL(
  limit = 20,
) {
  return useQuery({
    queryKey: [
      "arbitrage-pnl",
      limit,
    ],

    queryFn: ({
      signal,
    }) =>
      fetchArbitragePnL(
        limit,
        signal,
      ),

    refetchInterval:
      5000,

    staleTime:
      4000,
  });
}
export function useExecutionAnalytics(
  limit = 60,
) {
  return useQuery({
    queryKey: [
      "execution-analytics",
      limit,
    ],

    queryFn: ({
      signal,
    }) =>
      fetchExecutionAnalytics(
        limit,
        signal,
      ),

    refetchInterval:
      5_000,

    staleTime:
      4_000,
  });
}