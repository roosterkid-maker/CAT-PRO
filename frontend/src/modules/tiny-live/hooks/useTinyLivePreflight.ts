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
