import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  fetchTinyLiveCapability,
  fetchTinyLiveEvidenceArchive,
  fetchTinyLiveEvidencePackage,
  fetchTinyLiveReadinessClosure,
  runTinyLivePreflight,
  fetchStrategyOnePilotPreview,
  fetchStrategyOneDynamicRecommendation,
  fetchStrategyOneTinyLiveActionDiagnostics,
  fetchStrategyOneTinyLiveOpportunityAudit,
  previewStrategyOneTinyLiveAction,
  authorizeStrategyOneTinyLiveAction,
  cancelStrategyOneTinyLiveAction,
  executeStrategyOneTinyLiveAction,
  runStrategyOnePilotPreflight,
  sealTinyLiveEvidencePackage,
} from "../services/tinyLiveApi";

export function useTinyLiveCapability() {
  return useQuery({
    queryKey: [
      "tiny-live",
      "capability",
    ],

    queryFn:
      fetchTinyLiveCapability,

    staleTime:
      30_000,

    retry: 2,
  });
}

export function useRunTinyLivePreflight() {
  return useMutation({
    mutationFn:
      runTinyLivePreflight,
  });
}

export function useTinyLiveEvidencePackage() {
  return useQuery({
    queryKey: [
      "tiny-live",
      "evidence-package",
    ],
    queryFn:
      fetchTinyLiveEvidencePackage,
    refetchInterval:
      5_000,
    staleTime:
      2_000,
    retry: 2,
  });
}

export function useTinyLiveEvidenceArchive() {
  return useQuery({
    queryKey: [
      "tiny-live",
      "evidence-archive",
    ],
    queryFn:
      fetchTinyLiveEvidenceArchive,
    staleTime:
      2_000,
    retry: 2,
  });
}

export function useTinyLiveReadinessClosure() {
  return useQuery({
    queryKey: [
      "tiny-live",
      "readiness-closure",
    ],
    queryFn:
      fetchTinyLiveReadinessClosure,
    refetchInterval:
      5_000,
    staleTime:
      2_000,
    retry: 2,
  });
}

export function useSealTinyLiveEvidencePackage() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn:
      sealTinyLiveEvidencePackage,
    onSuccess:
      async () => {
        await queryClient
          .invalidateQueries({
            queryKey: [
              "tiny-live",
              "evidence-archive",
            ],
          });
      },
  });
}

export function useStrategyOnePilotPreview() {
  return useQuery({
    queryKey: [
      "tiny-live",
      "strategy-one-pilot",
    ],
    queryFn:
      fetchStrategyOnePilotPreview,
    refetchInterval:
      2_000,
    staleTime:
      1_000,
    retry:
      2,
  });
}

export function useRunStrategyOnePilotPreflight() {
  const queryClient =
    useQueryClient();

  return useMutation({
    mutationFn:
      runStrategyOnePilotPreflight,
    onSuccess:
      async () => {
        await queryClient
          .invalidateQueries({
            queryKey: [
              "tiny-live",
              "strategy-one-pilot",
            ],
          });
      },
  });
}

export function useStrategyOneDynamicRecommendation() {
  return useQuery({
    queryKey: ["tiny-live", "strategy-one-dynamic-recommendation"],
    queryFn: fetchStrategyOneDynamicRecommendation,
    refetchInterval: 2_000,
    staleTime: 1_000,
    retry: 2,
  });
}

export function useStrategyOneTinyLiveActionDiagnostics() {
  return useQuery({
    queryKey: ["tiny-live", "strategy-one-action"],
    queryFn: fetchStrategyOneTinyLiveActionDiagnostics,
    refetchInterval: 1_000,
    staleTime: 500,
    retry: 2,
  });
}

export function useStrategyOneTinyLiveOpportunityAudit() {
  return useQuery({
    queryKey: ["tiny-live", "strategy-one-opportunity-audit"],
    queryFn: fetchStrategyOneTinyLiveOpportunityAudit,
    refetchInterval: 5_000,
    staleTime: 2_000,
    retry: 2,
  });
}

export function usePreviewStrategyOneTinyLiveAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: previewStrategyOneTinyLiveAction,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["tiny-live", "strategy-one-action"],
      });
    },
  });
}

export function useAuthorizeStrategyOneTinyLiveAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authorizeStrategyOneTinyLiveAction,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["tiny-live", "strategy-one-action"],
      });
    },
  });
}

export function useCancelStrategyOneTinyLiveAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelStrategyOneTinyLiveAction,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["tiny-live", "strategy-one-action"],
      });
    },
  });
}

export function useExecuteStrategyOneTinyLiveAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: executeStrategyOneTinyLiveAction,
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["tiny-live", "strategy-one-action"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["tiny-live", "strategy-one-dynamic-recommendation"],
        }),
      ]);
    },
  });
}
