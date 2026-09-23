import {
  useQuery,
} from "@tanstack/react-query";

import {
  fetchInrCrossShadow,
  fetchLiveOnlyInventory,
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

export function useLiveOnlyInventory() {
  return useQuery({
    queryKey: [
      "live-only-inventory",
    ],
    queryFn: ({signal}) =>
      fetchLiveOnlyInventory(
        signal,
      ),
    refetchInterval:
      10_000,
    staleTime:
      5_000,
    retry:
      1,
  });
}

export function useInrCrossShadow() {
  return useQuery({
    queryKey: [
      "live-only-inr-shadow",
    ],
    queryFn: ({signal}) =>
      fetchInrCrossShadow(
        signal,
      ),
    refetchInterval:
      3_000,
    staleTime:
      2_000,
    retry:
      1,
  });
}
