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
  fetchStrategyOneTinyLivePreArm,
  fetchStrategyOneTinyLiveOpportunityAudit,
  armStrategyOneTinyLive,
  activateStrategyOneTinyLiveAccountLease,
  clearRecoveredStrategyOneTinyLiveEmergencyStop,
  disarmStrategyOneTinyLive,
  restoreStrategyOnePaperAccountMode,
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

export function useStrategyOnePilotPreview(
  enabled = true,
) {
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

    enabled,
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

export function useStrategyOneTinyLivePreArm(
  enabled = true,
) {
  return useQuery({
    queryKey: ["tiny-live", "strategy-one-pre-arm"],
    queryFn: fetchStrategyOneTinyLivePreArm,
    refetchInterval: 1_000,
    staleTime: 500,
    retry: 2,
    enabled,
  });
}

export function useStrategyOneTinyLiveOpportunityAudit(
  enabled = true,
) {
  return useQuery({
    queryKey: ["tiny-live", "strategy-one-opportunity-audit"],
    queryFn: fetchStrategyOneTinyLiveOpportunityAudit,
    refetchInterval: 5_000,
    staleTime: 2_000,
    retry: 2,
    enabled,
  });
}

export function useArmStrategyOneTinyLive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: armStrategyOneTinyLive,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["tiny-live", "strategy-one-pre-arm"],
      });
    },
  });
}

export function useDisarmStrategyOneTinyLive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: disarmStrategyOneTinyLive,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["tiny-live", "strategy-one-pre-arm"],
      });
    },
  });
}

export function useActivateStrategyOneTinyLiveAccountLease() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: activateStrategyOneTinyLiveAccountLease,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["tiny-live", "strategy-one-pre-arm"],
      });
    },
  });
}

export function useClearRecoveredStrategyOneTinyLiveEmergencyStop() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: clearRecoveredStrategyOneTinyLiveEmergencyStop,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["tiny-live", "strategy-one-pre-arm"],
      });
    },
  });
}

export function useRestoreStrategyOnePaperAccountMode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: restoreStrategyOnePaperAccountMode,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["tiny-live", "strategy-one-pre-arm"],
      });
    },
  });
}
