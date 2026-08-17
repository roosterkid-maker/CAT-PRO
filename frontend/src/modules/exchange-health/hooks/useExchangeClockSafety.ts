import {
  useQuery,
} from "@tanstack/react-query";

import {
  fetchExchangeClockSafety,
} from "../services/exchangeHealthApi";

export function useExchangeClockSafety() {
  return useQuery({
    queryKey: [
      "exchange-health",
      "clock-safety",
    ],

    queryFn: ({
      signal,
    }) =>
      fetchExchangeClockSafety(
        signal,
      ),

    refetchInterval:
      5_000,

    staleTime:
      3_000,

    retry: 2,
  });
}
