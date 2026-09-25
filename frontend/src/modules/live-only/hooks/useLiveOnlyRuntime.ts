import {
  useQuery,
} from "@tanstack/react-query";

import {
  fetchCoinStudy,
  fetchInrExecutor,
  fetchInExchangeMaker,
  fetchInExchangeMakerLive,
  fetchRefillPlan,
  fetchInrScanner,
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

export function useInrScanner() {
  return useQuery({
    queryKey: [
      "live-only-inr-scanner",
    ],
    queryFn: ({signal}) =>
      fetchInrScanner(
        signal,
      ),
    refetchInterval:
      1_500,
    staleTime:
      1_000,
    retry:
      1,
  });
}

export function useCoinStudy() {
  return useQuery({
    queryKey: [
      "live-only-coin-study",
    ],
    queryFn: ({signal}) =>
      fetchCoinStudy(
        signal,
      ),
    refetchInterval:
      30_000,
    staleTime:
      15_000,
    retry:
      1,
  });
}

export function useInExchangeMakerLive() {
  return useQuery({
    queryKey: [
      "live-only-in-exchange-maker-live",
    ],
    queryFn: ({signal}) =>
      fetchInExchangeMakerLive(
        signal,
      ),
    refetchInterval:
      5_000,
    staleTime:
      2_000,
  });
}

export function useInExchangeMaker(venue: string) {
  return useQuery({
    queryKey: [
      "live-only-in-exchange-maker",
      venue,
    ],
    queryFn: ({signal}) =>
      fetchInExchangeMaker(
        venue,
        signal,
      ),
    refetchInterval:
      10_000,
    staleTime:
      5_000,
  });
}

export function useRefillPlan() {
  return useQuery({
    queryKey: [
      "live-only-refill-plan",
    ],
    queryFn: ({signal}) =>
      fetchRefillPlan(
        signal,
      ),
    refetchInterval:
      30_000,
    staleTime:
      15_000,
    retry:
      1,
  });
}

export function useInrExecutor() {
  return useQuery({
    queryKey: [
      "live-only-inr-executor",
    ],
    queryFn: ({signal}) =>
      fetchInrExecutor(
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
