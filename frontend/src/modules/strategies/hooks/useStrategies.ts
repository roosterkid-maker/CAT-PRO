import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  fetchCentralPaperLifecycle,
  fetchCentralStrategyLiveReadiness,
  fetchEightStrategyPaperReadiness,
  fetchStrategies,
  fetchStatisticalResearchEvidence,
  fetchStatisticalPaperLifecycle,
  fetchTriangularPaperClosure,
  fetchSpotPerpetualBasisPaperClosure,
  fetchFundingRatePaperClosure,
  fetchPerpetualPerpetualPaperClosure,
  fetchDynamicMarketMakingPaperClosure,
  fetchPersonalStrategyOneBot,
  fetchPersonalStrategyOnePerformanceSummary,
  fetchStrategy,
  updatePersonalBotControl,
} from "../services/strategyApi";

export function usePersonalStrategyOneBot() {
  return useQuery({
    queryKey: ["strategies", "personal-bot"],
    queryFn: fetchPersonalStrategyOneBot,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    staleTime: 3_000,
    retry: 2,
  });
}

export function usePersonalStrategyOnePerformanceSummary() {
  return useQuery({
    queryKey: [
      "strategies",
      "personal-bot",
      "performance-summary",
    ],
    queryFn:
      fetchPersonalStrategyOnePerformanceSummary,
    refetchInterval:
      5_000,
    refetchIntervalInBackground:
      false,
    staleTime:
      4_000,
    retry:
      2,
  });
}

export function usePersonalBotControl() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updatePersonalBotControl,
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ["strategies", "personal-bot"]});
    },
  });
}

export function useStrategies() {
  return useQuery({
    queryKey: [
      "strategies",
    ],
    queryFn:
      fetchStrategies,
    refetchInterval:
      3_000,
    staleTime:
      2_000,
    retry:
      2,
  });
}

export function useStrategy(
  strategyId: string,
) {
  return useQuery({
    queryKey: [
      "strategies",
      strategyId,
    ],
    queryFn:
      () =>
        fetchStrategy(
          strategyId,
        ),
    enabled:
      strategyId.length >
      0,
    refetchInterval:
      3_000,
    staleTime:
      2_000,
    retry:
      2,
  });
}

export function useCentralPaperLifecycle() {
  return useQuery({
    queryKey: ["strategies", "central-paper-lifecycle"],
    queryFn: fetchCentralPaperLifecycle,
    refetchInterval: 3_000,
    staleTime: 2_000,
    retry: 2,
  });
}

export function useCentralStrategyLiveReadiness() {
  return useQuery({
    queryKey: ["strategies", "central-live-readiness"],
    queryFn: fetchCentralStrategyLiveReadiness,
    refetchInterval: 5_000,
    staleTime: 3_000,
    retry: 2,
  });
}

export function useStatisticalResearchEvidence(
  enabled = true,
) {
  return useQuery({
    queryKey: ["strategies", "statistical-arbitrage", "research-evidence"],
    queryFn: fetchStatisticalResearchEvidence,
    enabled,
    refetchInterval: 5_000,
    staleTime: 3_000,
    retry: 2,
  });
}

export function useStatisticalPaperLifecycle(
  enabled = true,
) {
  return useQuery({
    queryKey: ["strategies", "statistical-arbitrage", "paper-lifecycle"],
    queryFn: fetchStatisticalPaperLifecycle,
    enabled,
    refetchInterval: 5_000,
    staleTime: 3_000,
    retry: 2,
  });
}

export function useEightStrategyPaperReadiness() {
  return useQuery({
    queryKey: ["strategies", "eight-strategy-paper-readiness"],
    queryFn: fetchEightStrategyPaperReadiness,
    refetchInterval: 5_000,
    staleTime: 3_000,
    retry: 2,
  });
}

export function useTriangularPaperClosure() {
  return useQuery({
    queryKey: ["strategies", "triangular-arbitrage", "paper-closure"],
    queryFn: fetchTriangularPaperClosure,
    refetchInterval: 3_000,
    staleTime: 2_000,
    retry: 2,
  });
}

export function useSpotPerpetualBasisPaperClosure() {
  return useQuery({
    queryKey: ["strategies", "spot-perpetual-basis-arbitrage", "paper-closure"],
    queryFn: fetchSpotPerpetualBasisPaperClosure,
    refetchInterval: 3_000,
    staleTime: 2_000,
    retry: 2,
  });
}

export function useFundingRatePaperClosure() {
  return useQuery({
    queryKey: ["strategies", "funding-rate-arbitrage", "paper-closure"],
    queryFn: fetchFundingRatePaperClosure,
    refetchInterval: 3_000,
    staleTime: 2_000,
    retry: 2,
  });
}

export function usePerpetualPerpetualPaperClosure() {
  return useQuery({
    queryKey: ["strategies", "perpetual-perpetual-arbitrage", "paper-closure"],
    queryFn: fetchPerpetualPerpetualPaperClosure,
    refetchInterval: 3_000,
    staleTime: 2_000,
    retry: 2,
  });
}

export function useDynamicMarketMakingPaperClosure() {
  return useQuery({
    queryKey: ["strategies", "dynamic-market-making", "paper-closure"],
    queryFn: fetchDynamicMarketMakingPaperClosure,
    refetchInterval: 3_000,
    staleTime: 2_000,
    retry: 2,
  });
}
