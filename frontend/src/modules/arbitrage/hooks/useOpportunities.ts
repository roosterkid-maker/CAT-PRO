import { useQuery } from "@tanstack/react-query";

import { fetchOpportunities } from "../services/opportunityApi";

export function useOpportunities() {
  return useQuery({
    queryKey: ["arbitrage-opportunities"],
    queryFn: fetchOpportunities,
    refetchInterval: 2_000,
    staleTime: 1_000,
    retry: 2,
  });
}