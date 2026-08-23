import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createPaperTrade,
  fetchPaperTrades,
  fetchPaperTradingReadiness,
  runSuccessfulDemoSimulation,
} from "../services/paperTradingApi";

export function usePaperTrades(
  cursor:
    string | null =
      null,

  limit =
    100,
) {
  return useQuery({
    queryKey: [
      "paper-trades",
      {
        cursor,
        limit,
      },
    ],
    queryFn: ({signal}) => fetchPaperTrades(
      {
        cursor,
        limit,
      },
      signal,
    ),
    refetchInterval:
      cursor ===
        null
        ? 5_000
        : false,
    refetchIntervalInBackground:
      false,
    staleTime: 4_000,
    placeholderData:
      (
        previous,
      ) =>
        previous,
    retry: 2,
  });
}

export function useCreatePaperTrade() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createPaperTrade,

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["paper-trades"],
      });
    },
  });
}

export function usePaperTradingReadiness() {
  return useQuery({
    queryKey: [
      "paper-trading",
      "readiness",
    ],
    queryFn:
      fetchPaperTradingReadiness,
    refetchInterval:
      5_000,
    refetchIntervalInBackground:
      false,
    staleTime:
      3_000,
    retry:
      2,
  });
}

export function useSuccessfulDemoSimulation() {
  return useMutation({
    mutationFn:
      runSuccessfulDemoSimulation,
  });
}
