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
    refetchInterval: 3_000,
    staleTime: 2_000,
    retry: 2,
  });
}
