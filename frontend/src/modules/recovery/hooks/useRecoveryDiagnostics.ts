import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  fetchOrderLifecyclePersistence,
  fetchRecoveryOverview,
  fetchRuntimeRecovery,
  fetchSettlementAccountingPersistence,
  resolveDurableRecovery,
} from "../services/recoveryApi";

const overviewKey = [
  "recovery",
  "overview",
] as const;

const runtimeKey = [
  "recovery",
  "runtime",
] as const;

const lifecycleKey = [
  "recovery",
  "order-lifecycle-persistence",
] as const;

const accountingKey = [
  "recovery",
  "settlement-accounting-persistence",
] as const;

export function useRecoveryOverview() {
  return useQuery({
    queryKey:
      overviewKey,

    queryFn:
      fetchRecoveryOverview,

    refetchInterval:
      5_000,

    staleTime:
      3_000,

    retry: 2,
  });
}

export function useRuntimeRecovery() {
  return useQuery({
    queryKey:
      runtimeKey,

    queryFn:
      fetchRuntimeRecovery,

    refetchInterval:
      5_000,

    staleTime:
      3_000,

    retry: 2,
  });
}

export function useOrderLifecyclePersistence() {
  return useQuery({
    queryKey:
      lifecycleKey,

    queryFn:
      fetchOrderLifecyclePersistence,

    refetchInterval:
      5_000,

    staleTime:
      3_000,

    retry: 2,
  });
}

export function useSettlementAccountingPersistence() {
  return useQuery({
    queryKey:
      accountingKey,

    queryFn:
      fetchSettlementAccountingPersistence,

    refetchInterval:
      5_000,

    staleTime:
      3_000,

    retry: 2,
  });
}

export function useResolveDurableRecovery() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      resolutionNote,
    }: {
      sessionId: string;

      resolutionNote: string;
    }) =>
      resolveDurableRecovery(
        sessionId,
        resolutionNote,
      ),

    onSuccess:
      async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey:
              overviewKey,
          }),

          queryClient.invalidateQueries({
            queryKey:
              runtimeKey,
          }),

          queryClient.invalidateQueries({
            queryKey:
              lifecycleKey,
          }),

          queryClient.invalidateQueries({
            queryKey:
              accountingKey,
          }),
        ]);
      },
  });
}