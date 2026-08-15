import {
  useQuery,
} from "@tanstack/react-query";

import {
  fetchReadinessObservations,
} from "../services/exchangeHealthApi";

export function useReadinessObservations() {
  return useQuery({
    queryKey: [
      "exchange-health",
      "readiness-observations",
    ],
    queryFn: ({
      signal,
    }) =>
      fetchReadinessObservations(
        signal,
      ),
    refetchInterval:
      5_000,
    staleTime:
      3_000,
    retry: 2,
  });
}
