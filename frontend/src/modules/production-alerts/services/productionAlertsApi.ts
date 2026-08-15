import {
  api,
} from "@/api/client";

import type {
  ProductionAlertHistoryResponse,
  ProductionAlertMutationResponse,
  ProductionAlertResponse,
} from "../types/ProductionAlerts";

export async function fetchProductionAlerts(): Promise<ProductionAlertResponse> {
  const response =
    await api.get<ProductionAlertResponse>(
      "/api/execution/alerts",
      {
        validateStatus: (
          status,
        ) =>
          status === 200 ||
          status === 503,
      },
    );

  return response.data;
}

export async function fetchProductionAlertHistory(): Promise<ProductionAlertHistoryResponse> {
  const response =
    await api.get<ProductionAlertHistoryResponse>(
      "/api/execution/alerts/history",
      {
        validateStatus: (
          status,
        ) =>
          status === 200 ||
          status === 503,
      },
    );

  return response.data;
}

export async function acknowledgeProductionAlert(
  key: string,
  note: string,
): Promise<ProductionAlertMutationResponse> {
  const response =
    await api.post<ProductionAlertMutationResponse>(
      `/api/execution/alerts/history/${encodeURIComponent(
        key,
      )}/acknowledge`,
      {
        note,
      },
    );

  return response.data;
}

export async function resolveProductionAlert(
  key: string,
  resolutionNote: string,
): Promise<ProductionAlertMutationResponse> {
  const response =
    await api.post<ProductionAlertMutationResponse>(
      `/api/execution/alerts/history/${encodeURIComponent(
        key,
      )}/resolve`,
      {
        resolutionNote,
      },
    );

  return response.data;
}