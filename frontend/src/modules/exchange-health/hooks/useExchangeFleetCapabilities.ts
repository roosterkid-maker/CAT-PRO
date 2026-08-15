import {
  useQuery,
} from "@tanstack/react-query";

import {
  fetchExchangeFleetCapabilities,
} from "../services/exchangeHealthApi";

export function useExchangeFleetCapabilities() {
  return useQuery({
    queryKey: [
      "exchange-health",
      "fleet-capabilities",
    ],

    queryFn: ({
      signal,
    }) =>
      fetchExchangeFleetCapabilities(
        signal,
      ),

    refetchInterval:
      5_000,

    staleTime:
      3_000,

    retry: 2,
  });
}
