import {
  useQuery,
} from "@tanstack/react-query";

import {
  fetchFreshnessDiagnostics,
} from "../services/freshnessDiagnosticsApi";

export function useFreshnessDiagnostics() {
  return useQuery({
    queryKey: [
      "market-freshness-diagnostics",
    ],

    queryFn:
      fetchFreshnessDiagnostics,

    refetchInterval:
      3_000,

    staleTime:
      1_000,

    retry:
      2,
  });
}