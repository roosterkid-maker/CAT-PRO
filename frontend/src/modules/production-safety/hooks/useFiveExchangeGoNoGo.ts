import {
  useQuery,
} from "@tanstack/react-query";

import {
  fetchFiveExchangeGoNoGo,
} from "../services/productionSafetyApi";

export function useFiveExchangeGoNoGo() {
  return useQuery({
    queryKey: [
      "production-safety",
      "five-exchange-go-no-go",
    ],
    queryFn:
      fetchFiveExchangeGoNoGo,
    refetchInterval:
      5_000,
    staleTime:
      2_000,
    retry: 2,
  });
}
