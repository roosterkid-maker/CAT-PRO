import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  fetchExchangeBalances,
  refreshExchangeBalances,
} from "../services/portfolioApi";

const QUERY_KEY = [
  "portfolio",
  "exchange-balances",
] as const;

export function useExchangeBalances() {
  return useQuery({
    queryKey:
      QUERY_KEY,
    queryFn:
      fetchExchangeBalances,
    refetchInterval:
      10_000,
    staleTime:
      4_000,
    refetchOnWindowFocus:
      true,
    retry:
      2,
  });
}

export function useRefreshExchangeBalances() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn:
      refreshExchangeBalances,
    onSuccess:
      (response) => {
        queryClient.setQueryData(
          QUERY_KEY,
          response,
        );
      },
  });
}
