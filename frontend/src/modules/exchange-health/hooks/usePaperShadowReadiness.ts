import {
  useQuery,
} from "@tanstack/react-query";

import {
  fetchPaperShadowReadiness,
} from "../services/exchangeHealthApi";

export function usePaperShadowReadiness() {
  return useQuery({
    queryKey: [
      "exchange-health",
      "paper-shadow-readiness",
    ],

    queryFn: ({
      signal,
    }) =>
      fetchPaperShadowReadiness(
        signal,
      ),

    refetchInterval:
      5_000,

    staleTime:
      3_000,

    retry: 2,
  });
}
