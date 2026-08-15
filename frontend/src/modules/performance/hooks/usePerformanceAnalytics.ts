import {
  useQuery,
} from "@tanstack/react-query";

import {
  fetchLivePerformance,
  fetchPaperAnalytics,
  fetchShadowPerformance,
} from "../services/performanceApi";

export function usePaperAnalytics() {
  return useQuery({
    queryKey: [
      "performance",
      "paper",
    ],

    queryFn:
      fetchPaperAnalytics,

    refetchInterval:
      5_000,

    staleTime:
      3_000,

    retry: 2,
  });
}

export function useShadowPerformance() {
  return useQuery({
    queryKey: [
      "performance",
      "shadow",
    ],

    queryFn:
      fetchShadowPerformance,

    refetchInterval:
      5_000,

    staleTime:
      3_000,

    retry: 2,
  });
}

export function useLivePerformance() {
  return useQuery({
    queryKey: [
      "performance",
      "live",
    ],

    queryFn:
      fetchLivePerformance,

    refetchInterval:
      5_000,

    staleTime:
      3_000,

    retry: 2,
  });
}