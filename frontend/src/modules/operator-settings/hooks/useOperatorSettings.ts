import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  fetchOperatorSettings,
  resetPaperTradingData,
  updatePaperCapitalConfiguration,
  updatePaperDailyAttemptLimit,
} from "../services/operatorSettingsApi";

import type {
  PaperCapitalConfigurationInput,
  PaperDailyAttemptLimitInput,
  PaperTradingDataResetInput,
} from "../types/OperatorSettings";

export function useOperatorSettings() {
  return useQuery({
    queryKey: [
      "operator-settings",
    ],

    queryFn:
      fetchOperatorSettings,

    refetchInterval:
      5_000,

    staleTime:
      2_000,

    retry:
      2,
  });
}

export function useUpdatePaperCapitalConfiguration() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn:
      (
        input:
          PaperCapitalConfigurationInput,
      ) =>
        updatePaperCapitalConfiguration(
          input,
        ),

    onSuccess:
      async (
        response,
      ) => {
        queryClient.setQueryData(
          [
            "operator-settings",
          ],
          response,
        );

        await queryClient.invalidateQueries({
          queryKey: [
            "strategies",
            "personal-bot",
          ],
        });
      },
  });
}

export function useUpdatePaperDailyAttemptLimit() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn:
      (
        input:
          PaperDailyAttemptLimitInput,
      ) =>
        updatePaperDailyAttemptLimit(
          input,
        ),

    onSuccess:
      async (
        response,
      ) => {
        queryClient.setQueryData(
          [
            "operator-settings",
          ],
          response,
        );

        await queryClient.invalidateQueries({
          queryKey: [
            "strategies",
            "personal-bot",
          ],
        });
      },
  });
}

export function useResetPaperTradingData() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn:
      (
        input:
          PaperTradingDataResetInput,
      ) =>
        resetPaperTradingData(
          input,
        ),

    onSuccess:
      async (
        response,
      ) => {
        queryClient.setQueryData(
          [
            "operator-settings",
          ],
          {
            success:
              response.success,

            data:
              response.data,
          },
        );

        await queryClient.invalidateQueries();
      },
  });
}
