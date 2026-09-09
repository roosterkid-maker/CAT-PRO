import { useQuery } from "@tanstack/react-query";

import { fetchLiveOnlyIntelligence } from "../services/tradeFlowApi";

export function useLiveOnlyIntelligence() {
  return useQuery({
    queryKey: ["live-only", "intelligence"],
    queryFn: ({ signal }) => fetchLiveOnlyIntelligence(signal),
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
    staleTime: 1_500,
    retry: 2,
  });
}
