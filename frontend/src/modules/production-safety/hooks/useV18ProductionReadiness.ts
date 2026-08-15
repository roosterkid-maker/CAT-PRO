import {
  useQuery,
} from "@tanstack/react-query";

import {
  fetchV18ProductionReadiness,
} from "../services/productionSafetyApi";

export function useV18ProductionReadiness() {
  return useQuery({
    queryKey: [
      "production-safety",
      "v18-readiness",
    ],

    queryFn:
      fetchV18ProductionReadiness,

    refetchInterval: 5_000,

    staleTime: 2_000,

    retry: 2,
  });
}