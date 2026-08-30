import {
  api,
} from "@/api/client";

import type {
  OrderLifecyclePersistenceResponse,
  RecoveryOverviewResponse,
  RecoveryResolutionMutationResponse,
  RuntimeRecoveryResponse,
  SettlementAccountingPersistenceResponse,
  StrategyOneResidualExecutionResponse,
  StrategyOneResidualRecoveryPreviewResponse,
  StrategyOneTwoLegRecoveryResponse,
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

export async function fetchStrategyOneTwoLegRecovery(): Promise<StrategyOneTwoLegRecoveryResponse> {
  const response =
    await api.get<StrategyOneTwoLegRecoveryResponse>(
      "/api/execution/recovery/strategy-one-two-leg",
    );

  return response.data;
}

export async function inspectStrategyOneResidualRecovery(
  sessionId: string,
): Promise<StrategyOneResidualRecoveryPreviewResponse> {
  const response = await api.post<StrategyOneResidualRecoveryPreviewResponse>(
    `/api/execution/recovery/strategy-one-residual-assistant/${encodeURIComponent(
      sessionId,
    )}/inspect`,
    {},
  );
  return response.data;
}

export async function approveStrategyOneResidualRecovery(
  previewId: string,
  confirmation: string,
): Promise<StrategyOneResidualRecoveryPreviewResponse> {
  const response = await api.put<StrategyOneResidualRecoveryPreviewResponse>(
    `/api/execution/recovery/strategy-one-residual-assistant/${encodeURIComponent(
      previewId,
    )}/approve`,
    {confirmation},
  );
  return response.data;
}

export async function executeStrategyOneResidualRecovery(
  previewId: string,
  confirmation: string,
  resolutionNote: string,
): Promise<StrategyOneResidualExecutionResponse> {
  const response = await api.post<StrategyOneResidualExecutionResponse>(
    `/api/execution/recovery/strategy-one-residual-assistant/${encodeURIComponent(
      previewId,
    )}/execute`,
    {confirmation, resolutionNote},
  );
  return response.data;
}
