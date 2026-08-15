import {
  useMutation,
  useQuery,
} from "@tanstack/react-query";

import {
  fetchAccountFeeVerification,
  fetchFeeAwareStrategyAnalytics,
  fetchOpportunityNearMissAnalytics,
} from "../services/opportunityDiagnosticsApi";

export function useOpportunityNearMissAnalytics() {
  return useQuery({
    queryKey: [
      "opportunity-diagnostics",
      "near-misses",
    ],

    queryFn: () =>
      fetchOpportunityNearMissAnalytics(
        20,
      ),

    staleTime: 1_000,

    refetchInterval: 2_000,

    retry: 1,

    refetchOnWindowFocus: false,
  });
}

export function useFeeAwareStrategyAnalytics() {
  return useQuery({
    queryKey: [
      "opportunity-diagnostics",
      "fee-strategy",
    ],

    queryFn: () =>
      fetchFeeAwareStrategyAnalytics(
        10,
      ),

    staleTime: 10_000,

    retry: 1,

    refetchOnWindowFocus: false,
  });
}

export function useAccountFeeVerification() {
  return useMutation({
    mutationFn:
      fetchAccountFeeVerification,
  });
}
