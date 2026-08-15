import {
  api,
} from "@/api/client";

import type {
  V18ProductionReadinessResponse,
} from "../types/V18Readiness";

import type {
  FiveExchangeGoNoGoResponse,
} from "../types/FiveExchangeGoNoGo";

export async function fetchV18ProductionReadiness(): Promise<V18ProductionReadinessResponse> {
  const response =
    await api.get<V18ProductionReadinessResponse>(
      "/api/execution/v18-readiness",
      {
        /*
         * Current backends return 200 whenever the diagnostic
         * report was evaluated successfully. Keep 503 accepted
         * for compatibility with pre-fix V18 deployments where
         * a blocked business gate was encoded as HTTP downtime.
         */
        validateStatus: (
          status,
        ) =>
          status === 200 ||
          status === 503,
      },
    );

  return response.data;
}

export async function fetchFiveExchangeGoNoGo(): Promise<FiveExchangeGoNoGoResponse> {
  const response =
    await api.get<FiveExchangeGoNoGoResponse>(
      "/api/execution/five-exchange-go-no-go",
      {
        validateStatus: (
          status,
        ) =>
          status === 200 ||
          status === 409,
      },
    );

  return response.data;
}
