import {
  useQuery,
} from "@tanstack/react-query";

import {
  fetchLiveOnlyRuntime,
} from "../services/liveOnlyRuntimeApi";

export function useLiveOnlyRuntime() {
  return useQuery({
    queryKey: [
      "live-only-runtime",
    ],
    queryFn: ({signal}) =>
      fetchLiveOnlyRuntime(
        signal,
      ),
    refetchInterval:
      2_000,
    staleTime:
      1_000,
    retry:
      1,
  });
}
