import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  acknowledgeProductionAlert,
  fetchProductionAlertHistory,
  fetchProductionAlerts,
  resolveProductionAlert,
} from "../services/productionAlertsApi";

const currentKey = [
  "production-alerts",
  "current",
] as const;

const historyKey = [
  "production-alerts",
  "history",
] as const;

export function useProductionAlerts() {
  return useQuery({
    queryKey:
      currentKey,

    queryFn:
      fetchProductionAlerts,

    refetchInterval:
      5_000,

    staleTime:
      3_000,

    retry: 2,
  });
}

export function useProductionAlertHistory() {
  return useQuery({
    queryKey:
      historyKey,

    queryFn:
      fetchProductionAlertHistory,

    refetchInterval:
      5_000,

    staleTime:
      3_000,

    retry: 2,
  });
}

export function useAcknowledgeProductionAlert() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn: ({
      key,
      note,
    }: {
      key: string;
      note: string;
    }) =>
      acknowledgeProductionAlert(
        key,
        note,
      ),

    onSuccess:
      async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey:
              currentKey,
          }),

          queryClient.invalidateQueries({
            queryKey:
              historyKey,
          }),
        ]);
      },
  });
}

export function useResolveProductionAlert() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn: ({
      key,
      resolutionNote,
    }: {
      key: string;
      resolutionNote: string;
    }) =>
      resolveProductionAlert(
        key,
        resolutionNote,
      ),

    onSuccess:
      async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey:
              currentKey,
          }),

          queryClient.invalidateQueries({
            queryKey:
              historyKey,
          }),
        ]);
      },
  });
}