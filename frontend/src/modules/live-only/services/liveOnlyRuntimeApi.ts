import {
  api,
} from "@/api/client";

import type {
  InrCrossShadowResponse,
  LiveOnlyInventoryResponse,
  LiveOnlyRuntimeResponse,
} from "../types/LiveOnlyRuntime";

export async function fetchLiveOnlyRuntime(
  signal?: AbortSignal,
): Promise<LiveOnlyRuntimeResponse> {
  const response =
    await api.get<LiveOnlyRuntimeResponse>(
      "/api/live-only",
      {
        signal,
      },
    );

  return response.data;
}

export async function fetchLiveOnlyInventory(
  signal?: AbortSignal,
): Promise<LiveOnlyInventoryResponse> {
  const response =
    await api.get<LiveOnlyInventoryResponse>(
      "/api/live-only/inventory",
      {
        signal,
      },
    );

  return response.data;
}

export async function fetchInrCrossShadow(
  signal?: AbortSignal,
): Promise<InrCrossShadowResponse> {
  const response =
    await api.get<InrCrossShadowResponse>(
      "/api/live-only/inr-shadow",
      {
        signal,
      },
    );

  return response.data;
}
