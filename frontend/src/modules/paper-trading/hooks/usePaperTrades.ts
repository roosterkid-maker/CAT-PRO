import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createPaperTrade,
  fetchPaperTrades,
} from "../services/paperTradingApi";

export function usePaperTrades() {
  return useQuery({
    queryKey: ["paper-trades"],
    queryFn: fetchPaperTrades,
    refetchInterval: 2_000,
    staleTime: 1_000,
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