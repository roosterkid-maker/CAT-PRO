import {
  api,
} from "@/api/client";

import type {
  OrderLifecyclePersistenceResponse,
  RecoveryOverviewResponse,
  RecoveryResolutionMutationResponse,
  RuntimeRecoveryResponse,
  SettlementAccountingPersistenceResponse,
} from "../types/RecoveryDiagnostics";

export async function fetchRecoveryOverview(): Promise<RecoveryOverviewResponse> {
  const response =
    await api.get<RecoveryOverviewResponse>(
      "/api/execution/recovery/resolutions",
    );

  return response.data;
}

export async function fetchRuntimeRecovery(): Promise<RuntimeRecoveryResponse> {
  const response =
    await api.get<RuntimeRecoveryResponse>(
      "/api/execution/recovery",
    );

  return response.data;
}

export async function fetchOrderLifecyclePersistence(): Promise<OrderLifecyclePersistenceResponse> {
  const response =
    await api.get<OrderLifecyclePersistenceResponse>(
      "/api/execution/lifecycle/persistence",
    );

  return response.data;
}

export async function fetchSettlementAccountingPersistence(): Promise<SettlementAccountingPersistenceResponse> {
  const response =
    await api.get<SettlementAccountingPersistenceResponse>(
      "/api/execution/settlement/persistence",
    );

  return response.data;
}

export async function resolveDurableRecovery(
  sessionId: string,
  resolutionNote: string,
): Promise<RecoveryResolutionMutationResponse> {
  const response =
    await api.post<RecoveryResolutionMutationResponse>(
      `/api/execution/recovery/resolutions/${encodeURIComponent(
        sessionId,
      )}`,
      {
        resolutionNote,
      },
    );

  return response.data;
}