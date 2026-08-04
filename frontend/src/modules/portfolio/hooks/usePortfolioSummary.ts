import { useQuery } from "@tanstack/react-query";

import {
  fetchPortfolioSummary,
} from "../services/portfolioApi";

export function usePortfolioSummary() {
  return useQuery({
    queryKey: [
      "portfolio",
      "summary",
    ],

    queryFn:
      fetchPortfolioSummary,

    refetchInterval: 5_000,

    staleTime: 2_000,

    refetchOnWindowFocus: true,
  });
}