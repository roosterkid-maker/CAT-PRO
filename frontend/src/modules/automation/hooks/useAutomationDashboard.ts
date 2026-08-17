import {
  useQuery,
} from "@tanstack/react-query";

import {
  fetchAutomationDashboard,
  fetchPaperPortfolioOptimizer,
} from "../services/automationApi";

export function useAutomationDashboard() {
  return useQuery({
    queryKey: [
      "automation",
      "dashboard",
    ],

    queryFn:
      fetchAutomationDashboard,

    refetchInterval:
      3_000,

    staleTime:
      2_000,

    retry: 2,
  });
}

export function usePaperPortfolioOptimizer() {
  return useQuery({
    queryKey: [
      "automation",
      "paper-portfolio",
    ],

    queryFn:
      fetchPaperPortfolioOptimizer,

    refetchInterval:
      5_000,

    staleTime:
      3_000,

    retry: 2,
  });
}