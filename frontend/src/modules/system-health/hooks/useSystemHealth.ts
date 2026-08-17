import { useQuery } from "@tanstack/react-query";

import { fetchSystemHealth } from "../services/systemHealthApi";

export function useSystemHealth() {
  return useQuery({
    queryKey: ["system-health"],
    queryFn: ({
      signal,
    }) =>
      fetchSystemHealth(
        signal,
      ),
    refetchInterval: 2_000,
    staleTime: 1_000,
    retry: 2,
  });
}
