import {
  useQuery,
} from "@tanstack/react-query";

import {
  fetchExchangeHealthEvidenceSnapshot,
} from "../services/exchangeHealthSnapshotApi";

export function useExchangeHealthEvidenceSnapshot() {
  return useQuery({
    queryKey: [
      "exchange-health",
      "evidence-snapshot",
    ],

    queryFn: ({
      signal,
    }) =>
      fetchExchangeHealthEvidenceSnapshot(
        signal,
      ),

    refetchInterval:
      15_000,

    staleTime:
      10_000,

    retry: 2,
  });
}
