import {
  api,
} from "@/api/client";

import type {
  AccountFeeVerificationResponse,
  FeeAwareStrategyAnalyticsResponse,
  OpportunityNearMissAnalyticsResponse,
} from "../types/OpportunityEconomicsDiagnostics";

export async function fetchOpportunityNearMissAnalytics(
  limit = 20,
): Promise<OpportunityNearMissAnalyticsResponse> {
  const response =
    await api.get<OpportunityNearMissAnalyticsResponse>(
      "/api/automation/bottleneck/near-misses",
      {
        params: {
          limit,
        },
      },
    );

  return response.data;
}

export async function fetchFeeAwareStrategyAnalytics(
  limit = 10,
): Promise<FeeAwareStrategyAnalyticsResponse> {
  const response =
    await api.get<FeeAwareStrategyAnalyticsResponse>(
      "/api/automation/bottleneck/fee-strategy",
      {
        params: {
          limit,
        },
      },
    );

  return response.data;
}

export async function fetchAccountFeeVerification(
  symbol: string,
): Promise<AccountFeeVerificationResponse> {
  const response =
    await api.get<AccountFeeVerificationResponse>(
      "/api/automation/bottleneck/account-fees",
      {
        params: {
          symbol,
        },
      },
    );

  return response.data;
}
