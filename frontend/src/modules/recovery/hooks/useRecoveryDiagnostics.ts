import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  approveStrategyOneResidualRecovery,
  executeStrategyOneResidualRecovery,
  executeStrategyOneConfirmedRejectSecondAttempt,
  fetchStrategyOneResidualExecutionDiagnostics,
  fetchOrderLifecyclePersistence,
  fetchRecoveryOverview,
  fetchRuntimeRecovery,
  fetchSettlementAccountingPersistence,
  fetchStrategyOneTwoLegRecovery,
  inspectStrategyOneResidualRecovery,
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

const strategyOneTwoLegKey = [
  "recovery",
  "strategy-one-two-leg",
] as const;

const strategyOneResidualExecutionKey = [
  "recovery",
  "strategy-one-residual-execution",
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

export function useStrategyOneTwoLegRecovery(
  enabled = true,
) {
  return useQuery({
    queryKey:
      strategyOneTwoLegKey,

    queryFn:
      fetchStrategyOneTwoLegRecovery,

    enabled,

    refetchInterval:
      5_000,

    staleTime:
      3_000,

    retry: 2,
  });
}

export function useStrategyOneResidualExecutionDiagnostics() {
  return useQuery({
    queryKey: strategyOneResidualExecutionKey,
    queryFn: fetchStrategyOneResidualExecutionDiagnostics,
    refetchInterval: 5_000,
    staleTime: 3_000,
    retry: 2,
  });
}

export function useInspectStrategyOneResidualRecovery() {
  return useMutation({
    mutationFn: (request: {
      sessionId: string;
      maximumLossQuote?: number;
      lossAuthorization?: string;
    }) => inspectStrategyOneResidualRecovery(request),
  });
}

export function useApproveStrategyOneResidualRecovery() {
  return useMutation({
    mutationFn: ({
      previewId,
      confirmation,
    }: {
      previewId: string;
      confirmation: string;
    }) => approveStrategyOneResidualRecovery(previewId, confirmation),
  });
}

export function useExecuteStrategyOneResidualRecovery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      previewId,
      confirmation,
      resolutionNote,
    }: {
      previewId: string;
      confirmation: string;
      resolutionNote: string;
    }) => executeStrategyOneResidualRecovery(
      previewId,
      confirmation,
      resolutionNote,
    ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({queryKey: overviewKey}),
        queryClient.invalidateQueries({queryKey: runtimeKey}),
        queryClient.invalidateQueries({queryKey: strategyOneTwoLegKey}),
        queryClient.invalidateQueries({queryKey: strategyOneResidualExecutionKey}),
      ]);
    },
  });
}

export function useExecuteStrategyOneConfirmedRejectSecondAttempt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      priorExecutionId,
      previewId,
      confirmation,
      resolutionNote,
    }: {
      priorExecutionId: string;
      previewId: string;
      confirmation: string;
      resolutionNote: string;
    }) => executeStrategyOneConfirmedRejectSecondAttempt(
      priorExecutionId,
      previewId,
      confirmation,
      resolutionNote,
    ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({queryKey: overviewKey}),
        queryClient.invalidateQueries({queryKey: runtimeKey}),
        queryClient.invalidateQueries({queryKey: strategyOneTwoLegKey}),
        queryClient.invalidateQueries({queryKey: strategyOneResidualExecutionKey}),
      ]);
    },
  });
}
