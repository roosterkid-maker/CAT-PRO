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

    queryFn: ({
      signal,
    }) =>
      fetchFreshnessDiagnostics(
        signal,
      ),

    refetchInterval:
      10_000,

    staleTime:
      8_000,

    retry:
      2,
  });
}
